import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ResourcePage from '@/components/ResourcePage';
import useActionRunner from '@/components/Action/useActionRunner';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { MetricCards } from '@/components/MetricCards';
import { fetchVolumes, volumeColumns, volumeFilters, volumeActionConfigs, createVolumeAction } from './volumeShared';

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

  return (
    <ResourcePage
      title={t('Volumes')}
      breadcrumb={[t('Storage'), t('Volumes')]}
      description={t('Persistent block storage volumes for compute instances.')}
      fetch={fetchVolumes}
      header={({ data, refetch, isAdmin }) => (
        <>
          <MetricCards
            items={[
              { label: t('Total Volumes'), value: data.length },
              {
                label: t('Total Allocated Size'),
                value: data.reduce((acc, v) => acc + (v.size || 0), 0),
                unit: 'GiB',
                color: '#0068ff',
              },
              { label: t('In-use'), value: data.filter((v) => v.status === 'in-use').length, color: '#10b981' },
              { label: t('Available'), value: data.filter((v) => v.status === 'available').length, color: '#6366f1' },
            ]}
          />
          {autoCreate && !isAdmin ? <AutoOpenCreate refetch={refetch} /> : null}
        </>
      )}
      columns={({ isAdmin }) => volumeColumns({ isAdmin, projectMap })}
      searchFields={['name', 'id', 'volume_type']}
      filterParams={volumeFilters()}
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
