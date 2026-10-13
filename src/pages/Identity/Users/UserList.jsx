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
  Switch,
  message,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  UserOutlined,
  CopyOutlined,
  DeleteOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { keystoneApi } from '@/api/keystone';
import { useTranslation } from '@/core/i18n';

export default function UserList() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await keystoneApi.listUsers();
      if (res && res.users) {
        const normalized = res.users.map((u) => ({
          key: u.id,
          id: u.id,
          name: u.name,
          email: u.email || `${u.name}@openstack.local`,
          domain: u.domain_id || 'Default',
          enabled: u.enabled ?? true,
        }));
        setUsers(normalized);
      }
    } catch (err) {
      message.error(t('Failed to load users: ') + err.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (values) => {
    try {
      await keystoneApi.createUser({
        name: values.name,
        password: values.password,
        email: values.email,
        enabled: values.enabled ?? true,
      });
      message.success(t('User created successfully!'));
      setIsModalOpen(false);
      form.resetFields();
      fetchUsers();
    } catch (err) {
      message.error(t('Failed to create user: ') + err.message);
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: `${t('Delete User')} ${record.name}?`,
      content: t('Are you sure you want to delete this user? This cannot be undone.'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await keystoneApi.deleteUser(record.id);
          message.success(t('User deleted successfully'));
          fetchUsers();
        } catch (err) {
          message.error(t('Failed to delete user: ') + err.message);
        }
      },
    });
  };

  const filteredUsers = users.filter((u) => {
    const q = searchText.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
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
            <UserOutlined style={{ color: '#0068ff' }} />
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
      title: t('Email'),
      dataIndex: 'email',
      key: 'email',
      render: (email) => <span style={{ color: '#64748b' }}>{email}</span>,
    },
    {
      title: t('Domain'),
      dataIndex: 'domain',
      key: 'domain',
      render: (domain) => <Tag color="blue">{domain}</Tag>,
    },
    {
      title: t('Status'),
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled) =>
        enabled ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            {t('Enabled')}
          </Tag>
        ) : (
          <Tag color="error" icon={<StopOutlined />}>
            {t('Disabled')}
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
          { title: t('Identity') },
          { title: t('Users') },
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
            {t('Users')}
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            {t('Manage user credentials and access authorization in OpenStack Keystone.')}
          </p>
        </div>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>
            {t('Refresh')}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalOpen(true)}
            style={{ backgroundColor: '#0068ff', borderRadius: 8, fontWeight: 600 }}
          >
            {t('Create User')}
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
            placeholder={t('Search by Name, Email, or ID...')}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 320, borderRadius: 8 }}
            allowClear
          />
        </div>

        <Table
          columns={columns}
          dataSource={filteredUsers}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey="id"
        />
      </Card>

      <Modal
        title={t('Create User')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ enabled: true }}>
          <Form.Item
            name="name"
            label={t('Username')}
            rules={[{ required: true, message: t('Please input username!') }]}
          >
            <Input placeholder="johndoe" />
          </Form.Item>

          <Form.Item
            name="password"
            label={t('Password')}
            rules={[{ required: true, message: t('Please input password!') }]}
          >
            <Input.Password placeholder={t('Password')} />
          </Form.Item>

          <Form.Item name="email" label={t('Email')}>
            <Input placeholder="user@company.com" />
          </Form.Item>

          <Form.Item name="enabled" label={t('Status')} valuePropName="checked">
            <Switch defaultChecked />
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
