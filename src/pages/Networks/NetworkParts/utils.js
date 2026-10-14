/**
 * Local port of legacy pages/network/containers/Network/actions/networkUtil.js
 * (allocation pools / DNS / host routes parsing + validation) and the
 * NetworkStore.createSubnet payload builder.
 */
import { neutronApi } from '@/api/neutron';
import { isIPv4, isIPv6, isCidr } from '@/components/network/ip';
import { t } from '@/core/i18n';

export const physicalNetworkArray = ['vlan', 'flat'];
export const segmentationNetworkArray = ['geneve', 'vxlan', 'vlan', 'gre'];
export const segmentationNetworkRequireArray = ['vlan', 'gre'];

export const segMax = (type = 'geneve') => {
  switch (type) {
    case 'vlan':
      return 4094;
    case 'gre':
      return 4294967295;
    default:
      return 16777215;
  }
};

export const segTip = (type = 'geneve') => {
  switch (type) {
    case 'geneve':
      return t('For GENEVE networks, valid segmentation IDs are 1 to 16777215');
    case 'vxlan':
      return t('For VXLAN networks, valid segmentation IDs are 1 to 16777215');
    case 'vlan':
      return t('For VLAN networks, valid segmentation IDs are 1 to 4094');
    case 'gre':
      return t('For GRE networks, valid segmentation IDs are 1 to 4294967295');
    default:
      return t('For GENEVE networks, valid segmentation IDs (VNIs) are 1 to 16777215');
  }
};

export const subnetIpv6Tip = () =>
  t('Default is slaac, for details, see https://docs.openstack.org/neutron/latest/admin/config-ipv6.html');

export const ipv6ModeOptions = () => [
  { label: t('DHCPv6-stateful'), value: 'dhcpv6-stateful' },
  { label: t('DHCPv6-stateless'), value: 'dhcpv6-stateless' },
  { label: t('SLAAC'), value: 'slaac' },
];

export const ipVersionStrOptions = () => [
  { label: t('IPv4'), value: 'ipv4' },
  { label: t('IPv6'), value: 'ipv6' },
];

export const dhcpOptions = () => [
  { label: t('Enabled'), value: true },
  { label: t('Disabled'), value: false },
];

/* ---------------- IP -> BigInt ---------------- */
export const ipToBigInt = (ip) => {
  const s = String(ip || '').trim();
  if (isIPv4(s)) {
    return s.split('.').reduce((acc, p) => (acc << 8n) + BigInt(Number(p)), 0n);
  }
  if (!isIPv6(s)) return null;
  let str = s;
  // embedded ipv4 tail
  const v4 = str.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = ipToBigInt(v4[1]);
    str = `${str.slice(0, -v4[1].length)}${(n >> 16n).toString(16)}:${(n & 0xffffn).toString(16)}`;
  }
  const [head, tail] = str.split('::');
  const h = head ? head.split(':') : [];
  const tl = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const fill = str.includes('::') ? new Array(8 - h.length - tl.length).fill('0') : [];
  const groups = [...h, ...fill, ...tl];
  if (groups.length !== 8) return null;
  return groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g || '0', 16)), 0n);
};

const bigIntToIp = (n, v6) => {
  if (!v6) {
    return [24n, 16n, 8n, 0n].map((s) => String((n >> s) & 255n)).join('.');
  }
  const groups = [];
  for (let i = 7; i >= 0; i -= 1) groups.push(((n >> BigInt(i * 16)) & 0xffffn).toString(16));
  // compress the longest run of zero groups
  let best = [-1, 0];
  let cur = [-1, 0];
  groups.forEach((g, i) => {
    if (g === '0') {
      cur = cur[0] === -1 ? [i, 1] : [cur[0], cur[1] + 1];
      if (cur[1] > best[1]) best = cur;
    } else {
      cur = [-1, 0];
    }
  });
  if (best[1] < 2) return groups.join(':');
  const left = groups.slice(0, best[0]).join(':');
  const right = groups.slice(best[0] + best[1]).join(':');
  return `${left}::${right}`;
};

/** First usable IP of a CIDR (legacy ipValidate.getFirstIpFromCidr) */
export const getFirstIpFromCidr = (cidr) => {
  if (!isCidr(cidr)) return '';
  const [ip, maskStr] = String(cidr).trim().split('/');
  const v6 = !isIPv4(ip);
  const bits = v6 ? 128n : 32n;
  const mask = BigInt(Number(maskStr));
  const n = ipToBigInt(ip);
  if (n === null) return '';
  const hostBits = bits - mask;
  const network = (n >> hostBits) << hostBits;
  if (hostBits <= 1n) return bigIntToIp(network, v6);
  return bigIntToIp(network + 1n, v6);
};

