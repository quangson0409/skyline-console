import { useState, useCallback, useMemo, useEffect } from 'react';
import { message } from 'antd';
import { t } from '@/core/i18n';
import { novaApi } from '@/api/nova';
import { glanceApi } from '@/api/glance';
import { skylineApi } from '@/api/skyline';
import { sortParams, pageParams } from '@/api/paging';
import { useAuthStore } from '@/store/authStore';
import { normalizeServer } from '@/pages/Instances/resources';

// Server normalizer shared with the instance detail page and the legacy action checks
export { normalizeServer };

/** GET /servers/detail following servers_links "next" markers (legacy requestListAll) */
export const listAllServers = async (params = {}, maxPages = 20) => {
  const all = [];
  let query = { ...params };
  for (let i = 0; i < maxPages; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await novaApi.listServersV(Object.keys(query).length ? query : undefined);
    const servers = Array.isArray(res?.servers) ? res.servers : null;
    if (!servers) return i === 0 ? null : all;
    all.push(...servers);
    const next = (res.servers_links || []).find((l) => l.rel === 'next');
    if (!next || !servers.length) break;
    query = { ...params, marker: servers[servers.length - 1].id };
  }
  return all;
};

/** number of servers matching `params` from the light /servers list (ids only), following markers */
export const countServers = async (params = {}, maxPages = 50) => {
  let count = 0;
  let query = { limit: 1000, ...params };
  for (let i = 0; i < maxPages; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await novaApi.listServersBriefV(query);
    const servers = Array.isArray(res?.servers) ? res.servers : [];
    count += servers.length;
    const next = (res?.servers_links || []).find((l) => l.rel === 'next');
    if (!next || !servers.length) break;
    query = { ...query, marker: servers[servers.length - 1].id };
  }
  return count;
};

/** skyline /extension/servers item -> the list/detail shape of normalizeServer (origin_data is the nova server) */
export const normalizeExtensionServer = (ext = {}, { imageMap = {} } = {}) => {
  const origin = ext.origin_data && typeof ext.origin_data === 'object' ? ext.origin_data : {};
  const srv = { ...origin };
  if (!srv.id) srv.id = ext.id;
  if (srv.name === undefined) srv.name = ext.name;
  if (!srv.status && ext.status) srv.status = String(ext.status).toUpperCase();
  if (!srv.created && ext.created_at) srv.created = ext.created_at;
  if (srv.locked === undefined) srv.locked = ext.locked;
  if (!srv.tenant_id && !srv.project_id) srv.tenant_id = ext.project_id;
  if (!srv['OS-EXT-SRV-ATTR:host'] && ext.host) srv['OS-EXT-SRV-ATTR:host'] = ext.host;
  if (!srv['OS-EXT-STS:task_state'] && ext.task_state) srv['OS-EXT-STS:task_state'] = ext.task_state;
  if (!srv['OS-EXT-STS:vm_state'] && ext.vm_state) srv['OS-EXT-STS:vm_state'] = ext.vm_state;
  if (!srv['OS-EXT-SRV-ATTR:root_device_name'] && ext.root_device_name) {
    srv['OS-EXT-SRV-ATTR:root_device_name'] = ext.root_device_name;
  }
  if (!srv.image && ext.image) srv.image = ext.image;
  const info = ext.flavor_info && typeof ext.flavor_info === 'object' ? ext.flavor_info : null;
  if (info && (!srv.flavor || typeof srv.flavor !== 'object' || !srv.flavor.original_name)) {
    srv.flavor = {
      ...(srv.flavor && typeof srv.flavor === 'object' ? srv.flavor : {}),
      ...info,
      original_name: ext.flavor || info.original_name || info.name,
    };
  }
  const item = normalizeServer(srv, { imageMap });
  const fixed = Array.isArray(ext.fixed_addresses) && ext.fixed_addresses.length ? ext.fixed_addresses : item.fixed_addresses;
  const floating =
    Array.isArray(ext.floating_addresses) && ext.floating_addresses.length ? ext.floating_addresses : item.floating_addresses;
  return {
    ...item,
    project_name: ext.project_name || item.project_name,
    image_name: ext.image_name || item.image_name,
    image_os_distro: ext.image_os_distro || item.image_os_distro,
    flavor: typeof ext.flavor === 'string' && ext.flavor ? ext.flavor : item.flavor,
    fixed_addresses: fixed,
    floating_addresses: floating,
    ip: [...fixed, ...floating].join(' '),
    floatingIp: floating[0] || null,
    host: item.host || ext.host || '',
  };
};

