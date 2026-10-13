import apiClient from './client';
import { useAuthStore } from '@/store/authStore';
import { serviceBase, versionHeaders } from './endpoints';

/**
 * OpenStack Cinder Block Storage API (v3) - port of legacy src/client/cinder
 * Base path resolved per call: serviceBase('cinder') -> /openstack/<region>/cinder/v3
 * Legacy client has `projectInUrl`, so every path is /v3/{project_id}/...
 */
const base = () => serviceBase('cinder');

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

/** /v3/{project_id} prefix for the current project */
const p = () => `${base()}/${resolveProjectId()}`;
const vh = () => versionHeaders('cinder');
const withParams = (params) => ({ ...vh(), params });

/** Skyline apiserver extension endpoints (legacy skylineClient.extension.*) */
const SKYLINE_EXT = '/openstack/skyline/api/v1/extension';

export const cinderApi = {
  // ---------------------------------------------------------------- Volumes
  // (projectId, params) | (params) signatures kept for existing callers
  listVolumes: (projectId, params) => {
    if (typeof projectId === 'object' && projectId !== null && !params) {
      params = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.get(`${base()}/${pid}/volumes/detail`, { params });
  },
  getVolume: (projectId, id) => {
    if (!id && projectId) {
      id = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.get(`${base()}/${pid}/volumes/${id}`);
  },
  createVolume: (projectId, data) => {
    if (typeof projectId === 'object' && !data) {
      data = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.post(`${base()}/${pid}/volumes`, { volume: data });
  },
  deleteVolume: (projectId, id) => {
    if (!id && projectId) {
      id = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.delete(`${base()}/${pid}/volumes/${id}`);
  },
  /** legacy cascadeDelete: DELETE /volumes/{id}?cascade=true */
  deleteVolumeCascade: (id, cascade = true) =>
    apiClient.delete(`${p()}/volumes/${id}`, withParams(cascade ? { cascade: true } : undefined)),
  updateVolume: (id, data) => apiClient.put(`${p()}/volumes/${id}`, { volume: data }, vh()),
  /** POST /volumes/{id}/action { [key]: data } (os-extend, os-retype, os-reset_status, revert, ...) */
  volumeAction: (id, key, data) => apiClient.post(`${p()}/volumes/${id}/action`, { [key]: data }, vh()),
  /** Skyline extension list: includes attachments.server_name, project_name, host */
  listVolumesExtension: (params) =>
    apiClient.get(`${SKYLINE_EXT}/volumes`, { params, paramsSerializer: { indexes: null } }),

  // -------------------------------------------------------------- Snapshots
  listSnapshots: (projectId, params) => {
    if (typeof projectId === 'object' && projectId !== null && !params) {
      params = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.get(`${base()}/${pid}/snapshots/detail`, { params });
  },
  getSnapshot: (id) => apiClient.get(`${p()}/snapshots/${id}`, vh()),
  createSnapshot: (projectId, data) => {
    if (typeof projectId === 'object' && !data) {
      data = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.post(`${base()}/${pid}/snapshots`, { snapshot: data });
  },
  updateSnapshot: (id, data) => apiClient.put(`${p()}/snapshots/${id}`, { snapshot: data }, vh()),
  deleteSnapshot: (projectId, id) => {
    if (!id && projectId) {
      id = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.delete(`${base()}/${pid}/snapshots/${id}`);
  },
  /** Skyline extension list: includes volume_name, child_volumes, project_name */
  listSnapshotsExtension: (params) =>
    apiClient.get(`${SKYLINE_EXT}/volume_snapshots`, { params, paramsSerializer: { indexes: null } }),

  // ---------------------------------------------------------------- Backups
  listBackups: (projectId, params) => {
    if (typeof projectId === 'object' && projectId !== null && !params) {
      params = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.get(`${base()}/${pid}/backups/detail`, { params });
  },
  getBackup: (id) => apiClient.get(`${p()}/backups/${id}`, vh()),
  createBackup: (data) => apiClient.post(`${p()}/backups`, { backup: data }, vh()),
  updateBackup: (id, data) => apiClient.put(`${p()}/backups/${id}`, { backup: data }, vh()),
  deleteBackup: (id) => apiClient.delete(`${p()}/backups/${id}`),
  restoreBackup: (id, body) => apiClient.post(`${p()}/backups/${id}/restore`, { restore: body }),

  // ------------------------------------------------- Quota & availability zones
  getQuotaSet: (projectId) =>
    apiClient.get(`${p()}/os-quota-sets/${resolveProjectId(projectId)}`, {
      params: { usage: true },
    }),
  listAvailabilityZones: () => apiClient.get(`${p()}/os-availability-zone`),

  // ----------------------------------------------------------- Volume types
  listVolumeTypes: (projectId, params) => {
    if (typeof projectId === 'object' && projectId !== null && !params) {
      params = projectId;
      projectId = null;
    }
    const pid = resolveProjectId(projectId);
    return apiClient.get(`${base()}/${pid}/types`, { params });
  },
  getVolumeType: (id) => apiClient.get(`${p()}/types/${id}`, vh()),
  createVolumeType: (data) => apiClient.post(`${p()}/types`, { volume_type: data }, vh()),
  updateVolumeType: (id, data) => apiClient.put(`${p()}/types/${id}`, { volume_type: data }, vh()),
  deleteVolumeType: (id) => apiClient.delete(`${p()}/types/${id}`, vh()),
  volumeTypeAction: (id, body) => apiClient.post(`${p()}/types/${id}/action`, body, vh()),
  getVolumeTypeAccess: (id) => apiClient.get(`${p()}/types/${id}/os-volume-type-access`, vh()),
  listVolumeTypeExtraSpecs: (id) => apiClient.get(`${p()}/types/${id}/extra_specs`, vh()),
  setVolumeTypeExtraSpecs: (id, extraSpecs) =>
    apiClient.post(`${p()}/types/${id}/extra_specs`, { extra_specs: extraSpecs }, vh()),
  deleteVolumeTypeExtraSpec: (id, key) =>
    apiClient.delete(`${p()}/types/${id}/extra_specs/${encodeURIComponent(key)}`, vh()),
  getVolumeTypeEncryption: (id) => apiClient.get(`${p()}/types/${id}/encryption`, vh()),
  createVolumeTypeEncryption: (id, data) =>
    apiClient.post(`${p()}/types/${id}/encryption`, { encryption: data }, vh()),
  deleteVolumeTypeEncryption: (id, encryptionId) =>
    apiClient.delete(`${p()}/types/${id}/encryption/${encryptionId}`, vh()),

  // -------------------------------------------------------------- QoS specs
  listQosSpecs: (params) => apiClient.get(`${p()}/qos-specs`, withParams(params)),
  getQosSpec: (id) => apiClient.get(`${p()}/qos-specs/${id}`, vh()),
  createQosSpec: (data) => apiClient.post(`${p()}/qos-specs`, { qos_specs: data }, vh()),
  updateQosSpec: (id, data) => apiClient.put(`${p()}/qos-specs/${id}`, { qos_specs: data }, vh()),
  deleteQosSpec: (id) => apiClient.delete(`${p()}/qos-specs/${id}`, vh()),
  deleteQosSpecKeys: (id, keys) => apiClient.put(`${p()}/qos-specs/${id}/delete_keys`, { keys }, vh()),
  associateQosSpec: (id, volTypeId) =>
    apiClient.get(`${p()}/qos-specs/${id}/associate`, withParams({ vol_type_id: volTypeId })),
  disassociateQosSpec: (id, volTypeId) =>
    apiClient.get(`${p()}/qos-specs/${id}/disassociate`, withParams({ vol_type_id: volTypeId })),

  // ------------------------------------------------------ Pools / services
  listPools: (params = {}) =>
    apiClient.get(`${p()}/scheduler-stats/get_pools`, withParams({ detail: true, ...params })),
  listServices: (params) => apiClient.get(`${p()}/os-services`, withParams(params)),

  // ------------------------------------------------------- Volume transfers
  listTransfers: (params) => apiClient.get(`${p()}/volume-transfers`, withParams(params)),
  createTransfer: (data) => apiClient.post(`${p()}/volume-transfers`, { transfer: data }, vh()),
  deleteTransfer: (id) => apiClient.delete(`${p()}/volume-transfers/${id}`, vh()),
  acceptTransfer: (id, data) => apiClient.post(`${p()}/volume-transfers/${id}/accept`, { accept: data }, vh()),
};

export default cinderApi;
