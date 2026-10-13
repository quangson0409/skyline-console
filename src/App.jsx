import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import MainLayout from '@/layouts/MainLayout';
import { renderModuleRoutes } from '@/routes';

// Auth Layout & Login
const AuthLayout = lazy(() => import('@/layouts/AuthLayout'));
const Login = lazy(() => import('@/pages/Auth/Login'));

// Core Split Components
const Overview = lazy(() => import('@/pages/Overview/Overview'));
const AdminOverview = lazy(() => import('@/pages/Overview/AdminOverview'));

// Compute
const InstanceList = lazy(() => import('@/pages/Instances/InstanceList'));
const InstanceDetail = lazy(() => import('@/pages/Instances/InstanceDetail'));
const FlavorList = lazy(() => import('@/pages/Compute/Flavors/FlavorList'));
const KeypairList = lazy(() => import('@/pages/Compute/Keypairs/KeypairList'));
const ImageList = lazy(() => import('@/pages/Compute/Images/ImageList'));
const ServerGroupList = lazy(() => import('@/pages/Compute/ServerGroups/ServerGroupList'));
const InstanceSnapshotList = lazy(() => import('@/pages/Compute/InstanceSnapshots/SnapshotList'));
const HypervisorList = lazy(() => import('@/pages/Compute/Hypervisors/HypervisorList'));
const AggregateList = lazy(() => import('@/pages/Compute/Aggregates/AggregateList'));

// Storage
const VolumeList = lazy(() => import('@/pages/Storage/Volumes/VolumeList'));
const SnapshotList = lazy(() => import('@/pages/Storage/Snapshots/SnapshotList'));

// Network
const VpcNetworks = lazy(() => import('@/pages/Networks/VpcNetworks'));
const FloatingIpList = lazy(() => import('@/pages/Networks/FloatingIps/FloatingIpList'));
const SecurityGroupList = lazy(() => import('@/pages/Networks/SecurityGroups/SecurityGroupList'));

