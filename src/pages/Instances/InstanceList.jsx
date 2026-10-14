import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Breadcrumb, Card, Col, Result, Row, Tooltip, message, notification } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useInstances, instanceServerSide, fetchServersPage, fetchServersByUuids } from '@/hooks/useInstances';
import { useServerPaging } from '@/hooks/useServerPaging';
import { useResource } from '@/hooks/useResource';
import { useAuthStore } from '@/store/authStore';
import { hasEndpoint } from '@/api/endpoints';
import { checkActionPolicy, usePolicyStore } from '@/core/policy';
import Status from '@/components/Status';
import BaseTable from '@/components/Tables/BaseTable';
import useActionRunner from '@/components/Action/useActionRunner';
import { useTranslation } from '@/core/i18n';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useProjectMap } from '@/hooks/useProjectMap';
import { useIsAdminPage, nameColumn, IdNameCell, formatTime } from '@/components/ResourcePage/helpers';
import { sinceTimeClamp as sinceTime } from '@/components/ResourcePage/helpers';
import { fetchHypervisors } from '@/pages/Compute/Hypervisors/HypervisorList';
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

// user decision: the Image column stays hidden on the instance list page
const SHOW_IMAGE_COLUMN = false;

/** legacy Instance container `get policy()` */
export const instanceListPolicy = (isAdminPage) =>
  isAdminPage ? 'os_compute_api:servers:index:get_all_tenants' : 'os_compute_api:servers:index';

const ipLines = (list) => (Array.isArray(list) && list.length ? list.map((ip) => <div key={ip}>{ip}</div>) : '-');

const EMPTY_PARAMS = {};

/**
 * Instance list - port of legacy pages/compute/containers/Instance.
 *
 * Embedded variants (legacy Instance list reused inside detail pages, `inDetailPage`):
 *   <InstanceList embedded extraParams={{ flavor_id }} inFlavor />   flavor detail "Instances"
 *   <InstanceList embedded extraParams={{ host }} inHost />          hypervisor detail "Instances"
 *   <InstanceList embedded memberIds={[...]} serverGroupId={id} />   server group "Members"
 * Flavor / host tabs keep the backend paging (skyline /extension/servers with flavor_id / host),
 * server group members are loaded by id and filtered in the browser like legacy
 * (ServerGroupInstanceStore, isFilterByBackend = false). Row and batch actions are the legacy ones.
 */
