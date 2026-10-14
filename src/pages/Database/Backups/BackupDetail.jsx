import React from 'react';
import { Link } from 'react-router-dom';
import { troveApi } from '@/api/trove';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { backupStatus } from '../shared';
import { deleteBackupAction } from './BackupList';

export default function BackupDetail() {
  return (
    <ResourceDetail
      policy="backup:show"
      breadcrumb={[t('Databases'), { title: t('Database Backups'), path: '/database/backups' }]}
      backPath="/database/backups"
      fetch={async (id) => (await troveApi.getBackup(id))?.backup}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Description'), value: d.description },
      ]}
      tabs={(d) => [
        {
          key: 'general_info',
          label: t('Detail'),
          render: () => (
            <DetailCard
              title={t('Base Info')}
              items={[
                { label: t('Datastore'), value: d.datastore?.type },
                { label: t('Datastore Version'), value: d.datastore?.version },
                { label: t('Backup File Location'), value: d.locationRef, copyable: true },
                { label: t('Initial Volume Size'), value: d.size, unit: d.size !== undefined ? 'GiB' : undefined },
                { label: t('Created At'), value: formatTime(d.created) },
                { label: t('Updated At'), value: formatTime(d.updated) },
                { label: t('Status'), value: backupStatus()[d.status] || d.status },
                {
                  label: t('Database Instance'),
                  value: d.instance_id,
                  render: () => (d.instance_id ? <Link to={`/database/instances/detail/${d.instance_id}`}>{d.instance_id}</Link> : '-'),
                },
                { label: t('Parent Backup'), value: d.parent_id },
              ]}
            />
          ),
        },
      ]}
      actions={{ firstAction: deleteBackupAction(), moreActions: [] }}
    />
  );
}
