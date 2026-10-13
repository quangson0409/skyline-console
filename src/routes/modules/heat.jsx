import { lazy } from 'react';

const StackList = lazy(() => import('@/pages/Heat/Stack/StackList'));
const StackDetail = lazy(() => import('@/pages/Heat/Stack/StackDetail'));
const StackForm = lazy(() => import('@/pages/Heat/Stack/StackForm'));

/**
 * Legacy pages/heat/routes/index.js.
 * The administrator routes (stack-admin) were commented out in legacy because of Heat
 * system-scope policy issues; they are provided here (global_tenant listing) and are only
 * reachable with an administrator role.
 */
const both = (path, component) => [
  { path: `heat/${path}`, component },
  { path: `heat/${path.replace(/^stack/, 'stack-admin')}`, component },
];

export default [
  ...both('stack', StackList),
  ...both('stack/create', StackForm),
  ...both('stack/edit/:id/:name', StackForm),
  ...both('stack/detail/:id/:name', StackDetail),
  // nested stacks linked from a stack resource only know the stack id
  ...both('stack/detail/:id', StackDetail),
];
