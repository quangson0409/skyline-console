/**
 * Octavia helpers - port of legacy resources/octavia/{lb.jsx,pool.js}, the octavia stores
 * (stores/octavia/*.js: list/detail mappers) and the barbican certificate lookups used by
 * the listener forms (stores/barbican/{containers,secrets}.js).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import apiClient from '@/api/client';
import { serviceBase } from '@/api/endpoints';
import { octaviaApi } from '@/api/octavia';
import { neutronApi } from '@/api/neutron';
import { novaApi } from '@/api/nova';
import { t } from '@/core/i18n';
import { adminSuffix } from '@/pages/Network/common';

/* ---------------- status maps ---------------- */
export const operatingStatus = () => ({
  ONLINE: t('Online'),
  DRAINING: t('Draining'),
  OFFLINE: t('Offline'),
  DEGRADED: t('Degraded'),
  ERROR: t('Error'),
  NO_MONITOR: t('No Monitor'),
});

export const provisioningStatus = () => ({
  ACTIVE: t('Active'),
  DELETED: t('Deleted'),
  ERROR: t('Error'),
  PENDING_CREATE: t('Pending Create'),
  PENDING_UPDATE: t('Pending Update'),
  PENDING_DELETE: t('Pending Delete'),
});

/** PENDING_* provisioning states are transitions (list / detail poll every 10s) */
export const isLbTransition = (item) => /^PENDING_/i.test(String(item?.provisioning_status || ''));

export const statusOptions = (map) => Object.entries(map).map(([key, label]) => ({ key, label }));

export const certificateMode = () => ({
  SERVER: t('Server Certificate'),
  CA: t('CA Certificate'),
});

export const certificateStatus = () => ({
  ACTIVE: t('Active'),
  ERROR: t('Error'),
});

export const sslParseMethod = () => [
  { label: t('One-way authentication'), value: 'one-way' },
  { label: t('Two-way authentication'), value: 'two-way' },
];

export const listenerProtocols = [
  { label: 'HTTP', value: 'HTTP' },
  { label: 'TCP', value: 'TCP' },
  { label: 'HTTPS', value: 'TERMINATED_HTTPS' },
  { label: 'UDP', value: 'UDP' },
];

export const poolProtocols = [
  { label: 'HTTP', value: 'HTTP' },
  { label: 'TCP', value: 'TCP' },
  { label: 'UDP', value: 'UDP' },
];

export const healthProtocols = [
  { label: 'HTTP', value: 'HTTP' },
  { label: 'TCP', value: 'TCP' },
  { label: 'UDP', value: 'UDP-CONNECT' },
];

/** legacy: pool / monitor protocol options are those whose label is part of the listener protocol */
export const poolProtocolOptions = (listenerProtocol = '', isOVN = false) => {
  const base = poolProtocols.filter((it) => String(listenerProtocol || '').includes(it.label));
  return isOVN ? base.filter((it) => ['TCP', 'UDP'].includes(it.value)) : base;
};

export const healthProtocolOptions = (protocol = '', isOVN = false) => {
  const base = healthProtocols.filter((it) => String(protocol || '').includes(it.label));
  return isOVN ? base.filter((it) => ['TCP', 'UDP-CONNECT'].includes(it.value)) : base;
};

export const listenerProtocolOptions = (isOVN = false) =>
  isOVN ? listenerProtocols.filter((it) => ['TCP', 'UDP'].includes(it.value)) : listenerProtocols;

export const protocolText = (value) => (value === 'TERMINATED_HTTPS' ? 'HTTPS' : value) || '-';

/** Health monitor types without an HTTP url path */
export const isUrlLessMonitor = (type) => type === 'TCP' || type === 'UDP-CONNECT';

/* ---------------- pool algorithms (resources/octavia/pool.js) ---------------- */
export const algorithmDict = () => ({
  LEAST_CONNECTIONS: t('Least Connections'),
  ROUND_ROBIN: t('Round Robin'),
  SOURCE_IP: t('Source IP'),
});

export const ovnAlgorithmDict = () => ({
  SOURCE_IP_PORT: t('Source IP Port'),
});

export const algorithmText = (value) => ({ ...algorithmDict(), ...ovnAlgorithmDict() })[value] || value || '-';

