import apiClient from './client';

/**
 * OpenStack Skyline API Gateway (v1)
 * Path: /api/openstack/skyline/api/v1
 */
export const skylineApi = {
  login: (credentials) => apiClient.post('/openstack/skyline/api/v1/login', credentials),
  loginTotp: (data) => apiClient.post('/openstack/skyline/api/v1/login/totp', data),
  logout: () => apiClient.post('/openstack/skyline/api/v1/logout'),
  getProfile: () => apiClient.get('/openstack/skyline/api/v1/profile'),
  getEndpoints: () => apiClient.get('/openstack/skyline/api/v1/contrib/keystone_endpoints'),
  getDomains: () => apiClient.get('/openstack/skyline/api/v1/contrib/domains'),
  getRegions: () => apiClient.get('/openstack/skyline/api/v1/contrib/regions'),
  switchRegion: (region) => apiClient.post(`/openstack/skyline/api/v1/switch_region/${region}`, {}),
  switchProject: (projectId, domainId) =>
    apiClient.post(`/openstack/skyline/api/v1/switch_project/${projectId}`, {
      project_id: projectId,
      project_domain_id: domainId,
    }, { params: { project_domain_id: domainId } }),
};

export default skylineApi;

/**
 * Skyline settings (legacy skylineClient.setting): GET /settings, GET /setting/{key},
 * PUT /setting { key, value }, DELETE /setting/{key} (reset to the initial value).
 */
Object.assign(skylineApi, {
  listSettings: () => apiClient.get('/openstack/skyline/api/v1/settings'),
  getSetting: (key) => apiClient.get(`/openstack/skyline/api/v1/setting/${encodeURIComponent(key)}`),
  updateSetting: (body) => apiClient.put('/openstack/skyline/api/v1/setting', body),
  resetSetting: (key) => apiClient.delete(`/openstack/skyline/api/v1/setting/${encodeURIComponent(key)}`),
  /** Soft-deleted servers (legacy skylineClient.extension.recycleServers) */
  listRecycleServers: (params) =>
    apiClient.get('/openstack/skyline/api/v1/extension/recycle_servers', { params }),
});
