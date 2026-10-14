/**
 * Floating IP actions - port of legacy pages/network/containers/FloatingIp/actions/*
 * and Detail/PortForwarding/actions/*.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Checkbox, Form, Radio, Select } from 'antd';
import { IdNameCell } from '@/components/ResourcePage/helpers';
import { neutronApi, neutronResources } from '@/api/neutron';
import { novaApi } from '@/api/nova';
import { keystoneApi } from '@/api/keystone';
import { currentProjectId } from '@/api/endpoints';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import { quotaItem } from '@/components/Quota/utils';
import { fetchNeutronQuota } from '@/components/Quota/services';
import { ipRule, listAll, subnetLabel } from '@/pages/Network/common';
import {
  SelectTable,
  fixedIpColumns,
  getCanReachSubnets,
  getInterfaceWithReason,
  getPortForwardingName,
  getPortsAndReasons,
  hasPortForwardings,
  isFipAssociated,
  isPortRange,
  portForwardingProtocols,
  portRangeRule,
  portSelectColumns,
  qosEnabled,
} from './helpers';


const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([k, v]) => v !== undefined && !k.startsWith('_')));

const isAdminPath = () => /-admin(\/|$)/.test(window.location.pathname);

/* ---------------- shared option loaders ---------------- */
const qosOptions = async () => {
  const policies = await listAll.qosPolicies();
  return policies.map((p) => ({
    value: p.id,
    label: `${p.name || p.id}${p.shared ? ` (${t('Shared')})` : ''}`,
  }));
};

const qosField = (options) =>
  qosEnabled() && {
    name: 'qos_policy_id',
    label: t('QoS Policy'),
    type: 'select',
    options,
    tip: t('Choosing a QoS policy can limit bandwidth and DSCP'),
  };

/* ---------------- Allocate ---------------- */
const quotaState = { left: undefined };

const quotaLeft = (q = {}) => {
  const { limit, used = 0, reserved = 0 } = q || {};
  if (limit === undefined || limit === null) return undefined;
  if (limit === -1) return Infinity;
  return Math.max(0, limit - used - reserved);
};


