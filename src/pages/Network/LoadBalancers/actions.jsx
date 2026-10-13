/**
 * Octavia actions - port of legacy pages/network/containers/LoadBalancers/
 *   LoadBalancerInstance/actions/*, Listener/Actions/*, Listener/Detail/Member/Actions/*.
 * Payloads are identical to the legacy store calls (stores/octavia/*.js).
 */
import React from 'react';
import { Form, Input, Select, Typography } from 'antd';
import { octaviaApi } from '@/api/octavia';
import { neutronApi } from '@/api/neutron';
import { t } from '@/core/i18n';
import { loadAssociateFipData } from '@/pages/Network/Port/helpers';
import {
  nameRule,
  urlPathRule,
  sslParseMethod,
  listenerProtocols,
  poolProtocolOptions,
  healthProtocolOptions,
  algorithmOptions,
  algorithmTip,
  isUrlLessMonitor,
  getInsertHeadersValueFromForm,
  getInsertHeadersFormValueFromListener,
  fetchCertificateContainers,
  fetchCaSecrets,
  fetchListenerDetail,
  fetchMembers,
  fetchMemberPorts,
} from './helpers';
import {
  CertificateSelect,
  InsertHeadersInput,
  MemberAllocator,
  memberAllocatorRule,
  selectRequiredRule,
  selectValueFromIds,
} from './components';

const { Text } = Typography;

const toList = (target) => (Array.isArray(target) ? target : target ? [target] : []);
const isActive = (it) => it?.provisioning_status === 'ACTIVE';

/* =====================================================================
 * Load balancer
 * ===================================================================== */
export const createLoadBalancerAction = ({ navigate }) => ({
  id: 'lb-create',
  type: 'custom',
  title: t('Create Load Balancer'),
  onExecute: () => navigate('/network/load-balancers/create'),
});

export const editLoadBalancerAction = ({ isAdmin } = {}) => ({
  id: 'edit_load_balancer',
  type: 'modal',
  title: t('Edit Load Balancer'),
  buttonText: t('Edit'),
  allowed: (item) => !isAdmin && isActive(item),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [
    { name: 'name', label: t('Load Balancer Name'), type: 'input', required: true, rules: [nameRule(true)] },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => octaviaApi.updateLoadBalancer(item.id, values),
});

/** legacy Delete: current project (or system admin) and ACTIVE, or ERROR; always cascade */
export const deleteLoadBalancerAction = ({ hasAdminRole, projectId } = {}) => ({
  id: 'delete',
  type: 'confirm',
  title: t('Delete Load Balancer'),
  buttonText: t('Delete'),
  actionName: t('delete load balancer'),
  isDanger: true,
  allowed: (item) => {
    if (!item) return true;
    const isCurrentProject = hasAdminRole || !item.project_id || item.project_id === projectId;
    return (isCurrentProject && isActive(item)) || item.provisioning_status === 'ERROR';
  },
  confirmText: (items) => {
    const names = toList(items)
      .map((it) => it.name || it.id)
      .join(', ');
    return `${t('Are you sure to {action} (instance: {name})?', {
      action: t('Delete Load Balancer'),
      name: names,
    })} ${t('This will delete all child objects of the load balancer.')}`;
  },
  onSubmit: async (target) => {
    for (const it of toList(target)) {
      // eslint-disable-next-line no-await-in-loop
      await octaviaApi.deleteLoadBalancer(it.id, { cascade: true });
    }
  },
});

const vipPort = (item) => ({
  id: item.vip_port_id,
  network_id: item.vip_network_id,
  fixed_ips: [{ ip_address: item.vip_address, subnet_id: item.vip_subnet_id }],
});

export const associateFipAction = ({ isAdmin } = {}) => ({
  id: 'AssociateFip',
  type: 'modal',
  title: t('Associate Floating IP'),
  width: 760,
  allowed: (item) => !isAdmin && isActive(item) && (item.fip === null || item.fip === undefined),
  getDefaultValues: (item) => ({ lb: item.name || item.id, fixed_ip: item.vip_address }),
  getFormItems: async (item) => {
    const { interfaces, fipsForSubnet } = await loadAssociateFipData(vipPort(item));
    const bySubnet = Object.fromEntries(interfaces.map((i) => [i.fixed_ip_address, i.subnet_id]));
    return [
      { name: 'lb', label: t('Load Balancer'), type: 'label' },
      {
        name: 'fixed_ip',
        label: t('Fixed IP'),
        type: 'select',
        required: true,
        options: interfaces.map((i) => ({
          value: i.fixed_ip_address,
          disabled: !i.available,
          label: `${i.fixed_ip_address} | ${i.network_name || '-'}${i.reason ? ` - ${i.reason}` : ''}`,
        })),
      },
      {
        name: 'fip',
        label: t('Floating IP'),
        required: true,
        tip: t('The floating IP configured with port forwardings cannot be bound'),
        render: ({ form }) => <FipSelect form={form} fipsFor={(ip) => fipsForSubnet(bySubnet[ip])} />,
      },
    ];
  },
  onSubmit: (values, item) =>
    neutronApi.updateFloatingIp(values.fip, { port_id: item.vip_port_id, fixed_ip_address: values.fixed_ip }),
});

function FipSelect({ value, onChange, form, fipsFor }) {
  const fixedIp = Form.useWatch('fixed_ip', form);
  const options = fixedIp
    ? fipsFor(fixedIp).map((fip) => ({
        value: fip.id,
        label: `${fip.floating_ip_address} (${fip.network_name})`,
        disabled: (fip.port_forwardings || []).length > 0,
      }))
    : [];
  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      allowClear
      showSearch
      optionFilterProp="label"
      placeholder={t('Please select')}
      notFoundContent={fixedIp ? t('No available floating IP') : t('Please select fixed IP first')}
    />
  );
}

