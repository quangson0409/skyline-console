import React from 'react';
import ResourcePage from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { filterOptions, shareGroupStatus, manilaIsTransition } from '../shareShared';
import { fetchShareGroups, shareGroupColumns, shareGroupActionConfigs, shareGroupServerSide } from './shareGroupShared';

/** Legacy pages/share/containers/ShareGroup (share-group, share-group-admin) */
export default function ShareGroupList() {
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      title={t('Share Groups')}
      breadcrumb={[t('Share File Storage'), t('Share Groups')]}
      description={t('Groups of shares managed together, built from a share group type.')}
      fetch={fetchShareGroups}
      serverSide={shareGroupServerSide}
      columns={({ isAdmin }) => shareGroupColumns({ isAdmin, projectMap })}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'status', label: t('Status'), options: filterOptions(shareGroupStatus()) },
      ]}
      isTransition={manilaIsTransition}
      primaryActions={({ isAdmin }) => shareGroupActionConfigs({ isAdmin }).primaryActions}
      batchActions={({ isAdmin }) => shareGroupActionConfigs({ isAdmin }).batchActions}
      rowActions={({ isAdmin }) => shareGroupActionConfigs({ isAdmin }).rowActions}
    />
  );
}
