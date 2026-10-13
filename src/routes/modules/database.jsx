import { lazy } from 'react';

const InstanceList = lazy(() => import('@/pages/Database/Instances/InstanceList'));
const InstanceCreate = lazy(() => import('@/pages/Database/Instances/InstanceCreate'));
const InstanceDetail = lazy(() => import('@/pages/Database/Instances/InstanceDetail'));
const BackupList = lazy(() => import('@/pages/Database/Backups/BackupList'));
const BackupDetail = lazy(() => import('@/pages/Database/Backups/BackupDetail'));
const ConfigurationList = lazy(() => import('@/pages/Database/Configurations/ConfigurationList'));
const ConfigurationDetail = lazy(() => import('@/pages/Database/Configurations/ConfigurationDetail'));

/** Legacy pages/database/routes/index.jsx (Trove) */
export default [
  { path: 'database/instances', component: InstanceList },
  { path: 'database/instances-admin', component: InstanceList },
  { path: 'database/instances/create', component: InstanceCreate },
  { path: 'database/instances/detail/:id', component: InstanceDetail },
  { path: 'database/instances-admin/detail/:id', component: InstanceDetail },
  { path: 'database/backups', component: BackupList },
  { path: 'database/backups/detail/:id', component: BackupDetail },
  { path: 'database/configurations', component: ConfigurationList },
  { path: 'database/configurations/detail/:id', component: ConfigurationDetail },
];
