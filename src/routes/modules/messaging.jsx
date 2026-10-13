import { lazy } from 'react';

const QueueList = lazy(() => import('@/pages/Messaging/Queues/QueueList'));
const QueueDetail = lazy(() => import('@/pages/Messaging/Queues/QueueDetail'));

/** Legacy pages/zaqar/routes/index.js (Zaqar); :id = queue name */
export default [
  { path: 'messaging/queues', component: QueueList },
  { path: 'messaging/queues/:id', component: QueueDetail },
  { path: 'messaging/queues-admin', component: QueueList },
  { path: 'messaging/queues-admin/:id', component: QueueDetail },
];
