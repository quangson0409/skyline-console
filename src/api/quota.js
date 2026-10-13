import apiClient from './client';
import { serviceBase, versionHeaders, currentProjectId } from './endpoints';

const scoped = (service) => `${serviceBase(service)}/${currentProjectId()}`;

/**
 * Per-project quota calls used by Identity > Projects (legacy stores/keystone/project.js).
 * Every base path is resolved per call. Services that put the project id in the URL
 * (cinder, manila, trove - legacy `projectInUrl`) are prefixed with the current (token) project id
 * and address the target project as the resource id, exactly like legacy.
 */
export const quotaApi = {
  // Nova: os-quota-sets/{id}/detail
  getNovaQuota: (projectId) =>
    apiClient.get(`${serviceBase('nova')}/os-quota-sets/${projectId}/detail`, versionHeaders('nova')),
  updateNovaQuota: (projectId, body) =>
    apiClient.put(`${serviceBase('nova')}/os-quota-sets/${projectId}`, body, versionHeaders('nova')),

  // Neutron: quotas/{id}/details
  getNeutronQuota: (projectId) => apiClient.get(`${serviceBase('neutron')}/quotas/${projectId}/details`),
  updateNeutronQuota: (projectId, body) => apiClient.put(`${serviceBase('neutron')}/quotas/${projectId}`, body),

  // Cinder: {project}/os-quota-sets/{id}?usage=True
  getCinderQuota: (projectId) =>
    apiClient.get(`${scoped('cinder')}/os-quota-sets/${projectId}`, {
      params: { usage: 'True' },
      ...versionHeaders('cinder'),
    }),
  updateCinderQuota: (projectId, body) =>
    apiClient.put(`${scoped('cinder')}/os-quota-sets/${projectId}`, body, versionHeaders('cinder')),
  listVolumeTypes: (params = { is_public: 'None' }) =>
    apiClient.get(`${scoped('cinder')}/types`, { params, ...versionHeaders('cinder') }),
  getVolumeTypeAccess: (typeId) =>
    apiClient.get(`${scoped('cinder')}/types/${typeId}/os-volume-type-access`, versionHeaders('cinder')),

  // Manila: {project}/quota-sets/{id}/detail
  getShareQuota: (projectId) =>
    apiClient.get(`${scoped('manilav2')}/quota-sets/${projectId}/detail`, versionHeaders('manilav2')),
  updateShareQuota: (projectId, body) =>
    apiClient.put(`${scoped('manilav2')}/quota-sets/${projectId}`, body, versionHeaders('manilav2')),

  // Zun: quotas/{id}?usages=true
  getZunQuota: (projectId) =>
    apiClient.get(`${serviceBase('zun')}/quotas/${projectId}`, { params: { usages: true }, ...versionHeaders('zun') }),
  updateZunQuota: (projectId, body) =>
    apiClient.put(`${serviceBase('zun')}/quotas/${projectId}`, body, versionHeaders('zun')),

  // Magnum: quotas/{id}/Cluster
  getMagnumQuota: (projectId) => apiClient.get(`${serviceBase('magnum')}/quotas/${projectId}/Cluster`),
  listMagnumClusters: () => apiClient.get(`${serviceBase('magnum')}/clusters/detail`),
  createMagnumQuota: (body) => apiClient.post(`${serviceBase('magnum')}/quotas`, body),
  updateMagnumQuota: (projectId, body) => apiClient.patch(`${serviceBase('magnum')}/quotas/${projectId}/Cluster`, body),

  // Trove: {project}/mgmt/quotas/{id}
  getTroveQuota: (projectId) => apiClient.get(`${scoped('trove')}/mgmt/quotas/${projectId}`),
  updateTroveQuota: (projectId, body) =>
    apiClient.put(`${scoped('trove')}/mgmt/quotas/${projectId}`, body),
};

export default quotaApi;
