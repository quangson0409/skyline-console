import React from 'react';
import { useNavigate } from 'react-router-dom';
import { magnumApi } from '@/api/magnum';
import ResourcePage, { nameColumn, statusColumn, projectColumn, timeColumn } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { clusterStatus, healthStatus, toOptions, isClusterTransition, keypairLink, fetchKeypairs } from '../common';
import { createClusterAction, deleteClusterAction, clusterRowActions } from './actions';

/** Legacy ClustersStore / ClustersAdminStore list (+ keypair existence check) */
export const fetchClusters = async ({ isAdmin } = {}) => {
  const [res, keypairs] = await Promise.all([
    magnumApi.listClusters({}, { detail: !isAdmin }),
    isAdmin ? Promise.resolve([]) : fetchKeypairs().catch(() => []),
  ]);
  return (res?.clusters || []).map((it) => {
    const row = { ...it, id: it.uuid };
    if (!isAdmin && row.keypair && !keypairs.some((k) => k.name === row.keypair)) {
      row.original_keypair = row.keypair;
      row.keypair = null;
    }
    return row;
  });
};

export const clusterPath = (isAdmin, id) => `/container-infra/${isAdmin ? 'clusters-admin' : 'clusters'}/detail/${id}`;

export default function ClusterList() {
  const projectMap = useProjectMap();
  const navigate = useNavigate();
  return (
    <ResourcePage
      title={t('Clusters')}
      breadcrumb={[t('Container Infra'), t('Clusters')]}
      description={t('Kubernetes clusters provisioned by Magnum.')}
      rowKey="uuid"
      fetch={fetchClusters}
      isTransition={isClusterTransition}
      columns={({ isAdmin }) =>
        [
          nameColumn({ idIndex: 'uuid', linkTo: (r) => clusterPath(isAdmin, r.uuid) }),
          isAdmin && projectColumn(projectMap),
          statusColumn({ textMap: clusterStatus() }),
          {
            title: t('Health Status'),
            dataIndex: 'health_status',
            key: 'health_status',
            render: (v) => healthStatus()[v] || v || '-',
          },
          { title: t('Master Nodes'), dataIndex: 'master_count', key: 'master_count', render: (v) => v ?? '-' },
          { title: t('Nodes'), dataIndex: 'node_count', key: 'node_count', render: (v) => v ?? '-' },
          !isAdmin && {
            title: t('Keypair'),
            dataIndex: 'keypair',
            key: 'keypair',
            render: (v, r) => (v ? keypairLink(v) : r.original_keypair || '-'),
          },
          timeColumn(),
        ].filter(Boolean)
      }
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'status', label: t('Status'), options: toOptions(clusterStatus()) },
        { name: 'health_status', label: t('Health Status'), options: toOptions(healthStatus()) },
      ]}
      primaryActions={({ isAdmin }) => (isAdmin ? [] : [createClusterAction(navigate)])}
      batchActions={[deleteClusterAction()]}
      rowActions={({ isAdmin }) => clusterRowActions(isAdmin)}
    />
  );
}
