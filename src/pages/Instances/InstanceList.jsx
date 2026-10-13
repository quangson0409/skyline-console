import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Breadcrumb,
  Button,
  Card,
  Col,
  Row,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Tooltip,
  message,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useInstances } from '@/hooks/useInstances';
import { useAuthStore } from '@/store/authStore';
import { novaApi } from '@/api/nova';
import { glanceApi } from '@/api/glance';
import Status from '@/components/Status';
import BaseTable from '@/components/Tables/BaseTable';
import useActionRunner from '@/components/Action/useActionRunner';
import { rowActions, batchActions } from './actions';
import { useTranslation } from '@/core/i18n';
import CreateInstanceModal from './CreateInstanceModal';

export default function InstanceList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasAdminRole, user } = useAuthStore();
  const isAdmin = Boolean(hasAdminRole || (user?.roles || []).includes('admin'));

  const {
    instances,
    loading,
    actionLoading,
    quotaMetrics,
    refetch,
    createInstance,
  } = useInstances();

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  // Entry from other modules (image / volume / snapshot / server group "Create Instance")
  const createPreset = useMemo(() => {
    const keys = ['image', 'volume', 'snapshot', 'servergroup'];
    const preset = Object.fromEntries(keys.filter((k) => searchParams.get(k)).map((k) => [k, searchParams.get(k)]));
    return Object.keys(preset).length || searchParams.get('create') ? preset : null;
  }, [searchParams]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(Boolean(createPreset));
  const [magicFilters, setMagicFilters] = useState({});

  // Unified Skyline Action Runner (handles confirm, modal forms, etc.)
  const { handleAction, actionModal } = useActionRunner({ onRefresh: refetch });

  // MagicInput filter parameters matching legacy Skyline
  const filterParams = useMemo(
    () => [
      {
        name: 'name',
        label: t('Name'),
      },
      {
        name: 'status',
        label: t('Status'),
        options: [
          { key: 'ACTIVE', label: t('Active') },
          { key: 'SHUTOFF', label: t('Shutoff') },
          { key: 'BUILDING', label: t('Building') },
          { key: 'ERROR', label: t('Error') },
        ],
      },
      {
        name: 'ip',
        label: 'IP Address',
      },
      {
        name: 'flavor',
        label: t('Flavors'),
      },
      {
        name: 'host',
        label: 'Compute Host',
      },
    ],
    [t]
  );

  const columns = useMemo(
    () => [
      {
        title: t('Name'),
        dataIndex: 'name',
        key: 'name',
        sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
        render: (text, record) => (
          <div>
            <div
              style={{ fontWeight: 600, color: '#0068ff', cursor: 'pointer' }}
              onClick={() => navigate(`/compute/instance/detail/${record.id}`)}
            >
              {text}
            </div>
            <Space style={{ fontSize: 11, color: '#94a3b8' }}>
              <span>ID: {record.id}</span>
              <Tooltip title={t('Copy')}>
                <CopyOutlined
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(record.id);
                    message.success(t('Copied'));
                  }}
                />
              </Tooltip>
            </Space>
          </div>
        ),
      },
      {
        title: t('Images'),
        dataIndex: 'image',
        key: 'image',
        render: (text) => <span style={{ fontSize: 13 }}>{text}</span>,
      },
      {
        title: t('IP'),
        dataIndex: 'ip',
        key: 'ip',
        render: (ip, record) => (
          <div>
            <div style={{ fontSize: 13, fontFamily: 'monospace' }}>
              {ip}
            </div>
            {record.floatingIp && (
              <Tag color="cyan" style={{ fontSize: 11, margin: 0, fontFamily: 'monospace' }}>
                Floating: {record.floatingIp}
              </Tag>
            )}
          </div>
        ),
      },
      {
        title: t('Flavors'),
        dataIndex: 'flavor',
        key: 'flavor',
        render: (flavor) => <span style={{ fontSize: 12, color: '#475569' }}>{flavor}</span>,
      },
      {
        title: t('Status'),
        dataIndex: 'status',
        key: 'status',
        sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
        render: (status) => <Status status={status} />,
      },
      {
        title: t('Created At'),
        dataIndex: 'created',
        key: 'created',
        sorter: (a, b) => (a.created || '').localeCompare(b.created || ''),
        render: (dateStr) => <span style={{ fontSize: 12, color: '#94a3b8' }}>{dateStr}</span>,
      },
    ],
    [t, navigate]
  );

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Top Breadcrumb & Header */}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb
          items={[{ title: t('Compute') }, { title: t('Instances') }]}
          style={{ marginBottom: 6, fontSize: 12 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              {t('Instances')}
            </h1>
            <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
              {t('Manage compute instances, power states, network attachments, and VNC consoles.')}
            </p>
          </div>
        </div>
      </div>

      {/* 4 Quota KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('vCPUs')} {t('Allocated')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>
              {quotaMetrics.totalVcpus} <span style={{ fontSize: 13, color: '#94a3b8' }}>/ {quotaMetrics.maxVcpus}</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('Memory (RAM)')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#0068ff' }}>
              {quotaMetrics.totalRam} <span style={{ fontSize: 13, color: '#94a3b8' }}>GiB</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('Active')} Instances</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#10b981' }}>
              {quotaMetrics.activeCount} <span style={{ fontSize: 13, color: '#94a3b8' }}>/ {quotaMetrics.totalCount}</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('Shutoff')} Instances</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#64748b' }}>
              {quotaMetrics.shutoffCount}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Modernized BaseTable integrating MagicInput, ItemActionButtons, and Batch Actions */}
      <BaseTable
        columns={columns}
        dataSource={instances}
        loading={loading || actionLoading}
        rowKey="id"
        filterParams={filterParams}
        filters={magicFilters}
        onFilterChange={setMagicFilters}
        onRefresh={refetch}
        primaryAction={{
          id: 'create',
          label: `${t('Create')} ${t('Instances')}`,
          icon: <PlusOutlined />,
          onClick: () => setIsCreateModalOpen(true),
        }}
        rowActions={rowActions}
        batchActions={batchActions}
        selectedRowKeys={selectedRowKeys}
        onSelectChange={setSelectedRowKeys}
        isAdmin={isAdmin}
        onActionClick={handleAction}
      />

      {/* Dynamic Action Modal (Mounts AttachVolume, Resize, Snapshot, Password, etc.) */}
      {actionModal}

      {/* Comprehensive Launch / Create Instance Modal */}
      <CreateInstanceModal
        open={isCreateModalOpen}
        preset={createPreset}
        onCancel={() => {
          setIsCreateModalOpen(false);
          if (createPreset) setSearchParams({}, { replace: true });
        }}
        onSuccess={() => {
          setIsCreateModalOpen(false);
          if (createPreset) setSearchParams({}, { replace: true });
          refetch();
        }}
      />
    </div>
  );
}
