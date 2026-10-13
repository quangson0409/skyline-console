import React from 'react';
import {
  HomeOutlined,
  DesktopOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  SwitcherOutlined,
  ContainerOutlined,
  AppstoreOutlined,
  DatabaseFilled,
  MessageOutlined,
  CreditCardOutlined,
  SettingOutlined,
  DeploymentUnitOutlined,
  LockOutlined,
} from '@ant-design/icons';

/**
 * OpenStack Skyline Console Navigation Structure
 * Synchronized 1:1 with legacy skyline-console src/layouts/menu.jsx & admin-menu.jsx
 */

// Helper to determine if a URL belongs to Administrator scope
export const isAdminPath = (url = '') => url.includes('admin');

export const getTenantMenu = (t = (s) => s) => [
  {
    key: '/base/overview',
    path: '/base/overview',
    label: t('Home'),
    icon: <HomeOutlined />,
  },
  {
    key: 'compute',
    label: t('Compute'),
    icon: <DesktopOutlined />,
    children: [
      {
        key: '/compute/instance',
        path: '/compute/instance',
        label: t('Instances'),
      },
      {
        key: '/compute/instance-snapshot',
        path: '/compute/instance-snapshot',
        label: t('Instance Snapshots'),
      },
      {
        key: '/compute/flavor',
        path: '/compute/flavor',
        label: t('Flavors'),
      },
      {
        key: '/compute/server-group',
        path: '/compute/server-group',
        label: t('Server Groups'),
      },
      {
        key: '/compute/image',
        path: '/compute/image',
        label: t('Images'),
      },
      {
        key: '/compute/keypair',
        path: '/compute/keypair',
        label: t('Key Pairs'),
      },
    ],
  },
  {
    key: 'storage',
    label: t('Storage'),
    icon: <DatabaseOutlined />,
    children: [
      {
        key: '/storage/volume',
        path: '/storage/volume',
        label: t('Volumes'),
      },
      {
        key: '/storage/backup',
        path: '/storage/backup',
        label: t('Volume Backups'),
      },
      {
        key: '/storage/snapshot',
        path: '/storage/snapshot',
        label: t('Volume Snapshots'),
      },
      {
        key: '/storage/container',
        path: '/storage/container',
        label: t('Object Storage'),
      },
    ],
  },
  {
    key: 'network',
    label: t('Network'),
    icon: <GlobalOutlined />,
    children: [
      {
        key: '/network/networks',
        path: '/network/networks',
        label: t('Networks'),
      },
      {
        key: '/network/port',
        path: '/network/port',
        label: t('Ports'),
      },
      {
        key: '/network/qos-policy',
        path: '/network/qos-policy',
        label: t('QoS Policies'),
      },
      {
        key: '/network/router',
        path: '/network/router',
        label: t('Routers'),
      },
      {
        key: '/network/floatingip',
        path: '/network/floatingip',
        label: t('Floating IPs'),
      },
      {
        key: '/network/topo',
        path: '/network/topo',
        label: t('Topology'),
      },
      {
        key: '/network/load-balancers',
        path: '/network/load-balancers',
        label: t('Load Balancers'),
      },
      {
        key: '/network/certificate',
        path: '/network/certificate',
        label: t('Certificates'),
      },
      {
        key: '/network/vpn',
        path: '/network/vpn',
        label: t('VPNs'),
      },
      {
        key: '/network/security-group',
        path: '/network/security-group',
        label: t('Security Groups'),
      },
      {
        key: '/network/firewall',
        path: '/network/firewall',
        label: t('Firewalls'),
      },
      {
        key: '/network/dns/zones',
        path: '/network/dns/zones',
        label: t('DNS Zones'),
      },
      {
        key: '/network/dns/reverse',
        path: '/network/dns/reverse',
        label: t('DNS Reverse'),
      },
    ],
  },
  {
    key: 'share',
    label: t('Share File Storage'),
    icon: <SwitcherOutlined />,
    children: [
      {
        key: '/share/share',
        path: '/share/share',
        label: t('Shares'),
      },
      {
        key: '/share/share-network',
        path: '/share/share-network',
        label: t('Share Networks'),
      },
      {
        key: '/share/share-group',
        path: '/share/share-group',
        label: t('Share Groups'),
      },
    ],
  },
  {
    key: 'key-manager',
    label: t('Key Manager'),
    icon: <LockOutlined />,
    children: [
      {
        key: '/key-manager/secret',
        path: '/key-manager/secret',
        label: t('Secrets'),
      },
    ],
  },
  {
    key: 'heat',
    label: t('Orchestration'),
    icon: <AppstoreOutlined />,
    children: [
      {
        key: '/heat/stack',
        path: '/heat/stack',
        label: t('Stacks'),
      },
    ],
  },
  {
    key: 'database',
    label: t('Databases'),
    icon: <DatabaseFilled />,
    children: [
      {
        key: '/database/instances',
        path: '/database/instances',
        label: t('Database Instances'),
      },
      {
        key: '/database/backups',
        path: '/database/backups',
        label: t('Backups'),
      },
      {
        key: '/database/configurations',
        path: '/database/configurations',
        label: t('Configurations'),
      },
    ],
  },
  {
    key: 'messaging',
    label: t('Messaging'),
    icon: <MessageOutlined />,
    children: [
      {
        key: '/messaging/queues',
        path: '/messaging/queues',
        label: t('Queues'),
      },
    ],
  },
  {
    key: 'container',
    label: t('Containers'),
    icon: <ContainerOutlined />,
    children: [
      {
        key: '/container-service/containers',
        path: '/container-service/containers',
        label: t('Containers'),
      },
      {
        key: '/container-service/capsules',
        path: '/container-service/capsules',
        label: t('Capsules'),
      },
      {
        key: '/container-infra/clusters',
        path: '/container-infra/clusters',
        label: t('Clusters'),
      },
      {
        key: '/container-infra/cluster-template',
        path: '/container-infra/cluster-template',
        label: t('Cluster Templates'),
      },
    ],
  },
];

