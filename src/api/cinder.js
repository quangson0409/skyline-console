import apiClient from './client';

/**
 * OpenStack Cinder Block Storage API (v3)
 * Path: /api/openstack/regionone/cinder/v3
 */
const BASE_PATH = '/openstack/regionone/cinder/v3';

export const cinderApi = {
  // Volumes
  listVolumes: (projectId, params) => apiClient.get(`${BASE_PATH}/${projectId}/volumes/detail`, { params }),
  getVolume: (projectId, id) => apiClient.get(`${BASE_PATH}/${projectId}/volumes/${id}`),
  createVolume: (projectId, data) => apiClient.post(`${BASE_PATH}/${projectId}/volumes`, { volume: data }),
  deleteVolume: (projectId, id) => apiClient.delete(`${BASE_PATH}/${projectId}/volumes/${id}`),

  // Snapshots
  listSnapshots: (projectId, params) => apiClient.get(`${BASE_PATH}/${projectId}/snapshots/detail`, { params }),
  createSnapshot: (projectId, data) => apiClient.post(`${BASE_PATH}/${projectId}/snapshots`, { snapshot: data }),
  deleteSnapshot: (projectId, id) => apiClient.delete(`${BASE_PATH}/${projectId}/snapshots/${id}`),

  // Backups
  listBackups: (projectId, params) => apiClient.get(`${BASE_PATH}/${projectId}/backups/detail`, { params }),

  // Types
  listVolumeTypes: (projectId) => apiClient.get(`${BASE_PATH}/${projectId}/types`),
};

export default cinderApi;
