import apiClient from './client';
import { serviceBase } from './endpoints';

/**
 * OpenStack Keystone Identity API (v3) - port of legacy src/client/keystone
 * Base resolved per call: /openstack/<region>/keystone/v3
 */
const base = () => serviceBase('keystone');

export const keystoneApi = {
  // Auth
  listAuthProjects: () => apiClient.get(`${base()}/auth/projects`),
  getCatalog: () => apiClient.get(`${base()}/auth/catalog`),

  // Projects
  listProjects: (params) => apiClient.get(`${base()}/projects`, { params }),
  getProject: (id) => apiClient.get(`${base()}/projects/${id}`),
  createProject: (data) => apiClient.post(`${base()}/projects`, { project: data }),
  updateProject: (id, data) => apiClient.patch(`${base()}/projects/${id}`, { project: data }),
  deleteProject: (id) => apiClient.delete(`${base()}/projects/${id}`),
  listProjectTags: (id) => apiClient.get(`${base()}/projects/${id}/tags`),
  updateProjectTags: (id, tags) => apiClient.put(`${base()}/projects/${id}/tags`, { tags }),
  listProjectUserRoles: (projectId, userId) =>
    apiClient.get(`${base()}/projects/${projectId}/users/${userId}/roles`),
  assignProjectUserRole: (projectId, userId, roleId) =>
    apiClient.put(`${base()}/projects/${projectId}/users/${userId}/roles/${roleId}`),
  removeProjectUserRole: (projectId, userId, roleId) =>
    apiClient.delete(`${base()}/projects/${projectId}/users/${userId}/roles/${roleId}`),
  listProjectGroupRoles: (projectId, groupId) =>
    apiClient.get(`${base()}/projects/${projectId}/groups/${groupId}/roles`),
  assignProjectGroupRole: (projectId, groupId, roleId) =>
    apiClient.put(`${base()}/projects/${projectId}/groups/${groupId}/roles/${roleId}`),
  removeProjectGroupRole: (projectId, groupId, roleId) =>
    apiClient.delete(`${base()}/projects/${projectId}/groups/${groupId}/roles/${roleId}`),

  // Users
  listUsers: (params) => apiClient.get(`${base()}/users`, { params }),
  getUser: (id) => apiClient.get(`${base()}/users/${id}`),
  createUser: (data) => apiClient.post(`${base()}/users`, { user: data }),
  updateUser: (id, data) => apiClient.patch(`${base()}/users/${id}`, { user: data }),
  deleteUser: (id) => apiClient.delete(`${base()}/users/${id}`),
  /** Self-service password change (legacy users.updatePassword) */
  changePassword: (userId, original_password, password) =>
    apiClient.post(`${base()}/users/${userId}/password`, {
      user: { original_password, password },
    }),
  listUserProjects: (userId, params) => apiClient.get(`${base()}/users/${userId}/projects`, { params }),
  listUserGroups: (userId, params) => apiClient.get(`${base()}/users/${userId}/groups`, { params }),
  listApplicationCredentials: (userId, params) =>
    apiClient.get(`${base()}/users/${userId}/application_credentials`, { params }),
  createApplicationCredential: (userId, data) =>
    apiClient.post(`${base()}/users/${userId}/application_credentials`, { application_credential: data }),
  deleteApplicationCredential: (userId, id) =>
    apiClient.delete(`${base()}/users/${userId}/application_credentials/${id}`),

  // Groups
  listGroups: (params) => apiClient.get(`${base()}/groups`, { params }),
  getGroup: (id) => apiClient.get(`${base()}/groups/${id}`),
  createGroup: (data) => apiClient.post(`${base()}/groups`, { group: data }),
  updateGroup: (id, data) => apiClient.patch(`${base()}/groups/${id}`, { group: data }),
  deleteGroup: (id) => apiClient.delete(`${base()}/groups/${id}`),
  listGroupUsers: (groupId, params) => apiClient.get(`${base()}/groups/${groupId}/users`, { params }),
  addUserToGroup: (groupId, userId) => apiClient.put(`${base()}/groups/${groupId}/users/${userId}`),
  removeUserFromGroup: (groupId, userId) => apiClient.delete(`${base()}/groups/${groupId}/users/${userId}`),

  // Roles & Role Assignments
  listRoles: (params) => apiClient.get(`${base()}/roles`, { params }),
  getRole: (id) => apiClient.get(`${base()}/roles/${id}`),
  createRole: (data) => apiClient.post(`${base()}/roles`, { role: data }),
  updateRole: (id, data) => apiClient.patch(`${base()}/roles/${id}`, { role: data }),
  deleteRole: (id) => apiClient.delete(`${base()}/roles/${id}`),
  listRoleImplies: (id) => apiClient.get(`${base()}/roles/${id}/implies`),
  listRoleAssignments: (params) => apiClient.get(`${base()}/role_assignments`, { params }),

  // System role grants
  listSystemUserRoles: (userId) => apiClient.get(`${base()}/system/users/${userId}/roles`),
  assignSystemUserRole: (userId, roleId) => apiClient.put(`${base()}/system/users/${userId}/roles/${roleId}`),
  removeSystemUserRole: (userId, roleId) => apiClient.delete(`${base()}/system/users/${userId}/roles/${roleId}`),
  listSystemGroupRoles: (groupId) => apiClient.get(`${base()}/system/groups/${groupId}/roles`),
  assignSystemGroupRole: (groupId, roleId) => apiClient.put(`${base()}/system/groups/${groupId}/roles/${roleId}`),
  removeSystemGroupRole: (groupId, roleId) =>
    apiClient.delete(`${base()}/system/groups/${groupId}/roles/${roleId}`),

  // Domain role grants
  listDomainGroupRoles: (domainId, groupId) => apiClient.get(`${base()}/domains/${domainId}/groups/${groupId}/roles`),
  assignDomainGroupRole: (domainId, groupId, roleId) =>
    apiClient.put(`${base()}/domains/${domainId}/groups/${groupId}/roles/${roleId}`),
  removeDomainGroupRole: (domainId, groupId, roleId) =>
    apiClient.delete(`${base()}/domains/${domainId}/groups/${groupId}/roles/${roleId}`),

  // Domains
  listDomains: (params) => apiClient.get(`${base()}/domains`, { params }),
  getDomain: (id) => apiClient.get(`${base()}/domains/${id}`),
  createDomain: (data) => apiClient.post(`${base()}/domains`, { domain: data }),
  updateDomain: (id, data) => apiClient.patch(`${base()}/domains/${id}`, { domain: data }),
  deleteDomain: (id) => apiClient.delete(`${base()}/domains/${id}`),

  // Credentials (TOTP)
  listCredentials: (params) => apiClient.get(`${base()}/credentials`, { params }),
  createCredential: (data) => apiClient.post(`${base()}/credentials`, { credential: data }),
  deleteCredential: (id) => apiClient.delete(`${base()}/credentials/${id}`),
};

export default keystoneApi;
