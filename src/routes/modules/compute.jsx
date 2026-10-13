import React, { lazy } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

// Legacy /compute/instance/create?volume=... -> instance list with the create modal opened
const InstanceCreateRedirect = () => {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('create', '1');
  return <Navigate to={`/compute/instance?${params.toString()}`} replace />;
};

// Compute group (port of legacy pages/compute/routes/index.js) - instances live in App.jsx
const SnapshotList = lazy(() => import('@/pages/Compute/InstanceSnapshots/SnapshotList'));
const SnapshotDetail = lazy(() => import('@/pages/Compute/InstanceSnapshots/SnapshotDetail'));
const FlavorList = lazy(() => import('@/pages/Compute/Flavors/FlavorList'));
const FlavorDetail = lazy(() => import('@/pages/Compute/Flavors/FlavorDetail'));
const FlavorCreate = lazy(() => import('@/pages/Compute/Flavors/FlavorCreate'));
const ServerGroupList = lazy(() => import('@/pages/Compute/ServerGroups/ServerGroupList'));
const ServerGroupDetail = lazy(() => import('@/pages/Compute/ServerGroups/ServerGroupDetail'));
const ImageList = lazy(() => import('@/pages/Compute/Images/ImageList'));
const ImageDetail = lazy(() => import('@/pages/Compute/Images/ImageDetail'));
const ImageCreate = lazy(() => import('@/pages/Compute/Images/ImageCreate'));
const KeypairList = lazy(() => import('@/pages/Compute/Keypairs/KeypairList'));
const KeypairDetail = lazy(() => import('@/pages/Compute/Keypairs/KeypairDetail'));
const HypervisorList = lazy(() => import('@/pages/Compute/Hypervisors/HypervisorList'));
const HypervisorDetail = lazy(() => import('@/pages/Compute/Hypervisors/HypervisorDetail'));
const AggregateList = lazy(() => import('@/pages/Compute/Aggregates/AggregateList'));
const NodeList = lazy(() => import('@/pages/Compute/BareMetalNodes/NodeList'));
const NodeDetail = lazy(() => import('@/pages/Compute/BareMetalNodes/NodeDetail'));
const NodeCreate = lazy(() => import('@/pages/Compute/BareMetalNodes/NodeCreate'));

export default [
  { path: 'compute/instance-snapshot', component: SnapshotList },
  { path: 'compute/instance-snapshot-admin', component: SnapshotList },
  { path: 'compute/instance-snapshot/detail/:id', component: SnapshotDetail },
  { path: 'compute/instance-snapshot-admin/detail/:id', component: SnapshotDetail },

  { path: 'compute/flavor', component: FlavorList },
  { path: 'compute/flavor-admin', component: FlavorList },
  { path: 'compute/flavor/detail/:id', component: FlavorDetail },
  { path: 'compute/flavor-admin/detail/:id', component: FlavorDetail },
  { path: 'compute/flavor-admin/create', component: FlavorCreate },

  { path: 'compute/server-group', component: ServerGroupList },
  { path: 'compute/server-group-admin', component: ServerGroupList },
  { path: 'compute/server-group/detail/:id', component: ServerGroupDetail },
  { path: 'compute/server-group-admin/detail/:id', component: ServerGroupDetail },

  { path: 'compute/image', component: ImageList },
  { path: 'compute/image-admin', component: ImageList },
  { path: 'compute/image/create', component: ImageCreate },
  { path: 'compute/image-admin/create', component: ImageCreate },
  { path: 'compute/image/detail/:id', component: ImageDetail },
  { path: 'compute/image-admin/detail/:id', component: ImageDetail },

  { path: 'compute/keypair', component: KeypairList },
  { path: 'compute/keypair/detail/:id', component: KeypairDetail },

  { path: 'compute/hypervisors-admin', component: HypervisorList },
  { path: 'compute/hypervisors-admin/detail/:id', component: HypervisorDetail },

  { path: 'compute/aggregates-admin', component: AggregateList },

  { path: 'compute/baremetal-node-admin', component: NodeList },
  { path: 'compute/baremetal-node-admin/create', component: NodeCreate },
  { path: 'compute/baremetal-node-admin/edit/:id', component: NodeCreate },
  { path: 'compute/baremetal-node-admin/detail/:id', component: NodeDetail },

  { path: 'compute/instance/create', element: <InstanceCreateRedirect /> },
];
