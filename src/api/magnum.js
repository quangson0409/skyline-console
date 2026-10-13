import apiClient from './client';
import { serviceBase, currentProjectId } from './endpoints';

/**
 * OpenStack Magnum Container Infra API (v1) - port of legacy src/client/magnum
 * Base path resolved per call: serviceBase('magnum') -> /openstack/<region>/magnum/v1
 */
const base = () => serviceBase('magnum');

/** Legacy stores/magnum/clusters.resize header */
const LATEST = { headers: { 'OpenStack-API-Version': 'container-infra latest' } };

export const magnumApi = {
  // ---------------------------------------------------------------- Clusters
  /** Legacy listWithDetail: project page uses /clusters/detail, admin page /clusters */
  listClusters: (params, { detail = true } = {}) =>
    apiClient.get(`${base()}/clusters${detail ? '/detail' : ''}`, { params }),
  getCluster: (id) => apiClient.get(`${base()}/clusters/${id}`),
  createCluster: (body) => apiClient.post(`${base()}/clusters`, body),
  deleteCluster: (id) => apiClient.delete(`${base()}/clusters/${id}`),
  resizeCluster: (id, body) => apiClient.post(`${base()}/clusters/${id}/actions/resize`, body, LATEST),
  upgradeCluster: (id, body) => apiClient.post(`${base()}/clusters/${id}/actions/upgrade`, body),

  // ------------------------------------------------------- Cluster templates
  listClusterTemplates: (params, { detail = true } = {}) =>
    apiClient.get(`${base()}/clustertemplates${detail ? '/detail' : ''}`, { params }),
  getClusterTemplate: (id) => apiClient.get(`${base()}/clustertemplates/${id}`),
  createClusterTemplate: (body) => apiClient.post(`${base()}/clustertemplates`, body),
  /** JSON patch: [{ path: '/name', value, op: 'replace' | 'remove' }] */
  updateClusterTemplate: (id, ops) => apiClient.patch(`${base()}/clustertemplates/${id}`, ops),
  deleteClusterTemplate: (id) => apiClient.delete(`${base()}/clustertemplates/${id}`),

  // ------------------------------------------------------------------ Quotas
  getClusterQuota: (projectId = currentProjectId()) => apiClient.get(`${base()}/quotas/${projectId}/Cluster`),

  // ----------------------------------------- Heat stack of a cluster (detail)
  /** Legacy stackClient.list({ id }) - heat uses /v1/{project_id}/stacks */
  listStacks: (params) => apiClient.get(`${serviceBase('heat')}/${currentProjectId()}/stacks`, { params }),
};

export default magnumApi;
