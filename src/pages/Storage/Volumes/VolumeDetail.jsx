import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { formatTime, yesNo } from '@/components/ResourcePage';
import DetailCard from '@/components/DetailCard';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import {
  volumeStatus,
  bootableType,
  diskTag,
  fetchVolumeDetail,
  volumeActionConfigs,
  renderAttachments,
} from './volumeShared';
import {
  fetchBackups,
  backupColumns,
  deleteBackupAction,
  backupRowActions,
  createBackupAction,
  fetchBackupsPage,
  BACKUP_LIST_POLICY,
} from '../Backups/BackupList';
import {
  fetchSnapshots,
  snapshotColumns,
  snapshotActionConfigs,
  fetchSnapshotsPage,
  SNAPSHOT_LIST_POLICY,
} from '../Snapshots/SnapshotList';
import { filterTabsByPolicy } from '@/pages/Compute/_shared';

/** Volume/Detail/BaseDetail */
function BaseInfoTab({ d, isAdmin }) {
  const imageMeta = d.volume_image_metadata;
  return (
    <div>
      <DetailCard
        title={t('Attachments Info')}
        items={[{ label: t('Attached To'), value: d.attachmentsContrib, render: () => renderAttachments(d.attachmentsContrib, isAdmin) }]}
      />
      {d.snapshot_id ? (
        <DetailCard
          title={t('Volume Source')}
          items={[
            {
              label: t('Volume Snapshot'),
              value: d.snapshot_id,
              render: () => (
                <Link to={`/storage/${isAdmin ? 'snapshot-admin' : 'snapshot'}/detail/${d.snapshot_id}`}>
                  {d.snapshot?.name || d.snapshot_id}
                </Link>
              ),
            },
          ]}
        />
      ) : null}
      {imageMeta ? (
        <DetailCard
          title={d.snapshot_id ? t('Image Info') : t('Volume Source')}
          items={[
            {
              label: t('Image'),
              value: imageMeta.image_id,
              render: () => (
                <Link to={`/compute/${isAdmin ? 'image-admin' : 'image'}/detail/${imageMeta.image_id}`}>
                  {imageMeta.image_name || imageMeta.image_id}
                </Link>
              ),
            },
          ]}
        />
      ) : null}
      {d.transfer ? (
        <DetailCard
          title={t('Volume Transfer')}
          items={[
            { label: t('ID'), value: d.transfer.id },
            { label: t('Name'), value: d.transfer.name },
            { label: t('Created At'), value: formatTime(d.transfer.created_at) },
          ]}
        />
      ) : null}
    </div>
  );
}

export default function VolumeDetail() {
  const navigate = useNavigate();
  const projectMap = useProjectMap();
  return (
    <ResourceDetail
      breadcrumb={[t('Storage'), { title: t('Volumes'), path: '/storage/volume' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/storage/volume-admin' : '/storage/volume')}
      title={t('Volume')}
      policy="volume:get"
      fetch={(id, ctx) => fetchVolumeDetail(id, ctx)}
      interval={15000}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Name'), value: d.name },
          { label: t('Description'), value: d.description },
          { label: t('Shared'), value: d.multiattach, render: () => yesNo(d.multiattach) },
          { label: t('Status'), value: d.status, render: () => volumeStatus()[d.status] || d.status },
          { label: t('Size'), value: d.size, unit: 'GiB' },
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Type'), value: d.volume_type },
          { label: t('Encrypted'), value: d.encrypted, render: () => yesNo(d.encrypted) },
          { label: t('Bootable'), value: bootableType()[String(d.bootable)] },
          { label: t('Disk Tag'), value: diskTag()[d.disk_tag] },
          { label: t('Availability Zone'), value: d.availability_zone },
          isAdmin && { label: t('Host'), value: d.host },
          isAdmin && { label: t('Project'), value: d.project_name || projectMap[d.project_id] || d.project_id },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) =>
        filterTabsByPolicy([
          { key: 'base', label: t('Detail'), render: () => <BaseInfoTab d={d} isAdmin={isAdmin} /> },
          {
            key: 'backup',
            label: t('Backups'),
            // legacy Backup list (inDetailPage): backend paging by volume_id, primary action CreateBackup
            policy: BACKUP_LIST_POLICY,
            render: () => (
              <ResourcePage
                embedded
                deps={[d.id]}
                fetch={async (ctx) => (await fetchBackups({ ...ctx, params: { volume_id: d.id } })).filter((b) => b.volume_id === d.id)}
                serverSide={{
                  defaultSortKey: 'created_at',
                  fetchPage: (args) => fetchBackupsPage({ ...args, extraParams: { volume_id: d.id } }),
                }}
                columns={({ isAdmin: admin }) => backupColumns({ isAdmin: admin, projectMap, hideVolume: true })}
                filterParams={[{ name: 'name', label: t('Name') }]}
                primaryActions={({ isAdmin: admin }) =>
                  admin ? [] : [{ ...createBackupAction({ volumeId: d.id }), title: t('Create Backup') }]
                }
                batchActions={[deleteBackupAction()]}
                rowActions={({ isAdmin: admin }) => backupRowActions({ isAdmin: admin })}
              />
            ),
          },
          {
            key: 'snapshot',
            label: t('Snapshots'),
            policy: SNAPSHOT_LIST_POLICY,
            render: () => (
              <ResourcePage
                embedded
                deps={[d.id]}
                fetch={async (ctx) => (await fetchSnapshots({ ...ctx, params: { volume_id: d.id } })).filter((s) => s.volume_id === d.id)}
                serverSide={{
                  defaultSortKey: 'created_at',
                  fetchPage: (args) => fetchSnapshotsPage({ ...args, extraParams: { volume_id: d.id } }),
                }}
                columns={({ isAdmin: admin }) => snapshotColumns({ isAdmin: admin, projectMap, hideVolume: true })}
                filterParams={[{ name: 'name', label: t('Name') }]}
                batchActions={(ctx) => snapshotActionConfigs(ctx).batchActions}
                rowActions={(ctx) => snapshotActionConfigs(ctx).rowActions}
              />
            ),
          },
        ])
      }
      actions={({ isAdmin }) => volumeActionConfigs({ isAdmin, navigate }).rowActions}
    />
  );
}
