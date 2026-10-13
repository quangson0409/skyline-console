import React from 'react';
import { useNavigate } from 'react-router-dom';
import { heatApi } from '@/api/heat';
import ResourcePage, { nameColumn, statusColumn, timeColumn, projectColumn, useIsAdminPage } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
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

export const stackColumns = ({ isAdmin, projectMap }) =>
  [
    nameColumn({ dataIndex: 'stack_name', linkTo: (r) => stackDetailPath(r, isAdmin) }),
    isAdmin && { ...projectColumn(projectMap, 'project_id'), title: t('Project ID/Name') },
    statusColumn({ title: t('Stack Status'), dataIndex: 'stack_status', textMap: stackStatus() }),
    timeColumn({ dataIndex: 'creation_time' }),
    timeColumn({ title: t('Updated At'), dataIndex: 'updated_time' }),
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
