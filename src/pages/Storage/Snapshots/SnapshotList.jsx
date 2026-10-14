import React from 'react';
import { cinderApi } from '@/api/cinder';
import ResourcePage, { nameColumn, IdNameCell, statusColumn, timeColumn, textColumn, deleteAction } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { withQuota, quotaItem } from '@/components/Quota/utils';
import { useIsAdminPage } from '@/components/ResourcePage/helpers';
import { nameRule } from '@/pages/Compute/_shared/nameRules';
import { pagedSelectTableField } from '@/pages/Compute/_shared/PagedSelectTable';
import { fetchCinderQuota as fetchCinderQuotaData, volumeQuotaItems } from '@/components/Quota/services';
import { MetricCards } from '@/components/MetricCards';
import { useRemoteCounts } from '@/hooks/useServerPaging';
import { sortParams, pageParams } from '@/api/paging';
import { volumeStatus, fetchVolumeTypeList, fetchCinderQuota, fetchVolumesPage } from '../Volumes/volumeShared';

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
  policy: 'volume:update_snapshot',
  title: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: t('Please input name'), rules: [nameRule()] },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => cinderApi.updateSnapshot(item.id, values),
});

export const deleteSnapshotAction = () => ({
  ...deleteAction({
    name: t('Volume Snapshot'),
    title: t('Delete Volume Snapshot'),
    allowed: (item) => !hasCreatedVolumes(item),
    onDelete: (it) => cinderApi.deleteSnapshot(it.id),
  }),
  policy: 'volume:delete_snapshot',
});

