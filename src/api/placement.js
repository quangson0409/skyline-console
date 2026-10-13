import apiClient from './client';
import { serviceBase, versionHeaders } from './endpoints';

/**
 * OpenStack Placement API - port of legacy src/client/placement
 */
const base = () => serviceBase('placement');
const conf = (extra = {}) => ({ ...extra, headers: { ...versionHeaders('placement').headers, ...(extra.headers || {}) } });

export const placementApi = {
  listResourceProviders: (params) => apiClient.get(`${base()}/resource_providers`, conf({ params })),
  getInventories: (uuid) => apiClient.get(`${base()}/resource_providers/${uuid}/inventories`, conf()),
  getUsages: (uuid) => apiClient.get(`${base()}/resource_providers/${uuid}/usages`, conf()),
  listTraits: (params) => apiClient.get(`${base()}/traits`, conf({ params })),
};

export default placementApi;
