import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Breadcrumb, Card, Col, Row, Tooltip, message, notification } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useInstances } from '@/hooks/useInstances';
import { useAuthStore } from '@/store/authStore';
import { hasEndpoint } from '@/api/endpoints';
import Status from '@/components/Status';
import BaseTable from '@/components/Tables/BaseTable';
import useActionRunner from '@/components/Action/useActionRunner';
import { useTranslation } from '@/core/i18n';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useProjectMap } from '@/hooks/useProjectMap';
import { useIsAdminPage, nameColumn, IdNameCell, formatTime } from '@/components/ResourcePage/helpers';
import { sinceTime } from '@/pages/Compute/_shared';
import { getInstanceActions } from './actions';
import {
  instanceStatusText,
  instanceStatusFilterOptions,
  isInstanceTransition,
  isIronicInstance,
  lockRender,
  renderTags,
  instanceDetailPath,
} from './resources';

const SHOW_IMAGE_COLUMN = false;

const ipLines = (list) => (Array.isArray(list) && list.length ? list.map((ip) => <div key={ip}>{ip}</div>) : '-');

export default function InstanceList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasAdminRole, user } = useAuthStore();
  const isAdmin = Boolean(hasAdminRole || (user?.roles || []).includes('admin'));
  const isAdminPage = useIsAdminPage();
  const projectMap = useProjectMap();
  const actions = getInstanceActions(isAdminPage);

  const { instances: rawInstances, loading, actionLoading, quotaMetrics, refetch } = useInstances({
    allProjects: isAdminPage,
  });

  // project name for the admin "Project ID/Name" column and the "Project Name" filter
  const instances = useMemo(
    () =>
      rawInstances.map((it) =>
        it.project_name || !projectMap[it.project_id] ? it : { ...it, project_name: projectMap[it.project_id] }
      ),
    [rawInstances, projectMap]
  );

  // Legacy list watcher (10s while a server is in transition, else 30s auto refresh)
  const { autoRefresh, setAutoRefresh, resetAutoRefresh } = useAutoRefresh({
    data: rawInstances,
    refetch,
    isTransition: isInstanceTransition,
  });

  // legacy componentDidMount reaction: warn once per instance waiting for Confirm/Revert resize
  const notified = useRef(new Set());
  useEffect(() => {
    rawInstances
      .filter((it) => String(it.status).toLowerCase() === 'verify_resize')
      .forEach((it) => {
        if (notified.current.has(it.id)) return;
        notified.current.add(it.id);
        notification.warning({
          message: t('Waiting for user to Confirm/Revert the Resize for\n {id}', { id: it.id }),
          duration: 6,
        });
      });
  }, [rawInstances, t]);

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [searchParams] = useSearchParams();
  // Entry from other modules (image / volume / snapshot / server group "Create Instance"):
  // /compute/instance?image=... lands on the legacy create wizard with the same presets
  useEffect(() => {
    const keys = ['image', 'volume', 'snapshot', 'servergroup'];
    if (!keys.some((k) => searchParams.get(k)) && !searchParams.get('create')) return;
    const params = new URLSearchParams(searchParams);
    const ironic = params.get('type') === 'ironic';
    params.delete('create');
    params.delete('type');
    const query = params.toString();
    const base = ironic ? '/compute/ironic-instance/create' : '/compute/instance/create';
    navigate(query ? `${base}?${query}` : base, { replace: true });
  }, [searchParams, navigate]);
  const [magicFilters, setMagicFilters] = useState({});

  const onRefresh = useCallback(() => {
    setSelectedRowKeys([]);
    resetAutoRefresh();
    refetch();
  }, [refetch, resetAutoRefresh]);

  // Unified Skyline Action Runner (handles confirm, modal forms, etc.)
  const { handleAction, actionModal } = useActionRunner({ onRefresh });

  // MagicInput filters (legacy searchFilters + instanceStatusFilter; Flavor kept from the new console)
  const filterParams = useMemo(
    () =>
      [
        { name: 'name', label: t('Name') },
        { name: 'ip', label: t('Instance IP') },
        isAdminPage && { name: 'project_name', label: t('Project Name') },
        isAdminPage && { name: 'project_id', label: t('Project ID') },
        isAdminPage && { name: 'host', label: t('Host') },
        { name: 'status', label: t('Status'), options: instanceStatusFilterOptions() },
        { name: 'flavor', label: t('Flavor') },
      ].filter(Boolean),
    [t, isAdminPage]
  );

  const columns = useMemo(
    () =>
      [
        nameColumn({ linkTo: (r) => instanceDetailPath(r.id, isAdminPage) }),
        isAdminPage && {
          title: t('Project ID/Name'),
          dataIndex: 'project_name',
          key: 'project_name',
          sorter: (a, b) => String(a.project_id || '').localeCompare(String(b.project_id || '')),
          render: (v, r) => <IdNameCell id={r.project_id} name={v || projectMap[r.project_id]} bold={false} />,
        },
        isAdminPage && { title: t('Host'), dataIndex: 'host', key: 'host', render: (v) => v || '-' },
        // Image column temporarily hidden (flip SHOW_IMAGE_COLUMN to bring it back)
        SHOW_IMAGE_COLUMN && {
          title: t('Image'),
          dataIndex: 'image_name',
          key: 'image_name',
          width: 80,
          render: (text) => <span style={{ fontSize: 13 }}>{text}</span>,
        },
        {
          title: t('Instance IP'),
          dataIndex: 'fixed_addresses',
          key: 'fixed_addresses',
          render: (v) => <div style={{ fontSize: 13, fontFamily: 'monospace' }}>{ipLines(v)}</div>,
        },
        {
          title: t('Floating IP'),
          dataIndex: 'floating_addresses',
          key: 'floating_addresses',
          render: (v) => <div style={{ fontSize: 13, fontFamily: 'monospace' }}>{ipLines(v)}</div>,
        },
        {
          title: t('Flavor'),
          dataIndex: 'flavor',
          key: 'flavor',
          render: (flavor, record) => (
            <span style={{ fontSize: 12, color: '#475569' }}>
              {isIronicInstance(record) ? `${flavor}(${t('Ironic Instance')})` : flavor}
            </span>
          ),
        },
        {
          title: t('Status'),
          dataIndex: 'status',
          key: 'status',
          sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
          render: (status) => <Status status={String(status || '').toLowerCase()} text={instanceStatusText(status)} />,
        },
        // hidden by default like legacy; can be shown from the column settings
        { title: t('Tags'), dataIndex: 'tags', key: 'tags', defaultHidden: true, render: (tags) => renderTags(tags) },
        { title: t('Locked'), dataIndex: 'locked', key: 'locked', width: 80, render: lockRender },
        {
          title: t('Created At'),
          dataIndex: 'created_at',
          key: 'created_at',
          sorter: (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')),
          render: (v) => (
            <Tooltip title={formatTime(v)}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{sinceTime(v)}</span>
            </Tooltip>
          ),
        },
      ].filter(Boolean),
    [t, isAdminPage, projectMap]
  );

  // legacy batchActions getter (ironic aware); every button acts on the allowed selected rows
  const selectedRows = useMemo(() => instances.filter((it) => selectedRowKeys.includes(it.id)), [instances, selectedRowKeys]);
  const batchButtons = actions.getBatchActions(selectedRows).map((action) => ({
    id: action.id,
    title: action.buttonText || action.title,
    isDanger: action.isDanger,
    policy: action.policy,
    onClick: () => {
      const allowedRows = selectedRows.filter((it) => {
        try {
          return action.allowed ? action.allowed(it) : true;
        } catch {
          return false;
        }
      });
      const skipped = selectedRows.filter((it) => !allowedRows.includes(it));
      if (skipped.length) {
        message.warning(
          t('You are not allowed to { action } "{ name }".', {
            action: action.actionName || action.title,
            name: skipped.map((it) => it.name || it.id).join(', '),
          })
        );
      }
      if (allowedRows.length) handleAction(action, allowedRows);
    },
  }));

  // legacy primaryActions [StepCreate, CreateIronic]: not available on the administrator list
  const primaryActions = isAdminPage
    ? []
    : [
        {
          id: 'create',
          label: `${t('Create')} ${t('Instances')}`,
          icon: <PlusOutlined />,
          policy: 'os_compute_api:servers:create',
          onClick: () => navigate('/compute/instance/create'),
        },
        hasEndpoint('ironic') && {
          id: 'ironic-create',
          label: t('Create Ironic Instance'),
          icon: <PlusOutlined />,
          policy: 'os_compute_api:servers:create',
          onClick: () => navigate('/compute/ironic-instance/create'),
        },
      ].filter(Boolean);

  const kpiCard = (label, value, extra, color) => (
    <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
      <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color }}>
        {value} {extra !== undefined ? <span style={{ fontSize: 13, color: '#94a3b8' }}>{extra}</span> : null}
      </div>
    </Card>
  );

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Top Breadcrumb & Header */}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb items={[{ title: t('Compute') }, { title: t('Instances') }]} style={{ marginBottom: 6, fontSize: 12 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
              {t('Instances')}
            </h1>
            <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
              {t('Manage compute instances, power states, network attachments, and VNC consoles.')}
            </p>
          </div>
        </div>
      </div>

      {/* 4 Quota KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          {kpiCard(`${t('vCPUs')} ${t('Allocated')}`, quotaMetrics.totalVcpus, `/ ${quotaMetrics.maxVcpus}`)}
        </Col>
        <Col xs={24} sm={12} lg={6}>
          {kpiCard(t('Memory (RAM)'), quotaMetrics.totalRam, `/ ${quotaMetrics.maxRam} GiB`, '#0068ff')}
        </Col>
        <Col xs={24} sm={12} lg={6}>
          {kpiCard(t('Active Instances'), quotaMetrics.activeCount, `/ ${quotaMetrics.totalCount}`, '#10b981')}
        </Col>
        <Col xs={24} sm={12} lg={6}>
          {kpiCard(t('Shutoff Instances'), quotaMetrics.shutoffCount, undefined, '#64748b')}
        </Col>
      </Row>

      <BaseTable
        columns={columns}
        dataSource={instances}
        loading={loading || actionLoading}
        rowKey="id"
        filterParams={filterParams}
        filters={magicFilters}
        onFilterChange={setMagicFilters}
        onRefresh={onRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        primaryActions={primaryActions}
        rowActions={actions.getRowActions()}
        batchActions={batchButtons}
        selectedRowKeys={selectedRowKeys}
        onSelectChange={(keys) => {
          resetAutoRefresh();
          setSelectedRowKeys(keys);
        }}
        getCheckboxProps={(record) => ({ name: record.name })}
        isAdmin={isAdmin}
        onActionClick={handleAction}
      />

      {/* Dynamic Action Modal */}
      {actionModal}
    </div>
  );
}
