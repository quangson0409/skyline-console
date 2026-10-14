import React from 'react';
import { cinderApi } from '@/api/cinder';
import ResourcePage, {
  nameColumn,
  IdNameCell,
  statusColumn,
  timeColumn,
  projectColumn,
  deleteAction,
} from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { sortParams, pageParams } from '@/api/paging';
import { withQuota } from '@/components/Quota/utils';
import { fetchCinderQuota as fetchCinderQuotaData, volumeQuotaItems, backupQuotaItems } from '@/components/Quota/services';
import { novaApi } from '@/api/nova';
import { useIsAdminPage } from '@/components/ResourcePage/helpers';
import { nameRule } from '@/pages/Compute/_shared/nameRules';
import { instanceStatusText } from '@/pages/Instances/resources';
import { volumeStatus, fetchVolumesPage } from '../Volumes/volumeShared';
import { pagedSelectTableField } from '@/pages/Compute/_shared/PagedSelectTable';

export const backupStatus = () => ({
  available: t('Available'),
  error: t('Error'),
  updating: t('Updating'),
  deleting: t('Deleting'),
  error_deleting: t('Error Deleting'),
  restoring: t('Restoring'),
  creating: t('Creating'),
});

const backupModeOptions = () => [
  { value: false, label: t('Full Backup') },
  { value: true, label: t('Incremental Backup') },
];

/** legacy volumeSelectTablePropsBackend columns */
const backupVolumeColumns = () => [
  nameColumn(),
  { title: t('Size'), dataIndex: 'size', key: 'size', render: (v) => `${v ?? '-'} GiB` },
  statusColumn({ textMap: volumeStatus() }),
  { title: t('Type'), dataIndex: 'volume_type', key: 'volume_type', render: (v) => v || '-' },
  timeColumn(),
];