export const disassociateFipAction = () => ({
  id: 'disassociate-fip-from-lb',
  type: 'confirm',
  title: t('Disassociate Floating IP'),
  buttonText: t('Disassociate Floating IP'),
  actionName: t('Disassociate Floating IP'),
  allowed: (item) => isActive(item) && !!item.fip_id,
  onSubmit: (item) => neutronApi.updateFloatingIp(toList(item)[0].fip_id, { port_id: null }),
});

export const lbRowActions = (ctx) =>
  ctx.isAdmin
    ? { firstAction: deleteLoadBalancerAction(ctx), moreActions: [] }
    : {
        firstAction: editLoadBalancerAction(ctx),
        moreActions: [
          { action: associateFipAction(ctx) },
          { action: disassociateFipAction(ctx) },
          { action: deleteLoadBalancerAction(ctx) },
        ],
      };

/* =====================================================================
 * Listener
 * ===================================================================== */
const lbOf = (item, lb) => item?.loadBalancer || lb;
/** listener actions need the listener and its load balancer ACTIVE */
const listenerReady = (item, lb) => isActive(item) && (!lbOf(item, lb) || isActive(lbOf(item, lb)));

const isHttps = (v) => v.protocol === 'TERMINATED_HTTPS';

const listenerFormItems = ({ isEdit, containers, caSecrets, hasSni }) => [
  { name: 'name', label: t('Name'), type: 'input', required: true, rules: [nameRule()] },
  { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
  {
    name: 'protocol',
    label: t('Protocol'),
    type: 'select',
    options: listenerProtocols,
    required: true,
    disabled: isEdit,
  },
  {
    name: 'ssl_parsing_method',
    label: t('SSL Parsing Method'),
    type: 'select',
    options: sslParseMethod(),
    required: true,
    visible: isHttps,
  },
  {
    name: 'default_tls_container_ref',
    label: t('Server Certificate'),
    rules: [selectRequiredRule(t('Server Certificate'))],
    visible: isHttps,
    render: () => <CertificateSelect data={containers} />,
  },
  {
    name: 'client_ca_tls_container_ref',
    label: t('CA Certificate'),
    rules: [selectRequiredRule(t('CA Certificate'))],
    visible: (v) => isHttps(v) && v.ssl_parsing_method === 'two-way',
    render: () => <CertificateSelect data={caSecrets} withDomain={false} />,
  },
  {
    name: 'sni_enabled',
    label: t('SNI Enabled'),
    type: 'switch',
    visible: isHttps,
    disabled: isEdit && hasSni,
    tip: isEdit
      ? t(
          'If the listener has an SNI certificate installed, it cannot be removed. Please delete the listener or replace the SNI certificate'
        )
      : undefined,
  },
  {
    name: 'sni_container_refs',
    label: t('SNI Certificate'),
    rules: [selectRequiredRule(t('SNI Certificate'))],
    visible: (v) => isHttps(v) && !!v.sni_enabled,
    render: () => <CertificateSelect data={(containers || []).filter((it) => !!it.domain)} isMulti />,
  },
  {
    name: 'protocol_port',
    label: t('Port'),
    type: 'number',
    min: 1,
    max: 65535,
    required: true,
    disabled: isEdit,
  },
  {
    name: 'connection_limit',
    label: t('Connection Limit'),
    type: 'number',
    min: -1,
    tip: t('-1 means no connection limit'),
    required: true,
  },
  {
    name: 'admin_state_up',
    label: t('Admin State Up'),
    type: 'switch',
    tip: t('Defines the admin state of the listener.'),
  },
  {
    name: 'insert_headers',
    label: t('Custom Headers'),
    tip: t('The optional headers to insert into the request before it is sent to the backend member.'),
    render: () => <InsertHeadersInput />,
  },
];

const loadCertificates = async () => {
  const [containers, caSecrets] = await Promise.all([fetchCertificateContainers(), fetchCaSecrets()]);
  return { containers, caSecrets };
};

export const createListenerAction = (lb) => ({
  id: 'create_listener',
  type: 'modal',
  title: t('Create Listener'),
  width: 900,
  allowed: () => isActive(lb),
  getDefaultValues: () => ({
    ssl_parsing_method: 'one-way',
    sni_enabled: false,
    connection_limit: -1,
    admin_state_up: true,
  }),
  getFormItems: async () => listenerFormItems({ isEdit: false, ...(await loadCertificates()) }),
  onSubmit: (values) => {
    const {
      sni_enabled,
      ssl_parsing_method,
      default_tls_container_ref,
      client_ca_tls_container_ref,
      sni_container_refs,
      insert_headers,
      ...rest
    } = values;
    const data = { ...rest, loadbalancer_id: lb.id };
    const insertHeaders = getInsertHeadersValueFromForm(insert_headers);
    if (insertHeaders) data.insert_headers = insertHeaders;
    if (rest.protocol === 'TERMINATED_HTTPS') {
      if (default_tls_container_ref?.selectedRows?.length) {
        data.default_tls_container_ref = default_tls_container_ref.selectedRows[0].container_ref;
      }
      if (ssl_parsing_method === 'two-way' && client_ca_tls_container_ref?.selectedRows?.length) {
        data.client_ca_tls_container_ref = client_ca_tls_container_ref.selectedRows[0].secret_ref;
        data.client_authentication = 'MANDATORY';
      }
      if (sni_enabled && sni_container_refs?.selectedRows?.length) {
        data.sni_container_refs = sni_container_refs.selectedRows.map((it) => it.container_ref);
      }
    }
    return octaviaApi.createListener(data);
  },
});

const certCache = new Map();
const certsFor = (key) => {
  if (!certCache.has(key)) certCache.set(key, loadCertificates());
  return certCache.get(key);
};

export const editListenerAction = (lb) => ({
  id: 'edit-listener',
  type: 'modal',
  title: t('Edit Listener'),
  buttonText: t('Edit'),
  width: 900,
  allowed: (item) => listenerReady(item, lb),
  getFormItems: async (item) =>
    listenerFormItems({
      isEdit: true,
      hasSni: !!(item.sni_container_refs || []).length,
      ...(await certsFor(`edit-${item.id}`)),
    }),
  getDefaultValues: async (item) => {
    const { containers, caSecrets } = await certsFor(`edit-${item.id}`);
    certCache.delete(`edit-${item.id}`);
    const values = {
      name: item.name,
      description: item.description,
      protocol: item.protocol,
      protocol_port: item.protocol_port,
      connection_limit: item.connection_limit,
      insert_headers: getInsertHeadersFormValueFromListener(item),
      admin_state_up: item.admin_state_up,
    };
    if (item.protocol === 'TERMINATED_HTTPS') {
      if (item.default_tls_container_ref) {
        values.default_tls_container_ref = selectValueFromIds(
          [String(item.default_tls_container_ref).split('/containers/')[1]],
          containers
        );
      }
      if (item.client_ca_tls_container_ref) {
        values.ssl_parsing_method = 'two-way';
        values.client_ca_tls_container_ref = selectValueFromIds(
          [String(item.client_ca_tls_container_ref).split('/secrets/')[1]],
          caSecrets
        );
      } else {
        values.ssl_parsing_method = 'one-way';
      }
      if ((item.sni_container_refs || []).length) {
        values.sni_enabled = true;
        values.sni_container_refs = selectValueFromIds(
          item.sni_container_refs.map((it) => String(it).split('/containers/')[1]),
          containers.filter((it) => !!it.domain)
        );
      } else {
        values.sni_enabled = false;
      }
    }
    return values;
  },
  onSubmit: (values, item) => {
    const {
      protocol,
      protocol_port,
      sni_enabled,
      ssl_parsing_method,
      default_tls_container_ref,
      client_ca_tls_container_ref,
      sni_container_refs,
      insert_headers,
      ...rest
    } = values;
    const data = { ...rest };
    data.insert_headers = getInsertHeadersValueFromForm(insert_headers) || {};
    if (protocol === 'TERMINATED_HTTPS') {
      if (default_tls_container_ref?.selectedRows?.length) {
        data.default_tls_container_ref = default_tls_container_ref.selectedRows[0].container_ref;
      }
      if (ssl_parsing_method === 'two-way' && client_ca_tls_container_ref?.selectedRows?.length) {
        data.client_ca_tls_container_ref = client_ca_tls_container_ref.selectedRows[0].secret_ref;
        data.client_authentication = 'MANDATORY';
      } else {
        data.client_ca_tls_container_ref = null;
        data.client_authentication = 'NONE';
      }
      if (sni_enabled && sni_container_refs?.selectedRows?.length) {
        data.sni_container_refs = sni_container_refs.selectedRows.map((it) => it.container_ref);
      } else {
        data.sni_container_refs = [];
      }
    }
    return octaviaApi.updateListener(item.id, data);
  },
});

export const deleteListenerAction = (lb) => ({
  id: 'delete',
  type: 'confirm',
  title: t('Delete Listener'),
  buttonText: t('Delete'),
  actionName: t('delete listener'),
  isDanger: true,
  allowed: (item) => !item.default_pool_id && listenerReady(item, lb),
  onSubmit: async (target) => {
    for (const it of toList(target)) {
      // eslint-disable-next-line no-await-in-loop
      await octaviaApi.deleteListener(it.id);
    }
  },
});

/* ---------------- Default pool ---------------- */
function AlgorithmSelect({ value, onChange, options }) {
  const tip = value ? algorithmTip()[value] : null;
  return (
    <div>
      <Select value={value} onChange={onChange} options={options} placeholder={t('Please select')} style={{ width: '100%' }} />
      {tip ? (
        <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
          {tip}
        </Text>
      ) : null}
    </div>
  );
}

const isOvnOf = (item, lb) => lbOf(item, lb)?.provider === 'ovn';

export const createPoolAction = (lb) => ({
  id: 'pool-create',
  type: 'modal',
  title: t('Create Default Pool'),
  buttonText: t('Create Default Pool'),
  allowed: (item) => !item.default_pool_id && listenerReady(item, lb),
  getDefaultValues: () => ({ admin_state_up: true }),
  getFormItems: (item) => [
    { name: 'name', label: t('Pool Name'), type: 'input', required: true, rules: [nameRule()] },
    { name: 'description', label: t('Pool Description'), type: 'textarea', rows: 2 },
    {
      name: 'lb_algorithm',
      label: t('Pool Algorithm'),
      required: true,
      render: () => <AlgorithmSelect options={algorithmOptions(isOvnOf(item, lb))} />,
    },
    {
      name: 'protocol',
      label: t('Pool Protocol'),
      type: 'select',
      options: poolProtocolOptions(item.protocol),
      required: true,
    },
    {
      name: 'admin_state_up',
      label: t('Admin State Up'),
      type: 'switch',
      tip: t('Defines the admin state of the pool.'),
    },
  ],
  onSubmit: (values, item) => octaviaApi.createPool({ ...values, listener_id: item.id }),
});

export const editPoolAction = (lb) => ({
  id: 'pool-edit',
  type: 'modal',
  title: t('Edit Default Pool'),
  buttonText: t('Edit Default Pool'),
  allowed: (item) => !!item.default_pool_id && listenerReady(item, lb),
  getFormItems: async (item) => {
    const pool = item.default_pool || (await octaviaApi.getPool(item.default_pool_id))?.pool || {};
    return [
      { name: 'name', label: t('Name'), type: 'input', required: true, rules: [nameRule()] },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 2, rules: [{ max: 255 }] },
      {
        name: 'protocol',
        label: t('Protocol'),
        type: 'select',
        options: poolProtocolOptions(pool.protocol),
        required: true,
      },
      {
        name: 'lb_algorithm',
        label: t('Algorithm'),
        type: 'select',
        options: algorithmOptions(isOvnOf(item, lb)),
        required: true,
      },
      {
        name: 'admin_state_up',
        label: t('Admin State Up'),
        type: 'switch',
        tip: t('Defines the admin state of the pool.'),
      },
    ];
  },
  getDefaultValues: async (item) => {
    const pool = (await octaviaApi.getPool(item.default_pool_id))?.pool || {};
    const { name, description, protocol, lb_algorithm, admin_state_up } = pool;
    return { name, description, protocol, lb_algorithm, admin_state_up };
  },
  onSubmit: (values, item) => {
    const { protocol, ...others } = values;
    return octaviaApi.updatePool(item.default_pool_id, others);
  },
});

