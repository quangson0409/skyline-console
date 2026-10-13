import apiClient from './client';

/**
 * OpenStack Skyline API Gateway (v1)
 * Path: /api/openstack/skyline/api/v1
 */
export const skylineApi = {
  login: (credentials) => apiClient.post('/openstack/skyline/api/v1/login', credentials),
  logout: () => apiClient.post('/openstack/skyline/api/v1/logout'),
  getProfile: () => apiClient.get('/openstack/skyline/api/v1/profile'),
  getEndpoints: () => apiClient.get('/openstack/skyline/api/v1/contrib/keystone_endpoints'),
  getDomains: () => apiClient.get('/openstack/skyline/api/v1/contrib/domains'),
  getRegions: () => apiClient.get('/openstack/skyline/api/v1/contrib/regions'),
  switchProject: (projectId, domainId) =>
    apiClient.post(`/openstack/skyline/api/v1/switch_project/${projectId}`, {
      project_id: projectId,
      project_domain_id: domainId,
    }),
};

export default skylineApi;