export const createVolumeFromSnapshotAction = () => ({
  id: 'create',
  type: 'modal',
  policy: 'volume:create',
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
  // legacy Snapshot/actions/CreateVolume showQuota: volume / capacity / volume-type quota
  quota: withQuota(
    async () => {
      const [quota, types] = await Promise.all([fetchCinderQuotaData(), fetchVolumeTypeList()]);
      return { quota, types };
    },
    ({ quota, types }, values, item) =>
      volumeQuotaItems(quota, {
        count: 1,
        size: values.size,
        typeName: types.find((tp) => tp.id === ((values.more && values.volume_type) || item?.__volumeTypeId))?.name,
      })
  ),
  getFormItems: async (item) => {
    const [types, quota] = await Promise.all([fetchVolumeTypeList(), fetchCinderQuota()]);
    const g = quota.gigabytes;
    const left = !g || g.limit === -1 ? null : Math.max(0, g.limit - (g.in_use || 0) - (g.reserved || 0));
    return [
      { name: 'snapshot', label: t('Volume Snapshot'), type: 'label' },
      { name: 'name', label: t('Volume Name'), type: 'input', required: true, placeholder: t('Please input name'), rules: [nameRule()] },
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

/** source volume columns of the new-console "Create Snapshot" (legacy volume select table) */
const sourceVolumeColumns = () => [
  nameColumn(),
  { title: t('Size'), dataIndex: 'size', key: 'size', render: (v) => `${v ?? '-'} GiB` },
  statusColumn({ textMap: volumeStatus() }),
  { title: t('Type'), dataIndex: 'volume_type', key: 'volume_type', render: (v) => v || '-' },
  timeColumn(),
];

/**
 * Kept from the previous new-console page: create a snapshot by choosing a source volume.
 * Same rules as legacy Volume/actions/CreateSnapshot: volume:create_snapshot policy, source volume
 * available or in-use (force only for in-use), snapshots + snapshots_<type> quota.
 */
export const createSnapshotAction = () => {
  const seen = {};
  const selectedVolume = (values) => {
    const id = Array.isArray(values.volume_id) ? values.volume_id[0] : values.volume_id;
    return seen[id];
  };
  return {
    id: 'create-snapshot',
    type: 'modal',
    policy: 'volume:create_snapshot',
    title: t('Create Snapshot'),
    width: 900,
    getDefaultValues: () => ({ volume_id: [] }),
    // legacy Volume/actions/CreateSnapshot quotaInfo: snapshots + snapshots_<volume type>
    quota: withQuota(() => fetchCinderQuotaData(), (quota, values) => {
      const volume = selectedVolume(values);
      const typeName = volume?.volume_type;
      return [
        quotaItem(quota.snapshots, { name: 'snapshot', title: t('Volume Snapshot'), add: 1 }),
        typeName &&
          quota[`snapshots_${typeName}`] &&
          quotaItem(quota[`snapshots_${typeName}`], {
            name: 'type',
            title: t('{name} type snapshots', { name: typeName }),
            add: 1,
          }),
      ].filter(Boolean);
    }),
    getFormItems: async () => [
      { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: 'snapshot-volume-01', rules: [nameRule()] },
      pagedSelectTableField({
        name: 'volume_id',
        label: t('Source Volume'),
        required: true,
        columns: sourceVolumeColumns(),
        disabledFunc: (v) => !['available', 'in-use'].includes(v.status),
        fetchPage: ({ limit, marker, filters }) =>
          fetchVolumesPage({ ctx: {}, limit, marker, filters, sortKey: 'created_at', sortDir: 'desc' }),
        onRowsChange: (rows) =>
          rows.forEach((r) => {
            seen[r.id] = r;
          }),
      }),
      { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
    ],
    onSubmit: async ({ volume_id: selected, ...values }) => {
      const id = Array.isArray(selected) ? selected[0] : selected;
      let volume = seen[id];
      try {
        volume = (await cinderApi.getVolume(id))?.volume || volume;
      } catch {
        // keep the row from the table
      }
      if (volume && !['available', 'in-use'].includes(volume.status)) {
        throw new Error(t('The volume status must be available or in-use.'));
      }
      return cinderApi.createSnapshot({
        ...values,
        volume_id: id,
        description: values.description || '',
        force: volume?.status === 'in-use',
      });
    },
  };
};

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
    // sortKey: legacy backend sort keys (skyline /extension/volume_snapshots sort_keys)
    { ...nameColumn({ linkTo: (r) => `/storage/${isAdmin ? 'snapshot-admin' : 'snapshot'}/detail/${r.id}` }), sortKey: 'name' },
    isAdmin && {
      title: t('Project ID/Name'),
      dataIndex: 'project_name',
      key: 'project_name',
      render: (v, r) => <IdNameCell id={r.project_id} name={v || projectMap[r.project_id]} bold={false} />,
    },
    isAdmin && textColumn(t('Host'), 'host'),
    { title: t('Size'), dataIndex: 'size', key: 'size', sorter: (a, b) => a.size - b.size, render: (v) => <b>{v} GiB</b> },
    { ...statusColumn({ textMap: volumeStatus() }), sortKey: 'status' },
    !hideVolume && {
      title: t('Volume ID/Name'),
      dataIndex: 'volume_name',
      key: 'volume_name',
      render: (v, r) => (
        <IdNameCell
          id={r.volume_id}
          name={v}
          href={r.volume_id ? `/storage/${isAdmin ? 'volume-admin' : 'volume'}/detail/${r.volume_id}` : undefined}
          bold={false}
        />
      ),
    },
    { ...timeColumn(), sortKey: 'created_at' },
  ].filter(Boolean);

export const snapshotFilters = ({ isAdmin } = {}) =>
  [
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
    // legacy adminPageHasProjectFilter
    isAdmin && { name: 'project_id', label: t('Project ID') },
  ].filter(Boolean);

/** legacy Snapshot container `get policy()` */
export const SNAPSHOT_LIST_POLICY = 'volume:get_all_snapshots';

const normalizeSnapshot = (s) => ({
  ...s,
  project_id: s.project_id || s['os-extended-snapshot-attributes:project_id'],
  description: s.description || s.origin_data?.description,
});

/**
 * Server-side list (legacy Snapshot container isFilterByBackend / isSortByBackend, SnapshotStore):
 * skyline /extension/volume_snapshots?limit&marker&sort_keys&sort_dirs (+ all_projects) with the
 * name / status filters; the new-console "Volume Name" filter is resolved to volume_id.
 * Falls back to cinder /snapshots/detail paging when the extension is unavailable.
 */
export const fetchSnapshotsPage = async ({ ctx = {}, limit, marker, filters = {}, sortKey, sortDir, extraParams = {} } = {}) => {
  const { volume_name: volumeName, ...rest } = filters;
  const params = { ...pageParams({ limit, marker }), ...rest, ...extraParams, ...sortParams('skyline', sortKey, sortDir) };
  if (ctx.isAdmin) params.all_projects = true;
  if (volumeName && !params.volume_id) {
    const vols = await cinderApi
      .listVolumesExtensionPage({ name: volumeName, limit: 100, ...(ctx.isAdmin ? { all_projects: true } : {}) })
      .catch(() => ({ items: [] }));
    const match = vols.items.find((v) => v.name === volumeName) || vols.items[0];
    if (!match) return { items: [], total: 0, hasNext: false };
    params.volume_id = match.id;
  }
  let res;
  try {
    res = await cinderApi.listSnapshotsExtensionPage(params);
  } catch (err) {
    if (err?.response?.status && err.response.status < 404) throw err;
    const { all_projects, sort_keys, sort_dirs, ...query } = params;
    res = await cinderApi.listSnapshotsPage({
      ...query,
      ...(all_projects ? { all_tenants: 1 } : {}),
      ...sortParams('cinder', sortKey, sortDir),
    });
  }
  return { ...res, items: res.items.map(normalizeSnapshot) };
};

export const snapshotServerSide = { defaultSortKey: 'created_at', fetchPage: fetchSnapshotsPage };

function SnapshotMetrics({ data, countBy, isAdmin, projectId, total }) {
  const counts = useRemoteCounts(
    countBy,
    // the extension expects upper case snapshot statuses (same keys as the Status filter)
    { total: {}, available: { status: 'AVAILABLE' } },
    `${isAdmin}-${projectId}-${total}-${Math.floor(Date.now() / 30000)}`
  );
  const pick = (value, fallback) => (typeof value === 'number' ? value : fallback);
  return (
    <MetricCards
      items={[
        { label: t('Total Snapshots'), value: pick(counts.total, data.length) },
        {
          // only the current page is loaded; cinder has no snapshot size summary
          label: countBy ? t('Total Size (current page)') : t('Total Size'),
          value: data.reduce((acc, s) => acc + (s.size || 0), 0),
          unit: 'GiB',
          color: '#0068ff',
        },
        {
          label: t('Available'),
          value: pick(counts.available, data.filter((s) => s.status === 'available').length),
          color: '#10b981',
        },
      ]}
    />
  );
}

export default function SnapshotList() {
  const projectMap = useProjectMap();
  const isAdminPage = useIsAdminPage();
  return (
    <ResourcePage
      policy={SNAPSHOT_LIST_POLICY}
      title={t('Volume Snapshots')}
      breadcrumb={[t('Storage'), t('Volume Snapshots')]}
      description={t('Point-in-time copies of persistent block storage volumes.')}
      fetch={fetchSnapshots}
      serverSide={snapshotServerSide}
      header={({ data, countBy, isAdmin, projectId, total }) => (
        <SnapshotMetrics data={data} countBy={countBy} isAdmin={isAdmin} projectId={projectId} total={total} />
      )}
      columns={({ isAdmin }) => snapshotColumns({ isAdmin, projectMap })}
      searchFields={['name', 'id', 'volume_name', 'volume_id']}
      filterParams={snapshotFilters({ isAdmin: isAdminPage })}
      primaryActions={(ctx) => snapshotActionConfigs(ctx).primaryActions}
      batchActions={(ctx) => snapshotActionConfigs(ctx).batchActions}
      rowActions={(ctx) => snapshotActionConfigs(ctx).rowActions}
      interval={15000}
    />
  );
}
