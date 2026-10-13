import { lazy } from 'react';

const DomainList = lazy(() => import('@/pages/Identity/Domains/DomainList'));
const DomainDetail = lazy(() => import('@/pages/Identity/Domains/DomainDetail'));
const ProjectList = lazy(() => import('@/pages/Identity/Projects/ProjectList'));
const ProjectDetail = lazy(() => import('@/pages/Identity/Projects/ProjectDetail'));
const UserList = lazy(() => import('@/pages/Identity/Users/UserList'));
const UserCreate = lazy(() => import('@/pages/Identity/Users/UserCreate'));
const UserDetail = lazy(() => import('@/pages/Identity/Users/UserDetail'));
const UserGroupList = lazy(() => import('@/pages/Identity/UserGroups/UserGroupList'));
const UserGroupDetail = lazy(() => import('@/pages/Identity/UserGroups/UserGroupDetail'));
const RoleList = lazy(() => import('@/pages/Identity/Roles/RoleList'));
const RoleDetail = lazy(() => import('@/pages/Identity/Roles/RoleDetail'));
const UserCenter = lazy(() => import('@/pages/UserCenter/UserCenter'));
const Credentials = lazy(() => import('@/pages/UserCenter/Credentials'));
const TOTP = lazy(() => import('@/pages/UserCenter/TOTP'));
const ChangePassword = lazy(() => import('@/pages/UserCenter/ChangePassword'));

/** Legacy pages/identity/routes + pages/user-center/routes (+ auth change-password) */
export default [
  { path: 'identity/domain-admin', component: DomainList },
  { path: 'identity/domain-admin/detail/:id', component: DomainDetail },
  { path: 'identity/project', component: ProjectList },
  { path: 'identity/project/detail/:id', component: ProjectDetail },
  { path: 'identity/project-admin', component: ProjectList },
  { path: 'identity/project-admin/detail/:id', component: ProjectDetail },
  { path: 'identity/user', component: UserList },
  { path: 'identity/user-admin', component: UserList },
  { path: 'identity/user-admin/create', component: UserCreate },
  { path: 'identity/user-admin/detail/:id', component: UserDetail },
  { path: 'identity/user-group-admin', component: UserGroupList },
  { path: 'identity/user-group-admin/detail/:id', component: UserGroupDetail },
  { path: 'identity/role-admin', component: RoleList },
  { path: 'identity/role-admin/detail/:id', component: RoleDetail },
  { path: 'user/center', component: UserCenter },
  { path: 'user/application-credentials', component: Credentials },
  { path: 'user/totp', component: TOTP },
  { path: 'user/change-password', component: ChangePassword },
  // /auth/change-password (expired-password flow) is mounted under AuthLayout in App.jsx
];
