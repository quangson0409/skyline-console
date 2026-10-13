import apiClient from './client';

/**
 * OpenStack Keystone Identity API (v3)
 * Path: /api/openstack/regionone/keystone/v3
 */
const BASE_PATH = '/openstack/regionone/keystone/v3';

export const keystoneApi = {
  // Projects
  listProjects: (params) => apiClient.get(`${BASE_PATH}/projects`, { params }),
  getProject: (id) => apiClient.get(`${BASE_PATH}/projects/${id}`),
  createProject: (data) => apiClient.post(`${BASE_PATH}/projects`, { project: data }),
  deleteProject: (id) => apiClient.delete(`${BASE_PATH}/projects/${id}`),

  // Users
  listUsers: (params) => apiClient.get(`${BASE_PATH}/users`, { params }),
  getUser: (id) => apiClient.get(`${BASE_PATH}/users/${id}`),
  createUser: (data) => apiClient.post(`${BASE_PATH}/users`, { user: data }),
  deleteUser: (id) => apiClient.delete(`${BASE_PATH}/users/${id}`),

  // Roles & Domains
  listRoles: (params) => apiClient.get(`${BASE_PATH}/roles`, { params }),
  listDomains: (params) => apiClient.get(`${BASE_PATH}/domains`, { params }),
};

export default keystoneApi;