export const deletePoolAction = (lb) => ({
  id: 'delete-default-pool',
  type: 'confirm',
  title: t('Delete Default Pool'),
  buttonText: t('Delete Default Pool'),
  actionName: t('delete default pool'),
  isDanger: true,
  allowed: (item) => !!item.default_pool_id && listenerReady(item, lb),
  onSubmit: (target) => octaviaApi.deletePool(toList(target)[0].default_pool_id),
});

/* ---------------- Health monitor ---------------- */
function UrlPathInput({ value, onChange, form }) {
  const type = Form.useWatch('type', form);
  return (
    <Input
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={isUrlLessMonitor(type)}
      placeholder={t('e.g., /status.html or /healthcheck.html')}
    />
  );
}

const urlPathTip = () =>
  t(
    'Defaults to "/" if left blank. Recommended: use a dedicated status page like "/status.html". This option is not applicable for TCP and UDP health monitor types.'
  );

export { urlPathTip, UrlPathInput };

const hmCache = new Map();
const loadHm = (item) => {
  if (!hmCache.has(item.id)) {
    hmCache.set(
      item.id,
      fetchListenerDetail(item.id)
        .then((d) => d?.healthMonitor || null)
        .catch(() => null)
    );
  }
  return hmCache.get(item.id);
};

