import apiClient from './client';
import { useAuthStore } from '@/store/authStore';
import { versionHeaders } from './endpoints';

/**
 * OpenStack Cinder Block Storage API (v3)
 * Path: /api/openstack/regionone/cinder/v3
 */
const BASE_PATH = '/openstack/regionone/cinder/v3';

const resolveProjectId = (projectId) => {
  if (typeof projectId === 'string' && projectId && projectId !== 'undefined') {
    return projectId;
  }
  try {
    const state = useAuthStore.getState ? useAuthStore.getState() : {};
    return state?.currentProject?.id || state?.user?.project_id || 'admin';
  } catch {
    return 'admin';
  }
};

export const cinderApi = {
  // Volumes
  listVolumes: (projectId, params) => {
    if (typeof projectId === 'object' && projectId !== null && !params) {
      params = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.get(`${BASE_PATH}/${pid}/volumes/detail`, { params });
  },
  getVolume: (projectId, id) => {
    if (!id && projectId) {
      id = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.get(`${BASE_PATH}/${pid}/volumes/${id}`);
  },
  createVolume: (projectId, data) => {
    if (typeof projectId === 'object' && !data) {
      data = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.post(`${BASE_PATH}/${pid}/volumes`, { volume: data });
  },
  deleteVolume: (projectId, id) => {
    if (!id && projectId) {
      id = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.delete(`${BASE_PATH}/${pid}/volumes/${id}`);
  },

  // Snapshots
  listSnapshots: (projectId, params) => {
    if (typeof projectId === 'object' && projectId !== null && !params) {
      params = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.get(`${BASE_PATH}/${pid}/snapshots/detail`, { params });
  },
  createSnapshot: (projectId, data) => {
    if (typeof projectId === 'object' && !data) {
      data = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.post(`${BASE_PATH}/${pid}/snapshots`, { snapshot: data });
  },
  deleteSnapshot: (projectId, id) => {
    if (!id && projectId) {
      id = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.delete(`${BASE_PATH}/${pid}/snapshots/${id}`);
  },

  // Backups
  listBackups: (projectId, params) => {
    if (typeof projectId === 'object' && projectId !== null && !params) {
      params = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.get(`${BASE_PATH}/${pid}/backups/detail`, { params });
  },

  getBackup: (id) => apiClient.get(`${BASE_PATH}/${resolveProjectId()}/backups/${id}`, versionHeaders('cinder')),
  createBackup: (data) =>
    apiClient.post(`${BASE_PATH}/${resolveProjectId()}/backups`, { backup: data }, versionHeaders('cinder')),
  updateBackup: (id, data) =>
    apiClient.put(`${BASE_PATH}/${resolveProjectId()}/backups/${id}`, { backup: data }, versionHeaders('cinder')),
  deleteBackup: (id) => apiClient.delete(`${BASE_PATH}/${resolveProjectId()}/backups/${id}`),
  restoreBackup: (id, body) =>
    apiClient.post(`${BASE_PATH}/${resolveProjectId()}/backups/${id}/restore`, { restore: body }),

  // Quota & availability zones
  getQuotaSet: (projectId) =>
    apiClient.get(`${BASE_PATH}/${resolveProjectId()}/os-quota-sets/${resolveProjectId(projectId)}`, {
      params: { usage: true },
    }),
  listAvailabilityZones: () => apiClient.get(`${BASE_PATH}/${resolveProjectId()}/os-availability-zone`),

  // Types
  listVolumeTypes: (projectId) => {
    const pid = resolveProjectId(projectId);
    return apiClient.get(`${BASE_PATH}/${pid}/types`);
  },
};

export default cinderApi;