/** new-console "Flavor" filter (name or id) -> skyline flavor_id */
const resolveFlavorId = async (value) => {
  const q = String(value || '').trim().toLowerCase();
  const res = await novaApi.listFlavorsV({ is_public: 'None' }).catch(() => novaApi.listFlavorsV().catch(() => null));
  const flavors = res?.flavors || [];
  const found =
    flavors.find((f) => String(f.name).toLowerCase() === q) ||
    flavors.find((f) => String(f.id).toLowerCase() === q) ||
    flavors.find((f) => String(f.name).toLowerCase().includes(q));
  return found?.id;
};

/**
 * Server-side instance list (legacy Instance container isFilterByBackend / isSortByBackend, ServerStore):
 * skyline /extension/servers?limit&marker&sort_keys&sort_dirs (+ all_projects on the admin page) with
 * name / ip / project_name / project_id / host / status (and flavor -> flavor_id) as query params.
 * The extension returns no count -> "has next" paging. Like legacy listDidFetch, ISO-booted servers
 * are flagged from the glance iso image list.
 */
export const fetchServersPage = async ({ ctx = {}, limit, marker, filters = {}, sortKey, sortDir, extraParams = {} } = {}) => {
  const { flavor, ...rest } = filters;
  const params = { ...pageParams({ limit, marker }), ...rest, ...extraParams, ...sortParams('skyline', sortKey, sortDir) };
  if (ctx.isAdmin) params.all_projects = true;
  if (flavor && !params.flavor_id) {
    const flavorId = await resolveFlavorId(flavor);
    if (!flavorId) return { items: [], hasNext: false };
    params.flavor_id = flavorId;
  }
  const [res, isoRes] = await Promise.all([
    skylineApi.extensionPage('servers', 'servers', params),
    glanceApi.listImages({ disk_format: 'iso' }).catch(() => null),
  ]);
  const imageMap = Object.fromEntries((isoRes?.images || []).map((img) => [img.id, img]));
  return { ...res, items: res.items.map((it) => normalizeExtensionServer(it, { imageMap })) };
};

export const instanceServerSide = { defaultSortKey: 'created_at', fetchPage: fetchServersPage };

/**
 * Servers by id (legacy ServerGroupInstanceStore: one skyline /extension/servers?uuid= request per
 * member, all_projects on administrator pages); a member the extension does not return is read
 * from nova so the list still shows it.
 */
