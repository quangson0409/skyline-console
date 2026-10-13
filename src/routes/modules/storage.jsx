import { lazy } from 'react';

const BackupList = lazy(() => import('@/pages/Storage/Backups/BackupList'));
const BackupDetail = lazy(() => import('@/pages/Storage/Backups/BackupDetail'));
const VolumeList = lazy(() => import('@/pages/Storage/Volumes/VolumeList'));
const VolumeCreate = lazy(() =>
  import('@/pages/Storage/Volumes/VolumeList').then((m) => ({ default: m.VolumeCreatePage }))
);
const VolumeDetail = lazy(() => import('@/pages/Storage/Volumes/VolumeDetail'));
const SnapshotList = lazy(() => import('@/pages/Storage/Snapshots/SnapshotList'));
const SnapshotDetail = lazy(() => import('@/pages/Storage/Snapshots/SnapshotDetail'));
const VolumeTypeAdmin = lazy(() => import('@/pages/Storage/VolumeTypes/VolumeTypeAdmin'));
const VolumeTypeDetail = lazy(() => import('@/pages/Storage/VolumeTypes/VolumeTypeDetail'));
const QosSpecDetail = lazy(() => import('@/pages/Storage/VolumeTypes/QosSpecDetail'));
const StorageBackendList = lazy(() => import('@/pages/Storage/StorageBackends/StorageBackendList'));
const ContainerList = lazy(() => import('@/pages/Storage/Containers/ContainerList'));
const ContainerDetail = lazy(() => import('@/pages/Storage/Containers/ContainerDetail'));

/** Legacy pages/storage/routes/index.js */
export default [
  // Volume backups
  { path: 'storage/backup', component: BackupList },
  { path: 'storage/backup/detail/:id', component: BackupDetail },
  { path: 'storage/backup-admin', component: BackupList },
  { path: 'storage/backup-admin/detail/:id', component: BackupDetail },
  // Volumes
  { path: 'storage/volume', component: VolumeList },
  { path: 'storage/volume-admin', component: VolumeList },
  { path: 'storage/volume/create', component: VolumeCreate },
  { path: 'storage/volume/detail/:id', component: VolumeDetail },
  { path: 'storage/volume-admin/detail/:id', component: VolumeDetail },
  // Volume snapshots
  { path: 'storage/snapshot', component: SnapshotList },
  { path: 'storage/snapshot-admin', component: SnapshotList },
  { path: 'storage/snapshot/detail/:id', component: SnapshotDetail },
  { path: 'storage/snapshot-admin/detail/:id', component: SnapshotDetail },
  // Volume types & QoS specs (admin)
  { path: 'storage/volume-type-admin', component: VolumeTypeAdmin },
  { path: 'storage/volume-type-admin/detail/:id', component: VolumeTypeDetail },
  { path: 'storage/volume-type-admin/qos/detail/:id', component: QosSpecDetail },
  // Storage backends (admin)
  { path: 'storage/storage-admin', component: StorageBackendList },
  // Object storage (Swift); folder = encoded object prefix (legacy :container/:folder)
  { path: 'storage/container', component: ContainerList },
  { path: 'storage/container/detail/:container', component: ContainerDetail },
  { path: 'storage/container/detail/:container/*', component: ContainerDetail },
];
