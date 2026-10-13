import { lazy } from 'react';

// Networks / Subnets
const NetworkList = lazy(() => import('@/pages/Networks/VpcNetworks'));
const NetworkDetail = lazy(() => import('@/pages/Networks/NetworkDetail'));
const SubnetDetail = lazy(() => import('@/pages/Networks/SubnetDetail'));
// Floating IPs
const FloatingIpList = lazy(() => import('@/pages/Networks/FloatingIps/FloatingIpList'));
const FloatingIpDetail = lazy(() => import('@/pages/Networks/FloatingIps/FloatingIpDetail'));
// Security groups
const SecurityGroupList = lazy(() => import('@/pages/Networks/SecurityGroups/SecurityGroupList'));
const SecurityGroupDetail = lazy(() => import('@/pages/Networks/SecurityGroups/SecurityGroupDetail'));
// Ports
const PortList = lazy(() => import('@/pages/Network/Port/PortList'));
const PortDetail = lazy(() => import('@/pages/Network/Port/PortDetail'));
// QoS
const QosPolicyList = lazy(() => import('@/pages/Network/QoSPolicy/QosPolicyList'));
const QosPolicyDetail = lazy(() => import('@/pages/Network/QoSPolicy/QosPolicyDetail'));
// RBAC
const RbacPolicyList = lazy(() => import('@/pages/Network/RbacPolicies/RbacPolicyList'));
const RbacPolicyDetail = lazy(() => import('@/pages/Network/RbacPolicies/RbacPolicyDetail'));
// Routers
const RouterList = lazy(() => import('@/pages/Network/Router/RouterList'));
const RouterDetail = lazy(() => import('@/pages/Network/Router/RouterDetail'));
const RouterPortDetail = lazy(() => import('@/pages/Network/Router/RouterPortDetail'));
// Topology
const Topology = lazy(() => import('@/pages/Network/Topology/Topology'));
// VPN
const VpnPage = lazy(() => import('@/pages/Network/VPN/VpnPage'));
const IpsecSiteConnectionDetail = lazy(() => import('@/pages/Network/VPN/IpsecSiteConnectionDetail'));
// Firewall
const FirewallPage = lazy(() => import('@/pages/Network/Firewall/FirewallPage'));
const FirewallDetail = lazy(() => import('@/pages/Network/Firewall/FirewallDetail'));
const FirewallPortDetail = lazy(() => import('@/pages/Network/Firewall/FirewallPortDetail'));
const FirewallPolicyDetail = lazy(() => import('@/pages/Network/Firewall/FirewallPolicyDetail'));
const FirewallRuleDetail = lazy(() => import('@/pages/Network/Firewall/FirewallRuleDetail'));
const FirewallCreate = lazy(() => import('@/pages/Network/Firewall/FirewallCreate'));
const FirewallPolicyForm = lazy(() => import('@/pages/Network/Firewall/FirewallPolicyForm'));
const FirewallRuleForm = lazy(() => import('@/pages/Network/Firewall/FirewallRuleForm'));

const both = (path, component) => [
  { path: `network/${path}`, component },
  { path: `network/${path.replace(/^([^/]+)/, '$1-admin')}`, component },
];

export default [
  ...both('networks', NetworkList),
  ...both('networks/detail/:id', NetworkDetail),
  ...both('networks/detail/:networkId/subnet/:id', SubnetDetail),
  ...both('networks/detail/:networkId/port/:id', PortDetail),
  ...both('networks/detail/:networkId/subnet/:subnetId/port/:id', PortDetail),
  ...both('instance/detail/:instanceId/port/:id', PortDetail),

  ...both('port', PortList),
  ...both('port/detail/:id', PortDetail),

  ...both('qos-policy', QosPolicyList),
  ...both('qos-policy/detail/:id', QosPolicyDetail),

  ...both('router', RouterList),
  ...both('router/detail/:id', RouterDetail),
  ...both('router/:routerId/port/:id', RouterPortDetail),

  ...both('floatingip', FloatingIpList),
  ...both('floatingip/detail/:id', FloatingIpDetail),

  { path: 'network/topo', component: Topology },

  ...both('vpn', VpnPage),
  ...both('ipsec-site-connection/detail/:id', IpsecSiteConnectionDetail),

  ...both('security-group', SecurityGroupList),
  ...both('security-group/detail/:id', SecurityGroupDetail),

  ...both('firewall', FirewallPage),
  ...both('firewall/detail/:id', FirewallDetail),
  ...both('firewall/:firewallId/port/:id', FirewallPortDetail),
  ...both('firewall-policy/detail/:id', FirewallPolicyDetail),
  ...both('firewall-rule/detail/:id', FirewallRuleDetail),
  { path: 'network/firewall/create', component: FirewallCreate },
  { path: 'network/firewall-policy/add', component: FirewallPolicyForm },
  { path: 'network/firewall-policy/edit/:id', component: FirewallPolicyForm },
  { path: 'network/firewall-rule/create', component: FirewallRuleForm },
  { path: 'network/firewall-rule/edit/:id', component: FirewallRuleForm },

  { path: 'network/rbac-policies-admin', component: RbacPolicyList },
  { path: 'network/rbac-policies-admin/detail/:id', component: RbacPolicyDetail },
];
