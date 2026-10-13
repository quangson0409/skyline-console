import apiClient from './client';
import { useAuthStore } from '@/store/authStore';

/**
 * OpenStack Neutron SDN Networking API (v2.0)
 * Path: /api/openstack/regionone/neutron/v2.0
 */
const BASE_PATH = '/openstack/regionone/neutron/v2.0';

const resolveProjectId = (projectId) => {
  if (typeof projectId === 'string' && projectId && projectId !== 'undefined') {
    return projectId;
  }
  try {
    const state = useAuthStore.getState ? useAuthStore.getState() : {};
    return state?.currentProject?.id || state?.user?.project_id || '';
  } catch {
    return '';
  }
};

export const neutronApi = {
  // Networks
  listNetworks: (params) => apiClient.get(`${BASE_PATH}/networks`, { params }),
  getNetwork: (id) => apiClient.get(`${BASE_PATH}/networks/${id}`),
  createNetwork: (data) => apiClient.post(`${BASE_PATH}/networks`, { network: data }),
  deleteNetwork: (id) => apiClient.delete(`${BASE_PATH}/networks/${id}`),

  // Subnets
  listSubnets: (params) => apiClient.get(`${BASE_PATH}/subnets`, { params }),
  createSubnet: (data) => apiClient.post(`${BASE_PATH}/subnets`, { subnet: data }),

  // Ports
  listPorts: (params) => apiClient.get(`${BASE_PATH}/ports`, { params }),

  // Floating IPs
  listFloatingIps: (params) => apiClient.get(`${BASE_PATH}/floatingips`, { params }),
  createFloatingIp: (data) => apiClient.post(`${BASE_PATH}/floatingips`, { floatingip: data }),
  deleteFloatingIp: (id) => apiClient.delete(`${BASE_PATH}/floatingips/${id}`),

  // Security Groups & Rules
  // Scopes to active project_id by default unless all_projects is explicitly passed
  listSecurityGroups: (params = {}) => {
    const query = { ...params };
    if (!query.project_id && !query.tenant_id && !query.all_projects) {
      const pid = resolveProjectId(query.project_id);
      if (pid) {
        query.project_id = pid;
      }
    }
    return apiClient.get(`${BASE_PATH}/security-groups`, { params: query });
  },
  getSecurityGroup: (id) => apiClient.get(`${BASE_PATH}/security-groups/${id}`),
  createSecurityGroup: (data) => {
    const payload = { ...data };
    if (!payload.project_id && !payload.tenant_id) {
      const pid = resolveProjectId();
      if (pid) payload.project_id = pid;
    }
    return apiClient.post(`${BASE_PATH}/security-groups`, { security_group: payload });
  },
  deleteSecurityGroup: (id) => apiClient.delete(`${BASE_PATH}/security-groups/${id}`),
  createSecurityGroupRule: (data) =>
    apiClient.post(`${BASE_PATH}/security-group-rules`, { security_group_rule: data }),
  deleteSecurityGroupRule: (id) =>
    apiClient.delete(`${BASE_PATH}/security-group-rules/${id}`),

  // Routers
  listRouters: (params) => apiClient.get(`${BASE_PATH}/routers`, { params }),
};

export default neutronApi;