export const editHealthMonitorAction = (lb) => ({
  id: 'health-monitor-edit',
  type: 'modal',
  title: t('Edit Health Monitor'),
  buttonText: t('Edit Health Monitor'),
  allowed: (item) => !!item.default_pool_id && listenerReady(item, lb),
  getFormItems: async (item) => {
    const healthMonitor = await loadHm(item);
    const enabled = (v) => !!v.enableHealthMonitor;
    return [
      {
        name: 'enableHealthMonitor',
        label: t('Enable Health Monitor'),
        type: 'radio',
        required: true,
        options: [
          { label: t('Yes'), value: true },
          { label: t('No'), value: false },
        ],
      },
      {
        name: 'type',
        label: t('Health Monitor Type'),
        type: 'select',
        options: healthProtocolOptions(item.protocol),
        required: true,
        disabled: !!healthMonitor,
        visible: enabled,
      },
      {
        name: 'delay',
        label: t('Delay Interval (s)'),
        type: 'number',
        min: 0,
        tip: t('Maximum interval time for each health check response'),
        required: true,
        visible: enabled,
      },
      {
        name: 'timeout',
        label: t('Timeout (s)'),
        type: 'number',
        min: 0,
        tip: t(
          'The timeout period of waiting for the return of the health check request, the check timeout will be judged as a check failure'
        ),
        required: true,
        visible: enabled,
      },
      {
        name: 'max_retries',
        label: t('Max Retries'),
        type: 'number',
        min: 0,
        tip: t(
          'That is, after how many consecutive failures of the health check, the health check status of the back-end cloud server is changed from normal to abnormal'
        ),
        required: true,
        visible: enabled,
      },
      {
        name: 'admin_state_up',
        label: t('Admin State Up'),
        type: 'switch',
        tip: t('Defines the admin state of the health monitor.'),
        visible: enabled,
      },
      {
        name: 'url_path',
        label: t('Monitoring URL'),
        rules: [urlPathRule()],
        tip: urlPathTip(),
        visible: enabled,
        render: ({ form }) => <UrlPathInput form={form} />,
      },
    ];
  },
  getDefaultValues: async (item) => {
    const healthMonitor = await loadHm(item);
    hmCache.delete(item.id);
    if (!healthMonitor) {
      return { delay: 5, timeout: 3, max_retries: 3, enableHealthMonitor: false, admin_state_up: true, url_path: '/' };
    }
    const { admin_state_up, operating_status, type, delay, timeout, max_retries, url_path } = healthMonitor;
    return { enableHealthMonitor: true, admin_state_up, operating_status, type, delay, timeout, max_retries, url_path };
  },
  onSubmit: async (values, item) => {
    const detail = await fetchListenerDetail(item.id);
    const { id } = detail?.healthMonitor || {};
    const { enableHealthMonitor, type, url_path, ...others } = values;
    const updatedUrlPath = url_path ?? '/';
    if (id) {
      if (!enableHealthMonitor) return octaviaApi.deleteHealthMonitor(id);
      // Exclude url_path from payload when TCP or UDP-CONNECT is selected
      const editData = { ...others };
      if (!isUrlLessMonitor(type)) editData.url_path = updatedUrlPath;
      return octaviaApi.updateHealthMonitor(id, editData);
    }
    if (!enableHealthMonitor) return undefined;
    const data = { type, ...others, pool_id: item.default_pool_id };
    if (!isUrlLessMonitor(type)) data.url_path = updatedUrlPath;
    return octaviaApi.createHealthMonitor(data);
  },
});