export const algorithmTip = () => ({
  LEAST_CONNECTIONS: t(
    'A dynamic scheduling algorithm that estimates the server load based on the number of currently active connections. The system allocates new connection requests to the server with the least number of current connections. Commonly used for long connection services, such as database connections and other services.'
  ),
  ROUND_ROBIN: t(
    'Each new connection request is assigned to the next server in order, and all requests are finally divided equally among all servers. Commonly used for short connection services, such as HTTP services.'
  ),
  SOURCE_IP: t(
    'Perform a consistent hash operation on the source IP address of the request to obtain a specific value. At the same time, the back-end server is numbered, and the request is distributed to the server with the corresponding number according to the calculation result. This can enable load distribution of visits from different source IPs, and at the same time enable requests from the same client IP to always be dispatched to a specific server. This method is suitable for load balancing TCP protocol without cookie function.'
  ),
  SOURCE_IP_PORT: t(
    'Similar to source IP but includes the source port in the hash, improving stickiness granularity for clients sharing the same IP.'
  ),
});

export const algorithmOptions = (isOVN = false) =>
  Object.entries(isOVN ? ovnAlgorithmDict() : algorithmDict()).map(([value, label]) => ({ value, label }));

/* ---------------- insert headers ---------------- */
export const INSERT_HEADER_KEYS = ['X-Forwarded-For', 'X-Forwarded-Port', 'X-Forwarded-Proto'];

export const insertHeaderTips = () => ({
  'X-Forwarded-For': t('Specify the client IP address'),
  'X-Forwarded-Port': t('Specify the listener port'),
  'X-Forwarded-Proto': t('When true this header is inserted'),
});

export const insertHeaderDesc = () =>
  t('The optional headers to insert into the request before it is sent to the backend member.');

/** form value is { 'X-Forwarded-For': bool, ... } (legacy check-group) */
export const getInsertHeadersValueFromForm = (values) => {
  if (!values) return null;
  const result = {};
  INSERT_HEADER_KEYS.forEach((key) => {
    if (values[key]) result[key] = 'true';
  });
  return Object.keys(result).length ? result : null;
};

export const getInsertHeadersFormValueFromListener = (listener) => {
  const insertHeaders = listener?.insert_headers || {};
  const result = {};
  INSERT_HEADER_KEYS.forEach((key) => {
    if (insertHeaders[key]) result[key] = insertHeaders[key] === 'true';
  });
  return result;
};

