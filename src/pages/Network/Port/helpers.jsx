/**
 * Port helpers - port of legacy resources/neutron/port.jsx, stores/neutron/port-extension.js,
 * stores/neutron/fixed-ip.js and the custom form items used by port actions
 * (mac-address, ip-distributor).
 */
import React, { useEffect, useState } from 'react';
import { Button, Col, Form, Input, Row, Select, Space, Typography } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { neutronApi } from '@/api/neutron';
import { novaApi } from '@/api/nova';
import { hasEndpoint } from '@/api/endpoints';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import { isIP, isIPv4, isIPv6, isCidr } from '../common';

const { Text } = Typography;

/* ---------------- resources/neutron/port.jsx ---------------- */
export const portStatus = () => ({
  ACTIVE: t('Active'),
  BUILD: t('Build'),
  DOWN: t('Down'),
  ERROR: t('Error'),
});

export const portState = () => ({ UP: t('Up'), DOWN: t('Down') });

export const bindingTypes = () => ({ normal: t('Normal'), direct: t('Direct'), macvtap: t('MacVTap') });

export const PORT_TYPES = 'normal,macvtap,direct,baremetal,direct-physical,virtio-forwarder,smart-nic'
  .split(',')
  .map((it) => ({ label: it, value: it }));

export const qosEnabled = () => hasEndpoint('neutron_qos');

export const ROUTER_OWNERS = [
  'network:router_interface',
  'network:ha_router_replicated_interface',
  'network:router_ha_interface',
];

/** Legacy "Device Owner" filter options (key = comma separated owners, 'none' = unbound) */
export const deviceOwnerOptions = () => [
  { label: t('Instance'), key: 'compute:nova' },
  {
    label: t('Router'),
    key: 'network:router_ha_interface,network:ha_router_replicated_interface,network:router_interface,network:router_gateway,network:router_interface_distributed,network:router_centralized_snat',
  },
  { label: t('Floating IP'), key: 'network:floatingip,network:floatingip_agent_gateway' },
  { label: t('DHCP Agent'), key: 'network:dhcp' },
  { label: t('Others'), key: 'network:local_ip,network:routed,network:distributed,compute:kuryr,Octavia' },
  { label: t('Unbounded'), key: 'none' },
];

/** Client-side equivalent of the legacy device_owner filter: tags each port with its option key */
export const deviceOwnerGroup = (owner) => {
  if (!owner) return 'none';
  const found = deviceOwnerOptions().find((o) => o.key !== 'none' && o.key.split(',').includes(owner));
  return found ? found.key : owner;
};

export const isPortError = (item) => String(item?.status || '').toLowerCase() === 'error';

export const currentProjectId = () => useAuthStore.getState()?.currentProject?.id;
export const hasAdminRole = () => Boolean(useAuthStore.getState()?.hasAdminRole);

const safeList = async (promise, key) => {
  try {
    const res = await promise;
    return res?.[key] || [];
  } catch {
    return [];
  }
};

/* ---------------- list (port-extension store) ---------------- */
const EXTENSION_KEYS = [
  'name',
  'status',
  'network_name',
  'network_id',
  'device_id',
  'device_owner',
  'uuid',
  'project_id',
  'tenant_id',
  'mac_address',
];

const splitIps = (fixedIps = []) => {
  const ips = (fixedIps || []).map((f) => f?.ip_address).filter(Boolean);
  return { ipv4: ips.filter((ip) => isIPv4(ip)), ipv6: ips.filter((ip) => !isIPv4(ip)) };
};

/** Normalizes a port coming from the skyline extension (or plain neutron) */
export const normalizePort = (it = {}) => {
  const raw = it.origin_data && typeof it.origin_data === 'object' ? it.origin_data : {};
  const item = { ...raw, ...it };
  const fixed = Array.isArray(item.fixed_ips) ? item.fixed_ips : [];
  const split = splitIps(fixed);
  return {
    ...item,
    fixed_ips: fixed,
    ipv4: Array.isArray(item.ipv4) ? item.ipv4 : split.ipv4,
    ipv6: Array.isArray(item.ipv6) ? item.ipv6 : split.ipv6,
    project_id: item.project_id || item.tenant_id,
    binding_vnic_type: item.binding_vnic_type || item['binding:vnic_type'],
    device_owner_group: deviceOwnerGroup(item.device_owner),
  };
};

