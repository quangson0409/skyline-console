import { useState, useCallback, useEffect, useMemo } from 'react';
import { message } from 'antd';
import { cinderApi } from '@/api/cinder';
import { useAuthStore } from '@/store/authStore';

// Normalize OpenStack Cinder Volume object
export const normalizeVolume = (vol) => {
  const attachments = Array.isArray(vol.attachments)
    ? vol.attachments.map((att) => ({
        id: att.id || att.attachment_id,
        serverId: att.server_id,
        device: att.device,
        hostName: att.host_name,
        attachedAt: att.attached_at ? att.attached_at.replace('T', ' ').substring(0, 19) : '',
      }))
    : [];

  return {
    key: vol.id,
    id: vol.id,
    name: vol.name && vol.name.trim() ? vol.name : vol.id,
    rawName: vol.name || '',
    description: vol.description || '',
    size: vol.size || 0,
    type: vol.volume_type || '-',
    status: vol.status || 'available',
    bootable: vol.bootable === 'true' || vol.bootable === true,
    multiattach: Boolean(vol.multiattach),
    zone: vol.availability_zone || 'nova',
    attachments,
    attachedTo: attachments.length > 0
      ? attachments.map((a) => `${a.device || 'disk'} (${a.hostName || a.serverId?.substring(0, 8)})`).join(', ')
      : null,
    createdAt: vol.created_at ? vol.created_at.replace('T', ' ').substring(0, 19) : '',
    updatedAt: vol.updated_at ? vol.updated_at.replace('T', ' ').substring(0, 19) : '',
    raw: vol,
  };
};

export function useVolumes() {
  const [volumes, setVolumes] = useState([]);
  const [volumeTypes, setVolumeTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isLiveApi, setIsLiveApi] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { currentProject } = useAuthStore();
  const projectId = currentProject?.id || '99b1fbbf5b3a4b6486288d842a33781e';

  // Fetch live Cinder volumes and volume types
  const fetchVolumes = useCallback(async () => {
    setLoading(true);
    try {
      const [volRes, typesRes] = await Promise.allSettled([
        cinderApi.listVolumes(projectId),
        cinderApi.listVolumeTypes(projectId),
      ]);

      if (volRes.status === 'fulfilled' && volRes.value?.volumes) {
        const normalized = volRes.value.volumes.map(normalizeVolume);
        setVolumes(normalized);
        setIsLiveApi(true);
      } else {
        setIsLiveApi(false);
      }

      if (typesRes.status === 'fulfilled' && typesRes.value?.volume_types) {
        setVolumeTypes(typesRes.value.volume_types);
      }
    } catch {
      setIsLiveApi(false);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchVolumes();
  }, [fetchVolumes]);

  const refetch = useCallback(() => {
    fetchVolumes();
  }, [fetchVolumes]);

  // Create Volume
  const createVolume = useCallback(
    async (values) => {
      setActionLoading(true);
      try {
        const payload = {
          name: values.name,
          size: values.size,
          volume_type: values.type,
          description: values.description || '',
        };
        const res = await cinderApi.createVolume(projectId, payload);
        message.success(`Đã gửi lệnh tạo Volume ${values.name} (${values.size} GiB) thành công!`);
        await fetchVolumes();
        return { success: true, data: res?.volume };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi khi tạo Volume';
        message.error(`Không thể tạo Volume: ${msg}`);
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [projectId, fetchVolumes]
  );

  // Delete Volume
  const deleteVolume = useCallback(
    async (volumeId, volumeName = '') => {
      setActionLoading(true);
      try {
        await cinderApi.deleteVolume(projectId, volumeId);
        message.success(`Đã gửi lệnh xóa Volume ${volumeName || volumeId}!`);
        await fetchVolumes();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi khi xóa Volume';
        message.error(`Không thể xóa Volume: ${msg}`);
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [projectId, fetchVolumes]
  );

  // Filtered & Memoized
  const filteredVolumes = useMemo(() => {
    return volumes.filter((item) => {
      const q = searchText.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        (item.attachedTo && item.attachedTo.toLowerCase().includes(q));

      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [volumes, searchText, statusFilter]);

  // Metrics
  const metrics = useMemo(() => {
    const totalSize = volumes.reduce((acc, curr) => acc + (curr.size || 0), 0);
    const inUseCount = volumes.filter((v) => v.status === 'in-use').length;
    const availableCount = volumes.filter((v) => v.status === 'available').length;
    return {
      total: volumes.length,
      totalSize,
      inUseCount,
      availableCount,
    };
  }, [volumes]);

  return {
    volumes: filteredVolumes,
    rawVolumes: volumes,
    volumeTypes,
    loading,
    actionLoading,
    isLiveApi,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    refetch,
    createVolume,
    deleteVolume,
    metrics,
  };
}
