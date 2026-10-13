import { lazy } from 'react';

const BackupList = lazy(() => import('@/pages/Storage/Backups/BackupList'));
const BackupDetail = lazy(() => import('@/pages/Storage/Backups/BackupDetail'));

export default [
  { path: 'storage/backup', component: BackupList },
  { path: 'storage/backup/detail/:id', component: BackupDetail },
  { path: 'storage/backup-admin', component: BackupList },
  { path: 'storage/backup-admin/detail/:id', component: BackupDetail },
];