/** Fallback when the skyline extension is unavailable: neutron ports + names */
const fetchPortsFromNeutron = async (params) => {
  const { all_projects, tenant_id, uuid, device_owner, network_name, ...rest } = params;
  const query = { ...rest };
  if (tenant_id) query.project_id = tenant_id;
  if (uuid) query.id = uuid;
  if (device_owner) query.device_owner = device_owner;
  const [portsRes, networks, servers] = await Promise.all([
    neutronApi.listPorts(query),
    safeList(neutronApi.listNetworks(), 'networks'),
    safeList(novaApi.listServers(all_projects ? { all_tenants: 1 } : {}), 'servers'),
  ]);
  const netMap = Object.fromEntries(networks.map((n) => [n.id, n.name]));
  const srvMap = Object.fromEntries(servers.map((s) => [s.id, s.name]));
  let ports = (portsRes?.ports || []).map((p) => ({
    ...p,
    network_name: netMap[p.network_id] || '',
    server_name: srvMap[p.device_id] || '',
  }));
  if (network_name) ports = ports.filter((p) => String(p.network_name).includes(network_name));
  return ports;
};

/**
 * fetchPorts - port of PortStore (port-extension) list fetch + listDidFetch.
 *  filters: any neutron list query (network_id, device_id, fixed_ips: ['subnet_id=..'], ...)
 *  subnetId: keep only fixed IPs of this subnet (legacy subnet detail)
 */
export const fetchPorts = async ({ isAdmin, projectId, filters = {}, subnetId } = {}) => {
  const params = {};
  const local = {};
  let subnet = subnetId;
  let fixedIpAddress;
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (key === 'fixed_ips') {
      (Array.isArray(value) ? value : [value]).forEach((f) => {
        const [k, v] = String(f).split('=');
        if (k === 'subnet_id') subnet = v;
        if (k === 'ip_address') fixedIpAddress = v;
      });
      return;
    }
    if (key === 'subnetId') {
      subnet = value;
      return;
    }
    if (key === 'device_owner' && typeof value === 'string') {
      params.device_owner = value === 'none' ? [''] : value.split(',');
      return;
    }
    if (EXTENSION_KEYS.includes(key)) params[key] = value;
    else local[key] = value;
  });
  if (isAdmin) params.all_projects = true;
  else if (!params.tenant_id && !params.project_id) params.tenant_id = projectId || currentProjectId();

  let list;
  try {
    const res = await neutronApi.skylineExtension('ports', params);
    list = res?.ports;
    if (!Array.isArray(list)) throw new Error('no ports');
  } catch {
    list = await fetchPortsFromNeutron(params);
  }
  let items = list.map(normalizePort);
  Object.entries(local).forEach(([key, value]) => {
    items = items.filter((it) => String(it[key]) === String(value));
  });
  if (fixedIpAddress) {
    items = items.filter((it) => it.fixed_ips.some((f) => f.ip_address === fixedIpAddress));
  }
  if (!items.length) return items;

  if (subnet) {
    const result = [];
    items.forEach((it) => {
      const newFixedIps = it.fixed_ips.filter((ip) => ip.subnet_id === subnet);
      if (newFixedIps.length) {
        const has = (ip) => newFixedIps.some((n) => n.ip_address === ip);
        result.push({
          ...it,
          fixed_ips: newFixedIps,
          ipv4: it.ipv4.filter(has),
          ipv6: it.ipv6.filter(has),
          subnet_id: subnet,
        });
      }
    });
    return result;
  }

  const fips = await safeList(neutronApi.listFloatingIps(), 'floatingips');
  return items.map((it) => ({
    ...it,
    associatedDetail: fips.filter(
      (f) => f.port_id === it.id && it.fixed_ips.some((ff) => ff.ip_address === f.fixed_ip_address)
    ),
  }));
};

/* ---------------- detail (port-extension detailDidFetch) ---------------- */
export const fetchPortDetail = async (id, { isAdmin } = {}) => {
  const port = (await neutronApi.getPort(id))?.port;
  if (!port) return port;
  const detail = { ...port };
  const fixedIps = Array.isArray(port.fixed_ips) ? port.fixed_ips : [];
  const [network, itemInList, qosPolicy] = await Promise.all([
    port.network_id
      ? neutronApi
          .getNetwork(port.network_id)
          .then((r) => r?.network)
          .catch(() => undefined)
      : undefined,
    fetchPorts({ isAdmin, filters: { uuid: [id] }, subnetId: undefined })
      .then((r) => (r || []).find((p) => p.id === id) || r?.[0] || {})
      .catch(() => ({})),
    port.qos_policy_id
      ? neutronApi
          .getQosPolicy(port.qos_policy_id)
          .then((r) => r?.policy)
          .catch(() => undefined)
      : undefined,
  ]);
  let associatedDetail = [];
  if (fixedIps.length) {
    const lists = await Promise.all(
      fixedIps.map((f) => safeList(neutronApi.listFloatingIps({ fixed_ip_address: f.ip_address, port_id: id }), 'floatingips'))
    );
    associatedDetail = lists.flat();
  }
  const split = splitIps(fixedIps);
  detail.network = network;
  detail.network_name = network?.name || itemInList?.network_name || '';
  detail.itemInList = { ...itemInList, associatedDetail };
  detail.qosPolicy = qosPolicy;
  detail.server_name = itemInList?.server_name;
  detail.ipv4 = split.ipv4;
  detail.ipv6 = split.ipv6;
  detail.associatedDetail = associatedDetail;
  detail.binding_vnic_type = port['binding:vnic_type'] || itemInList?.binding_vnic_type;
  detail.fixed_ips = fixedIps;
  return detail;
};

