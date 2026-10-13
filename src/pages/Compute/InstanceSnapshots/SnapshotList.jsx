import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Breadcrumb,
  Button,
  Card,
  Col,
  Row,
  Tag,
  Space,
  Modal,
  message,
} from 'antd';
import {
  ReloadOutlined,
  DeleteOutlined,
  CameraOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { glanceApi } from '@/api/glance';
import BaseTable from '@/components/Tables/BaseTable';
import Status from '@/components/Status';
import { useTranslation } from '@/core/i18n';

export default function InstanceSnapshotList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [magicFilters, setMagicFilters] = useState({});

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await glanceApi.listImages();
      const allImages = res?.images || res?.data?.images || [];
      // Filter images that are instance snapshots
      const list = allImages.filter(
        (img) => img.image_type === 'snapshot' || img.instance_uuid || (img.name && img.name.includes('-snapshot'))
      );
      // Fallback: if no strict image_type === 'snapshot' found, list snapshot-like images or all custom images
      setSnapshots(list.length > 0 ? list : allImages.filter((img) => img.image_type === 'snapshot'));
    } catch (err) {
      message.error(err.message || t('Failed to fetch instance snapshots'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const filterParams = useMemo(
    () => [
      { name: 'name', label: t('Name') },
      {
        name: 'status',
        label: t('Status'),
        options: [
          { key: 'active', label: 'Active' },
          { key: 'queued', label: 'Queued' },
          { key: 'saving', label: 'Saving' },
        ],
      },
    ],
    [t]
  );

  const handleDeleteOne = (record) => {
    Modal.confirm({
      title: `${t('Delete Snapshot')}: ${record.name}?`,
      content: t('Are you sure you want to delete this instance snapshot?'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        await glanceApi.deleteImage(record.id);
        message.success(t('Snapshot deleted'));
        fetchSnapshots();
      },
    });
  };

  const handleBatchDelete = (keys) => {
    Modal.confirm({
      title: `${t('Batch Delete')} ${keys.length} ${t('Snapshots')}?`,
      content: t('Are you sure you want to delete these snapshots?'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        await Promise.all(keys.map((id) => glanceApi.deleteImage(id)));
        message.success(t('Snapshots deleted successfully'));
        setSelectedRowKeys([]);
        fetchSnapshots();
      },
    });
  };

  const rowActions = {
    firstAction: {
      id: 'create-instance',
      title: t('Create Instance'),
      onClick: (record) => {
        navigate(`/compute/instance?imageId=${record.id}`);
      },
    },
    moreActions: [
      {
        action: {
          id: 'delete',
          title: t('Delete'),
          isDanger: true,
          onClick: handleDeleteOne,
        },
      },
    ],
  };

  const batchActions = [
    {
      id: 'batch-delete',
      label: t('Batch Delete'),
      danger: true,
      onClick: handleBatchDelete,
    },
  ];

  const columns = [
    {
      title: t('Name'),
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (text) => (
        <Space>
          <CameraOutlined style={{ color: '#0068ff' }} />
          <span style={{ fontWeight: 600, color: '#0068ff' }}>{text}</span>
        </Space>
      ),
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      render: (status) => <Status status={status} />,
    },
    {
      title: t('Disk Format'),
      dataIndex: 'disk_format',
      key: 'disk_format',
      render: (fmt) => (
        <Tag color="cyan" style={{ textTransform: 'uppercase', borderRadius: 8 }}>
          {fmt || 'RAW'}
        </Tag>
      ),
    },
    {
      title: t('Size'),
      dataIndex: 'size',
      key: 'size',
      render: (bytes) => {
        if (!bytes) return '-';
        const gib = (bytes / (1024 * 1024 * 1024)).toFixed(2);
        return `${gib} GiB`;
      },
    },
    {
      title: t('Created At'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (dateStr) => <span style={{ fontSize: 12, color: '#94a3b8' }}>{dateStr?.substring(0, 19).replace('T', ' ')}</span>,
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb items={[{ title: t('Compute') }, { title: t('Instance Snapshots') }]} style={{ marginBottom: 6 }} />
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0f172a' }}>{t('Instance Snapshots')}</h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
          {t('Manage instance disk snapshots created from compute virtual machines.')}
        </p>
      </div>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('Total Snapshots')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#0068ff' }}>{snapshots.length}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('Active')} Snapshots</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#10b981' }}>
              {snapshots.filter((s) => s.status === 'active').length}
            </div>
          </Card>
        </Col>
      </Row>

      {/* BaseTable */}
      <BaseTable
        columns={columns}
        dataSource={snapshots}
        loading={loading}
        rowKey="id"
        filterParams={filterParams}
        filters={magicFilters}
        onFilterChange={setMagicFilters}
        onRefresh={fetchSnapshots}
        rowActions={rowActions}
        batchActions={batchActions}
        selectedRowKeys={selectedRowKeys}
        onSelectChange={setSelectedRowKeys}
      />
    </div>
  );
}
