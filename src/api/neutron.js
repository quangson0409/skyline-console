import apiClient from './client';
import { serviceBase } from './endpoints';
import { useAuthStore } from '@/store/authStore';

/**
 * OpenStack Neutron SDN Networking API (v2.0) - port of legacy src/client/neutron.
 * Base path is resolved per call from the service catalog (serviceBase('neutron')).
 *
 * Generic helpers (`list/show/create/update/remove`) take the legacy resource key
 * (e.g. 'ports', 'qos/policies', 'fwaas/firewall_groups') so every legacy resource
 * is reachable; named methods below are thin wrappers kept for readability.
 */
const base = () => serviceBase('neutron');

// Neutron expects repeated keys for arrays (?id=a&id=b), not id[]=a
const listConfig = (params) => ({ params, paramsSerializer: { indexes: null } });

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

const list = (key, params) => apiClient.get(`${base()}/${key}`, listConfig(params));
const show = (key, id, params) => apiClient.get(`${base()}/${key}/${id}`, listConfig(params));
const create = (key, responseKey, data) => apiClient.post(`${base()}/${key}`, { [responseKey]: data });
const update = (key, responseKey, id, data) =>
  apiClient.put(`${base()}/${key}/${id}`, { [responseKey]: data });
const remove = (key, id) => apiClient.delete(`${base()}/${key}/${id}`);
const putAction = (key, id, action, data) => apiClient.put(`${base()}/${key}/${id}/${action}`, data);

const crud = (key, responseKey) => ({
  list: (params) => list(key, params),
  show: (id, params) => show(key, id, params),
  create: (data) => create(key, responseKey, data),
  update: (id, data) => update(key, responseKey, id, data),
  delete: (id) => remove(key, id),
});

const subCrud = (key, subKey, responseKey) => ({
  list: (id, params) => apiClient.get(`${base()}/${key}/${id}/${subKey}`, listConfig(params)),
  show: (id, subId) => apiClient.get(`${base()}/${key}/${id}/${subKey}/${subId}`),
  create: (id, data) => apiClient.post(`${base()}/${key}/${id}/${subKey}`, responseKey ? { [responseKey]: data } : data),
  update: (id, subId, data) =>
    apiClient.put(`${base()}/${key}/${id}/${subKey}/${subId}`, responseKey ? { [responseKey]: data } : data),
  delete: (id, subId) => apiClient.delete(`${base()}/${key}/${id}/${subKey}/${subId}`),
});

export const neutronResources = {
  networks: crud('networks', 'network'),
  subnets: crud('subnets', 'subnet'),
  subnetpools: crud('subnetpools', 'subnetpool'),
  ports: crud('ports', 'port'),
  routers: crud('routers', 'router'),
  floatingips: crud('floatingips', 'floatingip'),
  portForwardings: subCrud('floatingips', 'port_forwardings', 'port_forwarding'),
  qosPolicies: crud('qos/policies', 'policy'),
  bandwidthLimitRules: subCrud('qos/policies', 'bandwidth_limit_rules', 'bandwidth_limit_rule'),
  dscpMarkingRules: subCrud('qos/policies', 'dscp_marking_rules', 'dscp_marking_rule'),
  securityGroups: crud('security-groups', 'security_group'),
  securityGroupRules: crud('security-group-rules', 'security_group_rule'),
  rbacPolicies: crud('rbac-policies', 'rbac_policy'),
  firewalls: crud('fwaas/firewall_groups', 'firewall_group'),
  firewallPolicies: crud('fwaas/firewall_policies', 'firewall_policy'),
  firewallRules: crud('fwaas/firewall_rules', 'firewall_rule'),
  // VPNaaS - same paths as legacy client (no "vpn/" prefix)
  vpnservices: crud('vpnservices', 'vpnservice'),
  ikePolicies: crud('ikepolicies', 'ikepolicy'),
  ipsecPolicies: crud('ipsecpolicies', 'ipsecpolicy'),
  ipsecSiteConnections: crud('ipsec_site_connections', 'ipsec_site_connection'),
  endpointGroups: crud('endpoint-groups', 'endpoint_group'),
  agents: crud('agents', 'agent'),
};

