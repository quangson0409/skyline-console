import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Breadcrumb, Alert } from 'antd';
import { Link } from 'react-router-dom';
import BaseTable from '@/components/Tables/BaseTable';
import useActionRunner from '@/components/Action/useActionRunner';
import { useResource } from '@/hooks/useResource';
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

  // interval may be a number or (list) => ms, e.g. poll only while something is PENDING_*
  const [dynamicInterval, setDynamicInterval] = useState(typeof interval === 'number' ? interval : 0);
  const { data, loading, refetch, setData } = useResource(
    () => fetch(ctx),
    [ctx, ...deps],
    { interval: dynamicInterval }
  );
  const list = Array.isArray(data) ? data : [];
  useEffect(() => {
    setDynamicInterval(typeof interval === 'function' ? interval(list) || 0 : interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, interval]);
  const fullCtx = useMemo(() => ({ ...ctx, data: list, refetch, setData }), [ctx, list, refetch, setData]);

  const onRefresh = useCallback(() => {
    setSelectedRowKeys([]);
    refetch();
  }, [refetch]);

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
        filterParams={filterParams}
        filters={initialFilters}
        getCheckboxProps={getCheckboxProps}
        searchFields={searchFields}
        onRefresh={onRefresh}
        primaryActions={primaryButtons}
        batchActions={batchButtons}
        rowActions={rows}
        isAdmin={hasAdminRole}
        onActionClick={(action, item) => handleAction(action, item)}
        selectedRowKeys={selectedRowKeys}
        onSelectChange={batch.length ? setSelectedRowKeys : undefined}
        pagination={{ pageSize }}
      />
      {typeof footer === 'function' ? footer(fullCtx) : footer}
      {actionModal}
    </div>
  );
}

export * from './helpers';
