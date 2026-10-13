import React from 'react';
import { Link } from 'react-router-dom';
import { cinderApi } from '@/api/cinder';
import ResourceDetail from '@/components/ResourceDetail';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  backupStatus,
  editBackupAction,
  restoreBackupAction,
  createVolumeFromBackupAction,
  deleteBackupAction,
} from './BackupList';

export default function BackupDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Storage'), { title: t('Volume Backups'), path: '/storage/backup' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/storage/backup-admin' : '/storage/backup')}
      fetch={async (id) => (await cinderApi.getBackup(id))?.backup}
      info={(d, { isAdmin }) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Status'), value: d.status, render: () => backupStatus()[d.status] || d.status },
        {
          label: t('Volume'),
          value: d.volume_id,
          render: () => (
            <Link to={`/storage/${isAdmin ? 'volume-admin' : 'volume'}/detail/${d.volume_id}`}>{d.volume_id}</Link>
          ),
        },
        { label: t('Size'), value: d.size, unit: 'GiB' },
        { label: t('Backup Mode'), value: d.is_incremental ? t('Incremental Backup') : t('Full Backup') },
        { label: t('Has Dependent Backups'), value: d.has_dependent_backups ? t('Yes') : t('No') },
        { label: t('Availability Zone'), value: d.availability_zone },
        { label: t('Container'), value: d.container },
        { label: t('Snapshot ID'), value: d.snapshot_id },
        { label: t('Fail Reason'), value: d.fail_reason },
        { label: t('Description'), value: d.description },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
        { label: t('Data Timestamp'), value: formatTime(d.data_timestamp) },
      ]}
      actions={({ isAdmin }) =>
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
    />
  );
}
