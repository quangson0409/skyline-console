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
  Input,
  Drawer,
  message,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  SafetyOutlined,
  DeleteOutlined,
  SettingOutlined,
  CopyOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { neutronApi } from '@/api/neutron';
import { useTranslation } from '@/core/i18n';
import { useAuthStore } from '@/store/authStore';

export default function SecurityGroupList() {
  const { t } = useTranslation();
  const { currentProject } = useAuthStore();
  const [secGroups, setSecGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  const fetchSecGroups = useCallback(async () => {
    setLoading(true);
    try {
      const pid = currentProject?.id;
      const params = {
        limit: 10,
      };
      if (pid) {
        params.project_id = pid;
      }
      const res = await neutronApi.listSecurityGroups(params);
      if (res && res.security_groups) {
        const normalized = res.security_groups.map((sg) => ({
          key: sg.id,
          id: sg.id,
          name: sg.name || sg.id,
          description: sg.description || '',
          rulesCount: (sg.security_group_rules || []).length,
          rules: (sg.security_group_rules || []).map((r) => ({
            id: r.id,
            direction: (r.direction || 'ingress').toUpperCase(),
            ethertype: r.ethertype || 'IPv4',
            protocol: (r.protocol || 'ANY').toUpperCase(),
            portRange:
              r.port_range_min === r.port_range_max
                ? r.port_range_min !== null
                  ? String(r.port_range_min)
                  : t('All')
                : `${r.port_range_min} - ${r.port_range_max}`,
            remote: r.remote_ip_prefix || r.remote_group_id || '0.0.0.0/0',
          })),
        }));
        setSecGroups(normalized);
      }
    } catch (err) {
      message.error(t('Failed to load Security Groups: ') + err.message);
    } finally {
      setLoading(false);
    }
  }, [t, currentProject?.id]);

  useEffect(() => {
    fetchSecGroups();
  }, [fetchSecGroups]);

  const handleCreate = async (values) => {
    try {
      await neutronApi.createSecurityGroup({
        name: values.name,
        description: values.description || '',
        project_id: currentProject?.id,
      });
      message.success(t('Security Group created successfully!'));
      setIsModalOpen(false);
      form.resetFields();
      fetchSecGroups();
    } catch (err) {
      message.error(t('Failed to create Security Group: ') + err.message);
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: `${t('Delete Security Group')} ${record.name}?`,
      content: t('Are you sure you want to delete this security group?'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await neutronApi.deleteSecurityGroup(record.id);
          message.success(t('Security Group deleted successfully'));
          fetchSecGroups();
        } catch (err) {
          message.error(t('Failed to delete Security Group: ') + err.message);
        }
      },
    });
  };

  const filteredGroups = secGroups.filter((g) => {
    const q = searchText.toLowerCase().trim();
    if (!q) return true;
    return (
      g.name.toLowerCase().includes(q) ||
      g.id.toLowerCase().includes(q) ||
      g.description.toLowerCase().includes(q)
    );
  });

  const columns = [
    {
      title: t('ID/Name'),
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <Space size={6}>
            <SafetyOutlined style={{ color: '#0068ff' }} />
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
      title: t('Description'),
      dataIndex: 'description',
      key: 'description',
      render: (d) => d || <span style={{ color: '#94a3b8' }}>-</span>,
    },
    {
      title: t('Rules Count'),
      dataIndex: 'rulesCount',
      key: 'rulesCount',
      render: (count) => <Tag color="blue">{count} rules</Tag>,
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'right',
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<SettingOutlined />}
            onClick={() => {
              setSelectedGroup(record);
              setIsDrawerOpen(true);
            }}
          >
            {t('Manage Rules')}
          </Button>
          {record.name !== 'default' && (
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record)}
            />
          )}
        </Space>
      ),
    },
  ];

  const ruleColumns = [
    {
      title: t('Direction'),
      dataIndex: 'direction',
      key: 'direction',
      render: (d) => <Tag color={d === 'INGRESS' ? 'green' : 'orange'}>{d}</Tag>,
    },
    {
      title: t('Ether Type'),
      dataIndex: 'ethertype',
      key: 'ethertype',
    },
    {
      title: t('IP Protocol'),
      dataIndex: 'protocol',
      key: 'protocol',
      render: (p) => <Tag color="geekblue">{p}</Tag>,
    },
    {
      title: t('Port Range'),
      dataIndex: 'portRange',
      key: 'portRange',
      render: (r) => <span style={{ fontWeight: 600 }}>{r}</span>,
    },
    {
      title: t('Remote IP / CIDR'),
      dataIndex: 'remote',
      key: 'remote',
      render: (rem) => <code>{rem}</code>,
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { title: t('Network') },
          { title: t('Security Groups') },
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
            {t('Security Groups')}
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            {t('Virtual firewalls controlling inbound and outbound network traffic for compute instances.')}
          </p>
        </div>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchSecGroups} loading={loading}>
            {t('Refresh')}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalOpen(true)}
            style={{ backgroundColor: '#0068ff', borderRadius: 8, fontWeight: 600 }}
          >
            {t('Create Security Group')}
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
            placeholder={t('Search by Name or ID...')}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300, borderRadius: 8 }}
            allowClear
          />
        </div>

        <Table
          columns={columns}
          dataSource={filteredGroups}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey="id"
        />
      </Card>

      {/* Rules Drawer */}
      <Drawer
        title={`${t('Security Rules')}: ${selectedGroup?.name || ''}`}
        width={720}
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      >
        <Table
          columns={ruleColumns}
          dataSource={selectedGroup?.rules || []}
          pagination={false}
          rowKey="id"
          size="small"
        />
      </Drawer>

      {/* Create Modal */}
      <Modal
        title={t('Create Security Group')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="name"
            label={t('Name')}
            rules={[{ required: true, message: t('Please input group name!') }]}
          >
            <Input placeholder="web-traffic-sg" />
          </Form.Item>

          <Form.Item name="description" label={t('Description')}>
            <Input.TextArea rows={3} placeholder={t('Description')} />
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
