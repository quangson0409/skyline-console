import React, { useState, useMemo } from 'react';
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
  InputNumber,
  Switch,
  message,
  Table,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  DeleteOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useFlavors } from '@/hooks/useFlavors';
import { novaApi } from '@/api/nova';
import BaseTable from '@/components/Tables/BaseTable';
import { useTranslation } from '@/core/i18n';

export default function FlavorList() {
  const { t } = useTranslation();
  const { flavors, loading, refetch, createFlavor, deleteFlavor } = useFlavors();
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [magicFilters, setMagicFilters] = useState({});

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [extraSpecsModal, setExtraSpecsModal] = useState({ open: false, flavor: null, specs: {}, loading: false });
  const [accessModal, setAccessModal] = useState({ open: false, flavor: null, accessList: [], loading: false });

  const [createForm] = Form.useForm();
  const [specsForm] = Form.useForm();
  const [accessForm] = Form.useForm();

  // Filter params for MagicInput
  const filterParams = useMemo(
    () => [
      { name: 'name', label: t('Name') },
      { name: 'vcpus', label: 'vCPUs' },
      { name: 'disk', label: t('Root Disk') },
    ],
    [t]
  );

  // Handle Create Flavor
  const handleCreate = async (values) => {
    try {
      await createFlavor({
        name: values.name,
        vcpus: Number(values.vcpus),
        ram: Number(values.ram),
        disk: Number(values.disk || 0),
        'os-flavor-access:is_public': values.isPublic ?? true,
      });
      message.success(t('Flavor created successfully'));
      setIsCreateModalOpen(false);
      createForm.resetFields();
      refetch();
    } catch (err) {
      message.error(err.message || t('Failed to create flavor'));
    }
  };

  // Handle Delete Single
  const handleDeleteOne = (record) => {
    Modal.confirm({
      title: `${t('Delete Flavor')}: ${record.name}?`,
      content: t("If an instance is using this flavor, deleting it will cause the instance's flavor data to be missing. Are you sure?"),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        await deleteFlavor(record.id);
        refetch();
      },
    });
  };

  // Handle Batch Delete
  const handleBatchDelete = (keys) => {
    Modal.confirm({
      title: `${t('Batch Delete')} ${keys.length} ${t('Flavors')}?`,
      content: t('Are you sure you want to delete these flavors?'),
      okText: t('Delete'),
      okType: 'danger',
      cancelText: t('Cancel'),
      onOk: async () => {
        await Promise.all(keys.map((k) => novaApi.deleteFlavor(k)));
        message.success(t('Flavors deleted successfully'));
        setSelectedRowKeys([]);
        refetch();
      },
    });
  };

  // Open Extra Specs Modal
  const handleOpenSpecs = async (record) => {
    setExtraSpecsModal({ open: true, flavor: record, specs: {}, loading: true });
    try {
      const res = await novaApi.getFlavorExtraSpecs(record.id);
      const specs = res?.extra_specs || res?.data?.extra_specs || {};
      setExtraSpecsModal({ open: true, flavor: record, specs, loading: false });
    } catch {
      setExtraSpecsModal({ open: true, flavor: record, specs: {}, loading: false });
    }
  };

  const handleSaveSpecs = async (values) => {
    try {
      const { specKey, specVal } = values;
      if (!specKey) return;
      await novaApi.setFlavorExtraSpecs(extraSpecsModal.flavor.id, { [specKey]: specVal });
      message.success(t('Extra specs updated'));
      specsForm.resetFields();
      handleOpenSpecs(extraSpecsModal.flavor);
    } catch (err) {
      message.error(err.message || t('Failed to update extra specs'));
    }
  };

  // Open Access Modal (for private flavors)
  const handleOpenAccess = async (record) => {
    setAccessModal({ open: true, flavor: record, accessList: [], loading: true });
    try {
      const res = await novaApi.getFlavorAccess(record.id);
      const accessList = res?.flavor_access || res?.data?.flavor_access || [];
      setAccessModal({ open: true, flavor: record, accessList, loading: false });
    } catch {
      setAccessModal({ open: true, flavor: record, accessList: [], loading: false });
    }
  };

  const handleAddAccess = async (values) => {
    try {
      await novaApi.addFlavorAccess(accessModal.flavor.id, values.tenantId);
      message.success(t('Project access granted'));
      accessForm.resetFields();
      handleOpenAccess(accessModal.flavor);
    } catch (err) {
      message.error(err.message || t('Failed to add project access'));
    }
  };

  const handleRemoveAccess = async (tenantId) => {
    try {
      await novaApi.removeFlavorAccess(accessModal.flavor.id, tenantId);
      message.success(t('Project access revoked'));
      handleOpenAccess(accessModal.flavor);
    } catch (err) {
      message.error(err.message || t('Failed to revoke access'));
    }
  };

  const rowActions = {
    firstAction: {
      id: 'delete',
      title: t('Delete'),
      isDanger: true,
      onClick: (record) => handleDeleteOne(record),
    },
    moreActions: [
      {
        title: t('Manage Extra Specs'),
        onClick: (record) => handleOpenSpecs(record),
      },
      {
        title: t('Manage Access'),
        onClick: (record) => handleOpenAccess(record),
      },
    ],
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
      render: (text) => <span style={{ fontWeight: 600, color: '#0068ff' }}>{text}</span>,
    },
    {
      title: 'vCPUs',
      dataIndex: 'vcpus',
      key: 'vcpus',
      sorter: (a, b) => a.vcpus - b.vcpus,
      render: (v) => <span style={{ fontWeight: 700 }}>{v} Core(s)</span>,
    },
    {
      title: t('RAM'),
      dataIndex: 'ram',
      key: 'ram',
      sorter: (a, b) => a.ram - b.ram,
      render: (ram) => (
        <span>
          {ram >= 1024 ? `${(ram / 1024).toFixed(ram % 1024 === 0 ? 0 : 1)} GiB` : `${ram} MiB`}
        </span>
      ),
    },
    {
      title: t('Root Disk'),
      dataIndex: 'disk',
      key: 'disk',
      sorter: (a, b) => a.disk - b.disk,
      render: (d) => <span>{d} GiB</span>,
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
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb items={[{ title: t('Compute') }, { title: t('Flavors') }]} style={{ marginBottom: 6 }} />
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0f172a' }}>{t('Flavors')}</h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
          {t('Manage virtual hardware configurations (vCPU, RAM, and Disk storage).')}
        </p>
      </div>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('Total Flavors')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#0068ff' }}>{flavors.length}</div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('Public Flavors')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#10b981' }}>
              {flavors.filter((f) => f.isPublic).length}
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('Private Flavors')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#8b5cf6' }}>
              {flavors.filter((f) => !f.isPublic).length}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table */}
      <BaseTable
        columns={columns}
        dataSource={flavors}
        loading={loading}
        rowKey="id"
        filterParams={filterParams}
        filters={magicFilters}
        onFilterChange={setMagicFilters}
        onRefresh={refetch}
        primaryAction={{
          id: 'create-flavor',
          label: `${t('Create')} ${t('Flavor')}`,
          icon: <PlusOutlined />,
          onClick: () => setIsCreateModalOpen(true),
        }}
        rowActions={rowActions}
        batchActions={batchActions}
        selectedRowKeys={selectedRowKeys}
        onSelectChange={setSelectedRowKeys}
      />

      {/* Create Flavor Modal */}
      <Modal
        title={`${t('Create')} ${t('Flavor')}`}
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} initialValues={{ vcpus: 2, ram: 4096, disk: 20, isPublic: true }}>
          <Form.Item name="name" label={t('Name')} rules={[{ required: true, message: t('Please input name') }]}>
            <Input placeholder="c1.m4.d20" />
          </Form.Item>
          <Form.Item name="vcpus" label="vCPUs" rules={[{ required: true }]}>
            <InputNumber min={1} max={128} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="ram" label="RAM (MiB)" rules={[{ required: true }]} extra="4096 MiB = 4 GiB">
            <InputNumber min={512} step={1024} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="disk" label="Root Disk (GiB)" rules={[{ required: true }]}>
            <InputNumber min={0} max={2048} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isPublic" label={t('Public')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <Button onClick={() => setIsCreateModalOpen(false)}>{t('Cancel')}</Button>
            <Button type="primary" htmlType="submit" style={{ background: '#0068ff' }}>
              {t('Create')}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Extra Specs Modal */}
      <Modal
        title={`${t('Manage Extra Specs')}: ${extraSpecsModal.flavor?.name}`}
        open={extraSpecsModal.open}
        onCancel={() => setExtraSpecsModal({ open: false, flavor: null, specs: {}, loading: false })}
        footer={null}
        destroyOnHidden
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <Table
            size="small"
            loading={extraSpecsModal.loading}
            pagination={false}
            columns={[
              { title: t('Key'), dataIndex: 'key', key: 'key' },
              { title: t('Value'), dataIndex: 'val', key: 'val' },
            ]}
            dataSource={Object.entries(extraSpecsModal.specs).map(([key, val]) => ({ key, val }))}
            locale={{ emptyText: t('No extra specs defined') }}
          />
        </div>
        <Form form={specsForm} layout="inline" onFinish={handleSaveSpecs}>
          <Form.Item name="specKey" rules={[{ required: true, message: 'Key required' }]}>
            <Input placeholder="hw:cpu_policy" />
          </Form.Item>
          <Form.Item name="specVal" rules={[{ required: true, message: 'Value required' }]}>
            <Input placeholder="dedicated" />
          </Form.Item>
          <Button type="primary" htmlType="submit" style={{ background: '#0068ff' }}>
            {t('Add / Update')}
          </Button>
        </Form>
      </Modal>

      {/* Manage Access Modal */}
      <Modal
        title={`${t('Manage Access')}: ${accessModal.flavor?.name}`}
        open={accessModal.open}
        onCancel={() => setAccessModal({ open: false, flavor: null, accessList: [], loading: false })}
        footer={null}
        destroyOnHidden
      >
        <div style={{ marginBottom: 16 }}>
          <Table
            size="small"
            loading={accessModal.loading}
            pagination={false}
            columns={[
              { title: t('Project ID'), dataIndex: 'tenant_id', key: 'tenant_id' },
              {
                title: t('Action'),
                key: 'action',
                render: (_, r) => (
                  <Button danger size="small" type="link" onClick={() => handleRemoveAccess(r.tenant_id)}>
                    {t('Revoke')}
                  </Button>
                ),
              },
            ]}
            dataSource={accessModal.accessList}
            locale={{ emptyText: t('No project-specific access defined') }}
          />
        </div>
        <Form form={accessForm} layout="inline" onFinish={handleAddAccess}>
          <Form.Item name="tenantId" rules={[{ required: true, message: 'Project ID required' }]}>
            <Input placeholder="Project UUID" style={{ width: 280 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" style={{ background: '#0068ff' }}>
            {t('Grant Access')}
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
