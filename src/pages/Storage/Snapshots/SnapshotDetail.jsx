import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { formatTime } from '@/components/ResourcePage';
import DetailCard from '@/components/DetailCard';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { volumeStatus, fetchVolumes, volumeColumns, volumeActionConfigs } from '../Volumes/volumeShared';
import { fetchSnapshotDetail, snapshotActionConfigs } from './SnapshotList';

export default function SnapshotDetail() {
  const navigate = useNavigate();
  const projectMap = useProjectMap();
  return (
    <ResourceDetail
      breadcrumb={[t('Storage'), { title: t('Volume Snapshots'), path: '/storage/snapshot' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/storage/snapshot-admin' : '/storage/snapshot')}
      fetch={(id, ctx) => fetchSnapshotDetail(id, ctx)}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Description'), value: d.description },
        { label: t('Status'), value: d.status, render: () => volumeStatus()[d.status] || d.status },
        { label: t('Size'), value: d.size, unit: 'GiB' },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
      ]}
      tabs={(d, { isAdmin }) => [
        {
          key: 'base',
          label: t('Detail'),
          render: () => (
            <DetailCard
              title={t('Snapshot Source')}
              items={[
                {
                  label: t('Volume'),
                  value: d.volume_id,
                  render: () =>
                    d.volume_id ? (
                      <Link to={`/storage/${isAdmin ? 'volume-admin' : 'volume'}/detail/${d.volume_id}`}>
                        {d.volume_name || d.volume_id}
                      </Link>
                    ) : (
                      '-'
                    ),
                },
              ]}
            />
          ),
        },
        ...(d.child_volumes && d.child_volumes.length
          ? [
              {
                key: 'volumes',
                label: t('Created Volumes'),
                render: () => (
                  <ResourcePage
                    embedded
                    fetch={(ctx) => {
                      const ids = d.child_volumes.map((it) => it.volume_id);
                      return fetchVolumes({ ...ctx, params: { uuid: ids } }).then((list) => list.filter((v) => ids.includes(v.id)));
                    }}
                    columns={({ isAdmin: admin }) => volumeColumns({ isAdmin: admin, projectMap })}
                    filterParams={[{ name: 'name', label: t('Name') }]}
                    rowActions={({ isAdmin: admin }) => volumeActionConfigs({ isAdmin: admin, navigate }).rowActions}
                  />
                ),
              },
            ]
          : []),
      ]}
      actions={(ctx) => snapshotActionConfigs(ctx).rowActions}
    />
  );
}
