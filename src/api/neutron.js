import apiClient from './client';

/**
 * OpenStack Neutron SDN Networking API (v2.0)
 * Path: /api/openstack/regionone/neutron/v2.0
 */
const BASE_PATH = '/openstack/regionone/neutron/v2.0';

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

  // Security Groups
  listSecurityGroups: (params) => apiClient.get(`${BASE_PATH}/security-groups`, { params }),
  createSecurityGroup: (data) =>
    apiClient.post(`${BASE_PATH}/security-groups`, { security_group: data }),
  deleteSecurityGroup: (id) => apiClient.delete(`${BASE_PATH}/security-groups/${id}`),

  // Routers
  listRouters: (params) => apiClient.get(`${BASE_PATH}/routers`, { params }),
};

export default neutronApi;