export const getAdminMenu = (t = (s) => s) => [
  {
    key: '/base/overview-admin',
    path: '/base/overview-admin',
    label: t('Home'),
    icon: <HomeOutlined />,
  },
  {
    key: 'computeAdmin',
    label: t('Compute'),
    icon: <DesktopOutlined />,
    children: [
      {
        key: '/compute/instance-admin',
        path: '/compute/instance-admin',
        label: t('Instances'),
        badge: 28,
      },
      {
        key: '/compute/instance-snapshot-admin',
        path: '/compute/instance-snapshot-admin',
        label: t('Instance Snapshots'),
      },
      {
        key: '/compute/flavor-admin',
        path: '/compute/flavor-admin',
        label: t('Flavors'),
      },
      {
        key: '/compute/server-group-admin',
        path: '/compute/server-group-admin',
        label: t('Server Groups'),
      },
      {
        key: '/compute/image-admin',
        path: '/compute/image-admin',
        label: t('Images'),
      },
      {
        key: '/compute/hypervisors-admin',
        path: '/compute/hypervisors-admin',
        label: t('Hypervisors'),
      },
      {
        key: '/compute/aggregates-admin',
        path: '/compute/aggregates-admin',
        label: t('Host Aggregates'),
      },
      {
        key: '/compute/baremetal-node-admin',
        path: '/compute/baremetal-node-admin',
        label: t('Bare Metal Nodes'),
      },
    ],
  },
  {
    key: 'storageAdmin',
    label: t('Storage'),
    icon: <DatabaseOutlined />,
    children: [
      {
        key: '/storage/volume-admin',
        path: '/storage/volume-admin',
        label: t('Volumes'),
      },
      {
        key: '/storage/backup-admin',
        path: '/storage/backup-admin',
        label: t('Volume Backups'),
      },
      {
        key: '/storage/snapshot-admin',
        path: '/storage/snapshot-admin',
        label: t('Volume Snapshots'),
      },
      {
        key: '/storage/volume-type-admin',
        path: '/storage/volume-type-admin',
        label: t('Volume Types'),
      },
      {
        key: '/storage/storage-admin',
        path: '/storage/storage-admin',
        label: t('Storage Backends'),
      },
    ],
  },
  {
    key: 'networkAdmin',
    label: t('Network'),
    icon: <GlobalOutlined />,
    children: [
      {
        key: '/network/networks-admin',
        path: '/network/networks-admin',
        label: t('Networks'),
      },
      {
        key: '/network/port-admin',
        path: '/network/port-admin',
        label: t('Ports'),
      },
      {
        key: '/network/qos-policy-admin',
        path: '/network/qos-policy-admin',
        label: t('QoS Policies'),
      },
      {
        key: '/network/router-admin',
        path: '/network/router-admin',
        label: t('Routers'),
      },
      {
        key: '/network/floatingip-admin',
        path: '/network/floatingip-admin',
        label: t('Floating IPs'),
      },
      {
        key: '/network/load-balancers-admin',
        path: '/network/load-balancers-admin',
        label: t('Load Balancers'),
      },
      {
        key: '/network/vpn-admin',
        path: '/network/vpn-admin',
        label: t('VPNs'),
      },
      {
        key: '/network/security-group-admin',
        path: '/network/security-group-admin',
        label: t('Security Groups'),
      },
      {
        key: '/network/rbac-policies-admin',
        path: '/network/rbac-policies-admin',
        label: t('RBAC Policies'),
      },
      {
        key: '/network/firewall-admin',
        path: '/network/firewall-admin',
        label: t('Firewalls'),
      },
      {
        key: '/network/dns-admin/zones',
        path: '/network/dns-admin/zones',
        label: t('DNS Zones'),
      },
    ],
  },
  {
    key: 'shareAdmin',
    label: t('Share File Storage'),
    icon: <SwitcherOutlined />,
    children: [
      {
        key: '/share/share-admin',
        path: '/share/share-admin',
        label: t('Shares'),
      },
      {
        key: '/share/share-type-admin',
        path: '/share/share-type-admin',
        label: t('Share Types'),
      },
      {
        key: '/share/share-group-type-admin',
        path: '/share/share-group-type-admin',
        label: t('Share Group Types'),
      },
      {
        key: '/share/share-network-admin',
        path: '/share/share-network-admin',
        label: t('Share Networks'),
      },
      {
        key: '/share/share-server-admin',
        path: '/share/share-server-admin',
        label: t('Share Servers'),
      },
      {
        key: '/share/share-instance-admin',
        path: '/share/share-instance-admin',
        label: t('Share Instances'),
      },
      {
        key: '/share/share-group-admin',
        path: '/share/share-group-admin',
        label: t('Share Groups'),
      },
      {
        key: '/share/storage-admin',
        path: '/share/storage-admin',
        label: t('Storage Backends'),
      },
    ],
  },
  {
    key: 'identityAdmin',
    label: t('Identity'),
    icon: <CreditCardOutlined />,
    children: [
      {
        key: '/identity/domain-admin',
        path: '/identity/domain-admin',
        label: t('Domains'),
      },
      {
        key: '/identity/project-admin',
        path: '/identity/project-admin',
        label: t('Projects'),
      },
      {
        key: '/identity/user-admin',
        path: '/identity/user-admin',
        label: t('Users'),
      },
      {
        key: '/identity/user-group-admin',
        path: '/identity/user-group-admin',
        label: t('User Groups'),
      },
      {
        key: '/identity/role-admin',
        path: '/identity/role-admin',
        label: t('Roles'),
      },
    ],
  },
  {
    key: 'databaseAdmin',
    label: t('Databases'),
    icon: <DatabaseFilled />,
    children: [
      {
        key: '/database/instances-admin',
        path: '/database/instances-admin',
        label: t('Database Instances'),
      },
    ],
  },
  {
    key: 'configurationAdmin',
    label: t('Global Settings'),
    icon: <SettingOutlined />,
    children: [
      {
        key: '/configuration-admin/info',
        path: '/configuration-admin/info',
        label: t('System Info'),
      },
      {
        key: '/configuration-admin/setting',
        path: '/configuration-admin/setting',
        label: t('System Config'),
      },
      {
        key: '/configuration-admin/metadata',
        path: '/configuration-admin/metadata',
        label: t('Metadata Definitions'),
      },
    ],
  },
  {
    key: 'messagingAdmin',
    label: t('Messaging'),
    icon: <MessageOutlined />,
    children: [
      {
        key: '/messaging/queues-admin',
        path: '/messaging/queues-admin',
        label: t('Queues'),
      },
    ],
  },
  {
    key: 'containerAdmin',
    label: t('Containers'),
    icon: <ContainerOutlined />,
    children: [
      {
        key: '/container-service/containers-admin',
        path: '/container-service/containers-admin',
        label: t('Containers'),
      },
      {
        key: '/container-service/hosts-admin',
        path: '/container-service/hosts-admin',
        label: t('Hosts'),
      },
      {
        key: '/container-service/services-admin',
        path: '/container-service/services-admin',
        label: t('Services'),
      },
      {
        key: '/container-infra/clusters-admin',
        path: '/container-infra/clusters-admin',
        label: t('Clusters'),
      },
      {
        key: '/container-infra/cluster-template-admin',
        path: '/container-infra/cluster-template-admin',
        label: t('Cluster Templates'),
      },
    ],
  },
  {
    key: 'masakariAdmin',
    label: t('Instance-HA'),
    icon: <DeploymentUnitOutlined />,
    children: [
      {
        key: '/ha/segments-admin',
        path: '/ha/segments-admin',
        label: t('Segments'),
      },
      {
        key: '/ha/hosts-admin',
        path: '/ha/hosts-admin',
        label: t('Hosts'),
      },
      {
        key: '/ha/notifications-admin',
        path: '/ha/notifications-admin',
        label: t('Notifications'),
      },
    ],
  },
];

