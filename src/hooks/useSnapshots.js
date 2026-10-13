import { useState, useCallback, useEffect, useMemo } from 'react';
import { message } from 'antd';
import { cinderApi } from '@/api/cinder';
import { useAuthStore } from '@/store/authStore';

export const normalizeSnapshot = (snap, volumeMap = {}) => {
  const vol = volumeMap[snap.volume_id];
  const volumeName = vol?.name || snap.volume_id || '-';

  return {
    key: snap.id,
    id: snap.id,
    name: snap.name && snap.name.trim() ? snap.name : snap.id,
    rawName: snap.name || '',
    description: snap.description || '',
    size: snap.size || (vol?.size || 0),
    status: snap.status || 'available',
    volumeId: snap.volume_id,
    volumeName,
    createdAt: snap.created_at ? snap.created_at.replace('T', ' ').substring(0, 19) : '',
    updatedAt: snap.updated_at ? snap.updated_at.replace('T', ' ').substring(0, 19) : '',
    raw: snap,
  };
};

export function useSnapshots() {
  const [snapshots, setSnapshots] = useState([]);
  const [availableVolumes, setAvailableVolumes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isLiveApi, setIsLiveApi] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { currentProject } = useAuthStore();
  const projectId = currentProject?.id || '99b1fbbf5b3a4b6486288d842a33781e';

  // Fetch live snapshots and volumes for reference
  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const [snapRes, volRes] = await Promise.allSettled([
        cinderApi.listSnapshots(projectId),
        cinderApi.listVolumes(projectId),
      ]);

      const volumeMap = {};
      let volsList = [];
      if (volRes.status === 'fulfilled' && volRes.value?.volumes) {
        volsList = volRes.value.volumes;
        volsList.forEach((v) => {
          volumeMap[v.id] = v;
        });
        setAvailableVolumes(volsList);
      }

      if (snapRes.status === 'fulfilled' && snapRes.value?.snapshots) {
        const normalized = snapRes.value.snapshots.map((s) => normalizeSnapshot(s, volumeMap));
        setSnapshots(normalized);
        setIsLiveApi(true);
      } else {
        setIsLiveApi(false);
      }
    } catch {
      setIsLiveApi(false);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const refetch = useCallback(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  // Create Snapshot
  const createSnapshot = useCallback(
    async (values) => {
      setActionLoading(true);
      try {
        const payload = {
          name: values.name,
          volume_id: values.volume_id,
          description: values.description || '',
          force: true,
        };
        const res = await cinderApi.createSnapshot(projectId, payload);
        message.success(`Đã gửi lệnh tạo Snapshot ${values.name} thành công!`);
        await fetchSnapshots();
        return { success: true, data: res?.snapshot };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi khi tạo Snapshot';
        message.error(`Không thể tạo Snapshot: ${msg}`);
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [projectId, fetchSnapshots]
  );

  // Delete Snapshot
  const deleteSnapshot = useCallback(
    async (snapshotId, snapshotName = '') => {
      setActionLoading(true);
      try {
        await cinderApi.deleteSnapshot(projectId, snapshotId);
        message.success(`Đã gửi lệnh xóa Snapshot ${snapshotName || snapshotId}!`);
        await fetchSnapshots();
        return { success: true };
      } catch (err) {
        const msg = err.response?.data?.badRequest?.message || err.message || 'Lỗi khi xóa Snapshot';
        message.error(`Không thể xóa Snapshot: ${msg}`);
        return { success: false, error: msg };
      } finally {
        setActionLoading(false);
      }
    },
    [projectId, fetchSnapshots]
  );

  // Filtered & Memoized
  const filteredSnapshots = useMemo(() => {
    return snapshots.filter((item) => {
      const q = searchText.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.volumeName.toLowerCase().includes(q) ||
        item.volumeId.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [snapshots, searchText, statusFilter]);

  return {
    snapshots: filteredSnapshots,
    rawSnapshots: snapshots,
    availableVolumes,
    loading,
    actionLoading,
    isLiveApi,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    refetch,
    createSnapshot,
    deleteSnapshot,
  };
}
