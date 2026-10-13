import React from 'react';
import { Card, Row, Col, Progress, Statistic, Tag, Table, Space, Alert, Badge } from 'antd';
import {
  DesktopOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  CheckCircleFilled,
  SyncOutlined,
  ClusterOutlined,
  SafetyCertificateOutlined,
  CloudServerOutlined,
  HddOutlined,
  TeamOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import Status from '@/components/Status';
import { t } from '@/core/i18n';

export default function AdminOverview() {
  const hypervisorStats = [
    { key: '1', hostname: 'compute-node-01.dc1', hypervisor: 'QEMU/KVM 7.2', vcpus: '32/64', memory: '128GB/256GB', disk: '2.4TB/6TB', status: 'enabled', state: 'up' },
    { key: '2', hostname: 'compute-node-02.dc1', hypervisor: 'QEMU/KVM 7.2', vcpus: '28/64', memory: '96GB/256GB', disk: '1.8TB/6TB', status: 'enabled', state: 'up' },
    { key: '3', hostname: 'compute-node-03.dc1', hypervisor: 'QEMU/KVM 7.2', vcpus: '44/64', memory: '192GB/256GB', disk: '3.1TB/6TB', status: 'enabled', state: 'up' },
    { key: '4', hostname: 'compute-node-04.dc1', hypervisor: 'QEMU/KVM 7.2', vcpus: '16/64', memory: '64GB/256GB', disk: '1.2TB/6TB', status: 'enabled', state: 'up' },
  ];

  const serviceAgents = [
    { key: '1', binary: 'nova-compute', host: 'compute-node-01', zone: 'nova', status: 'enabled', state: 'up' },
    { key: '2', binary: 'nova-scheduler', host: 'controller-01', zone: 'internal', status: 'enabled', state: 'up' },
    { key: '3', binary: 'cinder-volume', host: 'storage-node-01', zone: 'nova', status: 'enabled', state: 'up' },
    { key: '4', binary: 'neutron-openvswitch-agent', host: 'network-node-01', zone: 'nova', status: 'enabled', state: 'up' },
    { key: '5', binary: 'neutron-l3-agent', host: 'network-node-01', zone: 'nova', status: 'enabled', state: 'up' },
  ];

  const hypervisorColumns = [
    {
      title: 'Hypervisor Host',
      dataIndex: 'hostname',
      key: 'hostname',
      render: (text) => <b>{text}</b>,
    },
    { title: 'KVM Type', dataIndex: 'hypervisor', key: 'hypervisor' },
    { title: 'vCPUs Used', dataIndex: 'vcpus', key: 'vcpus' },
    { title: 'RAM Allocation', dataIndex: 'memory', key: 'memory' },
    { title: 'Local Disk', dataIndex: 'disk', key: 'disk' },
    {
      title: t('Status'),
      dataIndex: 'state',
      key: 'state',
      render: (s) => <Status status={s} />,
    },
  ];

  const serviceColumns = [
    { title: 'Service Agent', dataIndex: 'binary', key: 'binary', render: (t) => <span style={{ fontFamily: 'monospace' }}>{t}</span> },
    { title: 'Host Node', dataIndex: 'host', key: 'host' },
    { title: 'Availability Zone', dataIndex: 'zone', key: 'zone', render: (z) => <Tag color="blue">{z}</Tag> },
    {
      title: t('Status'),
      dataIndex: 'state',
      key: 'state',
      render: (s) => <Status status={s} text="Up & Running" />,
    },
  ];

  return (
    <div>
      {/* Scope banner */}
      <Alert
        message="Quản Trị Toàn Cục Hạ Tầng Đám Mây (OpenStack Administrator Scope)"
        description="Bạn đang xem dữ liệu ở cấp độ Administrator (Toàn hệ thống). Dữ liệu bao gồm tất cả Domain, Project, Máy chủ vật lý (Hypervisors) và Trạng thái tác nhân dịch vụ OpenStack."
        type="info"
        showIcon
        style={{ marginBottom: 20, borderRadius: 8 }}
      />

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <Statistic
              title="Tổng Hypervisors (KVM)"
              value={4}
              prefix={<DesktopOutlined style={{ color: '#0068ff' }} />}
              suffix="Nodes (100% Online)"
              valueStyle={{ fontWeight: 700 }}
            />
            <div style={{ fontSize: 12, color: '#16a34a', marginTop: 8 }}>
              <CheckCircleFilled /> Không có node lỗi
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <Statistic
              title="Tổng Projects (Tenants)"
              value={18}
              prefix={<TeamOutlined style={{ color: '#fa8c16' }} />}
              suffix="Projects"
              valueStyle={{ fontWeight: 700 }}
            />
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
              1 Domain chính: Default
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <Statistic
              title="Tổng vCPU Đã Cấp Phát"
              value={120}
              prefix={<ClusterOutlined style={{ color: '#0284c7' }} />}
              suffix="/ 256 Cores"
              valueStyle={{ fontWeight: 700 }}
            />
            <div style={{ fontSize: 12, color: '#0284c7', marginTop: 8 }}>
              Tỷ lệ Overcommit: 1.5 : 1
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card variant="borderless" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <Statistic
              title="Tổng Ceph Storage"
              value={24.5}
              precision={1}
              prefix={<DatabaseOutlined style={{ color: '#9333ea' }} />}
              suffix="/ 60.0 TB"
              valueStyle={{ fontWeight: 700 }}
            />
            <div style={{ fontSize: 12, color: '#16a34a', marginTop: 8 }}>
              Ceph Cluster Health: HEALTH_OK
            </div>
          </Card>
        </Col>
      </Row>

      {/* Resource Allocation Gauges */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={8}>
          <Card title="Hạ Tầng CPU Toàn Cụm" variant="borderless" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <Progress type="dashboard" percent={47} strokeColor="#0068ff" />
              <div style={{ marginTop: 8, fontWeight: 600 }}>120 / 256 vCPUs (46.8%)</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Còn trống: 136 vCPUs</div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Bộ Nhớ RAM Vật Lý" variant="borderless" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <Progress type="dashboard" percent={46} strokeColor="#16a34a" />
              <div style={{ marginTop: 8, fontWeight: 600 }}>480 / 1024 GB (46.8%)</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Còn trống: 544 GB RAM</div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Lưu Trữ Khối Cinder Pool" variant="borderless" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <Progress type="dashboard" percent={40} strokeColor="#fa8c16" />
              <div style={{ marginTop: 8, fontWeight: 600 }}>24.5 / 60.0 TB (40.8%)</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Ceph Storage Pool: 3 Replicas</div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Hypervisor Table & Services Table */}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title="Danh Sách Hypervisor Nodes (KVM)" variant="borderless" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <Table
              columns={hypervisorColumns}
              dataSource={hypervisorStats}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card title="Dịch Vụ Tác Nhân Hệ Thống (OpenStack Agents)" variant="borderless" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <Table
              columns={serviceColumns}
              dataSource={serviceAgents}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
