import React, { useState } from 'react';
import {
  Breadcrumb,
  Button,
  Card,
  Table,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Dropdown,
  message,
  Tooltip,
  Row,
  Col,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  CameraOutlined,
  CopyOutlined,
  MoreOutlined,
  HddOutlined,
  DeleteOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useSnapshots } from '@/hooks/useSnapshots';
import { useTranslation } from '@/core/i18n';

export default function SnapshotList() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const {
    snapshots,
    rawSnapshots,
    availableVolumes,
    loading,
    actionLoading,
    isLiveApi,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    refetch,
    createSnapshot,
    deleteSnapshot,
  } = useSnapshots();

  const handleCreate = async (values) => {
    const res = await createSnapshot(values);
    if (res.success) {
      setIsModalOpen(false);
      form.resetFields();
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: `${t('Delete Snapshot')} ${record.name}?`,
      content: t('Are you sure you want to delete this volume snapshot?'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      confirmLoading: actionLoading,
      onOk: () => deleteSnapshot(record.id, record.name),
    });
  };

  const getStatusTag = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'available') {
      return (
        <Tag color="success" icon={<CheckCircleOutlined />}>
          {t('Available')}
        </Tag>
      );
    }
    if (s.includes('error')) {
      return (
        <Tag color="error" icon={<CloseCircleOutlined />}>
          {status}
        </Tag>
      );
    }
    if (s.includes('ing')) {
      return (
        <Tag color="warning" icon={<ClockCircleOutlined />}>
          {status}
        </Tag>
      );
    }
    return <Tag>{status}</Tag>;
  };

  const columns = [
    {
      title: t('ID/Name'),
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <Space size={6}>
            <CameraOutlined style={{ color: '#0068ff' }} />
            <span style={{ fontWeight: 600, color: '#0068ff' }}>{text}</span>
          </Space>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>ID: {record.id}</span>
            <Tooltip title={t('Copy')}>
              <CopyOutlined
                style={{ cursor: 'pointer', color: '#64748b' }}
                onClick={() => {
                  navigator.clipboard.writeText(record.id);
                  message.success(t('Copied'));
                }}
              />
            </Tooltip>
          </div>
        </div>
      ),
    },
    {
      title: t('Volume ID/Name'),
      dataIndex: 'volumeName',
      key: 'volumeName',
      render: (volName, record) => (
        <Space size={4}>
          <HddOutlined style={{ color: '#64748b' }} />
          <span style={{ fontSize: 13, color: '#0f172a' }}>{volName || record.volumeId}</span>
        </Space>
      ),
    },
    {
      title: t('Size'),
      dataIndex: 'size',
      key: 'size',
      sorter: (a, b) => a.size - b.size,
      render: (size) => <span style={{ fontWeight: 700 }}>{size} GiB</span>,
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      render: (status) => getStatusTag(status),
    },
    {
      title: t('Created At'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time) => <span style={{ color: '#64748b', fontSize: 12 }}>{time}</span>,
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'right',
      render: (_, record) => (
        <Dropdown
          menu={{
            items: [
              {
                key: 'delete',
                danger: true,
                icon: <DeleteOutlined />,
                label: t('Delete'),
                onClick: () => handleDelete(record),
              },
            ],
          }}
        >
          <Button type="text" size="small" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { title: t('Storage') },
          { title: t('Volume Snapshots') },
        ]}
        style={{ marginBottom: 16, fontSize: 13 }}
      />

      {/* Header Title & Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0f172a' }}>
            {t('Volume Snapshots')}
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            {t('Point-in-time copies of persistent block storage volumes.')}
          </p>
        </div>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={refetch} loading={loading}>
            {t('Refresh')}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalOpen(true)}
            style={{ backgroundColor: '#0068ff', borderRadius: 8, fontWeight: 600 }}
          >
            {t('Create Snapshot')}
          </Button>
        </Space>
      </div>

      {/* Metric Cards Banner */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ borderRadius: 8, borderColor: '#e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{t('Total Snapshots')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              {snapshots.length}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ borderRadius: 8, borderColor: '#e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{t('Total Size')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0068ff', marginTop: 4 }}>
              {snapshots.reduce((acc, curr) => acc + (curr.size || 0), 0)}{' '}
              <span style={{ fontSize: 14, fontWeight: 500 }}>GiB</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ borderRadius: 8, borderColor: '#e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{t('Available')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981', marginTop: 4 }}>
              {snapshots.filter((s) => s.status === 'available').length}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card
        variant="borderless"
        style={{
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <Input
            placeholder={t('Search by Name, ID, or Source Volume...')}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 320, borderRadius: 8 }}
            allowClear
          />

          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 160 }}
            options={[
              { value: 'ALL', label: t('All Status') },
              { value: 'available', label: t('Available') },
              { value: 'error', label: t('Error') },
            ]}
          />
        </div>

        <Table
          columns={columns}
          dataSource={snapshots}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          rowKey="id"
        />
      </Card>

      {/* Create Snapshot Modal */}
      <Modal
        title={t('Create Snapshot')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="name"
            label={t('Name')}
            rules={[{ required: true, message: t('Please input snapshot name!') }]}
          >
            <Input placeholder="snapshot-volume-01" />
          </Form.Item>

          <Form.Item
            name="volume_id"
            label={t('Source Volume')}
            rules={[{ required: true, message: t('Please select source volume!') }]}
          >
            <Select
              placeholder={t('Select Volume')}
              options={availableVolumes.map((v) => ({
                label: `${v.name || v.id} (${v.size} GiB - ${v.volume_type || 'ssd'})`,
                value: v.id,
              }))}
            />
          </Form.Item>

          <Form.Item name="description" label={t('Description')}>
            <Input.TextArea rows={2} placeholder={t('Description')} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <Button onClick={() => setIsModalOpen(false)}>{t('Cancel')}</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={actionLoading}
              style={{ backgroundColor: '#0068ff' }}
            >
              {t('Create')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
