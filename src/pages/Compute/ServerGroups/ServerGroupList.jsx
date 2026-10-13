import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  message,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  DeleteOutlined,
  ClusterOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { novaApi } from '@/api/nova';
import BaseTable from '@/components/Tables/BaseTable';
import { useTranslation } from '@/core/i18n';

const POLICY_LABELS = {
  affinity: 'Affinity (Cùng Host vật lý)',
  'anti-affinity': 'Anti-affinity (Khác Host vật lý)',
  'soft-affinity': 'Soft Affinity (Ưu tiên cùng Host)',
  'soft-anti-affinity': 'Soft Anti-affinity (Ưu tiên khác Host)',
};

const POLICY_COLORS = {
  affinity: 'blue',
  'anti-affinity': 'volcano',
  'soft-affinity': 'cyan',
  'soft-anti-affinity': 'orange',
};

export default function ServerGroupList() {
  const { t } = useTranslation();
  const [serverGroups, setServerGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [magicFilters, setMagicFilters] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchServerGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await novaApi.listServerGroups();
      const groups = res?.server_groups || res?.data?.server_groups || [];
      setServerGroups(groups);
    } catch (err) {
      message.error(err.message || t('Failed to fetch server groups'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchServerGroups();
  }, [fetchServerGroups]);

  const filterParams = useMemo(
    () => [
      { name: 'name', label: t('Name') },
      {
        name: 'policy',
        label: t('Policy'),
        options: [
          { key: 'affinity', label: 'Affinity' },
          { key: 'anti-affinity', label: 'Anti-affinity' },
          { key: 'soft-affinity', label: 'Soft Affinity' },
          { key: 'soft-anti-affinity', label: 'Soft Anti-affinity' },
        ],
      },
    ],
    [t]
  );

  const handleCreate = async (values) => {
    try {
      await novaApi.createServerGroup({
        name: values.name,
        policies: [values.policy],
      });
      message.success(t('Server group created successfully'));
      setIsModalOpen(false);
      form.resetFields();
      fetchServerGroups();
    } catch (err) {
      message.error(err.message || t('Failed to create server group'));
    }
  };

  const handleDeleteOne = (record) => {
    Modal.confirm({
      title: `${t('Delete Server Group')}: ${record.name}?`,
      content: t('Are you sure you want to delete this server group?'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        await novaApi.deleteServerGroup(record.id);
        message.success(t('Server group deleted'));
        fetchServerGroups();
      },
    });
  };

  const handleBatchDelete = (keys) => {
    Modal.confirm({
      title: `${t('Batch Delete')} ${keys.length} ${t('Server Groups')}?`,
      content: t('Are you sure you want to delete these server groups?'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        await Promise.all(keys.map((id) => novaApi.deleteServerGroup(id)));
        message.success(t('Server groups deleted successfully'));
        setSelectedRowKeys([]);
        fetchServerGroups();
      },
    });
  };

  const rowActions = {
    firstAction: {
      id: 'delete',
      title: t('Delete'),
      isDanger: true,
      onClick: handleDeleteOne,
    },
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
          <ClusterOutlined style={{ color: '#0068ff' }} />
          <span style={{ fontWeight: 600, color: '#0068ff' }}>{text}</span>
        </Space>
      ),
    },
    {
      title: t('Policy'),
      dataIndex: 'policies',
      key: 'policies',
      render: (policies) => {
        const pol = Array.isArray(policies) ? policies[0] : policies;
        return (
          <Tag color={POLICY_COLORS[pol] || 'blue'} style={{ borderRadius: 10, fontWeight: 600 }}>
            {POLICY_LABELS[pol] || pol}
          </Tag>
        );
      },
    },
    {
      title: t('Instances Count'),
      dataIndex: 'members',
      key: 'members',
      render: (members) => {
        const count = Array.isArray(members) ? members.length : 0;
        return <span><b>{count}</b> {t('instances')}</span>;
      },
    },
    {
      title: 'UUID',
      dataIndex: 'id',
      key: 'id',
      render: (id) => <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>{id}</span>,
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb items={[{ title: t('Compute') }, { title: t('Server Groups') }]} style={{ marginBottom: 6 }} />
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0f172a' }}>{t('Server Groups')}</h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
          {t('Manage placement policies (Affinity / Anti-affinity) for compute instances across physical hosts.')}
        </p>
      </div>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('Total Groups')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#0068ff' }}>{serverGroups.length}</div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Anti-affinity Groups</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#f97316' }}>
              {serverGroups.filter((g) => (g.policies || []).includes('anti-affinity')).length}
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Affinity Groups</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#3b82f6' }}>
              {serverGroups.filter((g) => (g.policies || []).includes('affinity')).length}
            </div>
          </Card>
        </Col>
      </Row>

      {/* BaseTable */}
      <BaseTable
        columns={columns}
        dataSource={serverGroups}
        loading={loading}
        rowKey="id"
        filterParams={filterParams}
        filters={magicFilters}
        onFilterChange={setMagicFilters}
        onRefresh={fetchServerGroups}
        primaryAction={{
          id: 'create-server-group',
          label: `${t('Create')} ${t('Server Group')}`,
          icon: <PlusOutlined />,
          onClick: () => setIsModalOpen(true),
        }}
        rowActions={rowActions}
        batchActions={batchActions}
        selectedRowKeys={selectedRowKeys}
        onSelectChange={setSelectedRowKeys}
      />

      {/* Create Modal */}
      <Modal
        title={`${t('Create')} ${t('Server Group')}`}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ policy: 'anti-affinity' }}>
          <Form.Item name="name" label={t('Name')} rules={[{ required: true, message: t('Please input name') }]}>
            <Input placeholder="ha-db-cluster-group" />
          </Form.Item>

          <Form.Item
            name="policy"
            label={t('Policy')}
            rules={[{ required: true }]}
            extra={
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                <InfoCircleOutlined style={{ marginRight: 4 }} />
                Anti-affinity đảm bảo các máy ảo trong cùng nhóm phân tán trên các máy chủ vật lý khác nhau để dự phòng lỗi phần cứng.
              </div>
            }
          >
            <Select
              options={[
                { value: 'anti-affinity', label: 'Anti-affinity (Phân tán khác Host vật lý - Khuyên dùng)' },
                { value: 'affinity', label: 'Affinity (Tập trung trên cùng một Host vật lý)' },
                { value: 'soft-anti-affinity', label: 'Soft Anti-affinity (Ưu tiên phân tán khác Host)' },
                { value: 'soft-affinity', label: 'Soft Affinity (Ưu tiên cùng Host)' },
              ]}
            />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <Button onClick={() => setIsModalOpen(false)}>{t('Cancel')}</Button>
            <Button type="primary" htmlType="submit" style={{ background: '#0068ff' }}>
              {t('Create')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
