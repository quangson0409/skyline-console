import React from 'react';
import { troveApi } from '@/api/trove';
import ResourcePage, { nameColumn, statusColumn, timeColumn, textColumn, deleteAction, IdNameCell } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { backupStatus } from '../shared';

/** legacy Backups/actions/Create */
export const createBackupAction = () => ({
  id: 'create-database-backup',
  type: 'modal',
  policy: 'backup:create',
  aliasPolicy: 'trove:backup:create',
  title: t('Create Database Backup'),
  width: 720,
  getFormItems: async () => {
    const res = await troveApi.listInstances().catch(() => ({}));
    const options = (res?.instances || []).map((it) => ({ value: it.id, label: it.name || it.id }));
    return [
      { name: 'name', label: t('Name'), type: 'input', required: true },
      { name: 'instance', label: t('Database Instance'), type: 'select', required: true, options },
      { name: 'description', label: t('Description'), type: 'input' },
    ];
  },
  onSubmit: (values) =>
    troveApi.createBackup({
      backup: { description: values.description, instance: values.instance, name: values.name },
    }),
});

/** legacy Backups/actions/Delete */
export const deleteBackupAction = () => ({
  ...deleteAction({
    name: t('Database Backup'),
    title: t('Delete Database Backup'),
    onDelete: (it) => troveApi.deleteBackup(it.id),
  }),
  policy: 'instance:delete',
});

export const fetchBackups = async () => (await troveApi.listBackups())?.backups || [];

export default function BackupList() {
  return (
    <ResourcePage
      title={t('Database Backups')}
      breadcrumb={[t('Databases'), t('Database Backups')]}
      description={t('Backups of Trove database instances.')}
      fetch={fetchBackups}
      columns={[
        nameColumn({ linkTo: (r) => `/database/backups/detail/${r.id}` }),
        textColumn(t('Description'), 'description'),
        {
          title: t('Database Instance'),
          dataIndex: 'instance_id',
          key: 'instance_id',
          render: (v) => (v ? <IdNameCell id={v} href={`/database/instances/detail/${v}`} bold={false} /> : '-'),
        },
        { title: t('Datastore'), key: 'datastore', render: (_, r) => [r.datastore?.type, r.datastore?.version].filter(Boolean).join(' ') || '-' },
        { title: t('Size'), dataIndex: 'size', key: 'size', render: (v) => (v === undefined || v === null ? '-' : `${v} GiB`) },
        statusColumn({ textMap: backupStatus() }),
        timeColumn({ dataIndex: 'created' }),
      ]}
      filterParams={[{ name: 'name', label: t('Name') }]}
      primaryActions={[createBackupAction()]}
      batchActions={[deleteBackupAction()]}
      rowActions={{ firstAction: deleteBackupAction(), moreActions: [] }}
    />
  );
}
