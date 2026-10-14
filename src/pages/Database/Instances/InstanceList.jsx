import React from 'react';
import { useNavigate } from 'react-router-dom';
import { troveApi } from '@/api/trove';
import ResourcePage, { nameColumn, statusColumn, projectColumn, textColumn } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { instanceStatus, isInstanceTransition, MultiLine } from '../shared';
import { createInstanceAction, deleteInstanceAction, instanceRowActions } from './actions';

/** legacy stores/trove/instances mapper + listDidFetch */
export const mapInstance = (it = {}) => ({
  ...it,
  type: it?.datastore?.type,
  version: it?.datastore?.version,
  size: it?.volume?.size,
  project_id: it.tenant_id || it.project_id,
});

export const fetchInstances = async ({ isAdmin } = {}) => {
  const res = await troveApi.listInstances(isAdmin ? { all_projects: true } : undefined);
  return (res?.instances || []).map(mapInstance);
};

export const instanceColumns = ({ isAdmin, projectMap }) =>
  [
    nameColumn({
      linkTo: (r) => `/database/${isAdmin ? 'instances-admin' : 'instances'}/detail/${r.id}`,
    }),
    isAdmin && { ...projectColumn(projectMap), title: t('Project ID/Name') },
    textColumn(t('Datastore'), 'type'),
    textColumn(t('Datastore Version'), 'version'),
    { title: t('Host'), dataIndex: 'ip', key: 'ip', render: (v) => <MultiLine value={v} /> },
    { title: t('Database Disk (GiB)'), dataIndex: 'size', key: 'size', render: (v) => (v ?? '') === '' ? '-' : `${v} GiB` },
    statusColumn({ textMap: instanceStatus() }),
  ].filter(Boolean);

export default function InstanceList() {
  const navigate = useNavigate();
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      aliasPolicy="trove:instance:index"
      title={t('Database Instances')}
      breadcrumb={[t('Databases'), t('Database Instances')]}
      description={t('Trove managed relational and NoSQL database instances.')}
      fetch={fetchInstances}
      columns={({ isAdmin }) => instanceColumns({ isAdmin, projectMap })}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'version', label: t('Version') },
        {
          name: 'status',
          label: t('Status'),
          options: Object.entries(instanceStatus()).map(([key, label]) => ({ key, label })),
        },
      ]}
      primaryActions={({ isAdmin }) => (isAdmin ? [] : [createInstanceAction(navigate)])}
      batchActions={[deleteInstanceAction()]}
      rowActions={({ isAdmin }) => instanceRowActions(isAdmin)}
      isTransition={isInstanceTransition}
    />
  );
}
