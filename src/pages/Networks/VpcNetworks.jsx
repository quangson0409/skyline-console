import React, { useState, useEffect, useCallback } from 'react';
import {
  Breadcrumb,
  Button,
  Card,
  Col,
  Row,
  Select,
  Table,
  Space,
  Modal,
  Form,
  Input,
  message,
  Tooltip,
  Tag,
} from 'antd';
import {
  ApartmentOutlined,
  ReloadOutlined,
  PlusOutlined,
  CopyOutlined,
  DeleteOutlined,
  SearchOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { neutronApi } from '@/api/neutron';
import { useTranslation } from '@/core/i18n';

export default function VpcNetworks() {
  const { t } = useTranslation();
  const [networks, setNetworks] = useState([]);
  const [subnetsMap, setSubnetsMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchNetworks = useCallback(async () => {
    setLoading(true);
    try {
      const [netsRes, subsRes] = await Promise.allSettled([
        neutronApi.listNetworks(),
        neutronApi.listSubnets(),
      ]);

      const subMap = {};
      if (subsRes.status === 'fulfilled' && subsRes.value?.subnets) {
        subsRes.value.subnets.forEach((s) => {
          subMap[s.id] = s;
        });
        setSubnetsMap(subMap);
      }

      if (netsRes.status === 'fulfilled' && netsRes.value?.networks) {
        const normalized = netsRes.value.networks.map((n) => {
          const cidrs = (n.subnets || []).map((sId) => subMap[sId]?.cidr).filter(Boolean);
          return {
            key: n.id,
            id: n.id,
            shortId: n.id.substring(0, 8) + '...',
            name: n.name || n.id,
            cidr: cidrs.length > 0 ? cidrs.join(', ') : '-',
            isExternal: Boolean(n['router:external']),
            shared: Boolean(n.shared),
            status: n.status || 'ACTIVE',
            subnetsCount: (n.subnets || []).length,
          };
        });
        setNetworks(normalized);
      }
    } catch (err) {
      message.error(t('Failed to load Networks: ') + err.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchNetworks();
  }, [fetchNetworks]);

  const handleCreate = async (values) => {
    try {
      await neutronApi.createNetwork({
        name: values.name,
        admin_state_up: true,
      });
      message.success(t('Network created successfully!'));
      setIsModalOpen(false);
      form.resetFields();
      fetchNetworks();
    } catch (err) {
      message.error(t('Failed to create network: ') + err.message);
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: `${t('Delete Network')} ${record.name}?`,
      content: t('Are you sure you want to delete this network? All attached ports and subnets will be removed.'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await neutronApi.deleteNetwork(record.id);
          message.success(t('Network deleted successfully'));
          fetchNetworks();
        } catch (err) {
          message.error(t('Failed to delete network: ') + err.message);
        }
      },
    });
  };

  const filteredNetworks = networks.filter((n) => {
    const q = searchText.toLowerCase().trim();
    const matchSearch =
      !q ||
      n.name.toLowerCase().includes(q) ||
      n.id.toLowerCase().includes(q) ||
      n.cidr.toLowerCase().includes(q);

    const matchType =
      typeFilter === 'ALL' ||
      (typeFilter === 'EXTERNAL' && n.isExternal) ||
      (typeFilter === 'INTERNAL' && !n.isExternal);

    return matchSearch && matchType;
  });

  const columns = [
    {
      title: 'ID',
      dataIndex: 'shortId',
      key: 'id',
      render: (shortId, record) => (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            padding: '2px 8px',
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        >
          <span>{shortId}</span>
          <Tooltip title={t('Copy')}>
            <CopyOutlined
              style={{ cursor: 'pointer', color: '#94a3b8' }}
              onClick={() => {
                navigator.clipboard.writeText(record.id);
                message.success(t('Copied'));
              }}
            />
          </Tooltip>
        </div>
      ),
    },
    {
      title: t('Name'),
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <Space size={8}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: '#e0f2fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ApartmentOutlined style={{ color: '#0068ff', fontSize: 13 }} />
          </div>
          <span style={{ color: '#0068ff', fontWeight: 600 }}>{text}</span>
        </Space>
      ),
    },
    {
      title: 'Subnet CIDR',
      dataIndex: 'cidr',
      key: 'cidr',
      render: (text) => (
        <span style={{ color: '#0f172a', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
          {text}
        </span>
      ),
    },
    {
      title: t('Type'),
      dataIndex: 'isExternal',
      key: 'isExternal',
      render: (ext) =>
        ext ? (
          <Tag color="cyan" icon={<GlobalOutlined />}>
            External (Gateway)
          </Tag>
        ) : (
          <Tag color="blue">Internal (Private)</Tag>
        ),
    },
    {
      title: t('Shared'),
      dataIndex: 'shared',
      key: 'shared',
      render: (shared) => (shared ? <Tag color="purple">{t('Yes')}</Tag> : <Tag>{t('No')}</Tag>),
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      render: (status) =>
        status === 'ACTIVE' ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            {t('Active')}
          </Tag>
        ) : (
          <Tag color="error" icon={<StopOutlined />}>
            {status}
          </Tag>
        ),
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'right',
      render: (_, record) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => handleDelete(record)}
        >
          {t('Delete')}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { title: t('Network') },
          { title: t('Networks') },
        ]}
        style={{ marginBottom: 16, fontSize: 13 }}
      />

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
            {t('Networks')}
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            {t('Software-defined networks (SDN) powered by OpenStack Neutron.')}
          </p>
        </div>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchNetworks} loading={loading}>
            {t('Refresh')}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalOpen(true)}
            style={{ backgroundColor: '#0068ff', borderRadius: 8, fontWeight: 600 }}
          >
            {t('Create Network')}
          </Button>
        </Space>
      </div>

      <Card
        variant="borderless"
        style={{
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <Input
            placeholder={t('Search by Name, ID, or CIDR...')}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300, borderRadius: 8 }}
            allowClear
          />

          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: 180 }}
            options={[
              { value: 'ALL', label: t('All Types') },
              { value: 'INTERNAL', label: 'Internal (Private)' },
              { value: 'EXTERNAL', label: 'External (Gateway)' },
            ]}
          />
        </div>

        <Table
          columns={columns}
          dataSource={filteredNetworks}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey="id"
        />
      </Card>

      <Modal
        title={t('Create Network')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="name"
            label={t('Name')}
            rules={[{ required: true, message: t('Please input network name!') }]}
          >
            <Input placeholder="my-private-net" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <Button onClick={() => setIsModalOpen(false)}>{t('Cancel')}</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#0068ff' }}>
              {t('Create')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