/* ---------------- text <-> array ---------------- */
const splitLines = (value) => String(value).trim().split(/\s*[\r\n]+\s*/g);

export const splitToArray = (value) => (typeof value === 'string' && value ? splitLines(value) : []);

export const getAllocationPools = (value) =>
  typeof value === 'string' && value
    ? splitLines(value).map((item) => {
        const [start, end] = item.split(',');
        return { start, end };
      })
    : [];

export const getHostRouters = (value) =>
  typeof value === 'string' && value
    ? splitLines(value).map((item) => {
        const [destination, nexthop] = item.split(',');
        return { destination, nexthop };
      })
    : [];

export const getAllocationPoolsIntoLines = (pools) =>
  pools?.length ? pools.map((p) => `${p.start},${p.end}`).join('\n') : undefined;
export const getDNSIntoLines = (dns) => (dns?.length ? dns.join('\n') : undefined);
export const getHostRoutesIntoLines = (routes) =>
  routes?.length ? routes.map((r) => `${r.destination},${r.nexthop}`).join('\n') : undefined;

/* ---------------- validators (antd rules) ---------------- */
const lineValidator = (hasError, msg) => (_, value) => {
  if (value && typeof value === 'string') {
    return splitLines(value).some(hasError) ? Promise.reject(new Error(msg)) : Promise.resolve();
  }
  return Promise.resolve();
};

const poolHasError = (isV4) => (line) => {
  const pool = line.split(',');
  if (pool.length !== 2) return true;
  const [s, e] = pool;
  const valid = isV4 ? isIPv4(s) && isIPv4(e) : isIPv6(s) && isIPv6(e);
  if (!valid) return true;
  return ipToBigInt(s) > ipToBigInt(e);
};

export const checkAllocationPools = (isV4) =>
  lineValidator(
    poolHasError(isV4),
    isV4
      ? t(
          'Invalid: Allocation Pools Format Error (e.g. 192.168.1.2,192.168.1.200) and start IP should be less than end IP'
        )
      : t(
          'Invalid: Allocation Pools Format Error (e.g. fd00:dead:beef:58::9,fd00:dead:beef:58::13) and start IP should be less than end IP'
        )
  );

/** legacy validateAllocationPoolsWithGatewayIp: gateway conflict + overlap + format */
export const validateAllocationPoolsWithGateway = (value, isV4, gatewayIp) => {
  if (value && typeof value === 'string') {
    const lines = splitLines(value);
    const parsed = lines.map((l) => {
      const [s, e] = l.split(',');
      return { line: l, s: ipToBigInt(s), e: ipToBigInt(e) };
    });
    const ok = parsed.every((p) => p.s !== null && p.e !== null);
    if (ok && parsed.length) {
      const sorted = [...parsed].sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
      const gw = gatewayIp ? ipToBigInt(gatewayIp) : null;
      if (gw !== null) {
        const conflict = sorted.find((p) => gw >= p.s && gw <= p.e);
        if (conflict) {
          return Promise.reject(
            new Error(
              t('Gateway IP {gateway_ip} conflicts with allocation pool {pool}', {
                gateway_ip: gatewayIp,
                pool: conflict.line.replace(',', '-'),
              })
            )
          );
        }
      }
      for (let i = 0; i < sorted.length - 1; i += 1) {
        if (sorted[i + 1].s < sorted[i].e) {
          return Promise.reject(
            new Error(
              t('Overlapping allocation pools: {pools}', {
                pools: `${sorted[i].line.replace(',', '-')}, ${sorted[i + 1].line.replace(',', '-')}`,
              })
            )
          );
        }
      }
    }
  }
  return checkAllocationPools(isV4)(null, value);
};

export const checkDNS = (isV4) =>
  lineValidator(
    (line) => !(isV4 ? isIPv4(line) : isIPv6(line)),
    isV4 ? t('Invalid: DNS Format Error (e.g. 114.114.114.114)') : t('Invalid: DNS Format Error (e.g. 1001:1001::)')
  );

export const checkHostRoutes = (isV4) =>
  lineValidator(
    (line) => {
      const [destination, nexthop] = line.trim().split(',');
      return !isCidr(destination, isV4 ? 4 : 6) && !nexthop;
    },
    isV4
      ? t('Host Routes Format Error (e.g. 192.168.200.0/24,10.56.1.254)')
      : t('Host Routes Format Error (e.g. ::0a38:01fe/24,::0a38:01fe)')
  );

const isV4Of = (getFieldValue) => (getFieldValue('ip_version') || 'ipv4') === 'ipv4';