export const neutronApi = {
  // Generic access to any legacy resource key
  list,
  show,
  create,
  update,
  remove,
  putAction,
  resources: neutronResources,

  // Extensions / AZ / availability
  listExtensions: () => apiClient.get(`${base()}/extensions`),
  listAvailabilityZones: (params) => list('availability_zones', params),
  listNetworkIpAvailabilities: (params) => list('network-ip-availabilities', params),
  getNetworkIpAvailability: (id) => show('network-ip-availabilities', id),
  getQuota: (projectId) => apiClient.get(`${base()}/quotas/${projectId}/details`),

  // Networks
  listNetworks: (params) => list('networks', params),
  getNetwork: (id) => show('networks', id),
  createNetwork: (data) => create('networks', 'network', data),
  updateNetwork: (id, data) => update('networks', 'network', id, data),
  deleteNetwork: (id) => remove('networks', id),
  listNetworkDhcpAgents: (id) => apiClient.get(`${base()}/networks/${id}/dhcp-agents`),

  // Subnets
  listSubnets: (params) => list('subnets', params),
  getSubnet: (id) => show('subnets', id),
  createSubnet: (data) => create('subnets', 'subnet', data),
  updateSubnet: (id, data) => update('subnets', 'subnet', id, data),
  deleteSubnet: (id) => remove('subnets', id),
  listSubnetPools: (params) => list('subnetpools', params),

  // Ports
  listPorts: (params) => list('ports', params),
  getPort: (id) => show('ports', id),
  createPort: (data) => create('ports', 'port', data),
  updatePort: (id, data) => update('ports', 'port', id, data),
  deletePort: (id) => remove('ports', id),

  // Floating IPs
  listFloatingIps: (params) => list('floatingips', params),
  getFloatingIp: (id) => show('floatingips', id),
  createFloatingIp: (data) => create('floatingips', 'floatingip', data),
  updateFloatingIp: (id, data) => update('floatingips', 'floatingip', id, data),
  deleteFloatingIp: (id) => remove('floatingips', id),
  listPortForwardings: (fipId, params) => neutronResources.portForwardings.list(fipId, params),
  createPortForwarding: (fipId, data) => neutronResources.portForwardings.create(fipId, data),
  updatePortForwarding: (fipId, id, data) => neutronResources.portForwardings.update(fipId, id, data),
  deletePortForwarding: (fipId, id) => neutronResources.portForwardings.delete(fipId, id),

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
    return list('security-groups', query);
  },
  getSecurityGroup: (id) => show('security-groups', id),
  createSecurityGroup: (data) => {
    const payload = { ...data };
    if (!payload.project_id && !payload.tenant_id) {
      const pid = resolveProjectId();
      if (pid) payload.project_id = pid;
    }
    return create('security-groups', 'security_group', payload);
  },
  updateSecurityGroup: (id, data) => update('security-groups', 'security_group', id, data),
  deleteSecurityGroup: (id) => remove('security-groups', id),
  listSecurityGroupRules: (params) => list('security-group-rules', params),
  createSecurityGroupRule: (data) => create('security-group-rules', 'security_group_rule', data),
  deleteSecurityGroupRule: (id) => remove('security-group-rules', id),

  // Routers
  listRouters: (params) => list('routers', params),
  getRouter: (id) => show('routers', id),
  createRouter: (data) => create('routers', 'router', data),
  updateRouter: (id, data) => update('routers', 'router', id, data),
  deleteRouter: (id) => remove('routers', id),
  addRouterInterface: (id, body) => putAction('routers', id, 'add_router_interface', body),
  removeRouterInterface: (id, body) => putAction('routers', id, 'remove_router_interface', body),
  addExtraRoutes: (id, body) => putAction('routers', id, 'add_extraroutes', body),
  removeExtraRoutes: (id, body) => putAction('routers', id, 'remove_extraroutes', body),
  listRouterL3Agents: (id) => apiClient.get(`${base()}/routers/${id}/l3-agents`),

  // QoS
  listQosPolicies: (params) => list('qos/policies', params),
  getQosPolicy: (id) => show('qos/policies', id),
  createQosPolicy: (data) => create('qos/policies', 'policy', data),
  updateQosPolicy: (id, data) => update('qos/policies', 'policy', id, data),
  deleteQosPolicy: (id) => remove('qos/policies', id),
  // legacy store sends the rule body as-is ({ bandwidth_limit_rule: {...} })
  createBandwidthLimitRule: (id, body) => apiClient.post(`${base()}/qos/policies/${id}/bandwidth_limit_rules`, body),
  updateBandwidthLimitRule: (id, ruleId, body) =>
    apiClient.put(`${base()}/qos/policies/${id}/bandwidth_limit_rules/${ruleId}`, body),
  deleteBandwidthLimitRule: (id, ruleId) =>
    apiClient.delete(`${base()}/qos/policies/${id}/bandwidth_limit_rules/${ruleId}`),
  createDscpMarkingRule: (id, body) => apiClient.post(`${base()}/qos/policies/${id}/dscp_marking_rules`, body),
  updateDscpMarkingRule: (id, ruleId, body) =>
    apiClient.put(`${base()}/qos/policies/${id}/dscp_marking_rules/${ruleId}`, body),
  deleteDscpMarkingRule: (id, ruleId) => apiClient.delete(`${base()}/qos/policies/${id}/dscp_marking_rules/${ruleId}`),

  // RBAC
  listRbacPolicies: (params) => list('rbac-policies', params),
  getRbacPolicy: (id) => show('rbac-policies', id),
  createRbacPolicy: (data) => create('rbac-policies', 'rbac_policy', data),
  updateRbacPolicy: (id, data) => update('rbac-policies', 'rbac_policy', id, data),
  deleteRbacPolicy: (id) => remove('rbac-policies', id),

  // FWaaS v2
  listFirewalls: (params) => list('fwaas/firewall_groups', params),
  getFirewall: (id) => show('fwaas/firewall_groups', id),
  createFirewall: (data) => create('fwaas/firewall_groups', 'firewall_group', data),
  updateFirewall: (id, data) => update('fwaas/firewall_groups', 'firewall_group', id, data),
  deleteFirewall: (id) => remove('fwaas/firewall_groups', id),
  listFirewallPolicies: (params) => list('fwaas/firewall_policies', params),
  getFirewallPolicy: (id) => show('fwaas/firewall_policies', id),
  createFirewallPolicy: (data) => create('fwaas/firewall_policies', 'firewall_policy', data),
  updateFirewallPolicy: (id, data) => update('fwaas/firewall_policies', 'firewall_policy', id, data),
  deleteFirewallPolicy: (id) => remove('fwaas/firewall_policies', id),
  insertFirewallRule: (id, body) => putAction('fwaas/firewall_policies', id, 'insert_rule', body),
  removeFirewallRule: (id, body) => putAction('fwaas/firewall_policies', id, 'remove_rule', body),
  listFirewallRules: (params) => list('fwaas/firewall_rules', params),
  getFirewallRule: (id) => show('fwaas/firewall_rules', id),
  createFirewallRule: (data) => create('fwaas/firewall_rules', 'firewall_rule', data),
  updateFirewallRule: (id, data) => update('fwaas/firewall_rules', 'firewall_rule', id, data),
  deleteFirewallRule: (id) => remove('fwaas/firewall_rules', id),

  // VPNaaS
  listVpnServices: (params) => list('vpnservices', params),
  getVpnService: (id) => show('vpnservices', id),
  createVpnService: (data) => create('vpnservices', 'vpnservice', data),
  updateVpnService: (id, data) => update('vpnservices', 'vpnservice', id, data),
  deleteVpnService: (id) => remove('vpnservices', id),
  listIkePolicies: (params) => list('ikepolicies', params),
  getIkePolicy: (id) => show('ikepolicies', id),
  createIkePolicy: (data) => create('ikepolicies', 'ikepolicy', data),
  updateIkePolicy: (id, data) => update('ikepolicies', 'ikepolicy', id, data),
  deleteIkePolicy: (id) => remove('ikepolicies', id),
  listIpsecPolicies: (params) => list('ipsecpolicies', params),
  getIpsecPolicy: (id) => show('ipsecpolicies', id),
  createIpsecPolicy: (data) => create('ipsecpolicies', 'ipsecpolicy', data),
  updateIpsecPolicy: (id, data) => update('ipsecpolicies', 'ipsecpolicy', id, data),
  deleteIpsecPolicy: (id) => remove('ipsecpolicies', id),
  listIpsecSiteConnections: (params) => list('ipsec_site_connections', params),
  getIpsecSiteConnection: (id) => show('ipsec_site_connections', id),
  createIpsecSiteConnection: (data) => create('ipsec_site_connections', 'ipsec_site_connection', data),
  updateIpsecSiteConnection: (id, data) => update('ipsec_site_connections', 'ipsec_site_connection', id, data),
  deleteIpsecSiteConnection: (id) => remove('ipsec_site_connections', id),
  listEndpointGroups: (params) => list('endpoint-groups', params),
  getEndpointGroup: (id) => show('endpoint-groups', id),
  createEndpointGroup: (data) => create('endpoint-groups', 'endpoint_group', data),
  updateEndpointGroup: (id, data) => update('endpoint-groups', 'endpoint_group', id, data),
  deleteEndpointGroup: (id) => remove('endpoint-groups', id),

  // Agents
  listAgents: (params) => list('agents', params),

  // Skyline apiserver extension (legacy client.skyline.extension.ports / networks ...)
  skylineExtension: (resource, params) =>
    apiClient.get(`/openstack/skyline/api/v1/extension/${resource}`, listConfig(params)),
};

export default neutronApi;
