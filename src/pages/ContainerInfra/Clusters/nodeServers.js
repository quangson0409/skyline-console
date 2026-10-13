import { neutronApi } from '@/api/neutron';
import { currentProjectId } from '@/api/endpoints';
import { useAuthStore } from '@/store/authStore';
import { settled } from '../common';

/**
 * Port of legacy stores/magnum/clusters.js node -> server resolution:
 * master/node addresses (IP, uuid or hostname) of a cluster are matched against the servers of the
 * cluster project so the detail page can link every node to its instance, and the cluster network /
 * subnet can be derived from the node ports when the cluster and template do not define them.
 */

const hasAdminRole = () => {
  try {
    return Boolean(useAuthStore.getState().hasAdminRole);
  } catch {
    return false;
  }
};

export const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const normalizeIpv4 = (value) => (IPV4_RE.test(value) ? value.split('.').map((p) => String(Number(p))).join('.') : null);

/** Canonical (RFC 5952-like) form of an IPv6 address, or null */
const normalizeIpv6 = (value) => {
  if (!/^[0-9a-f:.]+$/i.test(value) || !value.includes(':')) return null;
  let head = value;
  let tailV4 = [];
  const lastColon = value.lastIndexOf(':');
  const last = value.slice(lastColon + 1);
  if (last.includes('.')) {
    const v4 = normalizeIpv4(last);
    if (!v4) return null;
    const parts = v4.split('.').map(Number);
    tailV4 = [((parts[0] << 8) | parts[1]).toString(16), ((parts[2] << 8) | parts[3]).toString(16)];
    head = value[lastColon - 1] === ':' ? value.slice(0, lastColon + 1) : value.slice(0, lastColon);
  }
  const doubles = head.split('::');
  if (doubles.length > 2) return null;
  const left = doubles[0] ? doubles[0].split(':') : [];
  const right = doubles.length === 2 && doubles[1] ? doubles[1].split(':') : [];
  const total = 8 - tailV4.length;
  let groups;
  if (doubles.length === 2) {
    const fill = total - left.length - right.length;
    if (fill < 1) return null;
    groups = [...left, ...Array(fill).fill('0'), ...right];
  } else {
    groups = left;
  }
  groups = [...groups, ...tailV4];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  const norm = groups.map((g) => parseInt(g, 16).toString(16));
  // compress the longest run of zero groups (length >= 2)
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; i += 1) {
    if (norm[i] === '0') {
      let j = i;
      while (j < 8 && norm[j] === '0') j += 1;
      if (j - i > bestLen && j - i >= 2) {
        bestStart = i;
        bestLen = j - i;
      }
      i = j;
    }
  }
  if (bestStart === -1) return norm.join(':');
  return `${norm.slice(0, bestStart).join(':')}::${norm.slice(bestStart + bestLen).join(':')}`;
};

export const getIpAddress = (value) => {
  if (typeof value !== 'string' || /[/\s%]/.test(value)) return null;
  return normalizeIpv4(value) || normalizeIpv6(value);
};

const normalizeNodeReference = (value) => getIpAddress(value) || String(value || '').toLowerCase();

const getClusterProjectId = (item) =>
  item?.project_id || item?.tenant_id || item?.project?.id || (typeof item?.project === 'string' ? item.project : null);

const getServerProjectParams = (item, allProjects) => {
  const allowed = hasAdminRole();
  const projectId = getClusterProjectId(item) || (!allProjects ? currentProjectId() : null);
  return { all_projects: allowed, ...(allowed && projectId ? { project_id: projectId } : {}) };
};

const getNeutronProjectParams = (item, allProjects) => {
  const projectId = getClusterProjectId(item);
  const admin = hasAdminRole();
  const crossProject = admin && projectId && projectId !== currentProjectId();
  if (!admin || (!allProjects && !crossProject)) return {};
  return projectId ? { project_id: projectId } : {};
};

const getServerNames = (server) =>
  [
    server?.origin_data?.name,
    server?.name,
    server?.origin_data?.['OS-EXT-SRV-ATTR:hostname'],
    server?.['OS-EXT-SRV-ATTR:hostname'],
    server?.hostname,
  ].filter((name) => typeof name === 'string' && name);

const getServerAddresses = (server) => {
  const addresses = [...(server.fixed_addresses || []), ...(server.floating_addresses || [])];
  Object.values(server.origin_data?.addresses || server.addresses || {}).forEach((list) => {
    if (Array.isArray(list)) addresses.push(...list);
  });
  return addresses.map((a) => (typeof a === 'string' ? a : a?.addr || a?.ip_address)).filter(Boolean);
};

