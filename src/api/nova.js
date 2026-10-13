import apiClient from './client';
import { serviceBase, versionHeaders } from './endpoints';

/**
 * OpenStack Nova Compute API (v2.1)
 * Path: /api/openstack/regionone/nova/v2.1
 */
const BASE_PATH = '/openstack/regionone/nova/v2.1';
const novaV = () => serviceBase('nova');
const novaConf = (extra = {}) => ({
  ...extra,
  headers: { ...versionHeaders('nova').headers, ...(extra.headers || {}) },
});

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
  rebuildServer: (id, data) => apiClient.post(`${BASE_PATH}/servers/${id}/action`, { rebuild: data }),
  updateServer: (id, data) => apiClient.put(`${BASE_PATH}/servers/${id}`, { server: data }),

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

  // Security Groups Attachment
  addSecurityGroup: (id, name) =>
    apiClient.post(`${BASE_PATH}/servers/${id}/action`, { addSecurityGroup: { name } }),
  removeSecurityGroup: (id, name) =>
    apiClient.post(`${BASE_PATH}/servers/${id}/action`, { removeSecurityGroup: { name } }),

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
  getFlavor: (id) => apiClient.get(`${BASE_PATH}/flavors/${id}`),
  createFlavor: (data) => apiClient.post(`${BASE_PATH}/flavors`, { flavor: data }),
  deleteFlavor: (id) => apiClient.delete(`${BASE_PATH}/flavors/${id}`),
  getFlavorExtraSpecs: (id) => apiClient.get(`${BASE_PATH}/flavors/${id}/os-extra_specs`),
  setFlavorExtraSpecs: (id, extra_specs) =>
    apiClient.post(`${BASE_PATH}/flavors/${id}/os-extra_specs`, { extra_specs }),
  getFlavorAccess: (id) => apiClient.get(`${BASE_PATH}/flavors/${id}/os-flavor-access`),
  addFlavorAccess: (id, tenant_id) =>
    apiClient.post(`${BASE_PATH}/flavors/${id}/action`, { addTenantAccess: { tenant: tenant_id } }),
  removeFlavorAccess: (id, tenant_id) =>
    apiClient.post(`${BASE_PATH}/flavors/${id}/action`, { removeTenantAccess: { tenant: tenant_id } }),

  // Keypairs
  listKeypairs: () => apiClient.get(`${BASE_PATH}/os-keypairs`),
  createKeypair: (data) => apiClient.post(`${BASE_PATH}/os-keypairs`, { keypair: data }),
  deleteKeypair: (name) => apiClient.delete(`${BASE_PATH}/os-keypairs/${name}`),

  // Server Groups
  listServerGroups: () => apiClient.get(`${BASE_PATH}/os-server-groups`),
  getServerGroup: (id) => apiClient.get(`${BASE_PATH}/os-server-groups/${id}`),
  createServerGroup: (data) => apiClient.post(`${BASE_PATH}/os-server-groups`, { server_group: data }),
  deleteServerGroup: (id) => apiClient.delete(`${BASE_PATH}/os-server-groups/${id}`),

  // Host Aggregates
  listAggregates: () => apiClient.get(`${BASE_PATH}/os-aggregates`),
  createAggregate: (data) => apiClient.post(`${BASE_PATH}/os-aggregates`, { aggregate: data }),
  deleteAggregate: (id) => apiClient.delete(`${BASE_PATH}/os-aggregates/${id}`),
  addHostToAggregate: (id, host) =>
    apiClient.post(`${BASE_PATH}/os-aggregates/${id}/action`, { add_host: { host } }),
  removeHostFromAggregate: (id, host) =>
    apiClient.post(`${BASE_PATH}/os-aggregates/${id}/action`, { remove_host: { host } }),

  // Hypervisors, Services & Quota
  listHypervisors: () => apiClient.get(`${BASE_PATH}/os-hypervisors/detail`),
  listAvailabilityZones: () => apiClient.get(`${BASE_PATH}/os-availability-zone`),
  listServices: (params) => apiClient.get(`${BASE_PATH}/os-services`, { params }),
  enableService: (host, binary = 'nova-compute') =>
    apiClient.put(`${BASE_PATH}/os-services/enable`, { host, binary }),
  disableService: (host, binary = 'nova-compute') =>
    apiClient.put(`${BASE_PATH}/os-services/disable`, { host, binary }),
  getQuotaSet: (projectId) => apiClient.get(`${BASE_PATH}/os-quota-sets/${projectId}/detail`),
  // ---------------------------------------------------------------------
  // Microversioned calls used by the Compute pages (port of legacy client/nova).
  // Base path resolved per call from the catalog; legacy 2.79 microversion header.
  // ---------------------------------------------------------------------

  // Servers (read-only helpers for compute pages)
  listServersV: (params) => apiClient.get(`${novaV()}/servers/detail`, novaConf({ params })),
  getServerV: (id) => apiClient.get(`${novaV()}/servers/${id}`, novaConf()),

  // Flavors
  listFlavorsV: (params) => apiClient.get(`${novaV()}/flavors/detail`, novaConf({ params })),
  getFlavorV: (id) => apiClient.get(`${novaV()}/flavors/${id}`, novaConf()),
  createFlavorV: (flavor) => apiClient.post(`${novaV()}/flavors`, { flavor }, novaConf()),
  updateFlavorV: (id, flavor) => apiClient.put(`${novaV()}/flavors/${id}`, { flavor }, novaConf()),
  deleteFlavorV: (id) => apiClient.delete(`${novaV()}/flavors/${id}`, novaConf()),
  flavorActionV: (id, body) => apiClient.post(`${novaV()}/flavors/${id}/action`, body, novaConf()),
  getFlavorAccessV: (id) => apiClient.get(`${novaV()}/flavors/${id}/os-flavor-access`, novaConf()),
  getFlavorExtraSpecsV: (id) => apiClient.get(`${novaV()}/flavors/${id}/os-extra_specs`, novaConf()),
  createFlavorExtraSpecsV: (id, extra_specs) =>
    apiClient.post(`${novaV()}/flavors/${id}/os-extra_specs`, { extra_specs }, novaConf()),
  updateFlavorExtraSpecV: (id, key, value) =>
    apiClient.put(`${novaV()}/flavors/${id}/os-extra_specs/${encodeURIComponent(key)}`, { [key]: value }, novaConf()),
  deleteFlavorExtraSpecV: (id, key) =>
    apiClient.delete(`${novaV()}/flavors/${id}/os-extra_specs/${encodeURIComponent(key)}`, novaConf()),

  // Keypairs
  listKeypairsV: (params) => apiClient.get(`${novaV()}/os-keypairs`, novaConf({ params })),
  getKeypairV: (name, params) =>
    apiClient.get(`${novaV()}/os-keypairs/${encodeURIComponent(name)}`, novaConf({ params })),
  createKeypairV: (keypair) => apiClient.post(`${novaV()}/os-keypairs`, { keypair }, novaConf()),
  deleteKeypairV: (name, params) =>
    apiClient.delete(`${novaV()}/os-keypairs/${encodeURIComponent(name)}`, novaConf({ params })),

  // Server groups
  listServerGroupsV: (params) => apiClient.get(`${novaV()}/os-server-groups`, novaConf({ params })),
  getServerGroupV: (id) => apiClient.get(`${novaV()}/os-server-groups/${id}`, novaConf()),
  createServerGroupV: (server_group) =>
    apiClient.post(`${novaV()}/os-server-groups`, { server_group }, novaConf()),
  deleteServerGroupV: (id) => apiClient.delete(`${novaV()}/os-server-groups/${id}`, novaConf()),

  // Host aggregates
  listAggregatesV: () => apiClient.get(`${novaV()}/os-aggregates`, novaConf()),
  getAggregateV: (id) => apiClient.get(`${novaV()}/os-aggregates/${id}`, novaConf()),
  createAggregateV: (aggregate) => apiClient.post(`${novaV()}/os-aggregates`, { aggregate }, novaConf()),
  updateAggregateV: (id, aggregate) => apiClient.put(`${novaV()}/os-aggregates/${id}`, { aggregate }, novaConf()),
  deleteAggregateV: (id) => apiClient.delete(`${novaV()}/os-aggregates/${id}`, novaConf()),
  aggregateActionV: (id, body) => apiClient.post(`${novaV()}/os-aggregates/${id}/action`, body, novaConf()),
  setAggregateMetadataV: (id, metadata) =>
    apiClient.post(`${novaV()}/os-aggregates/${id}/action`, { set_metadata: { metadata } }, novaConf()),

  // Availability zones
  listAvailabilityZonesDetailV: () => apiClient.get(`${novaV()}/os-availability-zone/detail`, novaConf()),
  listAvailabilityZonesV: () => apiClient.get(`${novaV()}/os-availability-zone`, novaConf()),

  // Hypervisors
  listHypervisorsV: (params) => apiClient.get(`${novaV()}/os-hypervisors/detail`, novaConf({ params })),
  getHypervisorV: (id, params) => apiClient.get(`${novaV()}/os-hypervisors/${id}`, novaConf({ params })),

  // Compute services (2.53+: update by id)
  listServicesV: (params) => apiClient.get(`${novaV()}/os-services`, novaConf({ params })),
  updateServiceV: (id, body) => apiClient.put(`${novaV()}/os-services/${id}`, body, novaConf()),
  deleteServiceV: (id) => apiClient.delete(`${novaV()}/os-services/${id}`, novaConf()),
  /** Skyline apiserver extension used by legacy ComputeHost list */
  listComputeServicesExt: (params) =>
    apiClient.get('/openstack/skyline/api/v1/extension/compute-services', { params }),

  /**
   * Create server with the full legacy request body (legacy client.nova.servers.create(body)):
   * { server: {...}, 'OS-SCH-HNT:scheduler_hints': {...} } - catalog base path + 2.79 microversion.
   */
  createServerV: (body) => apiClient.post(`${novaV()}/servers`, body, novaConf()),

  /** GET /servers (brief: id/name/links) - legacy globalServerStore list used by AdminOverview counts */
  listServersBriefV: (params) => apiClient.get(`${novaV()}/servers`, novaConf({ params })),
};

export default novaApi;
