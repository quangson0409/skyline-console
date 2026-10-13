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
  Progress,
  message,
} from 'antd';
import {
  ReloadOutlined,
  DesktopOutlined,
  CheckCircleOutlined,
  StopOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { novaApi } from '@/api/nova';
import BaseTable from '@/components/Tables/BaseTable';
import { useTranslation } from '@/core/i18n';

export default function HypervisorList() {
  const { t } = useTranslation();
  const [hypervisors, setHypervisors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [magicFilters, setMagicFilters] = useState({});
  const [disableModal, setDisableModal] = useState({ open: false, record: null });
  const [disableForm] = Form.useForm();

  const fetchHypervisors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await novaApi.listHypervisors();
      const list = res?.hypervisors || res?.data?.hypervisors || [];
      setHypervisors(list);
    } catch (err) {
      message.error(err.message || t('Failed to fetch hypervisors'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchHypervisors();
  }, [fetchHypervisors]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalVcpus = 0;
    let usedVcpus = 0;
    let totalRamMb = 0;
    let usedRamMb = 0;
    let runningVms = 0;

    hypervisors.forEach((h) => {
      totalVcpus += h.vcpus || 0;
      usedVcpus += h.vcpus_used || 0;
      totalRamMb += h.memory_mb || 0;
      usedRamMb += h.memory_mb_used || 0;
      runningVms += h.running_vms || 0;
    });

    return {
      totalVcpus,
      usedVcpus,
      totalRamGiB: (totalRamMb / 1024).toFixed(1),
      usedRamGiB: (usedRamMb / 1024).toFixed(1),
      runningVms,
    };
  }, [hypervisors]);

  const filterParams = useMemo(
    () => [
      { name: 'hypervisor_hostname', label: t('Hostname') },
      {
        name: 'state',
        label: t('State'),
        options: [
          { key: 'up', label: 'Up' },
          { key: 'down', label: 'Down' },
        ],
      },
      {
        name: 'status',
        label: t('Status'),
        options: [
          { key: 'enabled', label: 'Enabled' },
          { key: 'disabled', label: 'Disabled' },
        ],
      },
    ],
    [t]
  );

  const handleToggleService = (record) => {
    const isEnabled = record.status === 'enabled';
    if (isEnabled) {
      setDisableModal({ open: true, record });
    } else {
      Modal.confirm({
        title: `${t('Enable Service')}: ${record.hypervisor_hostname}?`,
        content: t('Enable Nova compute service on this hypervisor to allow instance scheduling.'),
        okText: t('Enable'),
        onOk: async () => {
          try {
            await novaApi.enableService(record.service?.host || record.hypervisor_hostname);
            message.success(t('Service enabled successfully'));
            fetchHypervisors();
          } catch (err) {
            message.error(err.message || t('Failed to enable service'));
          }
        },
      });
    }
  };

  const handleConfirmDisable = async (values) => {
    try {
      const host = disableModal.record.service?.host || disableModal.record.hypervisor_hostname;
      await novaApi.disableService(host);
      message.success(t('Service disabled successfully'));
      setDisableModal({ open: false, record: null });
      disableForm.resetFields();
      fetchHypervisors();
    } catch (err) {
      message.error(err.message || t('Failed to disable service'));
    }
  };

  const rowActions = {
    firstAction: {
      id: 'toggle-service',
      title: t('Service Control'),
      onClick: handleToggleService,
    },
  };

  const columns = [
    {
      title: t('Hostname'),
      dataIndex: 'hypervisor_hostname',
      key: 'hypervisor_hostname',
      sorter: (a, b) => (a.hypervisor_hostname || '').localeCompare(b.hypervisor_hostname || ''),
      render: (text) => (
        <Space>
          <DesktopOutlined style={{ color: '#0068ff' }} />
          <span style={{ fontWeight: 600, color: '#0068ff' }}>{text}</span>
        </Space>
      ),
    },
    {
      title: t('Type'),
      dataIndex: 'hypervisor_type',
      key: 'hypervisor_type',
      render: (type, r) => (
        <span>
          <b>{type || 'KVM'}</b> <span style={{ fontSize: 11, color: '#94a3b8' }}>({r.hypervisor_version || ''})</span>
        </span>
      ),
    },
    {
      title: t('State'),
      dataIndex: 'state',
      key: 'state',
      render: (state) => (
        <Tag color={state === 'up' ? 'success' : 'error'} style={{ borderRadius: 10, textTransform: 'uppercase' }}>
          {state || 'UP'}
        </Tag>
      ),
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'enabled' ? 'blue' : 'warning'} style={{ borderRadius: 10, textTransform: 'uppercase' }}>
          {status || 'ENABLED'}
        </Tag>
      ),
    },
    {
      title: 'vCPUs',
      key: 'vcpus',
      render: (_, r) => {
        const pct = r.vcpus > 0 ? Math.round((r.vcpus_used / r.vcpus) * 100) : 0;
        return (
          <div style={{ width: 140 }}>
            <div style={{ fontSize: 12, marginBottom: 2 }}>
              <b>{r.vcpus_used}</b> / {r.vcpus} ({pct}%)
            </div>
            <Progress percent={pct} size="small" showInfo={false} strokeColor={pct > 85 ? '#ef4444' : '#0068ff'} />
          </div>
        );
      },
    },
    {
      title: t('RAM'),
      key: 'ram',
      render: (_, r) => {
        const usedGiB = (r.memory_mb_used / 1024).toFixed(1);
        const totalGiB = (r.memory_mb / 1024).toFixed(1);
        const pct = r.memory_mb > 0 ? Math.round((r.memory_mb_used / r.memory_mb) * 100) : 0;
        return (
          <div style={{ width: 140 }}>
            <div style={{ fontSize: 12, marginBottom: 2 }}>
              <b>{usedGiB}</b> / {totalGiB} GiB
            </div>
            <Progress percent={pct} size="small" showInfo={false} strokeColor={pct > 85 ? '#ef4444' : '#10b981'} />
          </div>
        );
      },
    },
    {
      title: t('Local Disk'),
      key: 'disk',
      render: (_, r) => {
        const used = r.local_gb_used ?? (r.local_gb - r.free_disk_gb);
        return (
          <span style={{ fontSize: 12 }}>
            <b>{used || 0}</b> / {r.local_gb || 0} GiB
          </span>
        );
      },
    },
    {
      title: t('Running VMs'),
      dataIndex: 'running_vms',
      key: 'running_vms',
      sorter: (a, b) => a.running_vms - b.running_vms,
      render: (vms) => <Tag color="geekblue" style={{ borderRadius: 10 }}><b>{vms || 0}</b></Tag>,
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb items={[{ title: t('Compute') }, { title: t('Hypervisors') }]} style={{ marginBottom: 6 }} />
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0f172a' }}>{t('Hypervisors')}</h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
          {t('Physical compute nodes monitoring, hardware allocation, and virtualization hypervisors.')}
        </p>
      </div>

      {/* KPI Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('Total Hypervisors')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#0068ff' }}>{hypervisors.length}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>vCPUs Allocation</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#10b981' }}>
              {metrics.usedVcpus} <span style={{ fontSize: 13, color: '#94a3b8' }}>/ {metrics.totalVcpus}</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>RAM Allocation</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#8b5cf6' }}>
              {metrics.usedRamGiB} <span style={{ fontSize: 13, color: '#94a3b8' }}>/ {metrics.totalRamGiB} GiB</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{t('Running Instances')}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: '#0284c7' }}>
              {metrics.runningVms}
            </div>
          </Card>
        </Col>
      </Row>

      {/* BaseTable */}
      <BaseTable
        columns={columns}
        dataSource={hypervisors}
        loading={loading}
        rowKey="id"
        filterParams={filterParams}
        filters={magicFilters}
        onFilterChange={setMagicFilters}
        onRefresh={fetchHypervisors}
        rowActions={rowActions}
      />

      {/* Disable Service Modal */}
      <Modal
        title={`${t('Disable Service')}: ${disableModal.record?.hypervisor_hostname}`}
        open={disableModal.open}
        onCancel={() => setDisableModal({ open: false, record: null })}
        footer={null}
        destroyOnHidden
      >
        <Form form={disableForm} layout="vertical" onFinish={handleConfirmDisable}>
          <div style={{ marginBottom: 16, color: '#64748b', fontSize: 13 }}>
            {t('Disabling service will prevent new instances from being scheduled on this physical host. Existing instances will not be affected.')}
          </div>
          <Form.Item name="reason" label={t('Reason')} initialValues="Scheduled maintenance">
            <Input placeholder="e.g. Scheduled hardware maintenance" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button onClick={() => setDisableModal({ open: false, record: null })}>{t('Cancel')}</Button>
            <Button type="primary" danger htmlType="submit">
              {t('Disable')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
