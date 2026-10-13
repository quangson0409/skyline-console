import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import MainLayout from '@/layouts/MainLayout';
import { renderModuleRoutes } from '@/routes';

// Auth Layout & Login
const AuthLayout = lazy(() => import('@/layouts/AuthLayout'));
const Login = lazy(() => import('@/pages/Auth/Login'));
const AuthChangePassword = lazy(() => import('@/pages/UserCenter/ChangePassword'));

// Core Split Components
const Overview = lazy(() => import('@/pages/Overview/Overview'));
const AdminOverview = lazy(() => import('@/pages/Overview/AdminOverview'));

// Compute
const InstanceList = lazy(() => import('@/pages/Instances/InstanceList'));
const InstanceDetail = lazy(() => import('@/pages/Instances/InstanceDetail'));

// Fallback Module Placeholder
const ModulePlaceholder = lazy(() => import('@/components/Common/ModulePlaceholder'));

const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
    <Spin size="large" tip="Đang tải dữ liệu phân hệ OpenStack..." />
  </div>
);

export default function App() {
  return (
    <Routes>
      {/* Authentication routes */}
      <Route
        path="/auth"
        element={
          <Suspense fallback={<PageLoader />}>
            <AuthLayout />
          </Suspense>
        }
      >
        <Route index element={<Navigate to="/auth/login" replace />} />
        <Route
          path="login"
          element={
            <Suspense fallback={<PageLoader />}>
              <Login />
            </Suspense>
          }
        />
        <Route
          path="change-password"
          element={
            <Suspense fallback={<PageLoader />}>
              <AuthChangePassword />
            </Suspense>
          }
        />
      </Route>
      <Route path="/login" element={<Navigate to="/auth/login" replace />} />

      <Route path="/" element={<MainLayout />}>
        {/* Default route redirect to /base/overview */}
        <Route index element={<Navigate to="/base/overview" replace />} />

        {/* Ported legacy modules (src/routes/modules/*) - take precedence over placeholders below */}
        {renderModuleRoutes()}

        {/* 1. Home / Overview */}
        <Route
          path="base/overview"
          element={
            <Suspense fallback={<PageLoader />}>
              <Overview />
            </Suspense>
          }
        />
        <Route
          path="base/overview-admin"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminOverview />
            </Suspense>
          }
        />
        {/* Alias redirects */}
        <Route path="overview" element={<Navigate to="/base/overview" replace />} />
        <Route path="overview-admin" element={<Navigate to="/base/overview-admin" replace />} />

        {/* 2. Compute (Module 1) */}
        <Route path="compute">
          {/* Tenant Compute */}
          <Route
            path="instance"
            element={
              <Suspense fallback={<PageLoader />}>
                <InstanceList />
              </Suspense>
            }
          />
          <Route
            path="instance/detail/:id"
            element={
              <Suspense fallback={<PageLoader />}>
                <InstanceDetail />
              </Suspense>
            }
          />
          <Route
            path="instance-admin/detail/:id"
            element={
              <Suspense fallback={<PageLoader />}>
                <InstanceDetail />
              </Suspense>
            }
          />
          <Route path="instances" element={<Navigate to="/compute/instance" replace />} />
          <Route path="flavors" element={<Navigate to="/compute/flavor" replace />} />
          <Route path="keypairs" element={<Navigate to="/compute/keypair" replace />} />

          {/* Admin Compute */}
          <Route
            path="instance-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <InstanceList />
              </Suspense>
            }
          />
        </Route>

        {/* 3. Storage */}
        <Route path="storage">
          {/* Tenant Storage */}
          <Route path="volumes" element={<Navigate to="/storage/volume" replace />} />
          <Route path="snapshots" element={<Navigate to="/storage/snapshot" replace />} />

          {/* Admin Storage */}
        </Route>

        {/* 4. Network */}
        <Route path="network">
          {/* Tenant Network */}
          <Route path="vpc" element={<Navigate to="/network/networks" replace />} />
          <Route path="floating-ips" element={<Navigate to="/network/floatingip" replace />} />
          <Route
            path="load-balancers"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Load Balancers (Cân bằng tải Octavia)" service="Octavia" />
              </Suspense>
            }
          />
          <Route
            path="certificate"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Certificates (Chứng chỉ Barbican)" service="Barbican" />
              </Suspense>
            }
          />
          <Route path="security-groups" element={<Navigate to="/network/security-group" replace />} />
          <Route
            path="dns/zones"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="DNS Zones (Quản lý tên miền)" service="Designate" />
              </Suspense>
            }
          />
          <Route
            path="dns/reverse"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="DNS Reverse (Phân giải ngược PTR)" service="Designate" />
              </Suspense>
            }
          />

          {/* Admin Network */}
          <Route
            path="load-balancers-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Load Balancers Admin (Octavia)" service="Octavia" />
              </Suspense>
            }
          />
          <Route
            path="dns-admin/zones"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="DNS Zones Admin (Designate)" service="Designate" />
              </Suspense>
            }
          />
        </Route>

        {/* 5. Share File Storage (Manila) */}
        <Route path="share">
          <Route
            path="*"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Share File Storage (Manila)" service="Manila Shared File Systems" />
              </Suspense>
            }
          />
        </Route>

        {/* 6. Key Manager (Barbican) */}
        <Route path="key-manager">
          <Route
            path="*"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Key Manager (Barbican)" service="Barbican Secrets" />
              </Suspense>
            }
          />
        </Route>

        {/* 7. Heat Orchestration */}
        <Route path="heat">
          <Route
            path="*"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Orchestration Stacks (Heat)" service="Heat Orchestration" />
              </Suspense>
            }
          />
        </Route>

        {/* 8. Databases (Trove) */}
        <Route path="database">
          <Route
            path="*"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Databases (Trove)" service="Trove Database Service" />
              </Suspense>
            }
          />
        </Route>

        {/* 9. Messaging (Zaqar) */}
        <Route path="messaging">
          <Route
            path="*"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Messaging Queues (Zaqar)" service="Zaqar Multi-tenant Messaging" />
              </Suspense>
            }
          />
        </Route>

        {/* 10. Containers (Zun & Magnum) */}
        <Route path="container-service/*" element={<Suspense fallback={<PageLoader />}><ModulePlaceholder title="Container Service (Zun)" service="Zun Containers" /></Suspense>} />
        <Route path="container-infra/*" element={<Suspense fallback={<PageLoader />}><ModulePlaceholder title="Container Infra (Magnum K8s)" service="Magnum" /></Suspense>} />

        {/* 11. Identity (Keystone) */}
        <Route path="identity">
          <Route path="projects" element={<Navigate to="/identity/project-admin" replace />} />
          <Route path="users" element={<Navigate to="/identity/user-admin" replace />} />
        </Route>

        {/* 12. Global Settings (Admin) */}
        <Route path="configuration-admin/*" element={<Suspense fallback={<PageLoader />}><ModulePlaceholder title="Global Settings (Cài đặt hệ thống OpenStack)" service="OpenStack Configuration" /></Suspense>} />

        {/* 13. High Availability (Masakari) */}
        <Route path="ha/*" element={<Suspense fallback={<PageLoader />}><ModulePlaceholder title="Instance-HA (Masakari)" service="Masakari High Availability" /></Suspense>} />

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/base/overview" replace />} />
      </Route>
    </Routes>
  );
}