export const createBackupAction = ({ volumeId } = {}) => {
  // rows seen in the backend paged volume table (size for the quota chart)
  const seen = {};
  let quotaRaw = null;
  const sizeOf = (values) => {
    const id = Array.isArray(values.volume_id) ? values.volume_id[0] : values.volume_id;
    return seen[id]?.size || 0;
  };
  return {
    id: 'create',
    type: 'modal',
    policy: 'backup:create',
    aliasPolicy: 'cinder:backup:create',
    title: t('Create Volume Backup'),
    width: volumeId ? undefined : 900,
    description: t(
      'When you do online backup of the volume that has been bound, you need to pay attention to the following points:'
    ),
    getDefaultValues: () => ({ incremental: false, volume_id: volumeId ? [volumeId] : [] }),
    // legacy Backup/actions/Create showQuota: backups + backup capacity of the chosen volume
    quota: withQuota(
      async () => {
        const quota = await fetchCinderQuotaData();
        quotaRaw = quota;
        if (volumeId) {
          try {
            const v = (await cinderApi.getVolume(volumeId))?.volume;
            if (v) seen[v.id] = v;
          } catch {
            // volume label only
          }
        }
        return quota;
      },
      (quota, values) => backupQuotaItems(quota, sizeOf(values))
    ),
    getFormItems: async () => {
      let volumeLabelText = volumeId;
      if (volumeId) {
        try {
          const v = (await cinderApi.getVolume(volumeId))?.volume;
          if (v) {
            seen[v.id] = v;
            volumeLabelText = `${v.name || v.id} (${v.size} GiB, ${volumeStatus()[v.status] || v.status})`;
          }
        } catch {
          volumeLabelText = volumeId;
        }
      }
      // legacy disabledVolume: not available / in-use, or no backup quota left for its size
      const disabledVolume = (v) => {
        if (!['available', 'in-use'].includes(v.status)) return true;
        const backups = quotaRaw?.backups;
        const gigabytes = quotaRaw?.backup_gigabytes;
        if (backups && backups.left === 0) return true;
        if (!gigabytes || gigabytes.left === -1 || gigabytes.left === undefined) return false;
        return gigabytes.left < (v.size || 0);
      };
      return [
        { name: 'name', label: t('Volume Backup Name'), type: 'input', required: true, rules: [nameRule()] },
        {
          name: 'incremental',
          label: t('Backup Mode'),
          type: 'radio',
          options: backupModeOptions(),
          tip: t(
            'Incremental backup requires a previous full backup of the volume; the system will create a full backup automatically if none exists.'
          ),
        },
        volumeId
          ? { name: 'volumeLabel', label: t('Volume'), render: () => <div style={{ padding: '6px 0', fontWeight: 600 }}>{volumeLabelText}</div> }
          : pagedSelectTableField({
              name: 'volume_id',
              label: t('Volume'),
              required: true,
              columns: backupVolumeColumns(),
              disabledFunc: disabledVolume,
              fetchPage: ({ limit, marker, filters }) => fetchVolumesPage({ ctx: {}, limit, marker, filters, sortKey: 'created_at', sortDir: 'desc' }),
              onRowsChange: (rows) =>
                rows.forEach((r) => {
                  seen[r.id] = r;
                }),
            }),
        { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
      ];
    },
    onSubmit: async ({ volumeLabel: _label, volume_id: selected, ...values }) => {
      const id = volumeId || (Array.isArray(selected) ? selected[0] : selected);
      const volume = await cinderApi.getVolume(id);
      const force = volume?.volume?.status === 'in-use';
      return cinderApi.createBackup({ ...values, volume_id: id, force });
    },
  };
};

export const editBackupAction = () => ({
  id: 'edit-backup',
  type: 'modal',
  policy: 'backup:update',
  aliasPolicy: 'cinder:backup:update',
  title: t('Edit Volume Backup'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', required: true, rules: [nameRule()] },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => cinderApi.updateBackup(item.id, values),
});

/* ------------------------------------------------------------------ Restore (legacy Backup/actions/Restore) */
const volumeStatusText = (status) => volumeStatus()[status] || status || '-';

/** read-only form value (Form.Item injects `value`) */
function LabelValue({ value }) {
  return <div style={{ padding: '6px 0', fontWeight: 600, color: '#0f172a', wordBreak: 'break-all' }}>{value || '-'}</div>;
}

/**
 * Legacy Restore.getVolume: the source volume and, when it is in-use, its attached instances.
 * enable = volume available, or in-use with every attached instance SHUTOFF.
 */
export const loadRestoreState = async (item = {}) => {
  let volume = null;
  try {
    volume = (await cinderApi.getVolume(item.volume_id))?.volume || null;
  } catch {
    volume = null;
  }
  const status = volume?.status;
  let instances = [];
  if (status === 'in-use') {
    const ids = [...new Set((volume.attachments || []).map((it) => it.server_id).filter(Boolean))];
    instances = await Promise.all(
      ids.map((sid) =>
        novaApi
          .getServer(sid)
          .then((r) => r?.server || { id: sid, name: sid, status: '' })
          .catch(() => {
            const att = (volume.attachments || []).find((a) => a.server_id === sid) || {};
            return { id: sid, name: att.server_name || sid, status: '' };
          })
      )
    );
  }
  const allShutOff = instances.every((it) => String(it.status || '').toLowerCase() === 'shutoff');
  const enable = status === 'available' || (status === 'in-use' && allShutOff);
  const volumeText = `${item.volume_name || volume?.name || item.volume_id}(${t('Status')}: ${volumeStatusText(status)})`;
  const instanceText = instances
    .map((it) => `${it.name || it.id}(${t('Status')}: ${instanceStatusText(it.status)})`)
    .join(' | ');
  return { volume, status, instances, allShutOff, enable, volumeText, instanceText };
};

const restoreTip = () => (
  <div>
    <div style={{ fontWeight: 600 }}>{t('When you restore a backup, you need to meet one of the following conditions:')}</div>
    <div>{t('1. The volume associated with the backup is available.')}</div>
    <div>{t('2. The volume associated with the backup has been mounted, and the instance is shut down.')}</div>
  </div>
);

export const restoreBackupAction = () => {
  // getFormItems runs before getDefaultValues for the same opening (useActionRunner)
  let state = null;
  const volumeRule = {
    validator: () =>
      state && ['available', 'in-use'].includes(state.status)
        ? Promise.resolve()
        : Promise.reject(new Error(t('The volume associated with the backup is not available, unable to restore.'))),
  };
  const instanceRule = {
    validator: () =>
      !state || state.allShutOff
        ? Promise.resolve()
        : Promise.reject(new Error(t('The instance is not shut down, unable to restore.'))),
  };
  return {
    id: 'restore-backup',
    type: 'modal',
    policy: 'backup:restore',
    title: t('Restore Backup'),
    buttonText: t('Restore Backup'),
    description: t(
      'Restoring overwrites the data of the source volume. The volume must be available, or every instance it is attached to must be shut off.'
    ),
    getFormItems: async (item) => {
      state = await loadRestoreState(item);
      const items = [
        { type: 'alert', name: 'restore-tip', alertType: 'info', message: restoreTip() },
        !state.enable && {
          type: 'alert',
          name: 'restore-blocked',
          alertType: 'error',
          message: !['available', 'in-use'].includes(state.status)
            ? t('The volume associated with the backup is not available, unable to restore.')
            : t('The instance is not shut down, unable to restore.'),
        },
        {
          name: 'volumeName',
          label: t('Volume'),
          rules: [volumeRule],
          render: () => <LabelValue />,
        },
      ];
      if (state.instanceText) {
        items.push({
          name: 'instanceNames',
          label: t('Instance'),
          rules: [instanceRule],
          render: () => <LabelValue />,
        });
      }
      return items.filter(Boolean);
    },
    getDefaultValues: async (item) => {
      if (!state) state = await loadRestoreState(item);
      return { volumeName: state.volumeText, instanceNames: state.instanceText };
    },
    onSubmit: async (_values, item) => {
      // legacy onSubmit: re-check right before restoring, reject when not allowed
      const fresh = await loadRestoreState(item);
      state = fresh;
      if (!fresh.enable) {
        throw new Error(
          !['available', 'in-use'].includes(fresh.status)
            ? t('The volume associated with the backup is not available, unable to restore.')
            : t('The instance is not shut down, unable to restore.')
        );
      }
      return cinderApi.restoreBackup(item.id, { volume_id: item.volume_id });
    },
  };
};

export const createVolumeFromBackupAction = () => ({
  id: 'create-volume',
  type: 'modal',
  policy: 'volume:create',
  aliasPolicy: 'cinder:volume:create',
  title: t('Create Volume'),
  allowed: (item) => item.status === 'available',
  getDefaultValues: (item) => ({ backupName: item.name || item.id, size: item.size, availability_zone: 'noSelect' }),
  // legacy Backup/actions/CreateVolume showQuota: volume / capacity / volume-type quota
  quota: withQuota(() => fetchCinderQuotaData(), (quota, values) =>
    volumeQuotaItems(quota, { count: 1, size: values.size, typeName: values.volume_type })
  ),
  getFormItems: async (item) => {
    const [types, zones] = await Promise.all([
      cinderApi.listVolumeTypes().catch(() => ({})),
      cinderApi.listAvailabilityZones().catch(() => ({})),
    ]);
    return [
      { name: 'backupName', label: t('Volume Backup'), type: 'label' },
      { name: 'name', label: t('Name'), type: 'input', required: true, rules: [nameRule()] },
      {
        name: 'size',
        label: t('Capacity (GiB)'),
        type: 'number',
        min: item.size,
        required: true,
        tip: `${t('Min. Size')}: ${item.size}GiB`,
      },
      {
        name: 'volume_type',
        label: t('Volume Type'),
        type: 'select',
        required: true,
        options: (types?.volume_types || []).map((vt) => ({ value: vt.name, label: vt.name })),
      },
      {
        name: 'availability_zone',
        label: t('Availability Zone'),
        type: 'select',
        required: true,
        options: [
          { value: 'noSelect', label: t('Not select') },
          ...(zones?.availabilityZoneInfo || [])
            .filter((z) => z.zoneState?.available)
            .map((z) => ({ value: z.zoneName, label: z.zoneName })),
        ],
      },
    ];
  },
  onSubmit: ({ backupName, availability_zone, ...rest }, item) =>
    cinderApi.createVolume({
      ...rest,
      backup_id: item.id,
      availability_zone: availability_zone !== 'noSelect' ? availability_zone : null,
    }),
});

export const deleteBackupAction = () => ({
  ...deleteAction({ name: t('Volume Backup'), onDelete: (it) => cinderApi.deleteBackup(it.id) }),
  policy: 'backup:delete',
  aliasPolicy: 'cinder:backup:delete',
});

export const backupColumns = ({ isAdmin, projectMap, hideVolume } = {}) =>
  [
    // sortKey: legacy Backup container sort keys (cinder sort=key:dir)
    {
      ...nameColumn({
        linkTo: (r) => `/storage/${isAdmin ? 'backup-admin' : 'backup'}/detail/${r.id}`,
      }),
      sortKey: 'id',
    },
    isAdmin && { ...projectColumn(projectMap), sortKey: 'project_id' },
    !hideVolume && {
      title: t('Volume ID/Name'),
      dataIndex: 'volume_name',
      key: 'volume_name',
      sortKey: 'volume_id',
      render: (value, r) => (
        <IdNameCell
          id={r.volume_id}
          name={value}
          href={r.volume_id ? `/storage/${isAdmin ? 'volume-admin' : 'volume'}/detail/${r.volume_id}` : undefined}
          bold={false}
        />
      ),
    },
    {
      title: t('Backup Mode'),
      dataIndex: 'is_incremental',
      key: 'is_incremental',
      render: (v) => (v ? t('Incremental Backup') : t('Full Backup')),
    },
    { title: t('Size'), dataIndex: 'size', key: 'size', render: (v) => `${v ?? '-'} GiB` },
    { ...statusColumn({ textMap: backupStatus() }), sortKey: 'status' },
    { ...timeColumn(), sortKey: 'created_at' },
  ].filter(Boolean);

export const fetchBackups = async ({ isAdmin, params = {} } = {}) => {
  const query = { ...params };
  if (isAdmin) query.all_tenants = 1;
  const [backupRes, volumeRes] = await Promise.all([
    cinderApi.listBackups(query),
    cinderApi.listVolumes(isAdmin ? { all_tenants: 1 } : {}).catch(() => ({})),
  ]);
  const volumeMap = Object.fromEntries((volumeRes?.volumes || []).map((v) => [v.id, v.name]));
  return (backupRes?.backups || []).map((b) => ({
    ...b,
    project_id: b['os-backup-project-attr:project_id'] || b.project_id,
    volume_name: volumeMap[b.volume_id] || '',
  }));
};

/**
 * Server-side list (legacy Backup container isFilterByBackend / isSortByBackend, BackupStore):
 * cinder /backups/detail?limit&marker&sort=key:dir (+ all_tenants on the admin page) with the
 * MagicInput filters as query params. Cinder returns no count -> "has next" paging (backups_links).
 * Volume names of the page are resolved with one skyline /extension/volumes?uuid=... call.
 */
export const fetchBackupsPage = async ({ ctx = {}, limit, marker, filters = {}, sortKey, sortDir, extraParams = {} } = {}) => {
  const params = { ...pageParams({ limit, marker }), ...filters, ...extraParams, ...sortParams('cinder', sortKey, sortDir) };
  if (ctx.isAdmin) params.all_tenants = true;
  const res = await cinderApi.listBackupsPage(params);
  const ids = [...new Set(res.items.map((b) => b.volume_id).filter(Boolean))];
  let volumeMap = {};
  if (ids.length) {
    try {
      const vols = await cinderApi.listVolumesExtensionPage({
        uuid: ids,
        limit: ids.length,
        ...(ctx.isAdmin ? { all_projects: true } : {}),
      });
      volumeMap = Object.fromEntries(vols.items.map((v) => [v.id, v.name]));
    } catch {
      volumeMap = {};
    }
  }
  return {
    ...res,
    items: res.items.map((b) => ({
      ...b,
      project_id: b['os-backup-project-attr:project_id'] || b.project_id,
      volume_name: volumeMap[b.volume_id] || '',
    })),
  };
};

export const backupServerSide = { defaultSortKey: 'created_at', fetchPage: fetchBackupsPage };

/** legacy Backup searchFilters (+ the admin "Project ID" filter of adminPageHasProjectFilter) */
export const backupFilters = ({ isAdmin } = {}) =>
  [
    { name: 'name', label: t('Name') },
    { name: 'status', label: t('Status'), options: Object.entries(backupStatus()).map(([key, label]) => ({ key, label })) },
    isAdmin && { name: 'project_id', label: t('Project ID') },
  ].filter(Boolean);

/** legacy Backup container `get policy()` */
export const BACKUP_LIST_POLICY = 'backup:get_all';

export const backupRowActions = ({ isAdmin } = {}) =>
  isAdmin
    ? { firstAction: deleteBackupAction(), moreActions: [] }
    : {
        firstAction: editBackupAction(),
        moreActions: [
          { action: restoreBackupAction() },
          { action: createVolumeFromBackupAction() },
          { action: deleteBackupAction() },
        ],
      };

export default function BackupList() {
  const projectMap = useProjectMap();
  const isAdminPage = useIsAdminPage();

  return (
    <ResourcePage
      title={t('Volume Backups')}
      breadcrumb={[t('Storage'), t('Volume Backups')]}
      description={t('Full and incremental backups of block storage volumes.')}
      policy={BACKUP_LIST_POLICY}
      fetch={fetchBackups}
      serverSide={backupServerSide}
      columns={({ isAdmin }) => backupColumns({ isAdmin, projectMap })}
      filterParams={backupFilters({ isAdmin: isAdminPage })}
      primaryActions={({ isAdmin }) => (isAdmin ? [] : [createBackupAction()])}
      batchActions={[deleteBackupAction()]}
      rowActions={({ isAdmin }) => backupRowActions({ isAdmin })}
      interval={15000}
    />
  );
}
