import { lazy } from 'react';

// Designate DNS - port of legacy pages/network/containers/DNS (routes in pages/network/routes/index.js)
const ZoneList = lazy(() => import('@/pages/Network/DNS/ZoneList'));
const ZoneDetail = lazy(() => import('@/pages/Network/DNS/ZoneDetail'));
const RecordSetDetail = lazy(() => import('@/pages/Network/DNS/RecordSetDetail'));
const ReverseList = lazy(() => import('@/pages/Network/DNS/ReverseList'));
const ReverseDetail = lazy(() => import('@/pages/Network/DNS/ReverseDetail'));

export default [
  { path: 'network/dns/zones', component: ZoneList },
  { path: 'network/dns-admin/zones', component: ZoneList },
  { path: 'network/dns/zones/detail/:id', component: ZoneDetail },
  { path: 'network/dns-admin/zones/detail/:id', component: ZoneDetail },
  { path: 'network/dns/zones/detail/:zoneId/recordsets/:id', component: RecordSetDetail },
  { path: 'network/dns-admin/zones/detail/:zoneId/recordsets/:id', component: RecordSetDetail },
  { path: 'network/dns/reverse', component: ReverseList },
  { path: 'network/dns/reverse/detail/:id', component: ReverseDetail },
];
