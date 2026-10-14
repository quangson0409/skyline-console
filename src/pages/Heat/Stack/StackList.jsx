import React from 'react';
import { useNavigate } from 'react-router-dom';
import { heatApi } from '@/api/heat';
import ResourcePage, { nameColumn, statusColumn, timeColumn, projectColumn, useIsAdminPage } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { sortParams, pageParams } from '@/api/paging';
import { stackStatus, FILTER_STATUSES, isStackInProgress, mapStack, stackDetailPath } from './resources';
import { createStackAction, deleteStackAction, stackRowActions } from './actions';

/** legacy StackStore.paramsFuncPage: with_count + tenant (project) or global_tenant (admin) */
export const fetchStacks = async ({ isAdmin, projectId }) => {
  const params = { with_count: true, sort_keys: 'creation_time', sort_dir: 'desc' };
  if (isAdmin) params.global_tenant = true;
  else if (projectId) params.tenant = projectId;
  const res = await heatApi.listStacks(params);
  return (res?.stacks || []).map(mapStack);
};

/**
 * Server-side list (legacy Stack container isFilterByBackend / isSortByBackend, StackStore):
 * GET /stacks?limit&marker&sort_keys&sort_dir&with_count=true + tenant (project) / global_tenant (admin),
 * id / name / status filters; the admin "Project ID" filter is sent as `tenant` (legacy projectFilterKey).
 * with_count -> count -> total.
 */
export const fetchStacksPage = async ({ ctx = {}, limit, marker, filters = {}, sortKey, sortDir } = {}) => {
  const { project_id: tenantFilter, ...rest } = filters;
  const params = { ...pageParams({ limit, marker }), ...rest, ...sortParams('heat', sortKey, sortDir), with_count: true };
  if (ctx.isAdmin) {
    params.global_tenant = true;
    if (tenantFilter) params.tenant = tenantFilter;
  } else if (ctx.projectId) params.tenant = ctx.projectId;
  const res = await heatApi.listStacksPage(params);
  return { ...res, items: res.items.map(mapStack) };
};

export const stackServerSide = { defaultSortKey: 'creation_time', fetchPage: fetchStacksPage };

export const stackColumns = ({ isAdmin, projectMap }) =>
  [
    // sortKey: legacy backend sort keys (heat sort_keys)
    { ...nameColumn({ dataIndex: 'stack_name', linkTo: (r) => stackDetailPath(r, isAdmin) }), sortKey: 'stack_name' },
    isAdmin && { ...projectColumn(projectMap, 'project_id'), title: t('Project ID/Name') },
    {
      ...statusColumn({ title: t('Stack Status'), dataIndex: 'stack_status', textMap: stackStatus() }),
      sortKey: 'stack_status',
    },
    { ...timeColumn({ dataIndex: 'creation_time' }), sortKey: 'creation_time' },
    { ...timeColumn({ title: t('Updated At'), dataIndex: 'updated_time' }), sortKey: 'updated_time' },
  ].filter(Boolean);

export default function StackList() {
  const navigate = useNavigate();
  const projectMap = useProjectMap();
  const isAdmin = useIsAdminPage();

  return (
    <ResourcePage
      title={t('Stacks')}
      breadcrumb={[t('Orchestration'), t('Stacks')]}
      description={t('Heat stacks: groups of cloud resources deployed and managed from a template.')}
      fetch={fetchStacks}
      serverSide={stackServerSide}
      columns={({ isAdmin }) => stackColumns({ isAdmin, projectMap })}
      // legacy searchFilters: ID, Name, Stack Status (+ project filter on the administrator page)
      filterParams={[
        { name: 'id', label: t('ID') },
        { name: 'name', label: t('Name') },
        {
          name: 'status',
          label: t('Stack Status'),
          options: FILTER_STATUSES.map((key) => ({ key, label: stackStatus()[key] })),
        },
        isAdmin && { name: 'project_id', label: t('Project ID') },
      ].filter(Boolean)}
      primaryActions={({ isAdmin }) => [createStackAction({ navigate, isAdmin })]}
      batchActions={[deleteStackAction()]}
      rowActions={({ isAdmin }) => stackRowActions({ navigate, isAdmin })}
      isTransition={isStackInProgress}
    />
  );
}