function SubnetSelect({ form, value, onChange }) {
  const networkId = Form.useWatch('floating_network_id', form);
  const [subnets, setSubnets] = useState([]);
  const [loading, setLoading] = useState(false);
  const prevNet = useRef(networkId);
  useEffect(() => {
    let alive = true;
    if (prevNet.current !== networkId) {
      prevNet.current = networkId;
      onChange?.(undefined);
    }
    if (!networkId) {
      setSubnets([]);
      return undefined;
    }
    setLoading(true);
    listAll.subnets({ network_id: networkId }).then((list) => {
      if (!alive) return;
      setSubnets(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkId]);
  const selected = subnets.find((s) => s.id === value);
  return (
    <div>
      <Select
        allowClear
        loading={loading}
        value={value}
        onChange={onChange}
        placeholder={t('Please select')}
        options={subnets.map((s) => ({ value: s.id, label: s.name || subnetLabel(s) }))}
      />
      {selected ? (
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
          <span>{t('Allocation Pools')}</span>
          {(selected.allocation_pools || []).map((pool) => (
            <div key={`${pool.start}-${pool.end}`}>
              {pool.start}--{pool.end}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const allocateAction = () => {
  const cache = {};
  return {
    id: 'allocate',
    type: 'modal',
    policy: 'create_floatingip',
    title: t('Allocate IP'),
    buttonText: t('Allocate IP'),
    width: qosEnabled() || isAdminPath() ? 820 : 600,
    // legacy FloatingIp/actions/Allocate showQuota: 1 (or the batch count) floating IP of the chosen project
    quota: async (item, values, qcache) => {
      const pid = values.project_id || currentProjectId();
      if (!pid) return [];
      if (qcache.pid !== pid) {
        qcache.pid = pid;
        qcache.promise = fetchNeutronQuota(pid).catch(() => null);
      }
      const quota = await qcache.promise;
      if (!quota?.floatingip) return [];
      quotaState.left = quotaLeft(quota.floatingip);
      const add = values.batch_allocate ? Number(values.count) || 0 : 1;
      return [quotaItem(quota.floatingip, { name: 'floatingip', title: t('Floating IP'), add })];
    },
    getFormItems: async () => {
      const isAdmin = isAdminPath();
      const [networks, qos, projects] = await Promise.all([
        listAll.networks({ 'router:external': true }),
        qosEnabled() ? qosOptions() : Promise.resolve([]),
        isAdmin
          ? keystoneApi
              .listProjects()
              .then((r) => r?.projects || [])
              .catch(() => useAuthStore.getState().projects || [])
          : Promise.resolve([]),
      ]);
      cache.networks = networks;
      return [
        {
          name: 'floating_network_id',
          label: t('Network'),
          type: 'select',
          required: true,
          options: networks.map((n) => ({ value: n.id, label: n.name || n.id })),
        },
        isAdmin && {
          name: 'project_id',
          label: t('Project'),
          type: 'select',
          required: true,
          options: projects.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` })),
        },
        {
          name: 'subnet_id',
          label: t('Subnet'),
          visible: (v) => !!v.floating_network_id,
          render: ({ form }) => <SubnetSelect form={form} />,
        },
        { name: 'batch_allocate', label: t('Batch Allocate'), type: 'switch' },
        {
          name: 'count',
          label: t('Count'),
          type: 'number',
          min: 1,
          required: true,
          visible: (v) => !!v.batch_allocate,
          rules: [
            {
              validator: (_, value) =>
                quotaState.left !== undefined && Number(value) > quotaState.left
                  ? Promise.reject(new Error(`${t('Quota exceeded')} (${t('Left')}: ${quotaState.left})`))
                  : Promise.resolve(),
            },
          ],
        },
        {
          name: 'floating_ip_address',
          label: t('Floating IP'),
          type: 'input',
          placeholder: t('Please input IP address'),
          visible: (v) => !!v.subnet_id && !v.batch_allocate,
          rules: [ipRule()],
        },
        { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
        qosField(qos),
      ].filter(Boolean);
    },
    getDefaultValues: () => {
      const values = { count: 2, batch_allocate: false };
      if (cache.networks?.length) values.floating_network_id = cache.networks[0].id;
      if (isAdminPath()) values.project_id = currentProjectId();
      return values;
    },
    onSubmit: ({ subnet_id, batch_allocate, count, qos_policy_id, project_id, ...rest }) => {
      if (quotaState.left === 0) {
        return Promise.reject(new Error(t('Quota exceeded')));
      }
      const data = clean(rest);
      if (subnet_id) data.subnet_id = subnet_id;
      if (qos_policy_id) data.qos_policy_id = qos_policy_id;
      if (batch_allocate) {
        data.floating_ip_address = null;
        const promises = [];
        for (let i = 0; i < count; i++) promises.push(neutronApi.createFloatingIp(data));
        return Promise.all(promises);
      }
      return neutronApi.createFloatingIp({ ...data, project_id: project_id || currentProjectId() });
    },
  };
};

/* ---------------- Edit ---------------- */
export const editFloatingIpAction = () => ({
  id: 'edit-floating-ip',
  type: 'modal',
  policy: 'update_floatingip',
  title: t('Edit'),
  buttonText: t('Edit'),
  width: qosEnabled() ? 760 : 600,
  getFormItems: async () => {
    const qos = qosEnabled() ? await qosOptions() : [];
    return [
      { name: 'floating_ip_address', label: t('Floating IP'), type: 'label' },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
      qosField(qos),
    ].filter(Boolean);
  },
  getDefaultValues: (item) => ({
    floating_ip_address: item.floating_ip_address,
    description: item.description,
    qos_policy_id: item.qos_policy_id || undefined,
  }),
  onSubmit: (values, item) => {
    const body = { description: values.description };
    if (qosEnabled()) body.qos_policy_id = values.qos_policy_id || null;
    return neutronApi.updateFloatingIp(item.id, body);
  },
});

/* ---------------- Associate ---------------- */
const serverFixedIps = (server) => {
  const out = [];
  Object.values(server?.addresses || {}).forEach((list) =>
    (list || []).forEach((a) => a['OS-EXT-IPS:type'] === 'fixed' && out.push(a.addr))
  );
  return out;
};
const serverFloatingIps = (server) => {
  const out = [];
  Object.values(server?.addresses || {}).forEach((list) =>
    (list || []).forEach((a) => a['OS-EXT-IPS:type'] === 'floating' && out.push(a.addr))
  );
  return out;
};

function AssociateTarget({ fip, value, onChange }) {
  const [type, setType] = useState('instance');
  const [canReach, setCanReach] = useState([]);
  const [servers, setServers] = useState([]);
  const [ports, setPorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [ipRows, setIpRows] = useState([]);
  const [ipLoading, setIpLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getCanReachSubnets(fip?.floating_network_id).catch(() => []),
      listAll.servers(),
      listAll.ports({ device_owner: [''], project_id: currentProjectId() }),
    ]).then(([reach, srv, prt]) => {
      if (!alive) return;
      setCanReach(reach);
      setServers(srv);
      setPorts(prt);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [fip?.floating_network_id]);

  const changeType = (e) => {
    setType(e.target.value);
    setSelected(null);
    setIpRows([]);
    onChange?.(undefined);
  };

  const selectResource = async (row) => {
    setSelected(row);
    onChange?.(undefined);
    if (!row) {
      setIpRows([]);
      return;
    }
    setIpLoading(true);
    try {
      let interfaces = [row];
      if (type === 'instance') {
        const res = await novaApi.listInterfaces(row.id).catch(() => ({}));
        interfaces = res?.interfaceAttachments || [];
      }
      const withReason = await getInterfaceWithReason(interfaces);
      setIpRows(getPortsAndReasons(withReason, canReach, true));
    } finally {
      setIpLoading(false);
    }
  };

  const instanceColumns = [
    {
      title: t('ID/Name'),
      dataIndex: 'name',
      key: 'name',
      render: (v, r) => <IdNameCell id={r.id} name={v} />,
    },
    { title: t('Status'), dataIndex: 'status', key: 'status' },
    {
      title: t('Fixed IP'),
      key: 'fixed',
      render: (_, r) => serverFixedIps(r).map((ip) => <div key={ip}>{ip}</div>),
    },
    {
      title: t('Floating IP'),
      key: 'floating',
      render: (_, r) => {
        const list = serverFloatingIps(r);
        return list.length ? list.map((ip) => <div key={ip}>{ip}</div>) : '-';
      },
    },
  ];

  return (
    <div>
      <Radio.Group
        value={type}
        onChange={changeType}
        options={[
          { value: 'instance', label: t('Instance') },
          { value: 'port', label: t('Port') },
        ]}
        style={{ marginBottom: 12 }}
      />
      <div style={{ fontWeight: 500, margin: '4px 0' }}>{type === 'instance' ? t('Instance') : t('Port')}</div>
      {type === 'instance' ? (
        <SelectTable
          data={servers}
          loading={loading}
          columns={instanceColumns}
          value={selected}
          onChange={selectResource}
          disabledFunc={(r) => serverFixedIps(r).length === 0}
          searchKeys={['name', 'id', (r) => serverFixedIps(r).join(' ')]}
        />
      ) : (
        <SelectTable
          data={ports}
          loading={loading}
          columns={portSelectColumns()}
          value={selected}
          onChange={selectResource}
          disabledFunc={(r) => !(r.fixed_ips || []).length}
          searchKeys={['name', 'id', (r) => (r.fixed_ips || []).map((f) => f.ip_address).join(' ')]}
        />
      )}
      <div style={{ fontWeight: 500, margin: '12px 0 4px' }}>{type === 'instance' ? t('Instance IP') : t('Fixed IP')}</div>
      <SelectTable
        data={ipRows}
        loading={ipLoading}
        rowKey="key"
        columns={type === 'instance' ? fixedIpColumns(true, true, false) : fixedIpColumns(false, false, true)}
        value={value?._row}
        onChange={(row) =>
          onChange?.(row ? { port_id: row.port_id, fixed_ip_address: row.fixed_ip_address, _row: row } : undefined)
        }
        disabledFunc={(r) => !r.available}
        searchKeys={['name']}
      />
    </div>
  );
}

export const associateAction = () => ({
  id: 'associate',
  type: 'modal',
  policy: 'update_floatingip',
  title: t('Associate Floating IP'),
  buttonText: t('Associate'),
  width: 960,
  allowed: (item) =>
    !hasPortForwardings(item) && item.fixed_ip_address == null && item.status === 'DOWN' && item.port_details == null,
  getDefaultValues: (item) => ({ floatingIp: item.floating_ip_address }),
  getFormItems: (item) => [
    { name: 'floatingIp', label: t('Floating IP'), type: 'label' },
    {
      name: 'target',
      label: t('Resource Type'),
      required: true,
      rules: [
        {
          validator: (_, v) =>
            v?.port_id ? Promise.resolve() : Promise.reject(new Error(t('Please select a fixed IP address'))),
        },
      ],
      render: () => <AssociateTarget fip={item} />,
    },
  ],
  onSubmit: ({ target }, item) => {
    const body = { port_id: target.port_id };
    if (target.fixed_ip_address !== '' && target.fixed_ip_address !== undefined) {
      body.fixed_ip_address = target.fixed_ip_address;
    }
    return neutronApi.updateFloatingIp(item.id, body);
  },
});

/* ---------------- Disassociate ---------------- */
export const disassociateAction = () => ({
  id: 'disassociate',
  type: 'confirm',
  policy: 'update_floatingip',
  title: t('Disassociate'),
  buttonText: t('Disassociate'),
  actionName: t('Disassociate'),
  allowed: (item) => item.fixed_ip_address != null && item.status !== 'DOWN',
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await neutronApi.updateFloatingIp(it.id, { port_id: null });
    }
  },
});

/* ---------------- Release (with force release) ---------------- */
const forceState = { checked: false };
function ForceReleaseBox() {
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    forceState.checked = false;
  }, []);
  return (
    <div>
      <p>{t('Are you sure to {action}?', { action: t('Release') })}</p>
      <Checkbox
        style={{ marginTop: 6 }}
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          forceState.checked = e.target.checked;
        }}
      >
        {t('Force release')}
      </Checkbox>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
        {t('Floating IP has already been associate, Please check Force release.')}
      </div>
    </div>
  );
}

export const releaseAction = () => ({
  id: 'delete',
  type: 'confirm',
  policy: 'delete_floatingip',
  title: t('Release'),
  buttonText: t('Release'),
  actionName: t('Release'),
  isDanger: true,
  confirmText: <ForceReleaseBox />,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    if (list.some(isFipAssociated) && !forceState.checked) {
      throw new Error(t('Floating IP has already been associate, Please check Force release.'));
    }
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await neutronApi.deleteFloatingIp(it.id);
    }
  },
});

/* ---------------- Port forwarding ---------------- */
function PfTarget({ fip, initial, value, onChange }) {
  const [canReach, setCanReach] = useState([]);
  const [ports, setPorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [ipRows, setIpRows] = useState([]);
  const [ipLoading, setIpLoading] = useState(false);

  const loadIps = async (row, reach) => {
    setIpLoading(true);
    try {
      const withReason = await getInterfaceWithReason([row]);
      const rows = getPortsAndReasons(withReason, reach, true);
      setIpRows(rows);
      return rows;
    } finally {
      setIpLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const [reach, prt] = await Promise.all([
        getCanReachSubnets(fip?.floating_network_id).catch(() => []),
        listAll.ports({ device_owner: ['compute:nova', ''], project_id: currentProjectId() }),
      ]);
      if (!alive) return;
      setCanReach(reach);
      setPorts(prt);
      setLoading(false);
      if (initial?.internal_port_id) {
        let port = prt.find((p) => p.id === initial.internal_port_id);
        if (!port) port = (await neutronApi.getPort(initial.internal_port_id).catch(() => ({})))?.port;
        if (!alive || !port) return;
        setSelected(port);
        const rows = await loadIps(port, reach);
        const row = rows.find((r) => r.fixed_ip_address === initial.internal_ip_address) || {
          key: `${port.id}-${initial.internal_ip_address}`,
          name: initial.internal_ip_address,
          port_id: port.id,
          fixed_ip_address: initial.internal_ip_address,
          available: true,
        };
        if (alive) onChange?.({ port_id: port.id, fixed_ip_address: initial.internal_ip_address, _row: row });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fip?.floating_network_id]);

  const columns = [
    ...portSelectColumns(),
    { title: t('Status'), dataIndex: 'status', key: 'status' },
    {
      title: t('Bind Resource'),
      dataIndex: 'device_id',
      key: 'device_id',
      render: (v, r) =>
        v ? (
          <IdNameCell
            id={v}
            href={r.device_owner === 'compute:nova' ? `/compute/instance/detail/${v}` : undefined}
            bold={false}
          />
        ) : (
          '-'
        ),
    },
  ];

  return (
    <div>
      <div style={{ fontWeight: 500, margin: '4px 0' }}>{t('Target Port')}</div>
      <SelectTable
        data={ports}
        loading={loading}
        columns={columns}
        value={selected}
        onChange={async (row) => {
          setSelected(row);
          onChange?.(undefined);
          if (row) await loadIps(row, canReach);
          else setIpRows([]);
        }}
        disabledFunc={(r) => !(r.fixed_ips || []).length}
        searchKeys={['name', 'id', 'status', (r) => (r.fixed_ips || []).map((f) => f.ip_address).join(' ')]}
      />
      <div style={{ fontWeight: 500, margin: '12px 0 4px' }}>{t('Target IP Address')}</div>
      <SelectTable
        data={ipRows}
        loading={ipLoading}
        rowKey="key"
        columns={fixedIpColumns(false, false, true)}
        value={value?._row}
        onChange={(row) =>
          onChange?.(row ? { port_id: row.port_id, fixed_ip_address: row.fixed_ip_address, _row: row } : undefined)
        }
        disabledFunc={(r) => !r.available}
        searchKeys={['name']}
      />
    </div>
  );
}

const rangeOf = (value) => {
  const tmp = String(value || '').split(':');
  if (!tmp.length || tmp.length > 2) return [];
  return [parseInt(tmp[0], 10), parseInt(tmp[1], 10)];
};

const pfContent = (pf) =>
  `${pf.external_port || pf.external_port_range} => ${pf.internal_ip_address}:${pf.internal_port || pf.internal_port_range}`;

/** Port usage checks of legacy CreatePortForwarding / Edit */
const makePfValidators = ({ usedPorts, supportRange, editId }) => {
  const maxRangeSize = supportRange ? Infinity : 20;
  const maxRangeSizeTip = t(
    'The maximum batch size is {size}, that is, the size of the port range cannot exceed {size}.',
    { size: maxRangeSize }
  );
  const checkUsed = (port, type, protocol, target) =>
    usedPorts.find((pf) => {
      const range = type === 'external' ? pf.external_port_range : pf.internal_port_range;
      let base;
      if (range) {
        const [s, e] = rangeOf(range);
        base = port >= s && port <= e && pf.protocol === protocol;
      } else {
        const pfPort = type === 'external' ? pf.external_port : pf.internal_port;
        base = (!editId || editId !== pf.id) && port === pfPort && pf.protocol === protocol;
      }
      if (type === 'external' || !base) return base;
      return (
        (!editId || editId !== pf.id) &&
        pf.internal_port_id === target?.port_id &&
        pf.internal_ip_address === target?.fixed_ip_address
      );
    });
  const usedError = (items, name) => {
    if (items.length === 1 && typeof items[0] === 'object') {
      return t('The {name} has already been used by other {resource}({content}), please change.', {
        name,
        resource: t('port forwarding'),
        content: pfContent(items[0]),
      });
    }
    return t('The {name} {ports} have already been used, please change.', { name, ports: items.join(',') });
  };
  const checkRange = (input) => {
    const [start, end] = rangeOf(input);
    const length = end - start + 1;
    if (length <= 1) {
      return {
        error: t('The value of the upper limit of the range must be greater than the value of the lower limit of the range.'),
      };
    }
    if (length > maxRangeSize) return { error: maxRangeSizeTip };
    return { length, start, end };
  };
  const checkInput = (selfInput, otherInput, type, protocol, target) => {
    const selfIsRange = selfInput.includes(':');
    const otherIsRange = otherInput.includes(':');
    if (otherInput && selfIsRange !== otherIsRange) return t('Ports are either single values or ranges');
    const name = type === 'external' ? t('external port') : t('internal port');
    if (!selfIsRange) {
      const ret = checkUsed(parseInt(selfInput, 10), type, protocol, target);
      return ret ? usedError([ret], name) : '';
    }
    const { start, length, error } = checkRange(selfInput);
    if (error) return error;
    const ports = Array.from({ length }, (_, i) => start + i);
    const used = ports.filter((p) => checkUsed(p, type, protocol, target));
    if (used.length) {
      return usedError(used, type === 'external' ? t('external ports') : t('internal ports'));
    }
    if (!isPortRange(otherInput)) return '';
    const { length: otherLength } = checkRange(otherInput);
    if (!otherLength) return '';
    return length !== otherLength
      ? t('The size of the external port range is required to be the same as the size of the internal port range')
      : '';
  };
  const rule = (type) => ({ getFieldValue }) => ({
    validator: (_, val) => {
      const value = val === undefined || val === null ? '' : `${val}`;
      if (!isPortRange(value)) return Promise.resolve();
      const other = `${getFieldValue(type === 'external' ? 'internal_port' : 'external_port') ?? ''}`;
      const result = checkInput(value, other, type, getFieldValue('protocol'), getFieldValue('target'));
      return result ? Promise.reject(new Error(result)) : Promise.resolve();
    },
  });
  const portsOf = (input) => {
    const { length, start } = checkRange(input);
    return Array.from({ length }, (_, i) => start + i);
  };
  return { rule, portsOf, maxRangeSizeTip };
};

const checkRangeSupport = async (fipId) => {
  try {
    await neutronApi.listPortForwardings(fipId, { limit: 1, external_port_range: '80:81' });
    return true;
  } catch {
    return false;
  }
};

const integerPortRule = () => ({
  validator: (_, v) =>
    v === undefined || v === '' || (/^\d+$/.test(String(v)) && Number(v) >= 1 && Number(v) <= 65535)
      ? Promise.resolve()
      : Promise.reject(new Error(t('Enter an integer value between 1 and 65535.'))),
});

const pfFormItems = ({ fip, initial, validators, supportRange, isEdit }) => {
  const externalPortExtra = t('Input external port or port range (example: 80 or 80:160)');
  const internalPortExtra = t('Input internal port or port range (example: 80 or 80:160)');
  const singleOnly = isEdit && !supportRange;
  const tips = !isEdit && (
    <div>
      <p style={{ margin: 0 }}>
        {t('1. You can create {resources} using ports or port ranges.', { resources: t('port forwardings') })}
      </p>
      <p style={{ margin: 0 }}>
        {t(
          '2. In the same protocol, you cannot create multiple {resources} for the same source port or source port range.',
          { resources: t('port forwardings') }
        )}
      </p>
      <p style={{ margin: 0 }}>
        {t(
          '3. When using a port range to create a port mapping, the size of the external port range is required to be the same as the size of the internal port range. For example, the external port range is 80:90 and the internal port range is 8080:8090.'
        )}
      </p>
      {!supportRange && (
        <p style={{ margin: 0 }}>
          {t('4. When you use a port range to create {resources}, multiple {resources} will be created in batches.', {
            resources: t('port forwardings'),
          }) + validators.maxRangeSizeTip}
        </p>
      )}
    </div>
  );
  return [
    tips && { name: '_tips', type: 'alert', message: tips },
    { name: 'floatingIp', label: t('Floating IP'), type: 'label' },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
    {
      name: 'protocol',
      label: t('Protocol'),
      type: 'select',
      required: true,
      options: Object.entries(portForwardingProtocols()).map(([value, label]) => ({ value, label })),
    },
    {
      name: 'external_port',
      label: singleOnly ? t('External Port') : t('External Port/Port Range'),
      type: 'input',
      required: true,
      placeholder: singleOnly ? t('Please input {label}', { label: t('External Port') }) : externalPortExtra,
      tip: singleOnly ? t('Enter an integer value between 1 and 65535.') : externalPortExtra,
      rules: [singleOnly ? integerPortRule() : portRangeRule(), validators.rule('external')],
    },
    {
      name: 'target',
      label: `${t('Target Port')} / ${t('Target IP Address')}`,
      required: true,
      rules: [
        {
          validator: (_, v) =>
            v?.port_id ? Promise.resolve() : Promise.reject(new Error(t('Please select a fixed IP address'))),
        },
      ],
      render: () => <PfTarget fip={fip} initial={initial} />,
    },
    {
      name: 'internal_port',
      label: singleOnly ? t('Internal Port') : t('Internal Port/Port Range'),
      type: 'input',
      required: true,
      visible: (v) => !!v.target?.fixed_ip_address,
      placeholder: singleOnly ? t('Please input {label}', { label: t('Internal Port') }) : internalPortExtra,
      tip: singleOnly ? t('Enter an integer value between 1 and 65535.') : internalPortExtra,
      rules: [singleOnly ? integerPortRule() : portRangeRule(), validators.rule('internal')],
    },
  ].filter(Boolean);
};

const pfSubmitData = ({ floatingIp, target, external_port, internal_port, ...rest }) => {
  const data = clean(rest);
  const ext = String(external_port);
  const int = String(internal_port);
  if (ext.includes(':')) data.external_port_range = ext;
  else data.external_port = Number(ext);
  if (int.includes(':')) data.internal_port_range = int;
  else data.internal_port = Number(int);
  data.internal_ip_address = target.fixed_ip_address;
  data.internal_port_id = target.port_id;
  return data;
};

/**
 * Create port forwarding. `fip` given in detail page; when used as list row action
 * the floating IP is the row item.
 */
export const createPortForwardingAction = ({ fip, enabled } = {}) => {
  const state = {};
  return {
    id: 'create-port-forwarding',
    type: 'modal',
    policy: 'create_floatingip_port_forwarding',
    title: t('Create Port Forwarding'),
    buttonText: t('Create Port Forwarding'),
    width: 960,
    allowed: (item) => (item || fip)?.fixed_ip_address == null && (enabled === undefined ? true : enabled),
    getFormItems: async (item) => {
      const target = fip || item;
      state.fip = target;
      const [used, supportRange] = await Promise.all([
        neutronApi
          .listPortForwardings(target.id)
          .then((r) => r?.port_forwardings || [])
          .catch(() => []),
        checkRangeSupport(target.id),
      ]);
      state.supportRange = supportRange;
      state.validators = makePfValidators({ usedPorts: used, supportRange });
      return pfFormItems({ fip: target, validators: state.validators, supportRange, isEdit: false });
    },
    getDefaultValues: (item) => ({ floatingIp: (fip || item)?.floating_ip_address }),
    onSubmit: (values) => {
      const data = pfSubmitData(values);
      const fipId = state.fip.id;
      const { external_port_range, internal_port_range, ...rest } = data;
      if (!external_port_range || state.supportRange) {
        return neutronApi.createPortForwarding(fipId, data);
      }
      const externalPorts = state.validators.portsOf(external_port_range);
      const internalPorts = state.validators.portsOf(internal_port_range);
      return Promise.all(
        externalPorts.map((externalPort, index) =>
          neutronApi.createPortForwarding(fipId, {
            ...rest,
            external_port: externalPort,
            internal_port: internalPorts[index],
          })
        )
      );
    },
  };
};

export const editPortForwardingAction = ({ fip }) => {
  const state = {};
  return {
    id: 'edit',
    type: 'modal',
    policy: 'update_floatingip_port_forwarding',
    title: t('Edit Port Forwarding'),
    buttonText: t('Edit'),
    width: 960,
    getFormItems: async (item) => {
      const [used, supportRange] = await Promise.all([
        neutronApi
          .listPortForwardings(fip.id)
          .then((r) => r?.port_forwardings || [])
          .catch(() => []),
        checkRangeSupport(fip.id),
      ]);
      state.validators = makePfValidators({ usedPorts: used, supportRange, editId: item.id });
      return pfFormItems({ fip, initial: item, validators: state.validators, supportRange, isEdit: true });
    },
    getDefaultValues: (item) => ({
      floatingIp: fip?.floating_ip_address,
      description: item.description,
      protocol: item.protocol,
      external_port: item.external_port ?? item.external_port_range,
      internal_port: item.internal_port ?? item.internal_port_range,
    }),
    onSubmit: (values, item) => neutronApi.updatePortForwarding(fip.id, item.id, pfSubmitData(values)),
  };
};

export const deletePortForwardingAction = ({ fip }) => ({
  id: 'delete',
  type: 'confirm',
  policy: 'delete_floatingip_port_forwarding',
  title: t('Delete Port Forwarding'),
  buttonText: t('Delete'),
  actionName: t('delete port forwarding'),
  isDanger: true,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await neutronResources.portForwardings.delete(fip.id, it.id);
    }
  },
});

export { getPortForwardingName };
