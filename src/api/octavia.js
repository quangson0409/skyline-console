import apiClient from './client';
import { serviceBase } from './endpoints';
import { getPage } from './paging';

/**
 * OpenStack Octavia Load Balancer API (v2) - port of legacy src/client/octavia.
 * Base path is resolved per call from the service catalog (serviceBase('octavia')).
 *
 * Resources (legacy client.octavia.*): loadbalancers, listeners, pools (+ members,
 * batchUpdateMembers), healthmonitors, flavors, providers. l7policies (+ rules) are
 * exposed as well for completeness.
 */
const base = () => serviceBase('octavia');

// legacy OctaviaClient always sends accept: application/json
const conf = (params) => ({ params, headers: { accept: 'application/json' }, paramsSerializer: { indexes: null } });

const list = (key, params) => apiClient.get(`${base()}/lbaas/${key}`, conf(params));
const show = (key, id, params) => apiClient.get(`${base()}/lbaas/${key}/${id}`, conf(params));
const create = (key, responseKey, data) => apiClient.post(`${base()}/lbaas/${key}`, { [responseKey]: data }, conf());
const update = (key, responseKey, id, data) =>
  apiClient.put(`${base()}/lbaas/${key}/${id}`, { [responseKey]: data }, conf());
const remove = (key, id, params) => apiClient.delete(`${base()}/lbaas/${key}/${id}`, conf(params));

export const octaviaApi = {
  // Load balancers
  listLoadBalancers: (params) => list('loadbalancers', params),
  getLoadBalancer: (id, params) => show('loadbalancers', id, params),
  createLoadBalancer: (data) => create('loadbalancers', 'loadbalancer', data),
  updateLoadBalancer: (id, data) => update('loadbalancers', 'loadbalancer', id, data),
  /** legacy LbaasStore.delete always cascades (child listeners/pools/members/monitors) */
  deleteLoadBalancer: (id, { cascade = true } = {}) => remove('loadbalancers', id, cascade ? { cascade: true } : undefined),
  getLoadBalancerStats: (id) => apiClient.get(`${base()}/lbaas/loadbalancers/${id}/stats`, conf()),
  getLoadBalancerStatus: (id) => apiClient.get(`${base()}/lbaas/loadbalancers/${id}/status`, conf()),

  // Listeners
  listListeners: (params) => list('listeners', params),
  getListener: (id) => show('listeners', id),
  createListener: (data) => create('listeners', 'listener', data),
  updateListener: (id, data) => update('listeners', 'listener', id, data),
  deleteListener: (id) => remove('listeners', id),

  // Pools
  listPools: (params) => list('pools', params),
  getPool: (id) => show('pools', id),
  createPool: (data) => create('pools', 'pool', data),
  updatePool: (id, data) => update('pools', 'pool', id, data),
  deletePool: (id) => remove('pools', id),

  // Pool members
  listMembers: (poolId, params) => apiClient.get(`${base()}/lbaas/pools/${poolId}/members`, conf(params)),
  getMember: (poolId, id) => apiClient.get(`${base()}/lbaas/pools/${poolId}/members/${id}`, conf()),
  createMember: (poolId, data) => apiClient.post(`${base()}/lbaas/pools/${poolId}/members`, { member: data }, conf()),
  updateMember: (poolId, id, data) =>
    apiClient.put(`${base()}/lbaas/pools/${poolId}/members/${id}`, { member: data }, conf()),
  deleteMember: (poolId, id) => apiClient.delete(`${base()}/lbaas/pools/${poolId}/members/${id}`, conf()),
  /** legacy PoolMemberStore.batchUpdate: PUT /pools/{id}/members { members: [...] } (replaces the member list) */
  batchUpdateMembers: (poolId, members) =>
    apiClient.put(`${base()}/lbaas/pools/${poolId}/members`, { members }, conf()),

  // Health monitors
  listHealthMonitors: (params) => list('healthmonitors', params),
  getHealthMonitor: (id) => show('healthmonitors', id),
  createHealthMonitor: (data) => create('healthmonitors', 'healthmonitor', data),
  updateHealthMonitor: (id, data) => update('healthmonitors', 'healthmonitor', id, data),
  deleteHealthMonitor: (id) => remove('healthmonitors', id),

  // L7 policies / rules
  listL7Policies: (params) => list('l7policies', params),
  getL7Policy: (id) => show('l7policies', id),
  listL7Rules: (policyId, params) => apiClient.get(`${base()}/lbaas/l7policies/${policyId}/rules`, conf(params)),

  // Flavors / providers
  listFlavors: (params) => list('flavors', params),
  listProviders: (params) => list('providers', params),
};

export default octaviaApi;

/** One page of /lbaas/<key> (legacy fetchListByPage): { items, hasNext (<key>_links), marker } */
Object.assign(octaviaApi, {
  listPage: (key, params) =>
    getPage(`${base()}/lbaas/${key}`, {
      key,
      params,
      config: { headers: { accept: 'application/json' }, paramsSerializer: { indexes: null } },
    }),
});