/** Rules bound to the form's ip_version field (create network / create subnet) */
export const subnetRules = {
  cidr: (requiredFn) => [
    ({ getFieldValue }) => ({
      validator: (_, value) => {
        if (!value) {
          return requiredFn && requiredFn(getFieldValue)
            ? Promise.reject(new Error(`${t('Please input')} ${t('CIDR')}`))
            : Promise.resolve();
        }
        return isCidr(value, isV4Of(getFieldValue) ? 4 : 6)
          ? Promise.resolve()
          : Promise.reject(new Error(t('Invalid: ') + t('CIDR')));
      },
    }),
  ],
  gateway: [
    ({ getFieldValue }) => ({
      validator: (_, value) => {
        if (!value) return Promise.resolve();
        if (isV4Of(getFieldValue)) {
          return isIPv4(value) ? Promise.resolve() : Promise.reject(new Error(t('Invalid IP address')));
        }
        return isIPv6(value)
          ? Promise.resolve()
          : Promise.reject(new Error(t('Invalid: Please input a valid IPv6.')));
      },
    }),
  ],
  pools: [
    ({ getFieldValue }) => ({
      validator: (_, value) =>
        validateAllocationPoolsWithGateway(value, isV4Of(getFieldValue), getFieldValue('gateway_ip')),
    }),
  ],
  dns: [({ getFieldValue }) => ({ validator: (r, v) => checkDNS(isV4Of(getFieldValue))(r, v) })],
  hostRoutes: [({ getFieldValue }) => ({ validator: (r, v) => checkHostRoutes(isV4Of(getFieldValue))(r, v) })],
  raMode: [
    ({ getFieldValue }) => ({
      validator: (_, value) => {
        const mode = getFieldValue('ipv6_address_mode');
        if (!value && mode) return Promise.resolve();
        if (mode && mode !== value) return Promise.reject(new Error(t('Invalid combination')));
        return Promise.resolve();
      },
    }),
  ],
};

/** Port of legacy NetworkStore.createSubnet payload */
export const buildSubnetBody = (values) => {
  const {
    dns,
    host_routes,
    allocation_pools,
    project_id,
    network_id,
    subnet_name,
    enable_dhcp,
    ip_version,
    ipv6_address_mode,
    ipv6_ra_mode,
    gateway_ip,
    cidr,
    disable_gateway,
    subnetpool_id,
    prefixlen,
  } = values;
  const data = {
    project_id,
    name: subnet_name,
    enable_dhcp,
    network_id,
    dns_nameservers: splitToArray(dns),
    ip_version: ip_version === 'ipv4' ? 4 : 6,
    gateway_ip: disable_gateway || gateway_ip === '' ? null : gateway_ip,
  };
  if (allocation_pools && allocation_pools.length > 0) data.allocation_pools = allocation_pools;
  if (host_routes && host_routes.length > 0) data.host_routes = host_routes;
  if (subnetpool_id) {
    data.subnetpool_id = subnetpool_id;
    if (prefixlen) {
      const parsed = parseInt(prefixlen, 10);
      if (Number.isNaN(parsed)) throw new Error('Invalid prefixlen');
      data.prefixlen = parsed;
    }
  } else {
    data.cidr = cidr;
  }
  if (data.ip_version === 6) {
    data.ipv6_address_mode = ipv6_address_mode;
    data.ipv6_ra_mode = ipv6_ra_mode;
  }
  return data;
};

export const createSubnetRequest = (values) => neutronApi.createSubnet(buildSubnetBody(values));

/* ---------------- quota (legacy fetchProjectNeutronQuota) ---------------- */
export const fetchNeutronQuota = async (projectId) => {
  if (!projectId) return {};
  try {
    const res = await neutronApi.getQuota(projectId);
    const quota = res?.quota || {};
    return Object.fromEntries(
      Object.entries(quota).map(([k, v]) => {
        const { limit = -1, used = 0, reserved = 0 } = v || {};
        return [k, { limit, used, reserved, left: limit === -1 ? -1 : limit - used - reserved }];
      })
    );
  } catch {
    return {};
  }
};

export const quotaText = (quota, keys) =>
  keys
    .map(([key, label]) => {
      const q = quota?.[key];
      if (!q) return null;
      return `${label}: ${t('Used')} ${q.used} / ${q.limit === -1 ? t('Unlimited') : q.limit} (${t('Left')} ${
        q.left === -1 ? t('Unlimited') : q.left
      })`;
    })
    .filter(Boolean)
    .join(' | ');

/** BigInt-safe sum of subnet total_ips (legacy sumBigNumber) */
export const sumTotalIps = (list = []) => {
  try {
    return (list || []).reduce((acc, it) => acc + BigInt(it?.total_ips || 0), 0n).toString();
  } catch {
    return undefined;
  }
};
