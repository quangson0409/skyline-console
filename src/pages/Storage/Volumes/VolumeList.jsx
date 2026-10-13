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
  InputNumber,
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
  HddOutlined,
  CopyOutlined,
  MoreOutlined,
  PaperClipOutlined,
  DeleteOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useVolumes } from '@/hooks/useVolumes';
import { useTranslation } from '@/core/i18n';

export default function VolumeList() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const {
    volumes,
    rawVolumes,
    volumeTypes,
    loading,
    actionLoading,
    isLiveApi,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    refetch,
    createVolume,
    deleteVolume,
    metrics,
  } = useVolumes();

  const handleCreate = async (values) => {
    const res = await createVolume(values);
    if (res.success) {
      setIsModalOpen(false);
      form.resetFields();
    }
  };

  const handleDelete = (record) => {
    if (record.status === 'in-use') {
      message.error(t('Cannot delete volume in-use. Please detach it first.'));
      return;
    }

    Modal.confirm({
      title: `${t('Delete Volume')} ${record.name}?`,
      content: t('Are you sure you want to delete this volume? This action cannot be undone.'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      confirmLoading: actionLoading,
      onOk: () => deleteVolume(record.id, record.name),
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
    if (s === 'in-use') {
      return (
        <Tag color="processing" icon={<ClockCircleOutlined />}>
          {t('In-use')}
        </Tag>
      );
    }
    if (s === 'creating' || s === 'downloading' || s === 'attaching') {
      return (
        <Tag color="warning" icon={<ClockCircleOutlined />}>
          {status}
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
            <HddOutlined style={{ color: '#0068ff' }} />
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
      title: t('Type'),
      dataIndex: 'type',
      key: 'type',
      render: (type) => <Tag color="geekblue">{type}</Tag>,
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
      title: t('Shared'),
      dataIndex: 'multiattach',
      key: 'multiattach',
      render: (multi) => (multi ? <Tag color="purple">{t('Yes')}</Tag> : <Tag>{t('No')}</Tag>),
    },
    {
      title: t('Attached To'),
      dataIndex: 'attachedTo',
      key: 'attachedTo',
      render: (attached, record) => {
        if (record.attachments && record.attachments.length > 0) {
          return (
            <div>
              {record.attachments.map((att, idx) => (
                <Space key={idx} size={4} style={{ display: 'flex', marginBottom: 2 }}>
                  <PaperClipOutlined style={{ color: '#10b981' }} />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>
                    {att.device || 'disk'} {t('on')} {att.hostName || att.serverId?.substring(0, 8)}
                  </span>
                </Space>
              ))}
            </div>
          );
        }
        return <span style={{ color: '#94a3b8', fontSize: 12 }}>-</span>;
      },
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
                disabled: record.status === 'in-use',
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
          { title: t('Volumes') },
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
            {t('Volumes')}
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            {t('Persistent block storage volumes for compute instances.')}
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
            {t('Create Volume')}
          </Button>
        </Space>
      </div>

      {/* Metric Cards Banner */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8, borderColor: '#e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{t('Total Volumes')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              {metrics.total}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8, borderColor: '#e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{t('Total Allocated Size')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0068ff', marginTop: 4 }}>
              {metrics.totalSize} <span style={{ fontSize: 14, fontWeight: 500 }}>GiB</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8, borderColor: '#e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{t('In-use')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981', marginTop: 4 }}>
              {metrics.inUseCount}
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 8, borderColor: '#e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{t('Available')}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#6366f1', marginTop: 4 }}>
              {metrics.availableCount}
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
            placeholder={t('Search by Name, ID, or Type...')}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280, borderRadius: 8 }}
            allowClear
          />

          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 160 }}
            options={[
              { value: 'ALL', label: t('All Status') },
              { value: 'available', label: t('Available') },
              { value: 'in-use', label: t('In-use') },
              { value: 'error', label: t('Error') },
            ]}
          />
        </div>

        <Table
          columns={columns}
          dataSource={volumes}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          rowKey="id"
        />
      </Card>

      {/* Create Volume Modal */}
      <Modal
        title={t('Create Volume')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{
            size: 20,
            type: volumeTypes[0]?.name || 'ssd',
          }}
        >
          <Form.Item
            name="name"
            label={t('Name')}
            rules={[{ required: true, message: t('Please input volume name!') }]}
          >
            <Input placeholder="my-volume-01" />
          </Form.Item>

          <Form.Item
            name="size"
            label={`${t('Size')} (GiB)`}
            rules={[{ required: true, message: t('Please input size!') }]}
          >
            <InputNumber min={1} max={10000} step={10} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="type"
            label={t('Volume Type')}
            rules={[{ required: true, message: t('Please select volume type!') }]}
          >
            <Select
              options={
                volumeTypes.length > 0
                  ? volumeTypes.map((vt) => ({
                      label: `${vt.name} (${vt.description || 'Volume Type'})`,
                      value: vt.name,
                    }))
                  : [
                      { label: 'ssd (block storage ssd)', value: 'ssd' },
                      { label: 'hdd (block storage hdd)', value: 'hdd' },
                      { label: '__DEFAULT__ (Default Type)', value: '__DEFAULT__' },
                    ]
              }
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
