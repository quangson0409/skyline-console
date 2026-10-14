import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { novaApi } from '@/api/nova';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { t } from '@/core/i18n';
import { useIsAdminPage } from '@/components/ResourcePage/helpers';
import { ImageDetailCards, imageHeaderInfo, fetchRawImage } from '@/pages/Compute/Images/ImageDetail';
import { fetchSnapshotVolumeInfo, snapshotRowActions } from './SnapshotList';

/** legacy InstanceSnapshotStore.detailDidFetch */
export const fetchSnapshotDetail = async (id) => {
  const raw = await fetchRawImage(id);
  const item = {
    originData: { ...raw },
    ...raw,
    project_id: raw.owner || raw.project_id,
    project_name: raw.owner_project_name || raw.project_name,
  };
  const { snapshotId, snapshotDetail, volumeDetail, instanceId } = await fetchSnapshotVolumeInfo(item);
  let instanceName = '';
  let instanceDetail = {};
  if (instanceId) {
    try {
      const res = await novaApi.getServerV(instanceId);
      instanceDetail = res?.server || {};
      instanceName = instanceDetail.name || '';
    } catch {
      // instance may be deleted
    }
  }
  return {
    ...item,
    snapshotId,
    snapshotDetail,
    volumeDetail,
    instance: { server_id: instanceId, server_name: instanceName },
    instanceDetail,
  };
};

const InstanceCard = ({ detail }) => {
  const isAdminPage = useIsAdminPage();
  const { server_id: serverId, server_name: serverName } = detail.instance || {};
  return (
    <DetailCard
      title={t('Instance Info')}
      items={[
        {
          label: t('Instance'),
          value: serverId,
          render: () => {
            if (!serverId) return '-';
            if (serverName) return <Link to={`/compute/instance${isAdminPage ? '-admin' : ''}/detail/${serverId}?tab=snapshots`}>{serverName}</Link>;
            return serverId;
          },
        },
      ]}
    />
  );
};

export default function SnapshotDetail() {
  const navigate = useNavigate();
  return (
    <ResourceDetail
      policy="get_image"
      breadcrumb={[t('Compute'), { title: t('Instance Snapshots'), path: '/compute/instance-snapshot' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/compute/instance-snapshot-admin' : '/compute/instance-snapshot')}
      fetch={fetchSnapshotDetail}
      info={(d) => imageHeaderInfo(d)}
      tabs={() => [
        {
          key: 'detail',
          label: t('Detail'),
          render: (d) => <ImageDetailCards detail={d} instanceCard={<InstanceCard detail={d} />} />,
        },
      ]}
      actions={({ isAdmin }) => snapshotRowActions({ isAdmin, navigate })}
    />
  );
}
