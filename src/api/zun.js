import apiClient from './client';
import { serviceBase, versionHeaders, currentProjectId } from './endpoints';

/**
 * OpenStack Zun Container Service API (v1) - port of legacy src/client/zun
 * Base path resolved per call: serviceBase('zun') -> /openstack/<region>/zun/v1
 * Every call carries the legacy microversion header (versionHeaders('zun')).
 */
const base = () => serviceBase('zun');
const conf = (extra = {}) => {
  const vh = versionHeaders('zun');
  return { ...extra, headers: { ...vh.headers, ...(extra.headers || {}) } };
};
const c = (id) => `${base()}/containers/${id}`;

/**
 * Legacy client sends the action options as JSON body; the zun API reads them from the
 * query string, so they are sent in both places (harmless for either implementation).
 */
const postAction = (id, op, data) =>
  apiClient.post(`${c(id)}/${op}`, data || null, conf(data ? { params: data } : {}));

export const zunApi = {
  // -------------------------------------------------------------- Containers
  listContainers: (params) => apiClient.get(`${base()}/containers`, conf({ params })),
  getContainer: (id) => apiClient.get(c(id), conf()),
  createContainer: (body) => apiClient.post(`${base()}/containers`, body, conf()),
  updateContainer: (id, body) => apiClient.patch(c(id), body, conf()),
  deleteContainer: (id, params) => apiClient.delete(c(id), conf(params ? { params } : {})),
  forceDeleteContainer: (id) => apiClient.delete(c(id), conf({ params: { force: true } })),
  startContainer: (id) => postAction(id, 'start'),
  stopContainer: (id) => postAction(id, 'stop'),
  pauseContainer: (id) => postAction(id, 'pause'),
  unpauseContainer: (id) => postAction(id, 'unpause'),
  rebootContainer: (id) => postAction(id, 'reboot'),
  rebuildContainer: (id, data) => postAction(id, 'rebuild', data),
  killContainer: (id, data) => postAction(id, 'kill', data),
  executeContainer: (id, data) => postAction(id, 'execute', data),
  /** Returns the websocket url of the interactive console */
  attachContainer: (id) => apiClient.get(`${c(id)}/attach`, conf()),
  /** Legacy network_attach(id, null, data): network passed as query params */
  attachNetwork: (id, params) => apiClient.post(`${c(id)}/network_attach`, null, conf({ params })),
  detachNetwork: (id, params) => apiClient.post(`${c(id)}/network_detach`, null, conf({ params })),
  getContainerStats: (id) => apiClient.get(`${c(id)}/stats`, conf()),
  getContainerLogs: (id, params) => apiClient.get(`${c(id)}/logs`, conf({ params })),
  listContainerActions: (id) => apiClient.get(`${c(id)}/container_actions`, conf()),
  getContainerAction: (id, requestId) => apiClient.get(`${c(id)}/container_actions/${requestId}`, conf()),

  // ---------------------------------------------------------------- Capsules
  listCapsules: (params) => apiClient.get(`${base()}/capsules`, conf({ params })),
  getCapsule: (id) => apiClient.get(`${base()}/capsules/${id}`, conf()),
  createCapsule: (body) => apiClient.post(`${base()}/capsules`, body, conf()),
  deleteCapsule: (id) => apiClient.delete(`${base()}/capsules/${id}`, conf()),

  // ------------------------------------------------------- Hosts / services
  listHosts: (params) => apiClient.get(`${base()}/hosts`, conf({ params })),
  getHost: (id) => apiClient.get(`${base()}/hosts/${id}`, conf()),
  listServices: (params) => apiClient.get(`${base()}/services`, conf({ params })),

  // ------------------------------------------------------------------ Quotas
  getQuota: (projectId = currentProjectId()) =>
    apiClient.get(`${base()}/quotas/${projectId}`, conf({ params: { usages: true } })),
};

export default zunApi;