const getServerReferences = (server) => {
  const names = getServerNames(server);
  return [server.id, ...names, ...names.map((n) => n.split('.')[0]), ...getServerAddresses(server)]
    .filter(Boolean)
    .map(normalizeNodeReference);
};

const getNodeNames = (item) => {
  const reason = item.health_status_reason;
  if (!reason || typeof reason !== 'object') return [];
  return Object.keys(reason)
    .filter((key) => key !== 'api' && key.endsWith('.Ready'))
    .map((key) => key.replace(/\.Ready$/, ''));
};

export const getNodeReferences = (item) => {
  const refs = [...(item.master_addresses || []), ...(item.node_addresses || []), ...getNodeNames(item)];
  if (Array.isArray(item.nodegroups)) {
    item.nodegroups.forEach((g) => {
      if (Array.isArray(g?.node_addresses)) refs.push(...g.node_addresses);
    });
  }
  return [...new Set(refs.filter((v) => typeof v === 'string' && v))];
};

const listServers = (params) => neutronApi.skylineExtension('servers', params);

const getServersByReference = async (reference, item, allProjects) => {
  const ip = getIpAddress(reference);
  if (!isUuid(reference) && !ip) return [];
  try {
    const result = await listServers({
      ...getServerProjectParams(item, allProjects),
      ...(ip ? { ip } : { uuid: reference }),
      limit: 1000,
      sort_keys: 'uuid',
      sort_dirs: 'asc',
    });
    return result?.servers || [];
  } catch {
    return [];
  }
};

const getProjectServers = async (item, allProjects) => {
  const references = new Set(getNodeReferences(item).map(normalizeNodeReference));
  const byId = new Map();
  const markers = new Set();
  const projectParams = getServerProjectParams(item, allProjects);
  let marker;
  try {
    for (let page = 0; page < 50; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await listServers({
        ...projectParams,
        limit: 1000,
        sort_keys: 'uuid',
        sort_dirs: 'asc',
        ...(marker ? { marker } : {}),
      });
      const servers = result?.servers || [];
      if (!servers.length) break;
      servers.forEach((server) => {
        if (server?.id && getServerReferences(server).some((v) => references.has(v))) byId.set(String(server.id), server);
      });
      const next = servers[servers.length - 1]?.id;
      if (!next || markers.has(next)) break;
      markers.add(next);
      marker = next;
    }
  } catch {
    // ignore - nodes stay without links
  }
  return Array.from(byId.values());
};

const getNodegroupMatchScore = (server, item, reference) => {
  if (!Array.isArray(item.nodegroups)) return 0;
  const ref = normalizeNodeReference(reference);
  const metadata = server.origin_data?.metadata || server.metadata || {};
  const scores = item.nodegroups
    .filter((g) => (g?.node_addresses || []).some((a) => normalizeNodeReference(a) === ref))
    .map((g) => {
      const labels = { ...g.labels, ...g.node_labels };
      return Object.entries(labels).reduce((score, [key, value]) => {
        if (metadata[key] === undefined) return score;
        return score + (String(metadata[key]) === String(value) ? 1 : -1);
      }, 0);
    });
  return scores.length ? Math.max(...scores) : 0;
};

const getServerMatchRank = (server, item, reference) => {
  const names = getServerNames(server).map((n) => n.toLowerCase());
  const nodeNames = getNodeReferences(item)
    .filter((v) => !isUuid(v) && !getIpAddress(v))
    .map((n) => n.toLowerCase());
  const referenceIsName = !isUuid(reference) && !getIpAddress(reference);
  const expected = referenceIsName ? [reference.toLowerCase()] : nodeNames;
  const exactName = names.some((n) => expected.includes(n));
  const shortName = names.some((n) => expected.includes(n.split('.')[0]));
  const origin = server.origin_data || {};
  return [
    Number(String(origin.status || server.status).toUpperCase() === 'ACTIVE'),
    exactName ? 2 : Number(shortName),
    getNodegroupMatchScore(server, item, reference),
    Date.parse(origin.created || server.created_at || server.created) || 0,
    Date.parse(origin.updated || server.updated_at || server.updated) || 0,
  ];
};

const selectNodeServer = (servers, item, reference) => {
  const ref = normalizeNodeReference(reference);
  const candidates = servers
    .filter((server) => {
      if (isUuid(reference)) return String(server.id).toLowerCase() === ref;
      if (getIpAddress(reference)) return getServerAddresses(server).some((a) => normalizeNodeReference(a) === ref);
      return true;
    })
    .map((server) => ({ server, rank: getServerMatchRank(server, item, reference) }));
  candidates.sort((l, r) => {
    for (let i = 0; i < l.rank.length; i += 1) {
      const diff = r.rank[i] - l.rank[i];
      if (diff) return diff;
    }
    const a = String(l.server.id);
    const b = String(r.server.id);
    return a < b ? -1 : Number(a > b);
  });
  return candidates[0]?.server;
};

