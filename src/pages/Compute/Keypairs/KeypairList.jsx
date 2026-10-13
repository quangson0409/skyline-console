import React, { useState } from 'react';
import {
  Breadcrumb,
  Button,
  Card,
  Table,
  Space,
  Modal,
  Form,
  Input,
  Radio,
  Tooltip,
  Tag,
  message,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  DeleteOutlined,
  KeyOutlined,
  CopyOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { useThemeStore, THEMES } from '@/store/themeStore';
import { useKeypairs } from '@/hooks/useKeypairs';
import { useTranslation } from '@/core/i18n';

export default function KeypairList() {
  const { t } = useTranslation();
  const { keypairs, loading, isLiveApi, refetch, createKeypair, deleteKeypair } = useKeypairs();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [actionType, setActionType] = useState('create');
  const { currentTheme } = useThemeStore();

  const isDark = currentTheme === THEMES.DARK_OPS;

  const handleCreate = async (values) => {
    const success = await createKeypair({
      name: values.name,
      publicKey: actionType === 'import' ? values.publicKey : undefined,
      keyType: 'ssh',
    });
    if (success) {
      setIsModalOpen(false);
      form.resetFields();
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: `${t('Confirm')} ${t('Delete')}: ${record.name}?`,
      content: 'Máy ảo đã triển khai vẫn giữ khóa này nhưng bạn sẽ không thể chọn khóa này cho các máy ảo mới.',
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: () => deleteKeypair(record.name),
    });
  };

  const columns = [
    {
      title: t('Name'),
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <Space>
          <KeyOutlined style={{ color: '#0068ff' }} />
          <span style={{ fontWeight: 600, color: isDark ? '#60a5fa' : '#0068ff' }}>{text}</span>
        </Space>
      ),
    },
    {
      title: t('Fingerprint'),
      dataIndex: 'fingerprint',
      key: 'fingerprint',
      render: (fp) => (
        <Space>
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: isDark ? '#94a3b8' : '#475569' }}>
            {fp || 'N/A'}
          </span>
          {fp && (
            <Tooltip title={t('Copy')}>
              <CopyOutlined
                style={{ cursor: 'pointer', color: '#94a3b8' }}
                onClick={() => {
                  navigator.clipboard.writeText(fp);
                  message.info(t('Copied'));
                }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: t('Key Type'),
      dataIndex: 'type',
      key: 'type',
      render: (type) => <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{type}</span>,
    },
    {
      title: t('Created At'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (tVal) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{tVal || 'Mặc định'}</span>,
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
          { title: t('Key Pairs') },
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
              {t('Key Pairs')}
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
            Sử dụng cặp khóa mã hóa bất đối xứng SSH để đăng nhập an toàn vào máy ảo Linux không cần mật khẩu.
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
            {t('Create Key Pair')}
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
          dataSource={keypairs}
          loading={loading}
          pagination={{ pageSize: 8, showTotal: (total) => `${t('Total')} ${total} ${t('Key Pairs')}` }}
        />
      </Card>

      {/* Create Modal */}
      <Modal
        title={t('Create Key Pair')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ name: '' }}>
          <Form.Item label={t('Login Type')}>
            <Radio.Group value={actionType} onChange={(e) => setActionType(e.target.value)}>
              <Radio.Button value="create">{t('Create Key Pair')}</Radio.Button>
              <Radio.Button value="import">{t('Import Public Key')}</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="name"
            label={t('Name')}
            rules={[{ required: true, message: 'Vui lòng nhập tên khóa!' }]}
          >
            <Input placeholder="ví dụ: devops-staging-key" />
          </Form.Item>

          {actionType === 'import' && (
            <Form.Item
              name="publicKey"
              label={t('Import Public Key')}
              rules={[{ required: true, message: 'Vui lòng dán nội dung Public Key!' }]}
            >
              <Input.TextArea rows={4} placeholder="ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC..." />
            </Form.Item>
          )}

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
