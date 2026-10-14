import { useState, useCallback, useMemo, useEffect } from 'react';
import { message } from 'antd';
import { t } from '@/core/i18n';
import { novaApi } from '@/api/nova';
import { useAuthStore } from '@/store/authStore';

// Normalize OpenStack Nova Server representation
const normalizeServer = (srv) => {
  let privateIp = null;
  let floatingIp = null;

  if (srv.addresses && typeof srv.addresses === 'object') {
    Object.values(srv.addresses).forEach((addrs) => {
      if (Array.isArray(addrs)) {
        addrs.forEach((addr) => {
          if (addr && addr['OS-EXT-IPS:type'] === 'floating') {
            floatingIp = addr.addr;
          } else if (addr && addr.addr) {
            privateIp = addr.addr;
          }
        });
      }
    });
  }

  const imageName = typeof srv.image === 'string'
    ? (srv.image || t('Boot from Volume'))
    : (srv.image?.name || srv.image?.id || t('Boot from Volume'));

  const flavorName = typeof srv.flavor === 'string'
    ? srv.flavor
    : (srv.flavor?.original_name || srv.flavor?.name || srv.flavor?.id || t('Custom Flavor'));

  return {
    key: srv.id,
    id: srv.id,
    name: srv.name || 'Instance',
    image: imageName,
    ip: privateIp,
    floatingIp,
    flavor: flavorName,
    vcpus: srv.flavor?.vcpus ?? null,
    // GiB, rounded like legacy (flavor.ram is MiB)
    ram: typeof srv.flavor?.ram === 'number' ? Math.round((srv.flavor.ram / 1024) * 100) / 100 : null,
    disk: srv.flavor?.disk ?? null,
    powerState: srv['OS-EXT-STS:power_state'] === 1 ? 'Running' : 'Shutoff',
    status: typeof srv.status === 'string' ? srv.status : 'ACTIVE',
    created: srv.created ? srv.created.replace('T', ' ').substring(0, 19) : '',
    updated: srv.updated ? srv.updated.replace('T', ' ').substring(0, 19) : '',
    zone: srv['OS-EXT-AZ:availability_zone'] || 'nova',
    host: srv['OS-EXT-SRV-ATTR:host'] || '-',
    hypervisor: srv['OS-EXT-SRV-ATTR:hypervisor_hostname'] || '-',
    taskState: srv['OS-EXT-STS:task_state'] || 'None',
    vmState: srv['OS-EXT-STS:vm_state'] || 'active',
    keyName: srv.key_name || '-',
    securityGroups: Array.isArray(srv.security_groups) ? srv.security_groups : [],
    volumesAttached: Array.isArray(srv['os-extended-volumes:volumes_attached'])
      ? srv['os-extended-volumes:volumes_attached']
      : [],
    locked: Boolean(srv.locked),
    raw: srv,
  };
};

export function useInstances({ allProjects = false } = {}) {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isLiveApi, setIsLiveApi] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Fetch servers from Live OpenStack Nova API
  const fetchServers = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      // microversion 2.79 (legacy apiVersionMaps): embedded flavor with original_name / vcpus / ram
      const [res, flavorRes] = await Promise.all([
        novaApi.listServersV(allProjects ? { all_tenants: 1 } : undefined),
        novaApi.listFlavorsV().catch(() => null),
      ]);
      const flavorNames = Object.fromEntries((flavorRes?.flavors || []).map((f) => [f.id, f]));
      (res?.servers || []).forEach((srv) => {
        // older clouds return only { id } -> resolve the name/specs from the flavor list
        if (srv.flavor && !srv.flavor.original_name && flavorNames[srv.flavor.id]) {
          const f = flavorNames[srv.flavor.id];
          srv.flavor = { ...srv.flavor, original_name: f.name, vcpus: f.vcpus, ram: f.ram, disk: f.disk };
        }
      });
      if (res && res.servers && Array.isArray(res.servers)) {
        const normalized = res.servers.map(normalizeServer);
        setInstances(normalized);
        setIsLiveApi(true);
      } else {
        setIsLiveApi(false);
      }
    } catch {
      setIsLiveApi(false);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [allProjects]);

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
        item.name.toLowerCase().includes(q) ||
        item.ip.includes(q) ||
        (item.floatingIp && item.floatingIp.includes(q)) ||
        item.flavor.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.host.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [instances, searchText, statusFilter]);

  // Real compute quota of the current project (nova os-quota-sets/{project}/detail)
  const projectId = useAuthStore((st) => st.currentProject?.id);
  const [quota, setQuota] = useState(null);
  useEffect(() => {
    if (!projectId) return;
    novaApi
      .getQuotaSet(projectId)
      .then((res) => setQuota(res?.quota_set || null))
      .catch(() => setQuota(null));
  }, [projectId, instances.length]);

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
    const activeCount = instances.filter((i) => i.status === 'ACTIVE').length;
    const buildingCount = instances.filter((i) => i.status === 'BUILD').length;
    const shutoffCount = instances.filter((i) => i.status === 'SHUTOFF').length;

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
      totalCount: instances.length,
    };
  }, [instances, quota]);

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
