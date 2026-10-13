import React from 'react';
import { Link } from 'react-router-dom';
import { cinderApi } from '@/api/cinder';
import ResourcePage, { nameColumn, statusColumn, timeColumn, textColumn, deleteAction } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { MetricCards } from '../shared';
import { volumeStatus, fetchVolumeTypeList, fetchCinderQuota } from '../Volumes/volumeShared';

/* ------------------------------------------------------------------ resources/cinder/snapshot */
export const snapshotTransitionStatuses = ['creating', 'deleting', 'updating', 'unmanaging', 'backing-up', 'restoring', 'uploading', 'rollbacking'];

const hasCreatedVolumes = (item) => Array.isArray(item.child_volumes) && item.child_volumes.length > 0;

/** stores/cinder/snapshot list: skyline extension (volume_name, child_volumes) with cinder fallback */
export const fetchSnapshots = async ({ isAdmin, params = {} } = {}) => {
  const query = { ...params };
  if (isAdmin) query.all_projects = true;
  let items = null;
  try {
    const res = await cinderApi.listSnapshotsExtension(query);
    if (Array.isArray(res?.volume_snapshots)) items = res.volume_snapshots;
  } catch {
    items = null;
  }
  if (!items) {
    const { all_projects, uuid, ...rest } = query;
    const [snapRes, volRes] = await Promise.all([
      cinderApi.listSnapshots(isAdmin ? { ...rest, all_tenants: 1 } : rest),
      cinderApi.listVolumes(isAdmin ? { all_tenants: 1 } : {}).catch(() => ({})),
    ]);
    const volumeMap = Object.fromEntries((volRes?.volumes || []).map((v) => [v.id, v.name]));
    items = (snapRes?.snapshots || []).map((s) => ({ ...s, volume_name: s.volume_name || volumeMap[s.volume_id] || '' }));
    if (uuid) items = items.filter((s) => s.id === uuid);
    if (rest.volume_id) items = items.filter((s) => s.volume_id === rest.volume_id);
  }
  return items.map((s) => ({
    ...s,
    project_id: s.project_id || s['os-extended-snapshot-attributes:project_id'],
    description: s.description || s.origin_data?.description,
  }));
};

/** stores/cinder/snapshot detail + detailDidFetch (child_volumes, volume_name) */
export const fetchSnapshotDetail = async (id, { isAdmin } = {}) => {
  let snap = {};
  try {
    snap = (await cinderApi.getSnapshot(id))?.snapshot || {};
  } catch (err) {
    snap = {};
  }
  let found = {};
  try {
    const list = await fetchSnapshots({ isAdmin, params: { uuid: id } });
    found = list.find((s) => s.id === id) || {};
  } catch {
    found = {};
  }
  const detail = { ...found, ...snap, child_volumes: found.child_volumes || [], volume_name: found.volume_name };
  if (!detail.id) throw new Error(t('Resource not found or failed to load'));
  return detail;
};

/* ------------------------------------------------------------------ actions (Snapshot/actions) */
export const editSnapshotAction = () => ({
  id: 'edit',
  type: 'modal',
  title: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: t('Please input name') },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => cinderApi.updateSnapshot(item.id, values),
});

export const deleteSnapshotAction = () =>
  deleteAction({
    name: t('Volume Snapshot'),
    title: t('Delete Volume Snapshot'),
    allowed: (item) => !hasCreatedVolumes(item),
    onDelete: (it) => cinderApi.deleteSnapshot(it.id),
  });

export const createVolumeFromSnapshotAction = () => ({
  id: 'create',
  type: 'modal',
  title: t('Create Volume'),
  getDefaultValues: async (item) => {
    let typeId;
    try {
      const [types, vol] = await Promise.all([fetchVolumeTypeList(), cinderApi.getVolume(item.volume_id)]);
      typeId = types.find((tp) => tp.name === vol?.volume?.volume_type)?.id;
    } catch {
      typeId = undefined;
    }
    item.__volumeTypeId = typeId;
    return { snapshot: item.name || item.id, size: item.size, volume_type: typeId, more: false };
  },
  getFormItems: async (item) => {
    const [types, quota] = await Promise.all([fetchVolumeTypeList(), fetchCinderQuota()]);
    const g = quota.gigabytes;
    const left = !g || g.limit === -1 ? null : Math.max(0, g.limit - (g.in_use || 0) - (g.reserved || 0));
    return [
      left !== null
        ? { type: 'alert', name: 'quota', message: `${t('Quota')} (${t('Left')}) - ${t('Volume Capacity (GiB)')}: ${left}` }
        : null,
      { name: 'snapshot', label: t('Volume Snapshot'), type: 'label' },
      { name: 'name', label: t('Volume Name'), type: 'input', required: true, placeholder: t('Please input name') },
      {
        name: 'size',
        label: t('Capacity (GiB)'),
        type: 'number',
        required: true,
        min: item.size,
        max: left === null ? undefined : left,
        tip: `${t('Min. Size')}: ${item.size}GiB`,
      },
      { name: 'more', label: t('Advanced Options'), type: 'switch' },
      {
        name: 'volume_type',
        label: t('Volume Type'),
        type: 'select',
        placeholder: t('Please select volume type'),
        options: types.map((tp) => ({ label: tp.name, value: tp.id })),
        visible: (v) => !!v.more,
      },
    ].filter(Boolean);
  },
  onSubmit: ({ name, size, volume_type }, item) =>
    cinderApi.createVolume({ name, size, snapshot_id: item.id, volume_type: volume_type || item.__volumeTypeId }),
});

