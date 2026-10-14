import React, { useState, useMemo, useCallback } from 'react';
import { Breadcrumb, Alert, Result } from 'antd';
import { Link } from 'react-router-dom';
import BaseTable from '@/components/Tables/BaseTable';
import useActionRunner from '@/components/Action/useActionRunner';
import { useResource } from '@/hooks/useResource';
import { checkActionPolicy, usePolicyStore } from '@/core/policy';
import { useServerPaging } from '@/hooks/useServerPaging';
import { useAutoRefresh, defaultIsTransition } from '@/hooks/useAutoRefresh';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/core/i18n';
import { useIsAdminPage } from './helpers';

/**
 * ResourcePage - declarative list page (port of legacy containers/List/Base).
 *
 * Every legacy list container maps to one config:
 *   fetch(ctx)            -> Promise<array>   ctx = { isAdmin, projectId, t }
 *   columns(ctx)          -> antd columns (or array)
 *   primaryActions(ctx)   -> actions shown top right (create...)
 *   batchActions(ctx)     -> actions applied to selected rows (receive record[])
 *   rowActions(ctx)       -> { firstAction, moreActions }
 * Actions follow useActionRunner schema (type confirm / modal / custom).
 *
 * serverSide (opt-in, legacy isFilterByBackend / isSortByBackend): see hooks/useServerPaging.
 *   { fetchPage: async ({ ctx, page, pageSize, limit, marker, offset, filters, sortKey, sortOrder, sortDir })
 *       => { items, total?, hasNext?, marker? } | array,
 *     defaultSortKey, defaultSortOrder, markerKey, pageSizeOptions,
 *     clientSort (backend paging + in-page browser sorting, legacy isFilterByBackend only) }
 *   `fetch` is ignored; MagicInput filters and the columns declaring `sortKey` go to the backend,
 *   the page / size / filters / sort survive refresh and auto refresh.
 *   ctx also gets `total` (backend count when known) and `countBy(filters)`.
 */