export const fetchServersByUuids = async (ids = [], { isAdmin = false } = {}) => {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return [];
  const isoRes = await glanceApi.listImages({ disk_format: 'iso' }).catch(() => null);
  const imageMap = Object.fromEntries((isoRes?.images || []).map((img) => [img.id, img]));
  const results = await Promise.all(
    list.map(async (uuid) => {
      try {
        const res = await skylineApi.extensionPage('servers', 'servers', {
          uuid,
          limit: 1,
          ...(isAdmin ? { all_projects: true } : {}),
        });
        if (res.items.length) return normalizeExtensionServer(res.items[0], { imageMap });
      } catch {
        // fall back to nova below
      }
      try {
        const srv = (await novaApi.getServerV(uuid))?.server;
        return srv ? normalizeServer(srv, { imageMap }) : null;
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
};

/**
 * remote: the caller pages the list itself (fetchServersPage); the hook then only loads the
 * KPI counts (light /servers lists) and the quota, and refetch() refreshes those.
 */
export function useInstances({ allProjects = false, remote = false, enabled = true } = {}) {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isLiveApi, setIsLiveApi] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [remoteCounts, setRemoteCounts] = useState(null);

  // Fetch servers from Live OpenStack Nova API
  const fetchServers = useCallback(async ({ quiet = false } = {}) => {
    // embedded instance lists (flavor / hypervisor / server group tabs) need no KPI counts
    if (!enabled) return;
    if (remote) {
      const scope = allProjects ? { all_tenants: 1 } : {};
      try {
        const [total, active, building, shutoff] = await Promise.all([
          countServers(scope),
          countServers({ ...scope, status: 'ACTIVE' }),
          countServers({ ...scope, status: 'BUILD' }),
          countServers({ ...scope, status: 'SHUTOFF' }),
        ]);
        setRemoteCounts({ total, active, building, shutoff });
        setIsLiveApi(true);
      } catch {
        setRemoteCounts(null);
      }
      return;
    }
    if (!quiet) setLoading(true);
    try {
      // microversion 2.79 (legacy apiVersionMaps): embedded flavor with original_name / vcpus / ram / extra_specs
      const [servers, flavorRes, isoRes] = await Promise.all([
        listAllServers(allProjects ? { all_tenants: 1 } : {}),
        novaApi.listFlavorsV().catch(() => null),
        // legacy listDidFetch: servers booted from an ISO image are flagged (iso_server)
        glanceApi.listImages({ disk_format: 'iso' }).catch(() => null),
      ]);
      const flavorNames = Object.fromEntries((flavorRes?.flavors || []).map((f) => [f.id, f]));
      const imageMap = Object.fromEntries((isoRes?.images || []).map((img) => [img.id, img]));
      (servers || []).forEach((srv) => {
        // older clouds return only { id } -> resolve the name/specs from the flavor list
        if (srv.flavor && !srv.flavor.original_name && flavorNames[srv.flavor.id]) {
          const f = flavorNames[srv.flavor.id];
          srv.flavor = { ...srv.flavor, original_name: f.name, vcpus: f.vcpus, ram: f.ram, disk: f.disk };
        }
      });
      if (Array.isArray(servers)) {
        setInstances(servers.map((srv) => normalizeServer(srv, { imageMap })));
        setIsLiveApi(true);
      } else {
        setIsLiveApi(false);
      }
    } catch {
      setIsLiveApi(false);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [allProjects, remote, enabled]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const refetch = useCallback((opts) => {
    fetchServers(opts && typeof opts === 'object' && 'quiet' in opts ? opts : undefined);
  }, [fetchServers]);

  // Filtered & Memoized instances
  const filteredInstances = useMemo(() => {
    return instances.filter((item) => {
      const q = searchText.toLowerCase().trim();
      const matchSearch =
        !q ||
        String(item.name || '').toLowerCase().includes(q) ||
        (item.ip || '').includes(q) ||
        (item.floatingIp && item.floatingIp.includes(q)) ||
        String(item.flavor || '').toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        String(item.host || '').toLowerCase().includes(q);

      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [instances, searchText, statusFilter]);

  // Real compute quota of the current project (nova os-quota-sets/{project}/detail)
  const projectId = useAuthStore((st) => st.currentProject?.id);
  const [quota, setQuota] = useState(null);
  useEffect(() => {
    if (!projectId || !enabled) return;
    novaApi
      .getQuotaSet(projectId)
      .then((res) => setQuota(res?.quota_set || null))
      .catch(() => setQuota(null));
  }, [projectId, instances.length, enabled]);

  // Quota Metrics
  const quotaMetrics = useMemo(() => {
    const sumVcpus = instances.reduce((acc, curr) => acc + (curr.vcpus || 0), 0);
    const sumRam = instances.reduce((acc, curr) => acc + (curr.ram || 0), 0);
    const totalVcpus = quota?.cores?.in_use ?? sumVcpus;
    const totalRam = quota?.ram ? Math.round((quota.ram.in_use / 1024) * 100) / 100 : sumRam;
    const limitVcpus = quota?.cores?.limit;
    const limitRam = quota?.ram?.limit;
    const maxVcpus = limitVcpus === undefined ? '-' : limitVcpus === -1 ? '∞' : limitVcpus;
    const maxRam = limitRam === undefined ? '-' : limitRam === -1 ? '∞' : Math.round(limitRam / 1024);
    const activeCount = remoteCounts ? remoteCounts.active : instances.filter((i) => i.status === 'ACTIVE').length;
    const buildingCount = remoteCounts ? remoteCounts.building : instances.filter((i) => i.status === 'BUILD').length;
    const shutoffCount = remoteCounts ? remoteCounts.shutoff : instances.filter((i) => i.status === 'SHUTOFF').length;

    return {
      totalVcpus,
      maxVcpus,
      vcpuPercent: limitVcpus > 0 ? Math.round((totalVcpus / limitVcpus) * 100) : 0,
      totalRam,
      maxRam,
      ramPercent: limitRam > 0 ? Math.round(((quota.ram.in_use || 0) / limitRam) * 100) : 0,
      activeCount,
      buildingCount,
      shutoffCount,
      totalCount: remoteCounts ? remoteCounts.total : instances.length,
    };
  }, [instances, quota, remoteCounts]);

  // Actions
  const startInstance = useCallback(
    async (id) => {
      setActionLoading(true);
      try {
        await novaApi.startServer(id);
        message.success(t('Start instance request sent!'));
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to start instance');
        message.error(t('Unable to start: {msg}', { msg }));
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [fetchServers]
  );

  const stopInstance = useCallback(
    async (id) => {
      setActionLoading(true);
      try {
        await novaApi.stopServer(id);
        message.success(t('Stop instance request sent!'));
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to stop instance');
        message.error(t('Unable to stop: {msg}', { msg }));
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [fetchServers]
  );

  const rebootInstance = useCallback(
    async (id, type = 'SOFT') => {
      setActionLoading(true);
      try {
        await novaApi.rebootServer(id, type);
        message.success(type === 'HARD' ? t('Hard reboot instance request sent!') : t('Soft reboot instance request sent!'));
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to reboot instance');
        message.error(t('Unable to reboot: {msg}', { msg }));
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [fetchServers]
  );

  const pauseInstance = useCallback(
    async (id) => {
      setActionLoading(true);
      try {
        await novaApi.pauseServer(id);
        message.success(t('Pause instance request sent!'));
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to pause instance');
        message.error(t('Unable to pause: {msg}', { msg }));
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [fetchServers]
  );

  const unpauseInstance = useCallback(
    async (id) => {
      setActionLoading(true);
      try {
        await novaApi.unpauseServer(id);
        message.success(t('Unpause instance request sent!'));
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to unpause instance');
        message.error(t('Unable to unpause: {msg}', { msg }));
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [fetchServers]
  );

  const lockInstance = useCallback(
    async (id) => {
      setActionLoading(true);
      try {
        await novaApi.lockServer(id);
        message.success(t('Instance locked!'));
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to lock instance');
        message.error(t('Unable to lock: {msg}', { msg }));
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [fetchServers]
  );

  const unlockInstance = useCallback(
    async (id) => {
      setActionLoading(true);
      try {
        await novaApi.unlockServer(id);
        message.success(t('Instance unlocked!'));
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to unlock instance');
        message.error(t('Unable to unlock: {msg}', { msg }));
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [fetchServers]
  );

  const openConsole = useCallback(
    async (id) => {
      try {
        const res = await novaApi.getVncConsole(id);
        const url = res?.console?.url;
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
          message.success(t('VNC console window opened!'));
        } else {
          message.warning(t('Could not get the console URL from the server'));
        }
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to open console');
        message.error(t('Unable to open VNC console: {msg}', { msg }));
      }
    },
    []
  );

  // Admin Actions
  const migrateInstance = useCallback(
    async (id) => {
      setActionLoading(true);
      try {
        await novaApi.migrateServer(id);
        message.success(t('Cold migrate request sent!'));
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to migrate instance');
        message.error(t('Unable to migrate: {msg}', { msg }));
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [fetchServers]
  );

  const liveMigrateInstance = useCallback(
    async (id) => {
      setActionLoading(true);
      try {
        await novaApi.liveMigrateServer(id);
        message.success(t('Live migrate request sent!'));
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to live migrate instance');
        message.error(t('Unable to live migrate: {msg}', { msg }));
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [fetchServers]
  );

  const resetInstanceState = useCallback(
    async (id, state = 'active') => {
      setActionLoading(true);
      try {
        await novaApi.resetServerState(id, state);
        message.success(t('Instance state reset to {state}!', { state }));
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to reset state');
        message.error(t('Unable to reset state: {msg}', { msg }));
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [fetchServers]
  );

  const createInstance = useCallback(
    async (values) => {
      setActionLoading(true);
      try {
        const payload = {
          name: values.name,
          flavorRef: values.flavorRef || values.flavor,
        };

        if (values.availability_zone) {
          payload.availability_zone = values.availability_zone;
        }

        if (values.min_count) {
          payload.min_count = Number(values.min_count);
        }
        if (values.max_count) {
          payload.max_count = Number(values.max_count);
        }

        // Boot Source & Block Device Mapping
        if (values.block_device_mapping_v2 && Array.isArray(values.block_device_mapping_v2)) {
          payload.block_device_mapping_v2 = values.block_device_mapping_v2;
        } else if (values.imageRef || values.image) {
          payload.imageRef = values.imageRef || values.image;
        }

        // Networks
        if (values.networks && Array.isArray(values.networks)) {
          payload.networks = values.networks;
        } else if (values.networkId) {
          payload.networks = [{ uuid: values.networkId }];
        }

        // Security Groups
        if (values.security_groups && Array.isArray(values.security_groups)) {
          payload.security_groups = values.security_groups;
        } else if (values.securityGroupNames && Array.isArray(values.securityGroupNames)) {
          payload.security_groups = values.securityGroupNames.map((name) => ({ name }));
        }

        // Keypair
        if (values.key_name) {
          payload.key_name = values.key_name;
        }

        // Admin Password
        if (values.adminPass) {
          payload.adminPass = values.adminPass;
        }

        // User Data (Cloud-init) - Base64 encode if plain text
        if (values.user_data) {
          try {
            payload.user_data = btoa(unescape(encodeURIComponent(values.user_data)));
          } catch {
            payload.user_data = btoa(values.user_data);
          }
        }

        await novaApi.createServer(payload);
        message.success(t('Create instance {name} request sent to OpenStack!', { name: values.name }));
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to create instance');
        message.error(t('Unable to create instance: {msg}', { msg }));
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [fetchServers]
  );

  const deleteInstance = useCallback(
    async (key) => {
      try {
        await novaApi.deleteServer(key);
        message.success(t('Delete instance request sent to OpenStack Nova!'));
        await fetchServers();
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || t('Failed to delete instance');
        message.error(t('Unable to delete instance: {msg}', { msg }));
      }
    },
    [fetchServers]
  );

  const batchDelete = useCallback(
    async (keys) => {
      try {
        await Promise.all(keys.map((k) => novaApi.deleteServer(k)));
        message.success(t('Delete request for {count} instances sent to OpenStack Nova!', { count: keys.length }));
        await fetchServers();
      } catch (err) {
        message.error(t('Failed to delete instances: {msg}', { msg: err.message }));
      }
    },
    [fetchServers]
  );

  return {
    instances: filteredInstances,
    rawCount: instances.length,
    loading,
    actionLoading,
    isLiveApi,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    quotaMetrics,
    refetch,
    createInstance,
    deleteInstance,
    batchDelete,
    startInstance,
    stopInstance,
    rebootInstance,
    pauseInstance,
    unpauseInstance,
    lockInstance,
    unlockInstance,
    openConsole,
    migrateInstance,
    liveMigrateInstance,
    resetInstanceState,
  };
}
