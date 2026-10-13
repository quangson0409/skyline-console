import apiClient from './client';
import { serviceBase, currentProjectId } from './endpoints';

/**
 * OpenStack Trove (Database) API v1.0 - port of legacy src/client/trove
 * Legacy client has `projectInUrl`, so every path is /v1.0/{project_id}/...
 * Base path resolved per call: serviceBase('trove') -> /openstack/<region>/trove/v1.0
 */
const p = () => `${serviceBase('trove')}/${currentProjectId()}`;
const enc = (v) => encodeURIComponent(v);

export const troveApi = {
  // -------------------------------------------------------------- Instances
  listInstances: (params) => apiClient.get(`${p()}/instances`, { params }),
  getInstance: (id) => apiClient.get(`${p()}/instances/${id}`),
  createInstance: (body) => apiClient.post(`${p()}/instances`, body),
  deleteInstance: (id) => apiClient.delete(`${p()}/instances/${id}`),
  /** legacy store.patch({ id }, { instance: { name } }) */
  patchInstance: (id, body) => apiClient.patch(`${p()}/instances/${id}`, body),
  /** PUT /instances/{id} - attach / detach a configuration group */
  updateInstance: (id, body) => apiClient.put(`${p()}/instances/${id}`, body),
  /** POST /instances/{id}/action { restart | reboot | resize ... } */
  instanceAction: (id, body) => apiClient.post(`${p()}/instances/${id}/action`, body),
  /** POST /mgmt/instances/{id}/action { stop: {} } (legacy instancesAdmin.action) */
  adminInstanceAction: (id, body) => apiClient.post(`${p()}/mgmt/instances/${id}/action`, body),

  // --------------------------------------------------- Instance sub resources
  listUsers: (id, params) => apiClient.get(`${p()}/instances/${id}/users`, { params }),
  createUsers: (id, body) => apiClient.post(`${p()}/instances/${id}/users`, body),
  deleteUser: (id, name) => apiClient.delete(`${p()}/instances/${id}/users/${enc(name)}`),
  /** legacy grantDatabase: PUT /instances/{id}/users/{name}/databases */
  grantDatabases: (id, name, body) => apiClient.put(`${p()}/instances/${id}/users/${enc(name)}/databases`, body),
  listDatabases: (id, params) => apiClient.get(`${p()}/instances/${id}/databases`, { params }),
  createDatabases: (id, body) => apiClient.post(`${p()}/instances/${id}/databases`, body),
  deleteDatabase: (id, name) => apiClient.delete(`${p()}/instances/${id}/databases/${enc(name)}`),
  listInstanceBackups: (id) => apiClient.get(`${p()}/instances/${id}/backups`),
  listInstanceLogs: (id) => apiClient.get(`${p()}/instances/${id}/log`),

  // ------------------------------------------------------------- Datastores
  listDatastores: () => apiClient.get(`${p()}/datastores`),

  // ---------------------------------------------------------------- Backups
  listBackups: (params) => apiClient.get(`${p()}/backups`, { params }),
  getBackup: (id) => apiClient.get(`${p()}/backups/${id}`),
  createBackup: (body) => apiClient.post(`${p()}/backups`, body),
  deleteBackup: (id) => apiClient.delete(`${p()}/backups/${id}`),

  // --------------------------------------------------------- Configurations
  listConfigurations: (params) => apiClient.get(`${p()}/configurations`, { params }),
  getConfiguration: (id) =>
    apiClient.get(`${p()}/configurations/${id}`, { headers: { 'content-type': 'application/json' } }),
  createConfiguration: (body) => apiClient.post(`${p()}/configurations`, body),
  deleteConfiguration: (id) => apiClient.delete(`${p()}/configurations/${id}`),
  listConfigurationInstances: (id) => apiClient.get(`${p()}/configurations/${id}/instances`),

  // ----------------------------------------------------------------- Quotas
  /** GET /mgmt/quotas/{project_id} -> { quotas: [{ resource, in_use, limit, reserved }] } */
  getQuota: (projectId) => apiClient.get(`${p()}/mgmt/quotas/${projectId || currentProjectId()}`),
};

export default troveApi;
