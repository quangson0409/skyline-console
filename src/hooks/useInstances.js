import { useState, useCallback, useMemo, useEffect } from 'react';
import { message } from 'antd';
import { novaApi } from '@/api/nova';

// Normalize OpenStack Nova Server representation
const normalizeServer = (srv) => {
  let privateIp = '10.0.0.1';
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
    ? (srv.image || 'Boot from Volume')
    : (srv.image?.name || srv.image?.id || 'Boot from Volume');

  const flavorName = typeof srv.flavor === 'string'
    ? srv.flavor
    : (srv.flavor?.original_name || srv.flavor?.name || srv.flavor?.id || 'Custom Flavor');

  return {
    key: srv.id,
    id: srv.id,
    name: srv.name || 'Instance',
    image: imageName,
    ip: privateIp,
    floatingIp,
    flavor: flavorName,
    vcpus: srv.flavor?.vcpus || 2,
    ram: srv.flavor?.ram ? (srv.flavor.ram >= 1024 ? srv.flavor.ram / 1024 : srv.flavor.ram) : 4,
    disk: srv.flavor?.disk || 40,
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

export function useInstances() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isLiveApi, setIsLiveApi] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Fetch servers from Live OpenStack Nova API
  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await novaApi.listServers();
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const refetch = useCallback(() => {
    fetchServers();
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

  // Quota Metrics
  const quotaMetrics = useMemo(() => {
    const totalVcpus = instances.reduce((acc, curr) => acc + (curr.vcpus || 2), 0);
    const totalRam = instances.reduce((acc, curr) => acc + (curr.ram || 4), 0);
    const activeCount = instances.filter((i) => i.status === 'ACTIVE').length;
    const buildingCount = instances.filter((i) => i.status === 'BUILDING').length;
    const shutoffCount = instances.filter((i) => i.status === 'SHUTOFF').length;

    return {
      totalVcpus,
      maxVcpus: 64,
      vcpuPercent: Math.round((totalVcpus / 64) * 100),
      totalRam,
      maxRam: 256,
      ramPercent: Math.round((totalRam / 256) * 100),
      activeCount,
      buildingCount,
      shutoffCount,
      totalCount: instances.length,
    };
  }, [instances]);

  // Actions
  const startInstance = useCallback(
    async (id) => {
      setActionLoading(true);
      try {
        await novaApi.startServer(id);
        message.success('Đã gửi lệnh khởi động máy ảo (Start)!');
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi khi khởi động máy ảo';
        message.error(`Không thể khởi động: ${msg}`);
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
        message.success('Đã gửi lệnh tắt nguồn máy ảo (Stop)!');
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi khi tắt máy ảo';
        message.error(`Không thể tắt máy: ${msg}`);
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
        message.success(`Đã gửi lệnh khởi động lại (${type === 'HARD' ? 'Cứng' : 'Mềm'}) máy ảo!`);
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi khi khởi động lại máy ảo';
        message.error(`Không thể khởi động lại: ${msg}`);
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
        message.success('Đã gửi lệnh tạm dừng máy ảo (Pause)!');
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi tạm dừng máy ảo';
        message.error(`Không thể tạm dừng: ${msg}`);
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
        message.success('Đã gửi lệnh tiếp tục máy ảo (Unpause)!');
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi tiếp tục máy ảo';
        message.error(`Không thể tiếp tục: ${msg}`);
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
        message.success('Đã khóa máy ảo (Lock)!');
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi khóa máy ảo';
        message.error(`Không thể khóa: ${msg}`);
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
        message.success('Đã mở khóa máy ảo (Unlock)!');
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi mở khóa máy ảo';
        message.error(`Không thể mở khóa: ${msg}`);
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
          message.success('Đã mở cửa sổ VNC Console!');
        } else {
          message.warning('Không lấy được URL console từ máy chủ');
        }
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi mở console';
        message.error(`Không thể mở VNC Console: ${msg}`);
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
        message.success('Đã gửi lệnh di chuyển máy ảo (Cold Migrate)!');
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi di chuyển máy ảo';
        message.error(`Không thể migrate: ${msg}`);
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
        message.success('Đã gửi lệnh di chuyển trực tiếp (Live Migrate)!');
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi live-migrate';
        message.error(`Không thể live-migrate: ${msg}`);
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
        message.success(`Đã đặt lại trạng thái máy ảo thành ${state}!`);
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi reset state';
        message.error(`Không thể reset state: ${msg}`);
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
        message.success(`Đã gửi lệnh tạo máy ảo ${values.name} lên OpenStack!`);
        await fetchServers();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi tạo máy ảo';
        message.error(`Không thể tạo máy ảo: ${msg}`);
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
        message.success('Đã gửi lệnh xóa máy ảo lên OpenStack Nova!');
        await fetchServers();
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi xóa máy ảo';
        message.error(`Không thể xóa máy ảo: ${msg}`);
      }
    },
    [fetchServers]
  );

  const batchDelete = useCallback(
    async (keys) => {
      try {
        await Promise.all(keys.map((k) => novaApi.deleteServer(k)));
        message.success(`Đã gửi lệnh xóa ${keys.length} máy ảo lên OpenStack Nova!`);
        await fetchServers();
      } catch (err) {
        message.error(`Lỗi xóa máy ảo: ${err.message}`);
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
