import React from 'react';
import { Tooltip } from 'antd';
import { skylineApi } from '@/api/skyline';
import apiClient from '@/api/client';
import { serviceBase, versionHeaders } from '@/api/endpoints';
import ResourcePage, { nameColumn, projectColumn, formatTime, useIsAdminPage } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { sinceTime } from '@/pages/Configuration/shared';

/** Legacy pages/management/containers/RecycleBin (soft-deleted instances, tenant + administrator) */

const serverAction = (id, body) =>
  apiClient.post(`${serviceBase('nova')}/servers/${id}/action`, body, versionHeaders('nova'));

export const recycleApi = {
  /** legacy ServerStore.restore */
  restore: (id) => serverAction(id, { restore: null }),
  /** legacy ServerStore.forceDelete */
  forceDelete: (id) => serverAction(id, { forceDelete: null }),
};

export const fetchRecycleServers = async ({ isAdmin } = {}) => {
  const params = { limit: 1000, sort_keys: 'updated_at', sort_dirs: 'desc' };
  if (isAdmin) params.all_projects = true;
  const res = await skylineApi.listRecycleServers(params);
  const list = res?.recycle_servers || res?.servers || [];
  return list.map((it) => ({
    ...it,
    fixed_addresses: it.fixed_addresses || [],
    floating_addresses: it.floating_addresses || [],
    reclaim_timestamp: it.reclaim_timestamp ? Number(it.reclaim_timestamp) * 1000 : it.reclaim_timestamp,
  }));
};

const runEach = (fn) => async (target) => {
  const list = Array.isArray(target) ? target : [target];
  for (const it of list) {
    // eslint-disable-next-line no-await-in-loop
    await fn(it.id);
  }
};

export const recoverAction = () => ({
  id: 'Recover',
  type: 'confirm',
  title: t('Recover'),
  actionName: t('recover instance'),
  onSubmit: runEach(recycleApi.restore),
});

export const forceDeleteAction = () => ({
  id: 'delete',
  type: 'confirm',
  title: t('Delete'),
  actionName: t('delete instance'),
  isDanger: true,
  onSubmit: runEach(recycleApi.forceDelete),
});

const listOf = (values) =>
  values && values.length ? values.map((it) => <div key={it}>{it}</div>) : '-';

export default function RecycleBinList() {
  const projectMap = useProjectMap();
  const isAdminPage = useIsAdminPage();
  return (
    <ResourcePage
      title={t('Recycle Bin')}
      breadcrumb={[t('Maintenance'), t('Recycle Bin')]}
      description={t('Soft-deleted instances can be recovered until their reclaim time expires.')}
      fetch={fetchRecycleServers}
      searchFields={['name', 'id', 'project_name']}
      columns={({ isAdmin }) =>
        [
          nameColumn({
            linkTo: (r) => `/management/${isAdmin ? 'recycle-bin-admin' : 'recycle-bin'}/detail/${r.id}`,
          }),
          isAdmin && {
            ...projectColumn(projectMap, 'project_id'),
            title: t('Project ID/Name'),
            render: (v, r) => (
              <div>
                <span>{r.project_name || projectMap[v] || '-'}</span>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{v}</div>
              </div>
            ),
          },
          {
            title: t('Image'),
            dataIndex: 'image_os_distro',
            key: 'image_os_distro',
            render: (v, r) =>
              v || r.image_name ? (
                <Tooltip title={r.image_name}>
                  <span>
                    {v ? <b style={{ marginRight: 6 }}>{v}</b> : null}
                    {r.image_name || ''}
                  </span>
                </Tooltip>
              ) : (
                '-'
              ),
          },
          { title: t('Fixed IP'), dataIndex: 'fixed_addresses', key: 'fixed_addresses', render: listOf },
          { title: t('Floating IP'), dataIndex: 'floating_addresses', key: 'floating_addresses', render: listOf },
          {
            title: t('Flavor'),
            dataIndex: 'flavor',
            key: 'flavor',
            render: (v) => (v && typeof v === 'object' ? v.original_name || v.name || v.id : v || '-'),
          },
          {
            title: t('Deleted At'),
            dataIndex: 'deleted_at',
            key: 'deleted_at',
            sorter: (a, b) => new Date(a.deleted_at || 0) - new Date(b.deleted_at || 0),
            render: (v) => <Tooltip title={formatTime(v)}>{sinceTime(v)}</Tooltip>,
          },
          {
            title: t('Expired Time'),
            dataIndex: 'reclaim_timestamp',
            key: 'reclaim_timestamp',
            render: (v) => (v ? formatTime(new Date(Number(v)).toISOString()) : '-'),
          },
        ].filter(Boolean)
      }
      filterParams={[
        { name: 'name', label: t('Name') },
        ...(isAdminPage ? [{ name: 'project_name', label: t('Project Name') }] : []),
      ]}
      batchActions={[recoverAction(), forceDeleteAction()]}
      rowActions={{ firstAction: recoverAction(), moreActions: [{ action: forceDeleteAction() }] }}
    />
  );
}
