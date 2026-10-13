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
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  DeleteOutlined,
  BlockOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import { novaApi } from '@/api/nova';
import BaseTable from '@/components/Tables/BaseTable';
import { useTranslation } from '@/core/i18n';

export default function AggregateList() {
  const { t } = useTranslation();
  const [aggregates, setAggregates] = useState([]);
  const [hypervisors, setHypervisors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [magicFilters, setMagicFilters] = useState({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [hostModal, setHostModal] = useState({ open: false, aggregate: null });

  const [createForm] = Form.useForm();
  const [hostForm] = Form.useForm();

  const fetchAggregates = useCallback(async () => {
    setLoading(true);
    try {
      const [aggRes, hypRes] = await Promise.allSettled([
        novaApi.listAggregates(),
        novaApi.listHypervisors(),
      ]);

      if (aggRes.status === 'fulfilled') {
        const list = aggRes.value?.aggregates || aggRes.value?.data?.aggregates || [];
        setAggregates(list);
      }
      if (hypRes.status === 'fulfilled') {
        const hyps = hypRes.value?.hypervisors || hypRes.value?.data?.hypervisors || [];
        setHypervisors(hyps);
      }
    } catch (err) {
      message.error(err.message || t('Failed to fetch host aggregates'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAggregates();
  }, [fetchAggregates]);

  const filterParams = useMemo(
    () => [
      { name: 'name', label: t('Name') },
      { name: 'availability_zone', label: t('Availability Zone') },
    ],
    [t]
  );

  const handleCreate = async (values) => {
    try {
      await novaApi.createAggregate({
        name: values.name,
        availability_zone: values.availability_zone || 'nova',
      });
      message.success(t('Aggregate created successfully'));
      setIsCreateOpen(false);
      createForm.resetFields();
      fetchAggregates();
    } catch (err) {
      message.error(err.message || t('Failed to create aggregate'));
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: `${t('Delete Aggregate')}: ${record.name}?`,
      content: t('Are you sure you want to delete this host aggregate?'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await novaApi.deleteAggregate(record.id);
          message.success(t('Aggregate deleted'));
          fetchAggregates();
        } catch (err) {
          message.error(err.message || t('Failed to delete aggregate'));
        }
      },
    });
  };

  const handleAddHost = async (values) => {
    try {
      await novaApi.addHostToAggregate(hostModal.aggregate.id, values.host);
      message.success(t('Host added to aggregate'));
      setHostModal({ open: false, aggregate: null });
      hostForm.resetFields();
      fetchAggregates();
    } catch (err) {
      message.error(err.message || t('Failed to add host'));
    }
  };

  const handleRemoveHost = async (aggregate, host) => {
    try {
      await novaApi.removeHostFromAggregate(aggregate.id, host);
      message.success(t('Host removed from aggregate'));
      fetchAggregates();
    } catch (err) {
      message.error(err.message || t('Failed to remove host'));
    }
  };

  const rowActions = {
    firstAction: {
      id: 'add-host',
      title: t('Manage Hosts'),
      onClick: (record) => setHostModal({ open: true, aggregate: record }),
    },
    moreActions: [
      {
        action: {
          id: 'delete',
          title: t('Delete'),
          isDanger: true,
          onClick: handleDelete,
        },
      },
    ],
  };

  const columns = [
    {
      title: t('Name'),
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (text) => (
        <Space>
          <BlockOutlined style={{ color: '#0068ff' }} />
          <span style={{ fontWeight: 600, color: '#0068ff' }}>{text}</span>
        </Space>
      ),
    },
    {
      title: t('Availability Zone'),
      dataIndex: 'availability_zone',
      key: 'availability_zone',
      render: (az) => (
        <Tag color="geekblue" style={{ borderRadius: 10 }}>
          {az || 'nova'}
        </Tag>
      ),
    },
    {
      title: t('Hosts'),
      dataIndex: 'hosts',
      key: 'hosts',
      render: (hosts, record) => {
        if (!hosts || hosts.length === 0) return <span style={{ color: '#94a3b8' }}>-</span>;
        return (
          <Space wrap size={4}>
            {hosts.map((h) => (
              <Tag
                key={h}
                closable
                onClose={(e) => {
                  e.preventDefault();
                  handleRemoveHost(record, h);
                }}
                style={{ borderRadius: 6, fontSize: 11 }}
              >
                {h}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: t('Hosts Count'),
      key: 'hosts_count',
      render: (_, r) => <span><b>{r.hosts ? r.hosts.length : 0}</b> hosts</span>,
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb items={[{ title: t('Compute') }, { title: t('Host Aggregates') }]} style={{ marginBottom: 6 }} />
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0f172a' }}>{t('Host Aggregates')}</h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
          {t('Group physical compute hosts into logical aggregates and availability zones with specific metadata tags.')}
        </p>
      </div>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('Total Aggregates')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#0068ff' }}>{aggregates.length}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>Total Associated Hosts</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#10b981' }}>
              {aggregates.reduce((acc, a) => acc + (a.hosts?.length || 0), 0)}
            </div>
          </Card>
        </Col>
      </Row>

      {/* BaseTable */}
      <BaseTable
        columns={columns}
        dataSource={aggregates}
        loading={loading}
        rowKey="id"
        filterParams={filterParams}
        filters={magicFilters}
        onFilterChange={setMagicFilters}
        onRefresh={fetchAggregates}
        primaryAction={{
          id: 'create-aggregate',
          label: `${t('Create')} ${t('Host Aggregate')}`,
          icon: <PlusOutlined />,
          onClick: () => setIsCreateOpen(true),
        }}
        rowActions={rowActions}
      />

      {/* Create Modal */}
      <Modal
        title={`${t('Create')} ${t('Host Aggregate')}`}
        open={isCreateOpen}
        onCancel={() => setIsCreateOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} initialValues={{ availability_zone: 'nova' }}>
          <Form.Item name="name" label={t('Name')} rules={[{ required: true, message: t('Please input name') }]}>
            <Input placeholder="compute-aggregate-01" />
          </Form.Item>
          <Form.Item name="availability_zone" label={t('Availability Zone')} rules={[{ required: true }]}>
            <Input placeholder="nova" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <Button onClick={() => setIsCreateOpen(false)}>{t('Cancel')}</Button>
            <Button type="primary" htmlType="submit" style={{ background: '#0068ff' }}>
              {t('Create')}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Add Host Modal */}
      <Modal
        title={`${t('Add Host to')}: ${hostModal.aggregate?.name}`}
        open={hostModal.open}
        onCancel={() => setHostModal({ open: false, aggregate: null })}
        footer={null}
        destroyOnHidden
      >
        <Form form={hostForm} layout="vertical" onFinish={handleAddHost}>
          <Form.Item name="host" label={t('Compute Host')} rules={[{ required: true, message: 'Please select host' }]}>
            <Select
              placeholder="Select compute host..."
              options={hypervisors.map((h) => ({
                label: `${h.hypervisor_hostname} (${h.state}/${h.status})`,
                value: h.service?.host || h.hypervisor_hostname,
              }))}
            />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button onClick={() => setHostModal({ open: false, aggregate: null })}>{t('Cancel')}</Button>
            <Button type="primary" htmlType="submit" style={{ background: '#0068ff' }}>
              {t('Add Host')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
