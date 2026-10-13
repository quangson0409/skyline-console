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
  Select,
  Tooltip,
  Badge,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  DeleteOutlined,
  FileZipOutlined,
  SearchOutlined,
  CopyOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { useThemeStore, THEMES } from '@/store/themeStore';
import { useImages } from '@/hooks/useImages';
import { useTranslation } from '@/core/i18n';

export default function ImageList() {
  const { t } = useTranslation();
  const { images, loading, isLiveApi, refetch, deleteImage } = useImages();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState('ALL');
  const [form] = Form.useForm();
  const { currentTheme } = useThemeStore();

  const isDark = currentTheme === THEMES.DARK_OPS;

  const handleDelete = (record) => {
    Modal.confirm({
      title: `${t('Confirm')} ${t('Delete')}: ${record.name}?`,
      content: 'Thao tác này sẽ xóa tệp image nhị phân khỏi Glance Backend Storage.',
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: () => deleteImage(record.id),
    });
  };

  const filteredImages = images.filter((img) => {
    const matchSearch =
      !searchText ||
      img.name.toLowerCase().includes(searchText.toLowerCase()) ||
      img.id.toLowerCase().includes(searchText.toLowerCase()) ||
      img.format.toLowerCase().includes(searchText.toLowerCase());
    const matchVis =
      visibilityFilter === 'ALL' || img.visibility.toLowerCase() === visibilityFilter.toLowerCase();
    return matchSearch && matchVis;
  });

  const columns = [
    {
      title: t('Name'),
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <Space>
            <FileZipOutlined style={{ color: '#0068ff' }} />
            <span style={{ fontWeight: 600, color: isDark ? '#60a5fa' : '#0068ff' }}>{text}</span>
          </Space>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            ID: {record.id.substring(0, 18)}...
            <Tooltip title={t('Copy')}>
              <CopyOutlined
                style={{ marginLeft: 6, cursor: 'pointer' }}
                onClick={() => navigator.clipboard.writeText(record.id)}
              />
            </Tooltip>
          </div>
        </div>
      ),
    },
    {
      title: 'OS',
      dataIndex: 'os',
      key: 'os',
      render: (os) => <Tag color="blue" style={{ borderRadius: 10, fontSize: 11 }}>{os}</Tag>,
    },
    {
      title: t('Image Format'),
      dataIndex: 'format',
      key: 'format',
      render: (f) => <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{f}</span>,
    },
    {
      title: t('Capacity'),
      dataIndex: 'size',
      key: 'size',
    },
    {
      title: t('Minimum Disk'),
      key: 'minRequirements',
      render: (_, r) => (
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Disk: <b>{r.minDisk} GB</b> | RAM: <b>{r.minRam >= 1024 ? `${(r.minRam / 1024).toFixed(0)} GB` : `${r.minRam} MB`}</b>
        </span>
      ),
    },
    {
      title: t('Visibility'),
      dataIndex: 'visibility',
      key: 'visibility',
      render: (v) => (
        <Tag color={v === 'public' ? 'green' : 'gold'} style={{ borderRadius: 10, fontSize: 11 }}>
          {v === 'public' ? t('Public') : t('Private')}
        </Tag>
      ),
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      render: () => (
        <Space>
          <Badge status="success" />
          <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 12 }}>{t('Active')}</span>
        </Space>
      ),
    },
    {
      title: t('Actions'),
      key: 'action',
      render: (_, record) => (
        <Button
          danger
          type="text"
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
        style={{ marginBottom: 16 }}
        items={[
          { title: t('Compute') },
          { title: t('Images') },
        ]}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: isDark ? '#ffffff' : '#0f172a' }}>
              {t('Images')}
            </h1>
            <Tag
              color={isLiveApi ? 'success' : 'blue'}
              style={{ borderRadius: 12, fontSize: 11, padding: '2px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <ApiOutlined />
              {isLiveApi ? 'Live Glance API' : 'Proxy Ready (10.0.29.10:9999)'}
            </Tag>
          </div>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            Quản lý các bản mẫu hệ điều hành (Golden Images) để tạo máy ảo nhanh chóng.
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
            {t('Register Image')}
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
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <Input
            placeholder={`${t('Search')}...`}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            style={{ width: 280, borderRadius: 6 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <Select
            value={visibilityFilter}
            onChange={setVisibilityFilter}
            style={{ width: 180 }}
            options={[
              { label: `${t('Visibility')}: ${t('Total')}`, value: 'ALL' },
              { label: t('Public'), value: 'public' },
              { label: t('Private'), value: 'private' },
            ]}
          />
        </div>

        <Table
          columns={columns}
          dataSource={filteredImages}
          loading={loading}
          pagination={{ pageSize: 8, showTotal: (total) => `${t('Total')} ${total} ${t('Images')}` }}
        />
      </Card>

      {/* Modal create stub */}
      <Modal
        title={t('Register Image')}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={() => setIsModalOpen(false)}>
          <Form.Item label={t('Name')} required>
            <Input placeholder="ví dụ: Rocky-Linux-9-Cloud" />
          </Form.Item>
          <Form.Item label={t('Image Format')}>
            <Select
              defaultValue="QCOW2"
              options={[
                { label: 'QCOW2 - QEMU Emulator', value: 'QCOW2' },
                { label: 'RAW - Đĩa thô', value: 'RAW' },
                { label: 'ISO - Đĩa quang cài đặt', value: 'ISO' },
                { label: 'VMDK - VMware Disk', value: 'VMDK' },
              ]}
            />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <Button onClick={() => setIsModalOpen(false)}>{t('Close')}</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#0068ff' }}>
              {t('Save')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
