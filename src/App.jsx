import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import MainLayout from '@/layouts/MainLayout';
import { renderModuleRoutes } from '@/routes';
import { useTranslation } from '@/core/i18n';

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


const PageLoader = () => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <Spin size="large" tip={t('Loading OpenStack module data...')} />
    </div>
  );
};

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
        </Route>

        {/* 4. Network */}
        <Route path="network">
          {/* Tenant Network */}
          <Route path="vpc" element={<Navigate to="/network/networks" replace />} />
          <Route path="floating-ips" element={<Navigate to="/network/floatingip" replace />} />
          <Route path="security-groups" element={<Navigate to="/network/security-group" replace />} />
        </Route>

        {/* 11. Identity (Keystone) */}
        <Route path="identity">
          <Route path="projects" element={<Navigate to="/identity/project-admin" replace />} />
          <Route path="users" element={<Navigate to="/identity/user-admin" replace />} />
        </Route>

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/base/overview" replace />} />
      </Route>
    </Routes>
  );
}