const buildNodeServerMap = (item, servers, allProjects) => {
  const candidatesByRef = new Map();
  const projectId = getClusterProjectId(item) || (!hasAdminRole() || !allProjects ? currentProjectId() : null);
  servers.forEach((server) => {
    const serverProjectId = server?.origin_data?.tenant_id || server?.project_id || server?.tenant_id;
    const status = server?.origin_data?.status || server?.status;
    if (
      !server?.id ||
      (projectId && serverProjectId && projectId !== serverProjectId) ||
      ['DELETED', 'SOFT_DELETED'].includes(String(status).toUpperCase())
    ) {
      return;
    }
    getServerReferences(server).forEach((ref) => {
      if (!candidatesByRef.has(ref)) candidatesByRef.set(ref, new Map());
      candidatesByRef.get(ref).set(String(server.id), server);
    });
  });
  const nodeServers = Object.create(null);
  const selected = new Map();
  getNodeReferences(item).forEach((reference) => {
    const candidates = candidatesByRef.get(normalizeNodeReference(reference));
    if (!candidates) return;
    const server = selectNodeServer(Array.from(candidates.values()), item, reference);
    if (server) {
      nodeServers[reference] = String(server.id);
      selected.set(String(server.id), server);
    }
  });
  return { nodeServers, servers: Array.from(selected.values()) };
};

export const resolveNodeServers = async (item, allProjects) => {
  const references = getNodeReferences(item);
  if (!references.length) return { nodeServers: {}, servers: [] };
  const direct = [
    ...new Set(references.filter((v) => isUuid(v) || getIpAddress(v)).map(normalizeNodeReference)),
  ];
  const byId = new Map();
  for (let offset = 0; offset < direct.length; offset += 20) {
    // eslint-disable-next-line no-await-in-loop
    const results = await settled(direct.slice(offset, offset + 20).map((ref) => getServersByReference(ref, item, allProjects)));
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        (r.value || []).forEach((s) => {
          if (s?.id) byId.set(String(s.id), s);
        });
      }
    });
  }
  const resolved = buildNodeServerMap(item, Array.from(byId.values()), allProjects);
  if (references.every((ref) => resolved.nodeServers[ref])) return resolved;
  const fallback = await getProjectServers(item, allProjects);
  fallback.forEach((s) => byId.set(String(s.id), s));
  return buildNodeServerMap(item, Array.from(byId.values()), allProjects);
};

const getPortForServer = (server, ports, preferredNetworkId) => {
  if (!ports.length) return null;
  const hasIps = (p) => Array.isArray(p?.fixed_ips) && p.fixed_ips.length;
  if (preferredNetworkId) {
    const p = ports.find((it) => it?.network_id === preferredNetworkId && hasIps(it));
    if (p) return p;
  }
  const fixed = new Set((server?.fixed_addresses || []).filter(Boolean));
  if (fixed.size) {
    const p = ports.find((it) => (it?.fixed_ips || []).some((ip) => fixed.has(ip?.ip_address)));
    if (p) return p;
  }
  const compute = ports.find((it) => String(it?.device_owner || '').startsWith('compute:') && hasIps(it));
  if (compute) return compute;
  return ports.find(hasIps) || null;
};

/** Legacy resolveClusterNetwork: derive fixed network / subnet ids from the node ports */
export const resolveClusterNetwork = async (item, servers, allProjects) => {
  if (!servers.length) return {};
  const params = getNeutronProjectParams(item, allProjects);
  const results = await settled(
    servers
      .filter((s) => s?.id)
      .map(async (server) => {
        const res = await neutronApi.listPorts({ device_id: server.id, ...params });
        const port = getPortForServer(server, res?.ports || [], item.fixed_network);
        return port ? { port, server } : null;
      })
  );
  const matched = results.find((r) => r.status === 'fulfilled' && r.value?.port);
  if (!matched) return {};
  const { port, server } = matched.value;
  const networkId = item.fixed_network || port.network_id;
  let subnetId = item.fixed_subnet;
  if (!subnetId) {
    const fixed = new Set((server?.fixed_addresses || []).filter(Boolean));
    const ip = (port.fixed_ips || []).find((it) => fixed.has(it?.ip_address));
    subnetId = ip?.subnet_id || port.fixed_ips?.[0]?.subnet_id;
  }
  return { networkId, subnetId };
};