export default function InstanceList({
  embedded = false,
  extraParams = EMPTY_PARAMS,
  memberIds,
  serverGroupId,
  inFlavor = false,
  inHost = false,
  showImageColumn = SHOW_IMAGE_COLUMN,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasAdminRole, user } = useAuthStore();
  const isAdmin = Boolean(hasAdminRole || (user?.roles || []).includes('admin'));
  const isAdminPage = useIsAdminPage();
  const projectMap = useProjectMap();
  const actions = getInstanceActions(isAdminPage);
  const memberMode = Array.isArray(memberIds);

  // legacy List `get policy()`: without the list permission nothing is fetched
  const policyRules = usePolicyStore((st) => st.rules);
  const canView = useMemo(
    () => checkActionPolicy({ policy: instanceListPolicy(isAdminPage) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdminPage, policyRules]
  );

  // KPI counts + quota only; the list is paged on the backend like legacy (isFilterByBackend)
  const { actionLoading, quotaMetrics, refetch: refetchCounts } = useInstances({
    allProjects: isAdminPage,
    remote: true,
    enabled: !embedded && canView,
  });
  // administrator page: platform wide vCPU / RAM allocation (hypervisors) instead of the project quota
  const { data: hypervisors } = useResource(
    () => (!embedded && isAdminPage && canView ? fetchHypervisors().catch(() => []) : Promise.resolve([])),
    [embedded, isAdminPage, canView],
    { initial: [] }
  );
  const currentProjectId = useAuthStore((st) => st.currentProject?.id);
  const pagingCtx = useMemo(() => ({ isAdmin: isAdminPage, projectId: currentProjectId }), [isAdminPage, currentProjectId]);
  const extraKey = JSON.stringify(extraParams || {});
  const serverSide = useMemo(
    () =>
      extraKey === '{}'
        ? instanceServerSide
        : { ...instanceServerSide, fetchPage: (args) => fetchServersPage({ ...args, extraParams: JSON.parse(extraKey) }) },
    [extraKey]
  );
  const paging = useServerPaging({ serverSide, ctx: pagingCtx, deps: [extraKey], enabled: canView && !memberMode });
  const memberKey = memberMode ? memberIds.join(',') : '';
  const members = useResource(
    () => (memberMode && canView ? fetchServersByUuids(memberIds, { isAdmin: isAdminPage }) : Promise.resolve([])),
    [memberKey, memberMode, canView, isAdminPage],
    { initial: [] }
  );
  const rawInstances = memberMode ? members.data || [] : paging.items;
  const loading = memberMode ? members.loading : paging.loading;
  const refetch = memberMode ? members.refetch : paging.refetch;

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
    if (embedded) return;
    const keys = ['image', 'volume', 'snapshot', 'servergroup'];
    if (!keys.some((k) => searchParams.get(k)) && !searchParams.get('create')) return;
    const params = new URLSearchParams(searchParams);
    const ironic = params.get('type') === 'ironic';
    params.delete('create');
    params.delete('type');
    const query = params.toString();
    const base = ironic ? '/compute/ironic-instance/create' : '/compute/instance/create';
    navigate(query ? `${base}?${query}` : base, { replace: true });
  }, [searchParams, navigate, embedded]);
  const [magicFilters, setMagicFilters] = useState({});

  const onRefresh = useCallback(() => {
    setSelectedRowKeys([]);
    resetAutoRefresh();
    refetch();
    if (!embedded) refetchCounts();
  }, [refetch, refetchCounts, resetAutoRefresh, embedded]);

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
        isAdminPage && !inHost && { name: 'host', label: t('Host') },
        { name: 'status', label: t('Status'), options: instanceStatusFilterOptions() },
        !inFlavor && { name: 'flavor', label: t('Flavor') },
      ].filter(Boolean),
    [t, isAdminPage, inHost, inFlavor]
  );

  const columns = useMemo(
    () =>
      [
        // sortKey: legacy backend sort keys (skyline /extension/servers sort_keys)
        { ...nameColumn({ linkTo: (r) => instanceDetailPath(r.id, isAdminPage) }), sortKey: 'display_name' },
        isAdminPage && {
          title: t('Project ID/Name'),
          dataIndex: 'project_name',
          key: 'project_name',
          sortKey: 'project_id',
          sorter: (a, b) => String(a.project_id || '').localeCompare(String(b.project_id || '')),
          render: (v, r) => <IdNameCell id={r.project_id} name={v || projectMap[r.project_id]} bold={false} />,
        },
        isAdminPage && !inHost && { title: t('Host'), dataIndex: 'host', key: 'host', sortKey: 'host', render: (v) => v || '-' },
        // Image column hidden on the list page (SHOW_IMAGE_COLUMN); the embedded tabs keep it
        showImageColumn && {
          title: t('Image'),
          dataIndex: 'image_name',
          key: 'image_name',
          render: (text, r) =>
            r.image_id ? (
              <IdNameCell
                id={r.image_id}
                name={text}
                href={`/compute/${isAdminPage ? 'image-admin' : 'image'}/detail/${r.image_id}`}
                bold={false}
              />
            ) : (
              <span style={{ fontSize: 13 }}>{text || '-'}</span>
            ),
          exportRender: (text) => text || '-',
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
        !inFlavor && {
          title: t('Flavor'),
          dataIndex: 'flavor',
          key: 'flavor',
          // legacy isDefaultHidden on the administrator page
          defaultHidden: isAdminPage,
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
        { title: t('Locked'), dataIndex: 'locked', key: 'locked', sortKey: 'locked', width: 80, render: lockRender },
        {
          title: t('Created At'),
          dataIndex: 'created_at',
          key: 'created_at',
          sortKey: 'created_at',
          sorter: (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')),
          render: (v) => (
            <Tooltip title={formatTime(v)}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{sinceTime(v)}</span>
            </Tooltip>
          ),
        },
      ].filter(Boolean),
    [t, isAdminPage, projectMap, inHost, inFlavor, showImageColumn]
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

  // legacy primaryActions [StepCreate, CreateIronic]: not on the administrator list nor the flavor tab
  const createQuery = serverGroupId ? `?servergroup=${serverGroupId}` : '';
  const primaryActions =
    isAdminPage || inFlavor
      ? []
      : [
          {
            id: 'create',
            label: `${t('Create')} ${t('Instances')}`,
            icon: <PlusOutlined />,
            policy: 'os_compute_api:servers:create',
            onClick: () => navigate(`/compute/instance/create${createQuery}`),
          },
          hasEndpoint('ironic') && {
            id: 'ironic-create',
            label: t('Create Ironic Instance'),
            icon: <PlusOutlined />,
            policy: 'os_compute_api:servers:create',
            onClick: () => navigate(`/compute/ironic-instance/create${createQuery}`),
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

  const hvList = Array.isArray(hypervisors) ? hypervisors : [];
  const hvSum = (k) => hvList.reduce((acc, h) => acc + (Number(h[k]) || 0), 0);
  const cpuCard = isAdminPage
    ? kpiCard(t('vCPUs Allocation'), hvSum('vcpus_used'), `/ ${Number(hvSum('vcpus').toFixed(2))}`)
    : kpiCard(`${t('vCPUs')} ${t('Allocated')}`, quotaMetrics.totalVcpus, `/ ${quotaMetrics.maxVcpus}`);
  const ramCard = isAdminPage
    ? kpiCard(
        t('RAM Allocation'),
        (hvSum('memory_mb_used') / 1024).toFixed(1),
        `/ ${(hvSum('memory_mb') / 1024).toFixed(1)} GiB`,
        '#0068ff'
      )
    : kpiCard(t('Memory (RAM)'), quotaMetrics.totalRam, `/ ${quotaMetrics.maxRam} GiB`, '#0068ff');

  const remote = memberMode
    ? undefined
    : {
        page: paging.page,
        pageSize: paging.pageSize,
        pageSizeOptions: paging.pageSizeOptions,
        total: paging.total,
        hasNext: paging.hasNext,
        sortKey: paging.sortKey,
        sortOrder: paging.sortOrder,
        fetchAll: paging.fetchAll,
        onPageChange: (page, size) => {
          setSelectedRowKeys([]);
          resetAutoRefresh();
          paging.setPage(page, size);
        },
        onSortChange: (sorter) => {
          setSelectedRowKeys([]);
          resetAutoRefresh();
          paging.setSorter(sorter);
        },
      };

  if (!canView) {
    return (
      <div style={embedded ? undefined : { maxWidth: 1400, margin: '0 auto' }}>
        {!embedded && (
          <Breadcrumb items={[{ title: t('Compute') }, { title: t('Instances') }]} style={{ marginBottom: 6, fontSize: 12 }} />
        )}
        <Result status="403" title={t("You don't have access to get {name}.", { name: t('Instances') })} />
      </div>
    );
  }

  const table = (
    <BaseTable
      columns={columns}
      dataSource={instances}
      loading={loading || actionLoading}
      rowKey="id"
      resourceName={t('Instances')}
      filterParams={filterParams}
      filters={magicFilters}
      onFilterChange={(next) => {
        setMagicFilters(next);
        setSelectedRowKeys([]);
        resetAutoRefresh();
        if (!memberMode) paging.setFilters(next);
      }}
      remote={remote}
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
      pagination={memberMode ? { pageSize: 10 } : undefined}
    />
  );

  if (embedded) {
    return (
      <div>
        {table}
        {actionModal}
      </div>
    );
  }

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

      {/* 4 KPI cards (project quota; platform allocation on the administrator page) */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          {cpuCard}
        </Col>
        <Col xs={24} sm={12} lg={6}>
          {ramCard}
        </Col>
        <Col xs={24} sm={12} lg={6}>
          {kpiCard(t('Active Instances'), quotaMetrics.activeCount, `/ ${quotaMetrics.totalCount}`, '#10b981')}
        </Col>
        <Col xs={24} sm={12} lg={6}>
          {kpiCard(t('Shutoff Instances'), quotaMetrics.shutoffCount, undefined, '#64748b')}
        </Col>
      </Row>

      {table}

      {/* Dynamic Action Modal */}
      {actionModal}
    </div>
  );
}
