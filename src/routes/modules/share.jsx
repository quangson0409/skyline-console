import { lazy } from 'react';

const ShareList = lazy(() => import('@/pages/Share/Share/ShareList'));
const ShareCreate = lazy(() => import('@/pages/Share/Share/ShareList').then((m) => ({ default: m.ShareCreatePage })));
const ShareDetail = lazy(() => import('@/pages/Share/Share/ShareDetail'));
const ShareTypeList = lazy(() => import('@/pages/Share/ShareType/ShareTypeList'));
const ShareTypeDetail = lazy(() => import('@/pages/Share/ShareType/ShareTypeDetail'));
const ShareGroupTypeList = lazy(() => import('@/pages/Share/ShareGroupType/ShareGroupTypeList'));
const ShareGroupTypeDetail = lazy(() => import('@/pages/Share/ShareGroupType/ShareGroupTypeDetail'));
const ShareInstanceList = lazy(() => import('@/pages/Share/ShareInstance/ShareInstanceList'));
const ShareInstanceDetail = lazy(() => import('@/pages/Share/ShareInstance/ShareInstanceDetail'));
const ShareNetworkList = lazy(() => import('@/pages/Share/ShareNetwork/ShareNetworkList'));
const ShareNetworkDetail = lazy(() => import('@/pages/Share/ShareNetwork/ShareNetworkDetail'));
const ShareGroupList = lazy(() => import('@/pages/Share/ShareGroup/ShareGroupList'));
const ShareGroupDetail = lazy(() => import('@/pages/Share/ShareGroup/ShareGroupDetail'));
const ShareServerList = lazy(() => import('@/pages/Share/ShareServer/ShareServerList'));
const ShareServerDetail = lazy(() => import('@/pages/Share/ShareServer/ShareServerDetail'));
const ShareStorageList = lazy(() => import('@/pages/Share/Storage/ShareStorageList'));

/** Legacy pages/share/routes/index.js (Manila shared file systems) */
export default [
  // Share types / share group types (admin)
  { path: 'share/share-type-admin', component: ShareTypeList },
  { path: 'share/share-type-admin/detail/:id', component: ShareTypeDetail },
  { path: 'share/share-group-type-admin', component: ShareGroupTypeList },
  { path: 'share/share-group-type-admin/detail/:id', component: ShareGroupTypeDetail },
  // Share instances (admin)
  { path: 'share/share-instance-admin', component: ShareInstanceList },
  { path: 'share/share-instance-admin/detail/:id', component: ShareInstanceDetail },
  // Share networks
  { path: 'share/share-network', component: ShareNetworkList },
  { path: 'share/share-network/detail/:id', component: ShareNetworkDetail },
  { path: 'share/share-network-admin', component: ShareNetworkList },
  { path: 'share/share-network-admin/detail/:id', component: ShareNetworkDetail },
  // Share groups
  { path: 'share/share-group', component: ShareGroupList },
  { path: 'share/share-group/detail/:id', component: ShareGroupDetail },
  { path: 'share/share-group-admin', component: ShareGroupList },
  { path: 'share/share-group-admin/detail/:id', component: ShareGroupDetail },
  // Shares
  { path: 'share/share', component: ShareList },
  { path: 'share/share/detail/:id', component: ShareDetail },
  { path: 'share/share/create', component: ShareCreate },
  { path: 'share/share-admin', component: ShareList },
  { path: 'share/share-admin/detail/:id', component: ShareDetail },
  // Share servers (admin)
  { path: 'share/share-server-admin', component: ShareServerList },
  { path: 'share/share-server-admin/detail/:id', component: ShareServerDetail },
  // Storage pools (admin)
  { path: 'share/storage-admin', component: ShareStorageList },
];
