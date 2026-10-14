import React from 'react';
import { Link } from 'react-router-dom';
import { cinderApi } from '@/api/cinder';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime, CopyText } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { backupStatus, backupRowActions } from './BackupList';

/** legacy BackupStore.fetchDetail + detailDidFetch (volume name) */
export const fetchBackupDetail = async (id) => {
  const backup = (await cinderApi.getBackup(id))?.backup || {};
  const item = { ...backup, project_id: backup['os-backup-project-attr:project_id'] || backup.project_id };
  if (item.volume_id) {
    try {
      const volume = (await cinderApi.getVolume(item.volume_id))?.volume;
      item.volume = volume;
      item.volume_name = volume?.name;
    } catch {
      item.volume_name = '';
    }
  }
  return item;
};

/** legacy Backup/Detail/BaseDetail "Volume Info" card */
function BackupBaseDetail({ d, isAdmin }) {
  const href = d.volume_id ? `/storage/${isAdmin ? 'volume-admin' : 'volume'}/detail/${d.volume_id}` : undefined;
  return (
    <DetailCard
      title={t('Volume Info')}
      items={[
        {
          label: t('Volume ID'),
          value: d.volume_id,
          render: () =>
            d.volume_id ? (
              <CopyText value={d.volume_id}>
                <Link to={href}>{d.volume_id}</Link>
              </CopyText>
            ) : (
              '-'
            ),
        },
        { label: t('Volume'), value: d.volume_name || '-' },
      ]}
    />
  );
}

export default function BackupDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Storage'), { title: t('Volume Backups'), path: '/storage/backup' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/storage/backup-admin' : '/storage/backup')}
      title={t('Volume Backup')}
      policy="backup:get"
      fetch={fetchBackupDetail}
      info={(d, { isAdmin }) =>
        [
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
          isAdmin && { label: t('Project ID'), value: d.project_id },
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
          { label: t('Data Timestamp'), value: formatTime(d.data_timestamp) },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) => [
        { key: 'base', label: t('Detail'), render: () => <BackupBaseDetail d={d} isAdmin={isAdmin} /> },
      ]}
      actions={({ isAdmin }) => backupRowActions({ isAdmin })}
    />
  );
}
