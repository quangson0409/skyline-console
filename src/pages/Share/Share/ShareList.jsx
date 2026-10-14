import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ResourcePage from '@/components/ResourcePage';
import useActionRunner from '@/components/Action/useActionRunner';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { MetricCards } from '@/components/MetricCards';
import { manilaIsTransition } from '../shareShared';
import { fetchShares, shareColumns, shareFilters, shareActionConfigs, createShareAction } from './shareActions';

/** Route share/share/create (legacy FormAction page): opens the create modal on top of the list */
function AutoOpenCreate({ refetch }) {
  const opened = useRef(false);
  const { handleAction, actionModal } = useActionRunner({ onRefresh: () => refetch?.() });
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    handleAction(createShareAction(), undefined);
  }, [handleAction]);
  return actionModal;
}

/** Legacy pages/share/containers/Share (share, share-admin) */
export default function ShareList({ autoCreate = false }) {
  const projectMap = useProjectMap();
  const navigate = useNavigate();
  return (
    <ResourcePage
      title={t('Shares')}
      breadcrumb={[t('Share File Storage'), t('Shares')]}
      description={t('Shared file systems (NFS, CIFS, CephFS...) provided by OpenStack Manila.')}
      fetch={fetchShares}
      header={({ data }) => (
        <MetricCards
          items={[
            { label: t('Total Shares'), value: data.length },
            {
              label: t('Total Capacity'),
              value: data.reduce((acc, it) => acc + (it.size || 0), 0),
              unit: 'GiB',
              color: '#0068ff',
            },
            { label: t('Available'), value: data.filter((it) => it.status === 'available').length, color: '#10b981' },
            {
              label: t('Error'),
              value: data.filter((it) => /error/.test(it.status || '')).length,
              color: '#ef4444',
            },
          ]}
        />
      )}
      columns={({ isAdmin }) => shareColumns({ isAdmin, projectMap })}
      filterParams={shareFilters()}
      searchFields={['name', 'id', 'share_proto', 'share_type_name']}
      isTransition={manilaIsTransition}
      primaryActions={({ isAdmin }) => shareActionConfigs({ isAdmin, navigate }).primaryActions}
      batchActions={({ isAdmin }) => shareActionConfigs({ isAdmin, navigate }).batchActions}
      rowActions={({ isAdmin }) => shareActionConfigs({ isAdmin, navigate }).rowActions}
      footer={autoCreate ? ({ refetch }) => <AutoOpenCreate refetch={refetch} /> : undefined}
    />
  );
}

export function ShareCreatePage() {
  return <ShareList autoCreate />;
}