/**
 * Service availability per menu path (legacy menu.jsx / admin-menu.jsx `endpoints`).
 * Keys are matched exactly or as a "/"-prefix; the value is a key of the skyline profile endpoints.
 */
export const MENU_ENDPOINTS = {
  '/storage/volume': 'cinder',
  '/storage/backup': 'cinder',
  '/storage/snapshot': 'cinder',
  '/storage/container': 'swift',
  '/network/qos-policy': 'neutron_qos',
  '/network/load-balancers': 'octavia',
  '/network/certificate': 'barbican',
  '/network/vpn': 'neutron_vpn',
  '/network/firewall': 'neutron_firewall',
  '/network/dns': 'designate',
  '/share': 'manilav2',
  '/key-manager': 'barbican',
  '/heat': 'heat',
  '/database': 'trove',
  '/messaging': 'zaqar',
  '/container-service': 'zun',
  '/container-infra': 'magnum',
  '/compute/baremetal-node-admin': 'ironic',
  '/storage/volume-admin': 'cinder',
  '/storage/backup-admin': 'cinder',
  '/storage/snapshot-admin': 'cinder',
  '/storage/volume-type-admin': 'cinder',
  '/storage/storage-admin': 'cinder',
  '/network/qos-policy-admin': 'neutron_qos',
  '/network/load-balancers-admin': 'octavia',
  '/network/vpn-admin': 'neutron_vpn',
  '/network/firewall-admin': 'neutron_firewall',
  '/network/dns-admin': 'designate',
  '/ha': 'masakari',
};

/** Endpoint a path depends on, or null (longest matching key wins) */
export const getRequiredEndpoint = (pathname = '') => {
  let best = null;
  Object.keys(MENU_ENDPOINTS).forEach((key) => {
    if ((pathname === key || pathname.startsWith(`${key}/`)) && (!best || key.length > best.length)) best = key;
  });
  return best ? MENU_ENDPOINTS[best] : null;
};

/** Drops menu entries whose service is not in the catalog; empty groups disappear (legacy checkEndpoint) */
export const filterMenuByEndpoints = (menu, hasEndpoint) =>
  menu
    .map((item) => {
      if (item.children) {
        const children = filterMenuByEndpoints(item.children, hasEndpoint);
        return children.length ? { ...item, children } : null;
      }
      const endpoint = getRequiredEndpoint(item.path || item.key);
      return !endpoint || hasEndpoint(endpoint) ? item : null;
    })
    .filter(Boolean);
