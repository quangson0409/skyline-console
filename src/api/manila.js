import apiClient from './client';
import { serviceBase, versionHeaders, currentProjectId } from './endpoints';
import { getPage } from './paging';

/**
 * OpenStack Manila Shared File Systems API (v2) - port of legacy src/client/manila
 * Base resolved per call: serviceBase('manilav2') -> /openstack/<region>/manilav2/v2
 * Legacy client has `projectInUrl`, so every path is /v2/{project_id}/...
 * Every call carries the microversion header (X-OpenStack-Manila-API-Version).
 */
const p = () => `${serviceBase('manilav2')}/${currentProjectId()}`;
const vh = () => versionHeaders('manilav2');
const withParams = (params) => ({ ...vh(), params });
const enc = (key) => encodeURIComponent(key);

export const manilaApi = {
  // ------------------------------------------------------ Availability zones
  listAvailabilityZones: () => apiClient.get(`${p()}/availability-zones`, vh()),

  // ------------------------------------------------------------------ Shares
  listShares: (params) => apiClient.get(`${p()}/shares/detail`, withParams(params)),
  getShare: (id) => apiClient.get(`${p()}/shares/${id}`, vh()),
  createShare: (data) => apiClient.post(`${p()}/shares`, { share: data }, vh()),
  updateShare: (id, data) => apiClient.put(`${p()}/shares/${id}`, { share: data }, vh()),
  /** legacy deleteItem: share_group_id query param when the share belongs to a group */
  deleteShare: (id, shareGroupId) =>
    apiClient.delete(`${p()}/shares/${id}`, withParams(shareGroupId ? { share_group_id: shareGroupId } : undefined)),
  /** POST /shares/{id}/action { extend | reset_status | allow_access | deny_access } */
  shareAction: (id, body) => apiClient.post(`${p()}/shares/${id}/action`, body, vh()),
  listShareExportLocations: (id) => apiClient.get(`${p()}/shares/${id}/export_locations`, vh()),
  listShareMetadata: (id) => apiClient.get(`${p()}/shares/${id}/metadata`, vh()),
  setShareMetadata: (id, metadata) => apiClient.post(`${p()}/shares/${id}/metadata`, { metadata }, vh()),
  deleteShareMetadata: (id, key) => apiClient.delete(`${p()}/shares/${id}/metadata/${enc(key)}`, vh()),

  // ------------------------------------------------------ Share access rules
  listAccessRules: (shareId, params = {}) =>
    apiClient.get(`${p()}/share-access-rules`, withParams({ ...params, share_id: shareId })),
  getAccessRule: (id) => apiClient.get(`${p()}/share-access-rules/${id}`, vh()),
  updateAccessRuleMetadata: (id, metadata) =>
    apiClient.put(`${p()}/share-access-rules/${id}/metadata`, { metadata }, vh()),
  deleteAccessRuleMetadata: (id, key) =>
    apiClient.delete(`${p()}/share-access-rules/${id}/metadata/${enc(key)}`, vh()),

  // ------------------------------------------------------------- Share types
  listShareTypes: (params) => apiClient.get(`${p()}/types`, withParams(params)),
  getShareType: (id) => apiClient.get(`${p()}/types/${id}`, vh()),
  getDefaultShareType: () => apiClient.get(`${p()}/types/default`, vh()),
  createShareType: (data) => apiClient.post(`${p()}/types`, { share_type: data }, vh()),
  updateShareType: (id, data) => apiClient.put(`${p()}/types/${id}`, { share_type: data }, vh()),
  deleteShareType: (id) => apiClient.delete(`${p()}/types/${id}`, vh()),
  shareTypeAction: (id, body) => apiClient.post(`${p()}/types/${id}/action`, body, vh()),
  getShareTypeAccess: (id) => apiClient.get(`${p()}/types/${id}/share_type_access`, vh()),
  listShareTypeExtraSpecs: (id) => apiClient.get(`${p()}/types/${id}/extra_specs`, vh()),
  setShareTypeExtraSpecs: (id, extraSpecs) =>
    apiClient.post(`${p()}/types/${id}/extra_specs`, { extra_specs: extraSpecs }, vh()),
  deleteShareTypeExtraSpec: (id, key) => apiClient.delete(`${p()}/types/${id}/extra_specs/${enc(key)}`, vh()),

  // ------------------------------------------------------- Share group types
  listShareGroupTypes: (params) => apiClient.get(`${p()}/share-group-types`, withParams(params)),
  getShareGroupType: (id) => apiClient.get(`${p()}/share-group-types/${id}`, vh()),
  createShareGroupType: (data) => apiClient.post(`${p()}/share-group-types`, { share_group_type: data }, vh()),
  updateShareGroupType: (id, data) =>
    apiClient.put(`${p()}/share-group-types/${id}`, { share_group_type: data }, vh()),
  deleteShareGroupType: (id) => apiClient.delete(`${p()}/share-group-types/${id}`, vh()),
  shareGroupTypeAction: (id, body) => apiClient.post(`${p()}/share-group-types/${id}/action`, body, vh()),
  getShareGroupTypeAccess: (id) => apiClient.get(`${p()}/share-group-types/${id}/access`, vh()),
  listGroupSpecs: (id) => apiClient.get(`${p()}/share-group-types/${id}/group-specs`, vh()),
  setGroupSpecs: (id, groupSpecs) =>
    apiClient.post(`${p()}/share-group-types/${id}/group-specs`, { group_specs: groupSpecs }, vh()),
  deleteGroupSpec: (id, key) => apiClient.delete(`${p()}/share-group-types/${id}/group-specs/${enc(key)}`, vh()),

  // ------------------------------------------------------------ Share groups
  listShareGroups: (params) => apiClient.get(`${p()}/share-groups/detail`, withParams(params)),
  getShareGroup: (id) => apiClient.get(`${p()}/share-groups/${id}`, vh()),
  createShareGroup: (data) => apiClient.post(`${p()}/share-groups`, { share_group: data }, vh()),
  updateShareGroup: (id, data) => apiClient.put(`${p()}/share-groups/${id}`, { share_group: data }, vh()),
  deleteShareGroup: (id) => apiClient.delete(`${p()}/share-groups/${id}`, vh()),

  // --------------------------------------------------------- Share instances
  listShareInstances: (params) => apiClient.get(`${p()}/share_instances`, withParams(params)),
  getShareInstance: (id) => apiClient.get(`${p()}/share_instances/${id}`, vh()),
  shareInstanceAction: (id, body) => apiClient.post(`${p()}/share_instances/${id}/action`, body, vh()),
  listShareInstanceExportLocations: (id) => apiClient.get(`${p()}/share_instances/${id}/export_locations`, vh()),

  // ---------------------------------------------------------- Share networks
  listShareNetworks: (params) => apiClient.get(`${p()}/share-networks/detail`, withParams(params)),
  getShareNetwork: (id) => apiClient.get(`${p()}/share-networks/${id}`, vh()),
  createShareNetwork: (data) => apiClient.post(`${p()}/share-networks`, { share_network: data }, vh()),
  updateShareNetwork: (id, data) => apiClient.put(`${p()}/share-networks/${id}`, { share_network: data }, vh()),
  deleteShareNetwork: (id) => apiClient.delete(`${p()}/share-networks/${id}`, vh()),
  listShareNetworkSubnets: (id) => apiClient.get(`${p()}/share-networks/${id}/subnets`, vh()),

  // ----------------------------------------------------------- Share servers
  listShareServers: (params) => apiClient.get(`${p()}/share-servers`, withParams(params)),
  getShareServer: (id) => apiClient.get(`${p()}/share-servers/${id}`, vh()),
  deleteShareServer: (id) => apiClient.delete(`${p()}/share-servers/${id}`, vh()),

  // ------------------------------------------------------------ Quota/pools
  /** quota-sets/{project}/detail -> { quota_set: { shares: { limit, in_use, reserved }, ... } } */
  getQuotaDetail: (projectId) =>
    apiClient.get(`${p()}/quota-sets/${projectId || currentProjectId()}/detail`, vh()),
  listPools: (params) => apiClient.get(`${p()}/scheduler-stats/pools/detail`, withParams(params)),
};

export default manilaApi;

/** Single pages for server-side lists (legacy fetchListByPage): { items, total (count), hasNext, marker } */
Object.assign(manilaApi, {
  listSharesPage: (params) => getPage(`${p()}/shares/detail`, { key: 'shares', params, config: vh() }),
  listShareGroupsPage: (params) => getPage(`${p()}/share-groups/detail`, { key: 'share_groups', params, config: vh() }),
});
