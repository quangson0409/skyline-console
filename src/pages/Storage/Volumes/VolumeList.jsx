import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ResourcePage, { useIsAdminPage } from '@/components/ResourcePage';
import useActionRunner from '@/components/Action/useActionRunner';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { MetricCards } from '@/components/MetricCards';
import { useRemoteCounts } from '@/hooks/useServerPaging';
import { cinderApi } from '@/api/cinder';
import {
  fetchVolumes,
  volumeColumns,
  volumeFilters,
  volumeActionConfigs,
  createVolumeAction,
  volumeServerSide,
  VOLUME_LIST_POLICY,
} from './volumeShared';

/** KPI cards: backend counts (extension count + /volumes/summary), the current page as fallback */
function VolumeMetrics({ data, countBy, isAdmin, projectId, total }) {
  const counts = useRemoteCounts(
    countBy,
    {
      total: {},
      inUse: { status: 'in-use' },
      available: { status: 'available' },
      size: async () => {
        const res = await cinderApi.getVolumesSummary(isAdmin ? { all_tenants: 1 } : undefined);
        return res?.['volume-summary']?.total_size;
      },
    },
    // re-count when the total changes, at most every 30 s otherwise (auto refresh ticks)
    `${isAdmin}-${projectId}-${total}-${Math.floor(Date.now() / 30000)}`
  );
  const pick = (value, fallback) => (typeof value === 'number' ? value : fallback);
  return (
    <MetricCards
      items={[
        { label: t('Total Volumes'), value: pick(counts.total, data.length) },
        {
          label: t('Total Allocated Size'),
          value: pick(counts.size, data.reduce((acc, v) => acc + (v.size || 0), 0)),
          unit: 'GiB',
          color: '#0068ff',
        },
        {
          label: t('In-use'),
          value: pick(counts.inUse, data.filter((v) => v.status === 'in-use').length),
          color: '#10b981',
        },
        {
          label: t('Available'),
          value: pick(counts.available, data.filter((v) => v.status === 'available').length),
          color: '#6366f1',
        },
      ]}
    />
  );
}

/** Route storage/volume/create (legacy step-form page): opens the create modal on top of the list */
function AutoOpenCreate({ refetch }) {
  const opened = useRef(false);
  const { handleAction, actionModal } = useActionRunner({ onRefresh: () => refetch?.() });
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    handleAction(createVolumeAction(), undefined);
  }, [handleAction]);
  return actionModal;
}

export default function VolumeList({ autoCreate = false }) {
  const projectMap = useProjectMap();
  const navigate = useNavigate();
  const isAdminPage = useIsAdminPage();

  return (
    <ResourcePage
      policy={VOLUME_LIST_POLICY}
      title={t('Volumes')}
      breadcrumb={[t('Storage'), t('Volumes')]}
      description={t('Persistent block storage volumes for compute instances.')}
      fetch={fetchVolumes}
      serverSide={volumeServerSide}
      header={({ data, refetch, isAdmin, countBy, projectId, total }) => (
        <>
          <VolumeMetrics data={data} countBy={countBy} isAdmin={isAdmin} projectId={projectId} total={total} />
          {autoCreate && !isAdmin ? <AutoOpenCreate refetch={refetch} /> : null}
        </>
      )}
      columns={({ isAdmin }) => volumeColumns({ isAdmin, projectMap })}
      searchFields={['name', 'id', 'volume_type']}
      filterParams={volumeFilters({ isAdmin: isAdminPage })}
      primaryActions={({ isAdmin }) => volumeActionConfigs({ isAdmin, navigate }).primaryActions}
      batchActions={({ isAdmin }) => volumeActionConfigs({ isAdmin, navigate }).batchActions}
      rowActions={({ isAdmin }) => volumeActionConfigs({ isAdmin, navigate }).rowActions}
      interval={15000}
    />
  );
}

export function VolumeCreatePage() {
  return <VolumeList autoCreate />;
}