// Identity
const ProjectList = lazy(() => import('@/pages/Identity/Projects/ProjectList'));
const UserList = lazy(() => import('@/pages/Identity/Users/UserList'));

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
          <Route
            path="instance-snapshot"
            element={
              <Suspense fallback={<PageLoader />}>
                <InstanceSnapshotList />
              </Suspense>
            }
          />
          <Route
            path="flavor"
            element={
              <Suspense fallback={<PageLoader />}>
                <FlavorList />
              </Suspense>
            }
          />
          <Route path="flavors" element={<Navigate to="/compute/flavor" replace />} />
          <Route
            path="server-group"
            element={
              <Suspense fallback={<PageLoader />}>
                <ServerGroupList />
              </Suspense>
            }
          />
          <Route
            path="image"
            element={
              <Suspense fallback={<PageLoader />}>
                <ImageList />
              </Suspense>
            }
          />
          <Route
            path="keypair"
            element={
              <Suspense fallback={<PageLoader />}>
                <KeypairList />
              </Suspense>
            }
          />
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
          <Route
            path="instance-snapshot-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <InstanceSnapshotList />
              </Suspense>
            }
          />
          <Route
            path="flavor-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <FlavorList />
              </Suspense>
            }
          />
          <Route
            path="server-group-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ServerGroupList />
              </Suspense>
            }
          />
          <Route
            path="image-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ImageList />
              </Suspense>
            }
          />
          <Route
            path="hypervisors-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <HypervisorList />
              </Suspense>
            }
          />
          <Route
            path="aggregates-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <AggregateList />
              </Suspense>
            }
          />
          <Route
            path="baremetal-node-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Bare Metal Nodes (Máy chủ Ironic)" service="Ironic" />
              </Suspense>
            }
          />
        </Route>

        {/* 3. Storage */}
        <Route path="storage">
          {/* Tenant Storage */}
          <Route
            path="volume"
            element={
              <Suspense fallback={<PageLoader />}>
                <VolumeList />
              </Suspense>
            }
          />
          <Route path="volumes" element={<Navigate to="/storage/volume" replace />} />
          <Route
            path="backup"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Volume Backups (Sao lưu ổ cứng)" service="Cinder" />
              </Suspense>
            }
          />
          <Route
            path="snapshot"
            element={
              <Suspense fallback={<PageLoader />}>
                <SnapshotList />
              </Suspense>
            }
          />
          <Route path="snapshots" element={<Navigate to="/storage/snapshot" replace />} />
          <Route
            path="container"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Object Storage (Lưu trữ đối tượng Swift)" service="Swift" />
              </Suspense>
            }
          />

          {/* Admin Storage */}
          <Route
            path="volume-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <VolumeList />
              </Suspense>
            }
          />
          <Route
            path="backup-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Volume Backups Admin" service="Cinder" />
              </Suspense>
            }
          />
          <Route
            path="snapshot-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <SnapshotList />
              </Suspense>
            }
          />
          <Route
            path="volume-type-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Volume Types & QoS Specs" service="Cinder" />
              </Suspense>
            }
          />
          <Route
            path="storage-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Storage Backends (Ceph / SAN Pool)" service="Cinder" />
              </Suspense>
            }
          />
        </Route>

        {/* 4. Network */}
        <Route path="network">
          {/* Tenant Network */}
          <Route
            path="networks"
            element={
              <Suspense fallback={<PageLoader />}>
                <VpcNetworks />
              </Suspense>
            }
          />
          <Route path="vpc" element={<Navigate to="/network/networks" replace />} />
          <Route
            path="port"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Ports (Cổng mạng)" service="Neutron" />
              </Suspense>
            }
          />
          <Route
            path="qos-policy"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="QoS Policies (Chính sách chất lượng dịch vụ)" service="Neutron" />
              </Suspense>
            }
          />
          <Route
            path="router"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Routers (Bộ định tuyến ảo)" service="Neutron" />
              </Suspense>
            }
          />
          <Route
            path="floatingip"
            element={
              <Suspense fallback={<PageLoader />}>
                <FloatingIpList />
              </Suspense>
            }
          />
          <Route path="floating-ips" element={<Navigate to="/network/floatingip" replace />} />
          <Route
            path="topo"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Topology (Sơ đồ kết nối mạng)" service="Neutron" />
              </Suspense>
            }
          />
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
          <Route
            path="vpn"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="VPNs (Mạng riêng ảo IPsec)" service="Neutron VPN" />
              </Suspense>
            }
          />
          <Route
            path="security-group"
            element={
              <Suspense fallback={<PageLoader />}>
                <SecurityGroupList />
              </Suspense>
            }
          />
          <Route path="security-groups" element={<Navigate to="/network/security-group" replace />} />
          <Route
            path="firewall"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Firewalls (Tường lửa FWaaS)" service="Neutron Firewall" />
              </Suspense>
            }
          />
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
            path="networks-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <VpcNetworks />
              </Suspense>
            }
          />
          <Route
            path="port-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Ports Admin (Tất cả cổng mạng)" service="Neutron" />
              </Suspense>
            }
          />
          <Route
            path="qos-policy-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="QoS Policies Admin" service="Neutron" />
              </Suspense>
            }
          />
          <Route
            path="router-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Routers Admin (Tất cả bộ định tuyến)" service="Neutron" />
              </Suspense>
            }
          />
          <Route
            path="floatingip-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <FloatingIpList />
              </Suspense>
            }
          />
          <Route
            path="load-balancers-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Load Balancers Admin (Octavia)" service="Octavia" />
              </Suspense>
            }
          />
          <Route
            path="vpn-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="VPNs Admin" service="Neutron VPN" />
              </Suspense>
            }
          />
          <Route
            path="security-group-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <SecurityGroupList />
              </Suspense>
            }
          />
          <Route
            path="rbac-policies-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="RBAC Policies (Chính sách chia sẻ tài nguyên mạng)" service="Neutron" />
              </Suspense>
            }
          />
          <Route
            path="firewall-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Firewalls Admin (FWaaS)" service="Neutron Firewall" />
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
          <Route
            path="domain-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Domains (Tên miền Keystone)" service="Keystone Identity" />
              </Suspense>
            }
          />
          <Route
            path="project-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ProjectList />
              </Suspense>
            }
          />
          <Route path="projects" element={<Navigate to="/identity/project-admin" replace />} />
          <Route
            path="user-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <UserList />
              </Suspense>
            }
          />
          <Route path="users" element={<Navigate to="/identity/user-admin" replace />} />
          <Route
            path="user-group-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="User Groups (Nhóm người dùng)" service="Keystone Identity" />
              </Suspense>
            }
          />
          <Route
            path="role-admin"
            element={
              <Suspense fallback={<PageLoader />}>
                <ModulePlaceholder title="Roles (Phân quyền & Vai trò)" service="Keystone Identity" />
              </Suspense>
            }
          />
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