/* ---------------- fixed IPs (fixed-ip store) ---------------- */
export const fetchFixedIps = async (port) => {
  const fixedIps = Array.isArray(port?.fixed_ips) ? port.fixed_ips : [];
  const subnetIds = Array.from(new Set(fixedIps.map((it) => it.subnet_id).filter(Boolean)));
  const subnets = await Promise.all(
    subnetIds.map((sid) =>
      neutronApi
        .getSubnet(sid)
        .then((r) => r?.subnet)
        .catch(() => undefined)
    )
  );
  const subnetMap = {};
  subnets.forEach((s, idx) => {
    subnetMap[subnetIds[idx]] = s;
  });
  const fips = await Promise.all(
    fixedIps.map((f) => safeList(neutronApi.listFloatingIps({ fixed_ip_address: f.ip_address, port_id: port.id }), 'floatingips'))
  );
  return fixedIps.map((it, idx) => ({
    ...it,
    id: `${it.subnet_id}-${it.ip_address}`,
    name: it.ip_address,
    subnet: subnetMap[it.subnet_id],
    subnet_name: subnetMap[it.subnet_id]?.name || '',
    fip: fips[idx] || [],
    port,
  }));
};

/* ---------------- custom form items ---------------- */
const macRe = /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;

/** Legacy `mac-address` form item: value { type: 'auto' | 'manual', mac } */
export function MacAddressInput({ value, onChange, options }) {
  const v = value || {};
  const opts = options || [
    { label: t('Auto allocate MAC address'), value: 'auto' },
    { label: t('Manual input'), value: 'manual' },
  ];
  return (
    <Row gutter={12}>
      <Col span={12}>
        <Select
          placeholder={t('Please select')}
          options={opts}
          value={v.type}
          onChange={(type) => onChange?.({ ...v, type })}
          style={{ width: '100%' }}
        />
      </Col>
      <Col span={12}>
        {v.type === 'manual' ? (
          <Input value={v.mac} placeholder="fa:16:3e:00:00:00" onChange={(e) => onChange?.({ ...v, mac: e.target.value })} />
        ) : null}
      </Col>
    </Row>
  );
}

export const macAddressRule = () => ({
  validator: (_, value) => {
    if (!value || !value.type) return Promise.reject(new Error(`${t('Please select')} ${t('MAC Address')}`));
    if (value.type === 'manual' && !macRe.test(String(value.mac || '').trim())) {
      return Promise.reject(new Error(t('Invalid MAC Address. Please use ":" as separator.')));
    }
    return Promise.resolve();
  },
});

