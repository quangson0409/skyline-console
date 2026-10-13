import { useState, useCallback, useEffect } from 'react';
import { novaApi } from '@/api/nova';
import { neutronApi } from '@/api/neutron';
import { keystoneApi } from '@/api/keystone';
import { placementApi } from '@/api/placement';
import { cinderApi } from '@/api/cinder';
import { quotaApi } from '@/api/quota';
import { hasEndpoint, currentProjectId } from '@/api/endpoints';
import { useAuthStore } from '@/store/authStore';

/**
 * Data hooks for the Overview pages - port of legacy
 *   pages/base/containers/Overview      (stores/keystone/project.fetchProjectQuota + stores/cinder/volume-type)
 *   pages/base/containers/AdminOverview (stores/overview-admin, stores/nova/hypervisor.getVirtualResource,
 *                                        stores/nova/server.getVirtualResourceOverview)
 * Every number comes from an API response; nothing is invented. Missing data stays undefined
 * so the page renders '-'.
 */

const settled = async (promise) => {
  if (!promise) return null;
  try {
    return await promise;
  } catch {
    return null;
  }
};

/** legacy utils getGiBValue: MiB -> GiB with 2 decimals */
export const getGiBValue = (input) => {
  if (typeof input !== 'number' || Number.isNaN(input) || !input) return 0;
  return parseFloat(Number(input / 1024).toFixed(2));
};

const num = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);

/** legacy projectStore.updateQuotaData: used = in_use, left = limit - used - reserved (-1 = unlimited) */
export const normalizeQuota = (quota) => {
  const out = {};
  Object.keys(quota || {}).forEach((key) => {
    const item = quota[key];
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const copy = { ...item };
      if (copy.in_use !== undefined) copy.used = copy.in_use;
      const { used = 0, limit = 0, reserved = 0 } = copy;
      copy.left = limit === -1 ? -1 : limit - used - reserved;
      out[key] = copy;
    } else {
      out[key] = item;
    }
  });
  return out;
};

// ---------------------------------------------------------------------------------------------
// Project overview
// ---------------------------------------------------------------------------------------------

/** legacy globalRootStore.checkEndpoint(...) gates used by QuotaOverview */
export const getProjectServices = () => {
  const { hasAdminOnlyRole } = useAuthStore.getState();
  return {
    cinder: hasEndpoint('cinder'),
    share: hasEndpoint('manilav2'),
    zun: hasEndpoint('zun'),
    magnum: hasEndpoint('magnum'),
    trove: hasEndpoint('trove') && Boolean(hasAdminOnlyRole),
    firewall: hasEndpoint('neutron_firewall'),
  };
};

/** Port of legacy projectStore.fetchProjectQuota({ project_id, withKeyPair: true }) + volumeTypeStore.fetchList() */
export async function fetchProjectQuota(projectId) {
  const svc = getProjectServices();
  const [nova, neutron, cinder, share, zun, magnum, magnumClusters, trove, keypairs, volumeTypes] =
    await Promise.all([
      settled(quotaApi.getNovaQuota(projectId)),
      settled(quotaApi.getNeutronQuota(projectId)),
      svc.cinder ? settled(quotaApi.getCinderQuota(projectId)) : null,
      svc.share ? settled(quotaApi.getShareQuota(projectId)) : null,
      svc.zun ? settled(quotaApi.getZunQuota(projectId)) : null,
      svc.magnum ? settled(quotaApi.getMagnumQuota(projectId)) : null,
      svc.magnum ? settled(quotaApi.listMagnumClusters()) : null,
      svc.trove ? settled(quotaApi.getTroveQuota(projectId)) : null,
      settled(novaApi.listKeypairsV()),
      svc.cinder ? settled(quotaApi.listVolumeTypes({})) : null,
    ]);

  const novaQuota = { ...(nova?.quota_set || {}) };
  // legacy updateNovaQuota: RAM shown in GiB
  if (novaQuota.ram && typeof novaQuota.ram === 'object') {
    const { limit = 0, in_use = 0, reserved = 0 } = novaQuota.ram;
    novaQuota.ram = {
      in_use: getGiBValue(in_use),
      limit: limit === -1 ? -1 : getGiBValue(limit),
      reserved: getGiBValue(reserved),
      limit_mb: limit,
      in_use_mb: in_use,
    };
  }
  const cinderQuota = cinder?.quota_set || {};
  const neutronQuota = neutron?.quota || {};

  const shareQuota = share?.quota_set || {};
  const renameShare = Object.keys(shareQuota).reduce((acc, k) => {
    acc[k.includes('share') ? k : `share_${k}`] = shareQuota[k];
    return acc;
  }, {});
  const zunQuota = zun && typeof zun === 'object' ? zun : {};
  const renameZun = Object.keys(zunQuota).reduce((acc, k) => {
    acc[`zun_${k}`] = zunQuota[k];
    return acc;
  }, {});
  const magnumQuota =
    magnum && magnum.hard_limit !== undefined
      ? {
          magnum_cluster: {
            limit: magnum.hard_limit,
            in_use: Array.isArray(magnumClusters?.clusters) ? magnumClusters.clusters.length : undefined,
          },
        }
      : {};
  const troveList = Array.isArray(trove?.quotas) ? trove.quotas : [];
  const renameTrove = troveList.reduce((acc, it) => {
    acc[`trove_${it.resource}`] = it;
    return acc;
  }, {});

  const quota = {
    ...novaQuota,
    ...cinderQuota,
    ...neutronQuota,
    ...renameShare,
    ...renameZun,
    ...magnumQuota,
    ...renameTrove,
  };
  // legacy withKeyPair: key pair usage = number of the user's key pairs
  if (quota.key_pairs && Array.isArray(keypairs?.keypairs)) {
    quota.key_pairs = { ...quota.key_pairs, in_use: keypairs.keypairs.length };
  }

  return {
    quota: normalizeQuota(quota),
    volumeTypes: Array.isArray(volumeTypes?.volume_types) ? volumeTypes.volume_types : [],
    services: svc,
  };
}

