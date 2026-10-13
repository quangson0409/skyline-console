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
  Switch,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  DeleteOutlined,
  AppstoreOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { useThemeStore, THEMES } from '@/store/themeStore';
import { useFlavors } from '@/hooks/useFlavors';
import { useTranslation } from '@/core/i18n';

export default function FlavorList() {
  const { t } = useTranslation();
  const { flavors, loading, isLiveApi, refetch, createFlavor, deleteFlavor } = useFlavors();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const { currentTheme } = useThemeStore();

  const isDark = currentTheme === THEMES.DARK_OPS;

  const handleCreate = async (values) => {
    const success = await createFlavor(values);
    if (success) {
      setIsModalOpen(false);
      form.resetFields();
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: `${t('Confirm')} ${t('Delete')}: ${record.name}?`,
      content: 'Lưu ý: Thao tác này sẽ xóa gói cấu hình khỏi hệ thống OpenStack Nova.',
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: () => deleteFlavor(record.id),
    });
  };

  const columns = [
    {
      title: t('Name'),
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <Space>
          <AppstoreOutlined style={{ color: '#0068ff' }} />
          <span style={{ fontWeight: 600, color: isDark ? '#60a5fa' : '#0068ff' }}>{text}</span>
        </Space>
      ),
    },
    {
      title: 'vCPUs',
      dataIndex: 'vcpus',
      key: 'vcpus',
      render: (v) => <span style={{ fontWeight: 700 }}>{v} Core(s)</span>,
    },
    {
      title: t('RAM'),
      dataIndex: 'ram',
      key: 'ram',
      render: (ram) => (
        <span>
          {ram >= 1024 ? `${(ram / 1024).toFixed(ram % 1024 === 0 ? 0 : 1)} GB` : `${ram} MB`}
        </span>
      ),
    },
    {
      title: t('Root Disk'),
      dataIndex: 'disk',
      key: 'disk',
      render: (d) => <span>{d} GB</span>,
    },
    {
      title: t('Visibility'),
      dataIndex: 'isPublic',
      key: 'isPublic',
      render: (isPub) => (
        <Tag color={isPub ? 'blue' : 'purple'} style={{ borderRadius: 10, fontSize: 11 }}>
          {isPub ? t('Public') : t('Private')}
        </Tag>
      ),
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDelete(record)}
        />
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { title: t('Compute') },
          { title: t('Flavors') },
        ]}
        style={{ marginBottom: 12, fontSize: 12 }}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: isDark ? '#ffffff' : '#0f172a' }}>
              {t('Flavors')}
            </h1>
            <Tag
              color={isLiveApi ? 'success' : 'blue'}
              style={{ borderRadius: 12, fontSize: 11, padding: '2px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <ApiOutlined />
              {isLiveApi ? 'Live Nova API' : 'Proxy Ready (10.0.29.10:9999)'}
            </Tag>
          </div>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            Định nghĩa các gói tài nguyên phần cứng tiêu chuẩn: vCPU, RAM, và dung lượng ổ đĩa.
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
            style={{ backgroundColor: '#0068ff', borderRadius: 20, fontWeight: 600 }}
          >
            {t('Create')} {t('Flavors')}
          </Button>
        </Space>
      </div>

      <Card
        variant="borderless"
        style={{
          borderRadius: 12,
          border: isDark ? '1px solid #1f293d' : '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <Table
          columns={columns}
          dataSource={flavors}
          loading={loading}
          pagination={{ pageSize: 8, showTotal: (total) => `${t('Total')} ${total} ${t('Flavors')}` }}
        />
      </Card>

      {/* Create Flavor Modal */}
      <Modal
        title={`${t('Create')} ${t('Flavors')}`}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{ vcpus: 2, ram: 4096, disk: 40, isPublic: true }}
        >
          <Form.Item
            name="name"
            label={t('Name')}
            rules={[{ required: true, message: 'Vui lòng nhập tên!' }]}
          >
            <Input placeholder="ví dụ: m1.custom-4c8g" />
          </Form.Item>
          <Form.Item name="vcpus" label="vCPUs" rules={[{ required: true }]}>
            <InputNumber min={1} max={64} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="ram" label={`${t('RAM')} (MB)`} rules={[{ required: true }]}>
            <InputNumber min={512} step={1024} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="disk" label={`${t('Root Disk')} (GB)`} rules={[{ required: true }]}>
            <InputNumber min={10} max={2000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isPublic" label={t('Public')} valuePropName="checked">
            <Switch />
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