/** Legacy `ip-distributor` form item: value [{ subnet, ip_address: { type, ip } }] */
export function IpDistributor({ value, onChange, subnets = [], maxNumber = 10 }) {
  const list = Array.isArray(value) ? value : [];
  const update = (next) => onChange?.(next);
  if (!subnets.length) {
    return <Text type="secondary">{t('The selected network has no subnet')}</Text>;
  }
  return (
    <div>
      {list.map((entry, idx) => {
        const used = list.filter((e, i) => i !== idx && e?.subnet).map((e) => e.subnet);
        const subnet = subnets.find((s) => s.id === entry?.subnet);
        const ipType = entry?.ip_address?.type || 'auto';
        const setEntry = (patch) => update(list.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
        return (
          // eslint-disable-next-line react/no-array-index-key
          <Row key={idx} gutter={[12, 8]} style={{ marginBottom: 8 }} align="top">
            <Col span={9}>
              <Select
                placeholder={t('Please select')}
                value={entry?.subnet}
                style={{ width: '100%' }}
                options={subnets
                  .filter((s) => !used.includes(s.id))
                  .map((s) => ({ value: s.id, label: s.name || s.id }))}
                onChange={(sid) => setEntry({ subnet: sid, ip_address: { type: 'auto' } })}
              />
              {subnet ? (
                <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>{`${t('CIDR')}: ${subnet.cidr || '-'}`}</div>
              ) : null}
            </Col>
            {subnet ? (
              <Col span={13}>
                <Space.Compact style={{ width: '100%' }}>
                  <Select
                    value={ipType}
                    style={{ width: '50%' }}
                    options={[
                      { label: t('Automatically Assigned Address'), value: 'auto' },
                      { label: t('Manual input'), value: 'manual' },
                    ]}
                    onChange={(type) => setEntry({ ip_address: { type, ip: entry?.ip_address?.ip } })}
                  />
                  {ipType === 'manual' ? (
                    <Input
                      style={{ width: '50%' }}
                      value={entry?.ip_address?.ip}
                      placeholder={subnet.ip_version === 6 ? '2001:db8::10' : '192.168.0.10'}
                      onChange={(e) => setEntry({ ip_address: { type: 'manual', ip: e.target.value } })}
                    />
                  ) : null}
                </Space.Compact>
              </Col>
            ) : (
              <Col span={13} />
            )}
            <Col span={2}>
              <MinusCircleOutlined
                style={{ marginTop: 9, cursor: 'pointer' }}
                onClick={() => update(list.filter((_, i) => i !== idx))}
              />
            </Col>
          </Row>
        );
      })}
      {list.length < Math.min(maxNumber, subnets.length) ? (
        <Button type="dashed" block icon={<PlusOutlined />} onClick={() => update([...list, {}])}>
          {t('Add IP')}
        </Button>
      ) : null}
    </div>
  );
}

export const ipDistributorRule = () => ({
  validator: (_, value) => {
    const list = Array.isArray(value) ? value : [];
    for (const it of list) {
      if (!it || !it.subnet) return Promise.reject(new Error(t('Missing Subnet')));
      if (it.ip_address?.type === 'manual') {
        const ip = it.ip_address.ip;
        if (!ip) return Promise.reject(new Error(t('Missing IP Address')));
        if (!isIP(ip)) return Promise.reject(new Error(t('Invalid: Please input a valid IP')));
      }
    }
    return Promise.resolve();
  },
});

/** Subnet loader for the network chosen in the same form (legacy handleOwnedNetworkChange) */
export function NetworkIpDistributor({ value, onChange, form, networkField = 'network_id', networkId }) {
  const watched = Form.useWatch(networkField, form);
  const nid = networkId || watched;
  const [subnets, setSubnets] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!nid) {
      setSubnets([]);
      return undefined;
    }
    safeList(neutronApi.listSubnets({ network_id: nid }), 'subnets').then((list) => {
      if (alive) setSubnets(list);
    });
    return () => {
      alive = false;
    };
  }, [nid]);
  useEffect(() => {
    // Reset owned subnets after changing the network
    if (!networkId && watched !== undefined) onChange?.(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched]);
  if (!nid) return <Text type="secondary">{t('Please select a network first')}</Text>;
  return <IpDistributor value={value} onChange={onChange} subnets={subnets} />;
}

/** Select whose options depend on another field value of the same form */
export function DependentSelect({ value, onChange, form, depName, optionsFor, placeholder }) {
  const dep = Form.useWatch(depName, form);
  const options = dep ? optionsFor(dep) || [] : [];
  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder || t('Please select')}
      allowClear
      showSearch
      optionFilterProp="label"
      style={{ width: '100%' }}
    />
  );
}

/** Allowed address pair "CIDR or IP" check (legacy checkIpOrCidr) */
export const checkIpOrCidr = (value, ipVersion = 'ipv4') => {
  if (!value) return false;
  if (ipVersion === 'ipv4' && !(isIPv4(value) || isCidr(value, 4))) return false;
  if (ipVersion === 'ipv6' && !(isIPv6(value) || isCidr(value, 6))) return false;
  return true;
};

/* ---------------- QoS policy options (legacy getQoSPolicyTabs) ---------------- */
export const loadQosPolicyOptions = async ({ disabledId } = {}) => {
  const projectId = currentProjectId();
  const [project, shared, all] = await Promise.all([
    safeList(neutronApi.listQosPolicies({ project_id: projectId }), 'policies'),
    safeList(neutronApi.listQosPolicies({ shared: true }), 'policies'),
    hasAdminRole() ? safeList(neutronApi.listQosPolicies({ all_projects: true }), 'policies') : Promise.resolve([]),
  ]);
  const seen = new Set();
  const toOpts = (list) =>
    list
      .filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .map((p) => ({ value: p.id, label: p.name ? `${p.name} (${p.id})` : p.id, disabled: p.id === disabledId }));
  const groups = [
    { label: t('Current Project QoS Policies'), options: toOpts(project) },
    { label: t('Shared QoS Policies'), options: toOpts(shared) },
  ];
  if (hasAdminRole()) groups.push({ label: t('All QoS Policies'), options: toOpts(all) });
  return groups.filter((g) => g.options.length);
};

