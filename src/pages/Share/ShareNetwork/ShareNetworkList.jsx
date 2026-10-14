import React from 'react';
import ResourcePage from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { fetchShareNetworks, shareNetworkColumns, shareNetworkActionConfigs } from './shareNetworkShared';

/** Legacy pages/share/containers/ShareNetwork (share-network, share-network-admin) */
export default function ShareNetworkList() {
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      policy="share_network:detail"
      title={t('Share Networks')}
      breadcrumb={[t('Share File Storage'), t('Share Networks')]}
      description={t('Neutron networks and subnets used by share servers of the shared file systems service.')}
      fetch={fetchShareNetworks}
      columns={({ isAdmin }) => shareNetworkColumns({ isAdmin, projectMap })}
      filterParams={[{ name: 'name', label: t('Name') }]}
      primaryActions={({ isAdmin }) => shareNetworkActionConfigs({ isAdmin }).primaryActions}
      batchActions={({ isAdmin }) => shareNetworkActionConfigs({ isAdmin }).batchActions}
      rowActions={({ isAdmin }) => shareNetworkActionConfigs({ isAdmin }).rowActions}
    />
  );
}
