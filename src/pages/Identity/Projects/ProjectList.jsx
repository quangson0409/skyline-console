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
  BankOutlined,
  CopyOutlined,
  DeleteOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { keystoneApi } from '@/api/keystone';
import { useTranslation } from '@/core/i18n';

export default function ProjectList() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await keystoneApi.listProjects();
      if (res && res.projects) {
        const normalized = res.projects.map((p) => ({
          key: p.id,
          id: p.id,
          name: p.name,
          domain: p.domain_id || 'Default',
          description: p.description || '',
          enabled: p.enabled ?? true,
        }));
        setProjects(normalized);
      }
    } catch (err) {
      message.error(t('Failed to load projects: ') + err.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (values) => {
    try {
      await keystoneApi.createProject({
        name: values.name,
        description: values.description || '',
        enabled: values.enabled ?? true,
      });
      message.success(t('Project created successfully!'));
      setIsModalOpen(false);
      form.resetFields();
      fetchProjects();
    } catch (err) {
      message.error(t('Failed to create project: ') + err.message);
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: `${t('Delete Project')} ${record.name}?`,
      content: t('Are you sure you want to delete this project? All associated resources may be impacted.'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await keystoneApi.deleteProject(record.id);
          message.success(t('Project deleted successfully'));
          fetchProjects();
        } catch (err) {
          message.error(t('Failed to delete project: ') + err.message);
        }
      },
    });
  };

  const filteredProjects = projects.filter((p) => {
    const q = searchText.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q)
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
            <BankOutlined style={{ color: '#0068ff' }} />
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
      title: t('Domain'),
      dataIndex: 'domain',
      key: 'domain',
      render: (domain) => <Tag color="blue">{domain}</Tag>,
    },
    {
      title: t('Description'),
      dataIndex: 'description',
      key: 'description',
      render: (desc) => desc || <span style={{ color: '#94a3b8' }}>-</span>,
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
          { title: t('Projects') },
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
            {t('Projects')}
          </h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            {t('Manage Keystone tenant projects and resource isolation domains.')}
          </p>
        </div>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchProjects} loading={loading}>
            {t('Refresh')}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalOpen(true)}
            style={{ backgroundColor: '#0068ff', borderRadius: 8, fontWeight: 600 }}
          >
            {t('Create Project')}
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
          dataSource={filteredProjects}
          loading={loading}
          pagination={{ pageSize: 10 }}
          rowKey="id"
        />
      </Card>

      <Modal
        title={t('Create Project')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ enabled: true }}>
          <Form.Item
            name="name"
            label={t('Name')}
            rules={[{ required: true, message: t('Please input project name!') }]}
          >
            <Input placeholder="my-project" />
          </Form.Item>

          <Form.Item name="description" label={t('Description')}>
            <Input.TextArea rows={3} placeholder={t('Description')} />
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
