import apiClient from './client';

/**
 * OpenStack Nova Compute API (v2.1)
 * Path: /api/openstack/regionone/nova/v2.1
 */
const BASE_PATH = '/openstack/regionone/nova/v2.1';

export const novaApi = {
  // Servers / Instances
  listServers: (params) => apiClient.get(`${BASE_PATH}/servers/detail`, { params }),
  getServer: (id) => apiClient.get(`${BASE_PATH}/servers/${id}`),
  createServer: (data) => apiClient.post(`${BASE_PATH}/servers`, { server: data }),
  deleteServer: (id) => apiClient.delete(`${BASE_PATH}/servers/${id}`),
  serverAction: (id, actionData) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, actionData),

  // Power & State Actions
  startServer: (id) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { 'os-start': null }),
  stopServer: (id) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { 'os-stop': null }),
  rebootServer: (id, type = 'SOFT') =>
    apiClient.post(`${BASE_PATH}/servers/${id}/action`, { reboot: { type } }),
  pauseServer: (id) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { pause: null }),
  unpauseServer: (id) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { unpause: null }),
  lockServer: (id) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { lock: null }),
  unlockServer: (id) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { unlock: null }),
  suspendServer: (id) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { suspend: null }),
  resumeServer: (id) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { resume: null }),
  shelveServer: (id) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { shelve: null }),
  unshelveServer: (id) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { unshelve: null }),
  rescueServer: (id, rescue_image_ref) =>
    apiClient.post(`${BASE_PATH}/servers/${id}/action`, { rescue: rescue_image_ref ? { rescue_image_ref } : null }),
  unrescueServer: (id) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { unrescue: null }),

  // Resizing & Configuration
  resizeServer: (id, flavorRef) =>
    apiClient.post(`${BASE_PATH}/servers/${id}/action`, { resize: { flavorRef } }),
  confirmResizeServer: (id) =>
    apiClient.post(`${BASE_PATH}/servers/${id}/action`, { confirmResize: null }),
  revertResizeServer: (id) =>
    apiClient.post(`${BASE_PATH}/servers/${id}/action`, { revertResize: null }),
  changePasswordServer: (id, adminPass) =>
    apiClient.post(`${BASE_PATH}/servers/${id}/action`, { changePassword: { adminPass } }),
  createSnapshot: (id, name, metadata = {}) =>
    apiClient.post(`${BASE_PATH}/servers/${id}/action`, { createImage: { name, metadata } }),

  // Attachments (Volumes & Network Interfaces)
  attachVolume: (id, volumeId) =>
    apiClient.post(`${BASE_PATH}/servers/${id}/os-volume_attachments`, {
      volumeAttachment: { volumeId },
    }),
  detachVolume: (id, volumeId) =>
    apiClient.delete(`${BASE_PATH}/servers/${id}/os-volume_attachments/${volumeId}`),
  listAttachedVolumes: (id) =>
    apiClient.get(`${BASE_PATH}/servers/${id}/os-volume_attachments`),
  attachInterface: (id, data) =>
    apiClient.post(`${BASE_PATH}/servers/${id}/os-interface`, { interfaceAttachment: data }),
  detachInterface: (id, portId) =>
    apiClient.delete(`${BASE_PATH}/servers/${id}/os-interface/${portId}`),
  listInterfaces: (id) =>
    apiClient.get(`${BASE_PATH}/servers/${id}/os-interface`),

  // Metadata & Tags
  setServerTags: (id, tags = []) =>
    apiClient.put(`${BASE_PATH}/servers/${id}/tags`, { tags }),

  // Admin Actions (Require Administrator Role)
  migrateServer: (id) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { migrate: null }),
  liveMigrateServer: (id, host = null) =>
    apiClient.post(`${BASE_PATH}/servers/${id}/action`, {
      'os-migrateLive': { host, block_migration: 'auto' },
    }),
  resetServerState: (id, state = 'active') =>
    apiClient.post(`${BASE_PATH}/servers/${id}/action`, {
      'os-resetState': { state },
    }),

  // Console & Logs
  getVncConsole: (id) =>
    apiClient.post(`${BASE_PATH}/servers/${id}/action`, {
      'os-getVNCConsole': { type: 'novnc' },
    }),
  getServerActionRecords: (id) =>
    apiClient.get(`${BASE_PATH}/servers/${id}/os-instance-actions`),

  // Flavors
  listFlavors: (params) => apiClient.get(`${BASE_PATH}/flavors/detail`, { params }),
  createFlavor: (data) => apiClient.post(`${BASE_PATH}/flavors`, { flavor: data }),
  deleteFlavor: (id) => apiClient.delete(`${BASE_PATH}/flavors/${id}`),

  // Keypairs
  listKeypairs: () => apiClient.get(`${BASE_PATH}/os-keypairs`),
  createKeypair: (data) => apiClient.post(`${BASE_PATH}/os-keypairs`, { keypair: data }),
  deleteKeypair: (name) => apiClient.delete(`${BASE_PATH}/os-keypairs/${name}`),

  // Server Groups
  listServerGroups: () => apiClient.get(`${BASE_PATH}/os-server-groups`),

  // Hypervisors & Quota
  listHypervisors: () => apiClient.get(`${BASE_PATH}/os-hypervisors/detail`),
  getQuotaSet: (projectId) => apiClient.get(`${BASE_PATH}/os-quota-sets/${projectId}/detail`),
};

export default novaApi;
