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

const fetchVolumeOptions = async () => {
  const res = await cinderApi.listVolumes();
  return (res?.volumes || [])
    .filter((v) => ['available', 'in-use'].includes(v.status))
    .map((v) => ({
      value: v.id,
      label: `${v.name || v.id} (${v.size} GiB, ${v.status})`,
      status: v.status,
    }));
};

export const createBackupAction = ({ volumeId } = {}) => ({
  id: 'create',
  type: 'modal',
  policy: 'backup:create',
  aliasPolicy: 'cinder:backup:create',
  title: t('Create Volume Backup'),
  description: t(
    'When you do online backup of the volume that has been bound, you need to pay attention to the following points:'
  ),
  getDefaultValues: () => ({ incremental: false, volume_id: volumeId }),
  getFormItems: async () => {
    const volumes = await fetchVolumeOptions();
    return [
      { name: 'name', label: t('Volume Backup Name'), type: 'input', required: true },
      {
        name: 'incremental',
        label: t('Backup Mode'),
        type: 'radio',
        options: backupModeOptions(),
        tip: t(
          'Incremental backup requires a previous full backup of the volume; the system will create a full backup automatically if none exists.'
        ),
      },
      {
        name: 'volume_id',
        label: t('Volume'),
        type: 'select',
        required: true,
        disabled: Boolean(volumeId),
        options: volumes,
      },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
    ];
  },
  onSubmit: async (values) => {
    const volume = await cinderApi.getVolume(values.volume_id);
    const force = volume?.volume?.status === 'in-use';
    return cinderApi.createBackup({ ...values, force });
  },
});

export const editBackupAction = () => ({
  id: 'edit-backup',
  type: 'modal',
  policy: 'backup:update',
  aliasPolicy: 'cinder:backup:update',
  title: t('Edit Volume Backup'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', required: true },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => cinderApi.updateBackup(item.id, values),
});

export const restoreBackupAction = () => ({
  id: 'restore-backup',
  type: 'modal',
  policy: 'backup:restore',
  title: t('Restore Backup'),
  description: t(
    'Restoring overwrites the data of the source volume. The volume must be available, or every instance it is attached to must be shut off.'
  ),
  getDefaultValues: async (item) => {
    let volumeText = item.volume_name || item.volume_id;
    try {
      const res = await cinderApi.getVolume(item.volume_id);
      volumeText = `${res?.volume?.name || item.volume_id} (${t('Status')}: ${res?.volume?.status || '-'})`;
    } catch {
      // source volume may be gone; restore will create a new one
    }
    return { volumeName: volumeText };
  },
  formItems: [{ name: 'volumeName', label: t('Volume'), type: 'label' }],
  onSubmit: (_values, item) => cinderApi.restoreBackup(item.id, { volume_id: item.volume_id }),
});

export const createVolumeFromBackupAction = () => ({
  id: 'create-volume',
  type: 'modal',
  policy: 'volume:create',
  aliasPolicy: 'cinder:volume:create',
  title: t('Create Volume'),
  allowed: (item) => item.status === 'available',
  getDefaultValues: (item) => ({ backupName: item.name || item.id, size: item.size, availability_zone: 'noSelect' }),
  getFormItems: async (item) => {
    const [types, zones] = await Promise.all([
      cinderApi.listVolumeTypes().catch(() => ({})),
      cinderApi.listAvailabilityZones().catch(() => ({})),
    ]);
    return [
      { name: 'backupName', label: t('Volume Backup'), type: 'label' },
      { name: 'name', label: t('Name'), type: 'input', required: true },
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
    nameColumn({
      linkTo: (r) => `/storage/${isAdmin ? 'backup-admin' : 'backup'}/detail/${r.id}`,
    }),
    isAdmin && projectColumn(projectMap),
    !hideVolume && {
      title: t('Volume ID/Name'),
      dataIndex: 'volume_name',
      key: 'volume_name',
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
    statusColumn({ textMap: backupStatus() }),
    timeColumn(),
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

export default function BackupList() {
  const projectMap = useProjectMap();

  return (
    <ResourcePage
      title={t('Volume Backups')}
      breadcrumb={[t('Storage'), t('Volume Backups')]}
      description={t('Full and incremental backups of block storage volumes.')}
      fetch={fetchBackups}
      columns={({ isAdmin }) => backupColumns({ isAdmin, projectMap })}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'status', label: t('Status'), options: Object.entries(backupStatus()).map(([key, label]) => ({ key, label })) },
      ]}
      primaryActions={({ isAdmin }) => (isAdmin ? [] : [createBackupAction()])}
      batchActions={[deleteBackupAction()]}
      rowActions={({ isAdmin }) =>
        isAdmin
          ? { firstAction: deleteBackupAction(), moreActions: [] }
          : {
              firstAction: editBackupAction(),
              moreActions: [
                { action: restoreBackupAction() },
                { action: createVolumeFromBackupAction() },
                { action: deleteBackupAction() },
              ],
            }
      }
      interval={15000}
    />
  );
}