/* ---------------- validation ---------------- */
const nameRegex = /^[a-zA-Z一-龥][一-龥\w"'[\]^.:()_-]{0,127}$/;
const nameRegexWithoutChinese = /^[a-zA-Z][\w"'[\]^.:()_-]{0,127}$/;

/** legacy input-name rule (withoutChinese for load balancer names) */
export const nameRule = (withoutChinese = false) => ({
  validator: (_, value) => {
    if (!value) return Promise.resolve();
    if ((withoutChinese ? nameRegexWithoutChinese : nameRegex).test(value)) return Promise.resolve();
    return Promise.reject(
      new Error(
        withoutChinese
          ? t(
              'The name should start with upper letter or lower letter, and be a string of 1 to 128, characters can only contain "0-9, a-z, A-Z, "-\'_()[].:^".'
            )
          : t(
              'The name should start with upper letter, lower letter or chinese, and be a string of 1 to 128, characters can only contain "0-9, a-z, A-Z, "-\'_()[].:^".'
            )
      )
    );
  },
});

export const urlPathRule = () => ({
  validator: (_, value) =>
    value && !String(value).startsWith('/') ? Promise.reject(new Error(t('URL must start with /'))) : Promise.resolve(),
});

/* ---------------- paths ---------------- */
export const lbListPath = (isAdmin) => `/network/load-balancers${adminSuffix(isAdmin)}`;
export const lbDetailPath = (id, isAdmin) => `${lbListPath(isAdmin)}/detail/${id}`;
export const listenerDetailPath = (lbId, id, isAdmin) => `${lbListPath(isAdmin)}/${lbId}/listener/${id}`;

export const TitleWithTip = ({ title, tip }) => (
  <span>
    {title}{' '}
    <Tooltip title={tip}>
      <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
    </Tooltip>
  </span>
);

export const onOff = (v) => (v ? t('On') : t('Off'));

/* ---------------- fetchers (stores/octavia/*) ---------------- */
const safeList = async (promise, key) => {
  try {
    const res = await promise;
    return res?.[key] || [];
  } catch {
    return [];
  }
};

/** legacy fetchListByPageWithFip: floating IP bound to the VIP port of each load balancer */
const attachFips = async (items) => {
  const portIds = [...new Set(items.map((it) => it.vip_port_id).filter(Boolean))];
  const fips = [];
  for (let i = 0; i < portIds.length; i += 40) {
    // eslint-disable-next-line no-await-in-loop
    fips.push(...(await safeList(neutronApi.listFloatingIps({ port_id: portIds.slice(i, i + 40) }), 'floatingips')));
  }
  return items.map((it) => {
    const fip = fips.find((f) => f.port_id === it.vip_port_id && f.fixed_ip_address === it.vip_address);
    return { ...it, fip: fip ? fip.floating_ip_address : null, fip_id: fip ? fip.id : null };
  });
};

export const fetchLoadBalancers = async ({ isAdmin, projectId } = {}) => {
  // legacy listFilterByProject + fetchDataByCurrentProject: project scoped unless administrator page
  const params = isAdmin ? {} : { project_id: projectId };
  const res = await octaviaApi.listLoadBalancers(params);
  let items = res?.loadbalancers || [];
  if (!isAdmin && projectId) items = items.filter((it) => !it.project_id || it.project_id === projectId);
  return attachFips(items);
};

export const fetchLoadBalancerDetail = async (id) => {
  const lb = (await octaviaApi.getLoadBalancer(id))?.loadbalancer;
  if (!lb) return lb;
  const [withFip] = await attachFips([lb]);
  const [network, subnet, flavor] = await Promise.all([
    lb.vip_network_id
      ? neutronApi.getNetwork(lb.vip_network_id).then((r) => r?.network).catch(() => null)
      : null,
    lb.vip_subnet_id ? neutronApi.getSubnet(lb.vip_subnet_id).then((r) => r?.subnet).catch(() => null) : null,
    lb.flavor_id
      ? apiClient
          .get(`${serviceBase('octavia')}/lbaas/flavors/${lb.flavor_id}`)
          .then((r) => r?.flavor)
          .catch(() => null)
      : null,
  ]);
  return {
    ...withFip,
    vip_network_name: network?.name || '',
    vip_subnet_name: subnet?.name || '',
    vip_subnet_cidr: subnet?.cidr || '',
    flavor_name: flavor?.name || '',
  };
};

export const fetchListeners = async (lbId) => {
  const res = await octaviaApi.listListeners({ loadbalancer_id: lbId });
  return (res?.listeners || [])
    .map((it) => ({ ...it, lbIds: (it.loadbalancers || []).map((lb) => lb.id) }))
    .filter((it) => !lbId || !it.lbIds.length || it.lbIds.includes(lbId));
};

const refId = (ref, sep) => (ref ? String(ref).split(sep)[1] : undefined);

/** legacy ListenerStore.detailDidFetch */
export const fetchListenerDetail = async (id) => {
  const listener = (await octaviaApi.getListener(id))?.listener;
  if (!listener) return listener;
  const item = {
    ...listener,
    lbIds: (listener.loadbalancers || []).map((lb) => lb.id),
    serverCertificateId: refId(listener.default_tls_container_ref, '/containers/'),
    caCertificateId: refId(listener.client_ca_tls_container_ref, '/secrets/'),
    sniCertificateId: (listener.sni_container_refs || []).map((it) => refId(it, '/containers/')),
  };
  if (item.lbIds[0]) {
    try {
      item.loadBalancer = (await octaviaApi.getLoadBalancer(item.lbIds[0]))?.loadbalancer;
    } catch {
      item.loadBalancer = null;
    }
  }
  if (item.default_pool_id) {
    try {
      const pool = (await octaviaApi.getPool(item.default_pool_id))?.pool;
      item.default_pool = pool;
      if (pool?.healthmonitor_id) {
        item.healthMonitor = (await octaviaApi.getHealthMonitor(pool.healthmonitor_id))?.healthmonitor;
      }
    } catch {
      // pool may be gone
    }
  }
  return item;
};

export const fetchMembers = async (poolId) => {
  if (!poolId) return [];
  const res = await octaviaApi.listMembers(poolId);
  return res?.members || [];
};

export const fetchFlavors = async () => {
  const flavors = await safeList(octaviaApi.listFlavors(), 'flavors');
  return flavors.filter((it) => it.enabled === true);
};

/** legacy LoadBalancerProviderStore: [{ label, value, ...provider }], fallback amphora / ovn */
export const fetchProviders = async () => {
  const providers = await safeList(octaviaApi.listProviders(), 'providers');
  return providers.map((p) => ({ label: p.name, value: p.name, ...p }));
};

/* ---------------- ports for the member allocator (stores/neutron/port-extension withInstanceName) ---------------- */
export const fetchMemberPorts = async (projectId) => {
  let ports = [];
  try {
    const res = await neutronApi.skylineExtension('ports', projectId ? { tenant_id: projectId } : {});
    ports = res?.ports || [];
  } catch {
    ports = await safeList(neutronApi.listPorts(projectId ? { project_id: projectId } : {}), 'ports');
  }
  ports = ports.filter((p) => p.device_owner !== 'network:dhcp' && p.device_owner !== 'network:router_gateway');
  if (ports.some((p) => String(p.device_owner || '').startsWith('compute:') && p.device_id)) {
    try {
      const res = await novaApi.listServers();
      const map = new Map((res?.servers || []).map((s) => [s.id, s.name]));
      ports = ports.map((p) =>
        String(p.device_owner || '').startsWith('compute:') && p.device_id
          ? { ...p, instance_name: map.get(p.device_id) || '' }
          : p
      );
    } catch {
      // instance names are optional
    }
  }
  return ports;
};

/* ---------------- barbican certificates (stores/barbican/*) ---------------- */
const barbicanBase = () => serviceBase('barbican');

const listAllBarbican = async (resource, key, params = {}) => {
  const limit = 100;
  let data = [];
  // legacy requestListAllByLimit: offset paging until total
  for (let guard = 0; guard < 50; guard += 1) {
    const offset = data.length;
    // eslint-disable-next-line no-await-in-loop
    const res = await apiClient.get(`${barbicanBase()}/${resource}`, {
      params: { ...params, limit, offset },
      headers: { accept: 'application/json' },
    });
    const items = res?.[key] || [];
    data = [...data, ...items];
    if (!items.length || data.length >= (res?.total ?? 0)) break;
  }
  return data;
};

const parseAlgorithm = (algorithm) => {
  if (!algorithm || !String(algorithm).startsWith('{')) return {};
  try {
    return JSON.parse(algorithm);
  } catch {
    return {};
  }
};

const mapSecret = (data) => {
  const id = refId(data.secret_ref, '/secrets/');
  const { expiration, domain } = parseAlgorithm(data.algorithm);
  return { ...data, id, domain, expiration: expiration || data.expiration };
};

const listenerUsage = (ref, listeners) => {
  const used = listeners.filter((ls) =>
    [ls.default_tls_container_ref, ls.client_ca_tls_container_ref, ...(ls.sni_container_refs || [])].includes(ref)
  );
  return used.length ? used.map((ls) => ({ id: ls.id, name: ls.name, lb: (ls.loadbalancers || [])[0]?.id })) : undefined;
};

const allListeners = () => safeList(octaviaApi.listListeners(), 'listeners');

/** CA certificates (legacy SecretsStore.fetchList({ mode: 'CA' })) - empty when barbican is unavailable */
export const fetchCaSecrets = async () => {
  try {
    const [secrets, listeners] = await Promise.all([listAllBarbican('secrets', 'secrets', { mode: 'CA' }), allListeners()]);
    return secrets.map(mapSecret).map((it) => ({ ...it, mode: it.mode || 'CA', listener: listenerUsage(it.secret_ref, listeners) }));
  } catch {
    return [];
  }
};

/** Server certificate containers (legacy ContainersStore.fetchList) - empty when barbican is unavailable */
export const fetchCertificateContainers = async () => {
  try {
    const [containers, secrets, listeners] = await Promise.all([
      listAllBarbican('containers', 'containers'),
      listAllBarbican('secrets', 'secrets', { mode: 'SERVER' }),
      allListeners(),
    ]);
    const serverSecrets = secrets.map(mapSecret);
    return containers
      .map((it) => {
        const refs = it.secret_refs || [];
        if (!refs.length) return null;
        let algorithm;
        let mode;
        let hidden = false;
        refs.forEach((secret) => {
          const theSecret = serverSecrets.find((s) => s.id === refId(secret.secret_ref, '/secrets/'));
          if (theSecret) {
            algorithm = theSecret.algorithm;
            mode = theSecret.mode;
          } else {
            hidden = true;
          }
        });
        if (hidden) return null;
        const { domain, expiration } = parseAlgorithm(algorithm);
        return {
          ...it,
          id: refId(it.container_ref, '/containers/'),
          algorithm,
          mode,
          domain,
          expiration,
          listener: listenerUsage(it.container_ref, listeners),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

/** Certificate links (legacy certificateContainerDetail / certificateSecretDetail routes) */
export const certificateContainerLink = (id) =>
  id ? <Link to={`/network/certificate-container/detail/${id}`}>{id}</Link> : '-';
export const certificateSecretLink = (id) =>
  id ? <Link to={`/network/certificate-secret/detail/${id}`}>{id}</Link> : '-';
