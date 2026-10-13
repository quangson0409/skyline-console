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
  updateProject: (id, data) => apiClient.patch(`${BASE_PATH}/projects/${id}`, { project: data }),
  deleteProject: (id) => apiClient.delete(`${BASE_PATH}/projects/${id}`),

  // Users
  listUsers: (params) => apiClient.get(`${BASE_PATH}/users`, { params }),
  getUser: (id) => apiClient.get(`${BASE_PATH}/users/${id}`),
  createUser: (data) => apiClient.post(`${BASE_PATH}/users`, { user: data }),
  updateUser: (id, data) => apiClient.patch(`${BASE_PATH}/users/${id}`, { user: data }),
  deleteUser: (id) => apiClient.delete(`${BASE_PATH}/users/${id}`),
  changePassword: (userId, original_password, password) =>
    apiClient.post(`${BASE_PATH}/users/${userId}/password`, {
      user: { original_password, password },
    }),

  // Groups
  listGroups: (params) => apiClient.get(`${BASE_PATH}/groups`, { params }),
  getGroup: (id) => apiClient.get(`${BASE_PATH}/groups/${id}`),
  createGroup: (data) => apiClient.post(`${BASE_PATH}/groups`, { group: data }),
  updateGroup: (id, data) => apiClient.patch(`${BASE_PATH}/groups/${id}`, { group: data }),
  deleteGroup: (id) => apiClient.delete(`${BASE_PATH}/groups/${id}`),
  listGroupUsers: (groupId) => apiClient.get(`${BASE_PATH}/groups/${groupId}/users`),
  addUserToGroup: (groupId, userId) => apiClient.put(`${BASE_PATH}/groups/${groupId}/users/${userId}`),
  removeUserFromGroup: (groupId, userId) =>
    apiClient.delete(`${BASE_PATH}/groups/${groupId}/users/${userId}`),

  // Roles & Role Assignments
  listRoles: (params) => apiClient.get(`${BASE_PATH}/roles`, { params }),
  getRole: (id) => apiClient.get(`${BASE_PATH}/roles/${id}`),
  createRole: (data) => apiClient.post(`${BASE_PATH}/roles`, { role: data }),
  updateRole: (id, data) => apiClient.patch(`${BASE_PATH}/roles/${id}`, { role: data }),
  deleteRole: (id) => apiClient.delete(`${BASE_PATH}/roles/${id}`),
  listRoleAssignments: (params) => apiClient.get(`${BASE_PATH}/role_assignments`, { params }),

  // Domains
  listDomains: (params) => apiClient.get(`${BASE_PATH}/domains`, { params }),
  getDomain: (id) => apiClient.get(`${BASE_PATH}/domains/${id}`),
};

export default keystoneApi;
