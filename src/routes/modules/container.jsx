import { lazy } from 'react';

// Magnum - legacy pages/container-infra/routes/index.js
const ClusterList = lazy(() => import('@/pages/ContainerInfra/Clusters/ClusterList'));
const ClusterDetail = lazy(() => import('@/pages/ContainerInfra/Clusters/ClusterDetail'));
const ClusterCreate = lazy(() => import('@/pages/ContainerInfra/Clusters/ClusterCreate'));
const TemplateList = lazy(() => import('@/pages/ContainerInfra/ClusterTemplates/TemplateList'));
const TemplateDetail = lazy(() => import('@/pages/ContainerInfra/ClusterTemplates/TemplateDetail'));
const TemplateForm = lazy(() => import('@/pages/ContainerInfra/ClusterTemplates/TemplateForm'));

// Zun - legacy pages/container-service/routes/index.js
const ContainerList = lazy(() => import('@/pages/ContainerService/Containers/ContainerList'));
const ContainerDetail = lazy(() => import('@/pages/ContainerService/Containers/ContainerDetail'));
const ContainerCreate = lazy(() => import('@/pages/ContainerService/Containers/ContainerCreate'));
const CapsuleList = lazy(() => import('@/pages/ContainerService/Capsules/CapsuleList'));
const CapsuleDetail = lazy(() => import('@/pages/ContainerService/Capsules/CapsuleDetail'));
const HostList = lazy(() => import('@/pages/ContainerService/Hosts/HostList'));
const HostDetail = lazy(() => import('@/pages/ContainerService/Hosts/HostDetail'));
const ServiceList = lazy(() => import('@/pages/ContainerService/Services/ServiceList'));

export default [
  // Clusters
  { path: 'container-infra/clusters', component: ClusterList },
  { path: 'container-infra/clusters/create', component: ClusterCreate },
  { path: 'container-infra/clusters/detail/:id', component: ClusterDetail },
  { path: 'container-infra/clusters-admin', component: ClusterList },
  { path: 'container-infra/clusters-admin/detail/:id', component: ClusterDetail },
  // Cluster templates
  { path: 'container-infra/cluster-template', component: TemplateList },
  { path: 'container-infra/cluster-template/create', component: TemplateForm },
  { path: 'container-infra/cluster-template/update/:id', component: TemplateForm },
  { path: 'container-infra/cluster-template/detail/:id', component: TemplateDetail },
  { path: 'container-infra/cluster-template-admin', component: TemplateList },
  { path: 'container-infra/cluster-template-admin/detail/:id', component: TemplateDetail },
  // Containers
  { path: 'container-service/containers', component: ContainerList },
  { path: 'container-service/containers/create', component: ContainerCreate },
  { path: 'container-service/containers/detail/:id', component: ContainerDetail },
  { path: 'container-service/containers-admin', component: ContainerList },
  { path: 'container-service/containers-admin/detail/:id', component: ContainerDetail },
  // Capsules
  { path: 'container-service/capsules', component: CapsuleList },
  { path: 'container-service/capsules/detail/:id', component: CapsuleDetail },
  // Hosts / services (admin)
  { path: 'container-service/hosts-admin', component: HostList },
  { path: 'container-service/hosts-admin/detail/:id', component: HostDetail },
  { path: 'container-service/services-admin', component: ServiceList },
];