/** Kept from the previous new-console page: create a snapshot by choosing a source volume */
export const createSnapshotAction = () => ({
  id: 'create-snapshot',
  type: 'modal',
  title: t('Create Snapshot'),
  getFormItems: async () => {
    const res = await cinderApi.listVolumes().catch(() => ({}));
    return [
      { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: 'snapshot-volume-01' },
      {
        name: 'volume_id',
        label: t('Source Volume'),
        type: 'select',
        required: true,
        options: (res?.volumes || []).map((v) => ({
          value: v.id,
          label: `${v.name || v.id} (${v.size} GiB - ${v.volume_type || '-'})`,
        })),
      },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
    ];
  },
  onSubmit: (values) => cinderApi.createSnapshot({ ...values, description: values.description || '', force: true }),
});

export const snapshotActionConfigs = ({ isAdmin } = {}) =>
  isAdmin
    ? { primaryActions: [], batchActions: [deleteSnapshotAction()], rowActions: { firstAction: deleteSnapshotAction(), moreActions: [] } }
    : {
        primaryActions: [createSnapshotAction()],
        batchActions: [deleteSnapshotAction()],
        rowActions: {
          firstAction: editSnapshotAction(),
          moreActions: [{ action: createVolumeFromSnapshotAction() }, { action: deleteSnapshotAction() }],
        },
      };

/* ------------------------------------------------------------------ columns */
export const snapshotColumns = ({ isAdmin, projectMap = {}, hideVolume } = {}) =>
  [
    nameColumn({ linkTo: (r) => `/storage/${isAdmin ? 'snapshot-admin' : 'snapshot'}/detail/${r.id}` }),
    isAdmin && {
      title: t('Project ID/Name'),
      dataIndex: 'project_name',
      key: 'project_name',
      render: (v, r) => (
        <div>
          <span>{v || projectMap[r.project_id] || '-'}</span>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.project_id}</div>
        </div>
      ),
    },
    isAdmin && textColumn(t('Host'), 'host'),
    { title: t('Size'), dataIndex: 'size', key: 'size', sorter: (a, b) => a.size - b.size, render: (v) => <b>{v} GiB</b> },
    statusColumn({ textMap: volumeStatus() }),
    !hideVolume && {
      title: t('Volume ID/Name'),
      dataIndex: 'volume_name',
      key: 'volume_name',
      render: (v, r) => (
        <div>
          <Link to={`/storage/${isAdmin ? 'volume-admin' : 'volume'}/detail/${r.volume_id}`}>{v || r.volume_id || '-'}</Link>
          {v ? <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.volume_id}</div> : null}
        </div>
      ),
    },
    timeColumn(),
  ].filter(Boolean);

export const snapshotFilters = () => [
  { name: 'name', label: t('Name') },
  {
    name: 'status',
    label: t('Status'),
    options: [
      { label: t('Available'), key: 'AVAILABLE' },
      { label: t('Error'), key: 'ERROR' },
    ],
  },
  { name: 'volume_name', label: t('Volume Name') },
];

export default function SnapshotList() {
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      title={t('Volume Snapshots')}
      breadcrumb={[t('Storage'), t('Volume Snapshots')]}
      description={t('Point-in-time copies of persistent block storage volumes.')}
      fetch={fetchSnapshots}
      header={({ data }) => (
        <MetricCards
          items={[
            { label: t('Total Snapshots'), value: data.length },
            { label: t('Total Size'), value: data.reduce((acc, s) => acc + (s.size || 0), 0), unit: 'GiB', color: '#0068ff' },
            { label: t('Available'), value: data.filter((s) => s.status === 'available').length, color: '#10b981' },
          ]}
        />
      )}
      columns={({ isAdmin }) => snapshotColumns({ isAdmin, projectMap })}
      searchFields={['name', 'id', 'volume_name', 'volume_id']}
      filterParams={snapshotFilters()}
      primaryActions={(ctx) => snapshotActionConfigs(ctx).primaryActions}
      batchActions={(ctx) => snapshotActionConfigs(ctx).batchActions}
      rowActions={(ctx) => snapshotActionConfigs(ctx).rowActions}
      interval={15000}
    />
  );
}