export default function ResourcePage({
  title,
  description,
  breadcrumb,
  fetch,
  deps = [],
  columns,
  primaryActions,
  batchActions,
  rowActions,
  filterParams,
  searchFields,
  rowKey = 'id',
  interval = 0,
  header,
  footer,
  pageSize = 10,
  notice,
  embedded = false,
  initialFilters,
  getCheckboxProps,
  isTransition,
  autoRefreshEnabled = true,
  serverSide,
  policy,
  aliasPolicy,
}) {
  const { t } = useTranslation();
  const isAdmin = useIsAdminPage();
  const { currentProject, hasAdminRole } = useAuthStore();
  const projectId = currentProject?.id;
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const ctx = useMemo(
    () => ({ isAdmin, projectId, hasAdminRole, t }),
    [isAdmin, projectId, hasAdminRole, t]
  );

  // legacy List `get policy()`: without the list permission the page shows a notice and fetches nothing
  const policyRules = usePolicyStore((st) => st.rules);
  const canView = useMemo(
    () => checkActionPolicy({ policy, aliasPolicy }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [policy, aliasPolicy, policyRules]
  );

  const remoteMode = Boolean(serverSide && serverSide.fetchPage);
  const local = useResource(
    () => (remoteMode || !canView ? Promise.resolve([]) : fetch(ctx)),
    [ctx, remoteMode, canView, ...deps]
  );
  const paging = useServerPaging({ serverSide, ctx, deps, initialFilters, enabled: remoteMode && canView });
  const data = remoteMode ? paging.items : local.data;
  const loading = remoteMode ? paging.loading : local.loading;
  const refetch = remoteMode ? paging.refetch : local.refetch;
  const setData = remoteMode ? paging.setItems : local.setData;
  const list = Array.isArray(data) ? data : [];

  // Legacy list watcher: 10s while something is in transition, else 30s auto refresh (10 min budget).
  // `isTransition(item)` overrides the default status check; a function `interval(list) => ms`
  // (older pages) is treated the same way.
  const transitionCheck = useMemo(() => {
    if (typeof isTransition === 'function') return isTransition;
    if (typeof interval === 'function') return (item) => Boolean(interval([item]));
    return defaultIsTransition;
  }, [isTransition, interval]);
  const { autoRefresh, setAutoRefresh, resetAutoRefresh } = useAutoRefresh({
    data,
    refetch,
    isTransition: transitionCheck,
    enabled: autoRefreshEnabled,
  });

  const remoteTotal = remoteMode ? paging.total : undefined;
  const countBy = remoteMode ? paging.countBy : undefined;
  const fullCtx = useMemo(
    () => ({ ...ctx, data: list, refetch, setData, total: remoteTotal, countBy, serverSide: remoteMode }),
    [ctx, list, refetch, setData, remoteTotal, countBy, remoteMode]
  );

  // legacy fetchListByPage clears the selection on every non silent load (page / filter / sort)
  const remote = remoteMode
    ? {
        page: paging.page,
        pageSize: paging.pageSize,
        pageSizeOptions: paging.pageSizeOptions,
        total: paging.total,
        hasNext: paging.hasNext,
        sortKey: paging.sortKey,
        sortOrder: paging.sortOrder,
        fetchAll: paging.fetchAll,
        clientSort: Boolean(serverSide.clientSort),
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
      }
    : undefined;
  const onRemoteFilterChange = remoteMode
    ? (filters) => {
        setSelectedRowKeys([]);
        resetAutoRefresh();
        paging.setFilters(filters);
      }
    : undefined;

  const onRefresh = useCallback(() => {
    setSelectedRowKeys([]);
    resetAutoRefresh();
    refetch();
  }, [refetch, resetAutoRefresh]);

  const { handleAction, actionModal } = useActionRunner({ onRefresh });

  const resolve = (v) => (typeof v === 'function' ? v(fullCtx) : v);
  const cols = resolve(columns) || [];
  const primary = (resolve(primaryActions) || []).filter(Boolean);
  const batch = (resolve(batchActions) || []).filter(Boolean);
  const rows = resolve(rowActions);

  const selectedRecords = list.filter((it) => selectedRowKeys.includes(it[rowKey]));

  const batchButtons = batch.map((action) => ({
    ...action,
    onClick: () => {
      const allowedItems = typeof action.allowed === 'function'
        ? selectedRecords.filter((it) => {
            try {
              return action.allowed(it);
            } catch {
              return false;
            }
          })
        : selectedRecords;
      handleAction(action, allowedItems);
    },
  }));

  const primaryButtons = primary.map((action) => ({
    ...action,
    onClick: () => handleAction(action, undefined),
  }));

  const crumbs = (breadcrumb || [title]).map((c) =>
    typeof c === 'object' && c.path ? { title: <Link to={c.path}>{c.title}</Link> } : { title: c }
  );

  if (!canView) {
    return (
      <div style={embedded ? undefined : { maxWidth: 1600, margin: '0 auto' }}>
        {!embedded && <Breadcrumb items={crumbs} style={{ marginBottom: 16, fontSize: 13 }} />}
        <Result
          status="403"
          title={t("You don't have access to get {name}.", { name: typeof title === 'string' ? title : '' })}
        />
      </div>
    );
  }

  return (
    <div style={embedded ? undefined : { maxWidth: 1600, margin: '0 auto' }}>
      {!embedded && (
        <>
          <Breadcrumb items={crumbs} style={{ marginBottom: 16, fontSize: 13 }} />
          <div style={{ marginBottom: 20 }}>
            <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
              {title}
            </h1>
            {description ? (
              <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>{description}</p>
            ) : null}
          </div>
        </>
      )}
      {notice ? <Alert type="info" showIcon message={notice} style={{ marginBottom: 16 }} /> : null}
      {typeof header === 'function' ? header(fullCtx) : header}
      <BaseTable
        columns={cols}
        dataSource={list}
        loading={loading}
        rowKey={rowKey}
        resourceName={typeof title === 'string' ? title : undefined}
        filterParams={filterParams}
        filters={initialFilters}
        onFilterChange={onRemoteFilterChange}
        remote={remote}
        getCheckboxProps={getCheckboxProps}
        searchFields={searchFields}
        onRefresh={onRefresh}
        primaryActions={primaryButtons}
        batchActions={batchButtons}
        rowActions={rows}
        isAdmin={hasAdminRole}
        onActionClick={(action, item) => handleAction(action, item)}
        selectedRowKeys={selectedRowKeys}
        onSelectChange={
          batch.length
            ? (keys) => {
                resetAutoRefresh();
                setSelectedRowKeys(keys);
              }
            : undefined
        }
        autoRefresh={autoRefreshEnabled ? autoRefresh : undefined}
        onAutoRefreshChange={autoRefreshEnabled ? setAutoRefresh : undefined}
        pagination={{ pageSize }}
      />
      {typeof footer === 'function' ? footer(fullCtx) : footer}
      {actionModal}
    </div>
  );
}

export * from './helpers';
