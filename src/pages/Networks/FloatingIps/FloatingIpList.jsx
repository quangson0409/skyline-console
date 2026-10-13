import React, { useState, useEffect, useCallback } from 'react';
import {
  Breadcrumb,
  Button,
  Card,
  Table,
  Tag,
  Space,
  Modal,
  Form,
  Select,
  message,
  Tooltip,
  Input,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  GlobalOutlined,
  CopyOutlined,
  DeleteOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { neutronApi } from '@/api/neutron';
import { useTranslation } from '@/core/i18n';

export default function FloatingIpList() {
  const { t } = useTranslation();
  const [fips, setFips] = useState([]);
  const [externalNetworks, setExternalNetworks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  const fetchFips = useCallback(async () => {
    setLoading(true);
    try {
      const [fipRes, netRes] = await Promise.allSettled([
        neutronApi.listFloatingIps(),
        neutronApi.listNetworks({ 'router:external': true }),
      ]);

      if (fipRes.status === 'fulfilled' && fipRes.value?.floatingips) {
        const normalized = fipRes.value.floatingips.map((f) => ({
          key: f.id,
          id: f.id,
          ip: f.floating_ip_address,
          pool: f.floating_network_id,
          fixedIp: f.fixed_ip_address,
          portId: f.port_id,
          status: f.status || 'DOWN',
          description: f.description || '',
        }));
        setFips(normalized);
      }

      if (netRes.status === 'fulfilled' && netRes.value?.networks) {
        setExternalNetworks(netRes.value.networks);
      }
    } catch (err) {
      message.error(t('Failed to load Floating IPs: ') + err.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchFips();
  }, [fetchFips]);

  const handleAllocate = async (values) => {
    try {
      await neutronApi.createFloatingIp({
        floating_network_id: values.network_id,
        description: values.description || '',
      });
      message.success(t('Allocated Floating IP successfully!'));
      setIsModalOpen(false);
      form.resetFields();
      fetchFips();
    } catch (err) {
      message.error(t('Failed to allocate Floating IP: ') + err.message);
    }
  };

  const handleRelease = (record) => {
    Modal.confirm({
      title: `${t('Release Floating IP')} ${record.ip}?`,
      content: t('Are you sure you want to release this Floating IP back to the public pool?'),
      okText: t('Release'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await neutronApi.deleteFloatingIp(record.id);
          message.success(t('Released Floating IP successfully'));
          fetchFips();
        } catch (err) {
          message.error(t('Failed to release Floating IP: ') + err.message);
        }
      },
    });
  };

  const filteredFips = fips.filter((f) => {
    const q = searchText.toLowerCase().trim();
    if (!q) return true;
    return (
      f.ip.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q) ||
      (f.fixedIp && f.fixedIp.includes(q))
    );
  });

  const columns = [
    {
      title: t('IP Address'),
      dataIndex: 'ip',
      key: 'ip',
      render: (ip, record) => (
        <div>
          <Space size={6}>
            <GlobalOutlined style={{ color: '#0068ff' }} />
            <span style={{ fontWeight: 600, color: '#0068ff' }}>{ip}</span>
          </Space>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>ID: {record.id}</span>
            <Tooltip title={t('Copy')}>
              <CopyOutlined
                style={{ cursor: 'pointer', color: '#64748b' }}
                onClick={() => {
                  navigator.clipboard.writeText(ip);
                  message.success(t('Copied'));
                }}
              />
            </Tooltip>
          </div>
        </div>
      ),
    },
    {
      title: t('Fixed IP (Mapped)'),
      dataIndex: 'fixedIp',
      key: 'fixedIp',
      render: (fixed) =>
        fixed ? (
          <Tag color="cyan">{fixed}</Tag>
        ) : (
          <span style={{ color: '#94a3b8', fontSize: 12 }}>{t('Unassociated')}</span>
        ),
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
          <Tag color="default" icon={<StopOutlined />}>
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
          onClick={() => handleRelease(record)}
        >
          {t('Release')}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { title: t('Network') },
          { title: t('Floating IPs') },
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
            {t('Floating IPs')}
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            {t('Public IP addresses routed from external networks to cloud compute instances.')}
          </p>
        </div>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchFips} loading={loading}>
            {t('Refresh')}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalOpen(true)}
            style={{ backgroundColor: '#0068ff', borderRadius: 8, fontWeight: 600 }}
          >
            {t('Allocate IP')}
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
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder={t('Search by IP or ID...')}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280, borderRadius: 8 }}
            allowClear
          />
        </div>

        <Table
          columns={columns}
          dataSource={filteredFips}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey="id"
        />
      </Card>

      <Modal
        title={t('Allocate Floating IP')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleAllocate}>
          <Form.Item
            name="network_id"
            label={t('External Network Pool')}
            rules={[{ required: true, message: t('Please select external network!') }]}
          >
            <Select
              placeholder={t('Select External Network')}
              options={
                externalNetworks.length > 0
                  ? externalNetworks.map((n) => ({ label: `${n.name} (${n.id.substring(0, 8)})`, value: n.id }))
                  : [{ label: 'public1 (External Pool)', value: '00482dd0-82c2-479d-9ec9-9c623e1b5c02' }]
              }
            />
          </Form.Item>

          <Form.Item name="description" label={t('Description')}>
            <Input placeholder={t('Description')} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <Button onClick={() => setIsModalOpen(false)}>{t('Cancel')}</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#0068ff' }}>
              {t('Allocate')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
