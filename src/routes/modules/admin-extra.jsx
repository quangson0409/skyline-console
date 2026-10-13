import { lazy } from 'react';

/* Instance-HA (legacy pages/ha/routes/index.js) */
const SegmentList = lazy(() => import('@/pages/HA/Segments/SegmentList'));
const SegmentCreate = lazy(() => import('@/pages/HA/Segments/SegmentCreate'));
const SegmentDetail = lazy(() => import('@/pages/HA/Segments/SegmentDetail'));
const HostList = lazy(() => import('@/pages/HA/Hosts/HostList'));
const HostDetail = lazy(() => import('@/pages/HA/Hosts/HostDetail'));
const NotificationList = lazy(() => import('@/pages/HA/Notifications/NotificationList'));
const NotificationDetail = lazy(() => import('@/pages/HA/Notifications/NotificationDetail'));

/* Monitor Center (legacy pages/monitor/routes/index.js) */
const MonitorOverview = lazy(() => import('@/pages/Monitor/Overview'));
const PhysicalNode = lazy(() => import('@/pages/Monitor/PhysicalNode'));
const StorageCluster = lazy(() => import('@/pages/Monitor/StorageCluster'));
const OpenstackService = lazy(() => import('@/pages/Monitor/OpenstackService'));
const OtherService = lazy(() => import('@/pages/Monitor/OtherService'));

/* Global settings (legacy pages/configuration/routes/index.js) */
const SystemInfo = lazy(() => import('@/pages/Configuration/SystemInfo/SystemInfo'));
const NeutronAgentDetail = lazy(() => import('@/pages/Configuration/SystemInfo/NeutronAgentDetail'));
const SettingList = lazy(() => import('@/pages/Configuration/Setting/SettingList'));
const MetadataList = lazy(() => import('@/pages/Configuration/Metadata/MetadataList'));
const MetadataDetail = lazy(() => import('@/pages/Configuration/Metadata/MetadataDetail'));

/* Maintenance (legacy pages/management/routes/index.js) */
const RecycleBinList = lazy(() => import('@/pages/Management/RecycleBin/RecycleBinList'));
const RecycleBinDetail = lazy(() => import('@/pages/Management/RecycleBin/RecycleBinDetail'));

export default [
  { path: 'ha/segments-admin', component: SegmentList },
  { path: 'ha/segments-admin/create-step-admin', component: SegmentCreate },
  { path: 'ha/segments-admin/detail/:id', component: SegmentDetail },
  { path: 'ha/hosts-admin', component: HostList },
  { path: 'ha/hosts-admin/detail/:id', component: HostDetail },
  { path: 'ha/notifications-admin', component: NotificationList },
  { path: 'ha/notifications-admin/detail/:id', component: NotificationDetail },

  { path: 'monitor-center/overview-admin', component: MonitorOverview },
  { path: 'monitor-center/physical-node-admin', component: PhysicalNode },
  { path: 'monitor-center/storage-cluster-admin', component: StorageCluster },
  { path: 'monitor-center/openstack-service-admin', component: OpenstackService },
  { path: 'monitor-center/other-service-admin', component: OtherService },

  { path: 'configuration-admin/info', component: SystemInfo },
  { path: 'configuration-admin/neutron/detail/:id', component: NeutronAgentDetail },
  { path: 'configuration-admin/setting', component: SettingList },
  { path: 'configuration-admin/metadata', component: MetadataList },
  { path: 'configuration-admin/metadata/detail/:id', component: MetadataDetail },

  { path: 'management/recycle-bin', component: RecycleBinList },
  { path: 'management/recycle-bin/detail/:id', component: RecycleBinDetail },
  { path: 'management/recycle-bin-admin', component: RecycleBinList },
  { path: 'management/recycle-bin-admin/detail/:id', component: RecycleBinDetail },
];