/** legacy Listener actionConfigs / adminActions; empty when the load balancer is not ACTIVE */
export const listenerRowActions = ({ isAdmin, lb }) => {
  if (lb && !isActive(lb)) return { firstAction: null, moreActions: [] };
  if (isAdmin) {
    return {
      firstAction: deletePoolAction(lb),
      moreActions: [{ action: deleteListenerAction(lb) }],
    };
  }
  return {
    firstAction: editListenerAction(lb),
    moreActions: [
      { action: deleteListenerAction(lb) },
      { action: createPoolAction(lb) },
      { action: editPoolAction(lb) },
      { action: deletePoolAction(lb) },
      { action: editHealthMonitorAction(lb) },
    ],
  };
};

export const listenerPrimaryActions = ({ isAdmin, lb }) =>
  !isAdmin && lb && isActive(lb) ? [createListenerAction(lb)] : [];

/* =====================================================================
 * Members
 * ===================================================================== */
const memberPayload = ({ weight, protocol_port, address, name, subnet_id }) => ({
  weight,
  protocol_port,
  address,
  name,
  subnet_id,
});

const uniqMembers = (list) => {
  const seen = new Set();
  return list.filter((it) => {
    const key = JSON.stringify(it);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const addMemberAction = ({ listener, projectId, isAdmin }) => ({
  id: 'manage-member',
  type: 'modal',
  title: t('Add Member'),
  width: 980,
  allowed: () => isActive(listener) && !!listener.default_pool_id,
  getDefaultValues: () => ({ extMembers: [] }),
  getFormItems: async () => {
    const [members, ports, lb] = await Promise.all([
      fetchMembers(listener.default_pool_id).catch(() => []),
      fetchMemberPorts(projectId),
      listener.loadBalancer
        ? Promise.resolve(listener.loadBalancer)
        : octaviaApi
            .getLoadBalancer(listener.lbIds?.[0])
            .then((r) => r?.loadbalancer)
            .catch(() => null),
    ]);
    return [
      {
        name: 'amphora-tip',
        type: 'alert',
        alertType: 'info',
        message: t('The amphora instance is required for load balancing service setup and is not recommended'),
      },
      {
        name: 'extMembers',
        label: '',
        rules: [memberAllocatorRule(members)],
        render: () => <MemberAllocator ports={ports} lbSubnetId={lb?.vip_subnet_id || ''} isAdmin={isAdmin} />,
      },
    ];
  },
  onSubmit: async (values) => {
    const current = await fetchMembers(listener.default_pool_id);
    const members = current.map(memberPayload);
    (values.extMembers || []).forEach((member) => {
      const { ip, protocol_port, weight, name = null, subnet_id } = member.ip_address || {};
      members.push({ weight, protocol_port, address: ip, name, subnet_id });
    });
    return octaviaApi.batchUpdateMembers(listener.default_pool_id, uniqMembers(members));
  },
});

export const editMemberAction = ({ listener }) => ({
  id: 'member-edit',
  type: 'modal',
  title: t('Edit Member'),
  buttonText: t('Edit Member'),
  allowed: (item) => isActive(item),
  getDefaultValues: (item) => ({ weight: item.weight, protocol_port: item.protocol_port }),
  getFormItems: async (item) => {
    const members = await fetchMembers(listener.default_pool_id).catch(() => []);
    return [
      { name: 'weight', label: t('Weight'), type: 'number', min: 0, max: 256, required: true },
      {
        name: 'protocol_port',
        label: t('Port'),
        type: 'number',
        min: 1,
        max: 65535,
        required: true,
        rules: [
          {
            validator: (_, value) =>
              members.find((m) => m.address === item.address && value === m.protocol_port && value !== item.protocol_port)
                ? Promise.reject(new Error(t('Invalid IP Address and Port')))
                : Promise.resolve(),
          },
        ],
      },
    ];
  },
  onSubmit: async (value, item) => {
    const members = await fetchMembers(listener.default_pool_id);
    const data = members.map((member) => {
      const next = member.id === item.id ? { ...member, weight: value.weight, protocol_port: value.protocol_port } : member;
      return memberPayload(next);
    });
    return octaviaApi.batchUpdateMembers(listener.default_pool_id, data);
  },
});

export const deleteMemberAction = ({ listener }) => ({
  id: 'delete',
  type: 'confirm',
  title: t('Delete Member'),
  buttonText: t('Delete'),
  actionName: t('delete member'),
  isDanger: true,
  allowed: (item) => isActive(item),
  onSubmit: async (target) => {
    for (const it of toList(target)) {
      // eslint-disable-next-line no-await-in-loop
      await octaviaApi.deleteMember(listener.default_pool_id, it.id);
    }
  },
});

export const disableMemberAction = ({ listener }) => ({
  id: 'disable',
  type: 'confirm',
  title: t('Disable Member'),
  buttonText: t('Disable'),
  actionName: t('disable member'),
  allowed: (item) => isActive(item) && !!item.admin_state_up,
  onSubmit: (target) => octaviaApi.updateMember(listener.default_pool_id, toList(target)[0].id, { admin_state_up: false }),
});

export const enableMemberAction = ({ listener }) => ({
  id: 'enable',
  type: 'confirm',
  title: t('Enable Member'),
  buttonText: t('Enable'),
  actionName: t('enable member'),
  allowed: (item) => isActive(item) && item.admin_state_up === false,
  onSubmit: (target) => octaviaApi.updateMember(listener.default_pool_id, toList(target)[0].id, { admin_state_up: true }),
});

export const memberRowActions = (ctx) =>
  ctx.isAdmin
    ? {
        firstAction: deleteMemberAction(ctx),
        moreActions: [{ action: disableMemberAction(ctx) }, { action: enableMemberAction(ctx) }],
      }
    : {
        firstAction: editMemberAction(ctx),
        moreActions: [
          { action: deleteMemberAction(ctx) },
          { action: disableMemberAction(ctx) },
          { action: enableMemberAction(ctx) },
        ],
      };

export const memberPrimaryActions = (ctx) => (ctx.isAdmin ? [] : [addMemberAction(ctx)]);
