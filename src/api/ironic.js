import apiClient from './client';
import { serviceBase, versionHeaders } from './endpoints';

/**
 * OpenStack Ironic Bare Metal API (v1) - port of legacy src/client/ironic
 * Every call sends the legacy microversion header (X-Openstack-Ironic-Api-Version).
 */
const base = () => serviceBase('ironic');
const conf = (extra = {}) => ({ ...extra, headers: { ...versionHeaders('ironic').headers, ...(extra.headers || {}) } });

export const ironicApi = {
  // Nodes
  listNodes: (params) => apiClient.get(`${base()}/nodes/detail`, conf({ params })),
  getNode: (id) => apiClient.get(`${base()}/nodes/${id}`, conf()),
  createNode: (data) => apiClient.post(`${base()}/nodes`, data, conf()),
  /** JSON patch: [{ op, path, value }] */
  updateNode: (id, ops) => apiClient.patch(`${base()}/nodes/${id}`, ops, conf()),
  deleteNode: (id) => apiClient.delete(`${base()}/nodes/${id}`, conf()),
  setProvisionState: (id, body) => apiClient.put(`${base()}/nodes/${id}/states/provision`, body, conf()),
  setPowerState: (id, body) => apiClient.put(`${base()}/nodes/${id}/states/power`, body, conf()),
  setMaintenance: (id, body = {}) => apiClient.put(`${base()}/nodes/${id}/maintenance`, body, conf()),
  clearMaintenance: (id) => apiClient.delete(`${base()}/nodes/${id}/maintenance`, conf()),
  getBootDevice: (id) => apiClient.get(`${base()}/nodes/${id}/management/boot_device`, conf()),
  setBootDevice: (id, body) => apiClient.put(`${base()}/nodes/${id}/management/boot_device`, body, conf()),
  getSupportedBootDevices: (id) =>
    apiClient.get(`${base()}/nodes/${id}/management/boot_device/supported`, conf()),
  updateTraits: (id, traits) => apiClient.put(`${base()}/nodes/${id}/traits`, { traits }, conf()),
  getStates: (id) => apiClient.get(`${base()}/nodes/${id}/states`, conf()),
  validateNode: (id) => apiClient.get(`${base()}/nodes/${id}/validate`, conf()),
  listNodePorts: (id, params) => apiClient.get(`${base()}/nodes/${id}/ports/detail`, conf({ params })),
  listNodePortGroups: (id, params) =>
    apiClient.get(`${base()}/nodes/${id}/portgroups/detail`, conf({ params })),

  // Ports
  listPorts: (params) => apiClient.get(`${base()}/ports/detail`, conf({ params })),
  getPort: (id) => apiClient.get(`${base()}/ports/${id}`, conf()),
  createPort: (data) => apiClient.post(`${base()}/ports`, data, conf()),
  updatePort: (id, ops) => apiClient.patch(`${base()}/ports/${id}`, ops, conf()),
  deletePort: (id) => apiClient.delete(`${base()}/ports/${id}`, conf()),

  // Port groups
  listPortGroups: (params) => apiClient.get(`${base()}/portgroups/detail`, conf({ params })),
  createPortGroup: (data) => apiClient.post(`${base()}/portgroups`, data, conf()),
  updatePortGroup: (id, ops) => apiClient.patch(`${base()}/portgroups/${id}`, ops, conf()),
  deletePortGroup: (id) => apiClient.delete(`${base()}/portgroups/${id}`, conf()),
};

export default ironicApi;
