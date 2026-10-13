import { lazy } from 'react';

// Octavia load balancers (legacy pages/network/routes: lb, lbAdmin, lbDetail, lbListenerDetail ...)
const LoadBalancerList = lazy(() => import('@/pages/Network/LoadBalancers/LoadBalancerList'));
const LoadBalancerDetail = lazy(() => import('@/pages/Network/LoadBalancers/LoadBalancerDetail'));
const LoadBalancerCreate = lazy(() => import('@/pages/Network/LoadBalancers/LoadBalancerCreate'));
const ListenerDetail = lazy(() => import('@/pages/Network/LoadBalancers/ListenerDetail'));

export default [
  { path: 'network/load-balancers', component: LoadBalancerList },
  { path: 'network/load-balancers-admin', component: LoadBalancerList },
  { path: 'network/load-balancers/create', component: LoadBalancerCreate },
  { path: 'network/load-balancers/detail/:id', component: LoadBalancerDetail },
  { path: 'network/load-balancers-admin/detail/:id', component: LoadBalancerDetail },
  { path: 'network/load-balancers/:loadBalancerId/listener/:id', component: ListenerDetail },
  { path: 'network/load-balancers-admin/:loadBalancerId/listener/:id', component: ListenerDetail },
];