export function useProjectOverview() {
  const storeProjectId = useAuthStore((s) => s.currentProject?.id);
  const projectId = storeProjectId || currentProjectId();
  const [state, setState] = useState({ quota: {}, volumeTypes: [], services: getProjectServices() });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setState(await fetchProjectQuota(projectId));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ...state, loading, refetch: fetchData };
}

// ---------------------------------------------------------------------------------------------
// Admin overview
// ---------------------------------------------------------------------------------------------

/** legacy Base.requestListAllByLimit: marker paging on nova GET /servers */
async function listAllServers(params, limit = 1000) {
  let marker;
  let all = [];
  for (let i = 0; i < 100; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await novaApi.listServersBriefV({ ...params, limit, ...(marker ? { marker } : {}) });
    const items = Array.isArray(res?.servers) ? res.servers : [];
    all = all.concat(items);
    if (items.length < limit) break;
    marker = items[items.length - 1]?.id;
    if (!marker) break;
  }
  return all;
}

/** legacy overviewAdminStore.getProjectInfoData */
async function fetchPlatformInfo() {
  const [projects, users, hosts] = await Promise.all([
    settled(keystoneApi.listProjects()),
    settled(keystoneApi.listUsers()),
    settled(novaApi.listServicesV({ binary: 'nova-compute' })),
  ]);
  return {
    projectNum: Array.isArray(projects?.projects) ? projects.projects.length : undefined,
    userNum: Array.isArray(users?.users) ? users.users.length : undefined,
    nodeNum: Array.isArray(hosts?.services) ? hosts.services.length : undefined,
  };
}

/** legacy hypervisorStore.getVirtualResource (hypervisors + placement allocation ratios) */
async function fetchHypervisorUsage() {
  const res = await settled(novaApi.listHypervisorsV());
  if (!Array.isArray(res?.hypervisors)) return null;
  const { hypervisors } = res;
  const usePlacement = hasEndpoint('placement');
  const inventories = await Promise.all(
    hypervisors.map((it) => (usePlacement && it.id ? settled(placementApi.getInventories(it.id)) : null))
  );
  const data = {
    vcpus: 0,
    vcpus_used: 0,
    memory_mb: 0,
    memory_mb_used: 0,
    local_gb: 0,
    local_gb_used: 0,
    hasDisk: false,
    count: hypervisors.length,
  };
  hypervisors.forEach((raw, index) => {
    const item = { ...raw };
    if (item.hypervisor_type !== 'ironic') {
      const inv = inventories[index]?.inventories || {};
      const { allocation_ratio: vcpuRatio, total: vcpuTotal } = inv.VCPU || {};
      const { allocation_ratio: pcpuRatio, total: pcpuTotal } = inv.PCPU || {};
      const { allocation_ratio: memoryRatio } = inv.MEMORY_MB || {};
      // mixed VCPU/PCPU configurations (legacy)
      let totalVcpus = 0;
      if (pcpuTotal !== undefined) totalVcpus += pcpuTotal * (pcpuRatio || 1.0);
      if (vcpuRatio && vcpuTotal !== undefined) totalVcpus += vcpuTotal * vcpuRatio;
      if (totalVcpus > 0) item.vcpus = totalVcpus;
      if (memoryRatio) item.memory_mb = num(item.memory_mb) * memoryRatio;
    }
    data.vcpus += num(item.vcpus);
    data.vcpus_used += num(item.vcpus_used);
    data.memory_mb += getGiBValue(num(item.memory_mb));
    data.memory_mb_used += getGiBValue(num(item.memory_mb_used));
    // Legacy reads storage from prometheus (commented out); hypervisor local_gb is used when the
    // compute API still reports it (microversion < 2.88).
    if (typeof item.local_gb === 'number') {
      data.hasDisk = true;
      data.local_gb += num(item.local_gb);
      data.local_gb_used += num(item.local_gb_used);
    }
  });
  data.memory_mb = parseFloat(data.memory_mb.toFixed(2));
  data.memory_mb_used = parseFloat(data.memory_mb_used.toFixed(2));
  return data;
}