/* ---------------- floating IP helpers (legacy resources/neutron/floatingip + router) ---------------- */
const ROUTER_INTERFACE_OWNERS = [
  'network:router_interface_distributed',
  'network:router_interface',
  'network:ha_router_replicated_interface',
];

/** Builds the data needed by "Associate Floating IP": fixed IPs with reason + candidate FIPs per subnet */
export const loadAssociateFipData = async (port) => {
  const projectId = currentProjectId();
  const fixedIps = Array.isArray(port?.fixed_ips) ? port.fixed_ips : [];
  const [routers, routerPorts, externalNetworks, network, fipsOfPort] = await Promise.all([
    safeList(neutronApi.listRouters({ fields: ['id', 'external_gateway_info'], project_id: projectId }), 'routers'),
    safeList(neutronApi.listPorts({ device_owner: ROUTER_INTERFACE_OWNERS, fields: ['fixed_ips', 'device_id', 'device_owner'] }), 'ports'),
    safeList(neutronApi.listNetworks({ 'router:external': true }), 'networks'),
    port?.network_id
      ? neutronApi
          .getNetwork(port.network_id)
          .then((r) => r?.network)
          .catch(() => undefined)
      : undefined,
    Promise.all(
      fixedIps.map((f) =>
        isIPv4(f.ip_address)
          ? safeList(neutronApi.listFloatingIps({ fixed_ip_address: f.ip_address }), 'floatingips')
          : Promise.resolve([])
      )
    ),
  ]);
  // subnet -> router (routers with external gateway)
  const canReach = [];
  routerPorts.forEach((rp) => {
    const router = routers.find((r) => r.external_gateway_info && r.id === rp.device_id);
    if (router) (rp.fixed_ips || []).forEach((f) => canReach.push({ subnet_id: f.subnet_id, router_id: rp.device_id }));
  });
  const interfaces = fixedIps.map((f, idx) => {
    const isExternal = externalNetworks.some((n) => (n.subnets || []).includes(f.subnet_id));
    const bound = fipsOfPort[idx]?.[0];
    const floatingIP = (bound && bound.port_id === port.id && bound.floating_ip_address) || '';
    let available = true;
    let reason = '';
    if (!isIPv4(f.ip_address)) {
      reason = t('It is IPv6 type.');
      available = false;
    } else if (isExternal) {
      reason = t('Is external network port');
      available = false;
    } else if (floatingIP) {
      reason = `${t('Is associate to floating IP: ')} ${floatingIP}`;
      available = false;
    } else if (!canReach.some((c) => c.subnet_id === f.subnet_id)) {
      reason = t('It is unreachable for all floating IPs.');
      available = false;
    }
    return {
      fixed_ip_address: f.ip_address,
      subnet_id: f.subnet_id,
      mac_address: port.mac_address,
      network_name: network?.name || port.network_name || '',
      available,
      reason,
    };
  });
  // candidate FIPs per subnet (legacy getFipsFromRouterId)
  const extNetIds = Array.from(
    new Set(
      canReach
        .map((c) => routers.find((r) => r.id === c.router_id)?.external_gateway_info?.network_id)
        .filter(Boolean)
    )
  );
  const fipsByNet = {};
  await Promise.all(
    extNetIds.map(async (nid) => {
      const fips = await safeList(
        neutronApi.listFloatingIps({ floating_network_id: nid, status: 'DOWN', project_id: projectId }),
        'floatingips'
      );
      const netName = externalNetworks.find((n) => n.id === nid)?.name || nid;
      fipsByNet[nid] = fips
        .filter((fip) => !fip.fixed_ip_address && !fip.port_details)
        .map((fip) => ({ ...fip, network_name: netName }));
    })
  );
  const fipsForSubnet = (subnetId) => {
    const map = {};
    canReach
      .filter((c) => c.subnet_id === subnetId)
      .forEach((c) => {
        const nid = routers.find((r) => r.id === c.router_id)?.external_gateway_info?.network_id;
        (fipsByNet[nid] || []).forEach((fip) => {
          map[fip.id] = fip;
        });
      });
    return Object.values(map);
  };
  return { interfaces, fipsForSubnet };
};