/** legacy serverStore.getVirtualResourceOverview (+ neutron counts for the legacy smallCard list) */
async function fetchVirtualResourceOverview() {
  const withCinder = hasEndpoint('cinder');
  const withNeutron = hasEndpoint('neutron');
  const count = (p) => settled(p).then((r) => (Array.isArray(r) ? r.length : undefined));
  const volCount = (params) =>
    settled(cinderApi.listVolumesExtension({ limit: 10, all_projects: true, ...params })).then((r) =>
      typeof r?.count === 'number' ? r.count : undefined
    );
  const neutronCount = (key, field) =>
    withNeutron
      ? settled(neutronApi.list(key, { fields: 'id' })).then((r) =>
          Array.isArray(r?.[field]) ? r[field].length : undefined
        )
      : Promise.resolve(undefined);

  const [all, active, error, shutoff, vAll, vInUse, vError, vAvailable, networks, routers, sgs, fips] =
    await Promise.all([
      count(listAllServers({ all_tenants: true })),
      count(listAllServers({ all_tenants: true, status: 'ACTIVE' })),
      count(listAllServers({ all_tenants: true, status: 'ERROR' })),
      count(listAllServers({ all_tenants: true, status: 'SHUTOFF' })),
      withCinder ? volCount({}) : undefined,
      withCinder ? volCount({ status: 'in-use' }) : undefined,
      withCinder ? volCount({ status: 'error' }) : undefined,
      withCinder ? volCount({ status: 'available' }) : undefined,
      neutronCount('networks', 'networks'),
      neutronCount('routers', 'routers'),
      neutronCount('security-groups', 'security_groups'),
      neutronCount('floatingips', 'floatingips'),
    ]);
  const other = (total, parts) =>
    total === undefined || parts.some((p) => p === undefined)
      ? undefined
      : total - parts.reduce((a, b) => a + b, 0);

  const result = {
    serviceNum: { all, active, error, shutoff, other: other(all, [active, error, shutoff]) },
    networkNum: networks,
    routerNum: routers,
    securityGroupNum: sgs,
    floatingIpNum: fips,
  };
  if (withCinder) {
    result.volumeNum = {
      all: vAll,
      active: vInUse,
      error: vError,
      available: vAvailable,
      other: other(vAll, [vInUse, vError, vAvailable]),
    };
  }
  return result;
}

/** legacy overviewAdminStore.getComputeService */
const fetchComputeServices = async () => {
  const res = await settled(novaApi.listServicesV());
  return Array.isArray(res?.services) ? res.services : null;
};

/** legacy overviewAdminStore.getNetworkService */
const fetchNetworkAgents = async () => {
  if (!hasEndpoint('neutron')) return null;
  const res = await settled(neutronApi.listAgents());
  return Array.isArray(res?.agents) ? res.agents : null;
};

const useAsync = (fn) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fn());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fn]);
  useEffect(() => {
    run();
  }, [run]);
  return { data, loading, refetch: run };
};

export function useAdminOverview() {
  const platform = useAsync(fetchPlatformInfo);
  const usage = useAsync(fetchHypervisorUsage);
  const resources = useAsync(fetchVirtualResourceOverview);
  const computeServices = useAsync(fetchComputeServices);
  const networkAgents = useAsync(fetchNetworkAgents);

  const refetch = () => {
    platform.refetch();
    usage.refetch();
    resources.refetch();
    computeServices.refetch();
    networkAgents.refetch();
  };

  const loading =
    platform.loading || usage.loading || resources.loading || computeServices.loading || networkAgents.loading;

  return { platform, usage, resources, computeServices, networkAgents, loading, refetch };
}

/** Back-compat name */
export const useOverview = useProjectOverview;
