import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { shareGroupStatus, shareNetworkLink } from '../shareShared';
import { ShareTable } from '../Share/shareActions';
import { fetchShareGroupDetail, shareGroupActionConfigs } from './shareGroupShared';

function GroupBaseInfo({ detail, isAdmin }) {
  const { shareGroupType = {}, shareTypes = [], shareNetwork } = detail;
  const groupTypeValue = () => {
    const { id, name } = shareGroupType;
    if (!id) return '-';
    if (!isAdmin) return `${name || '-'}(${id})`;
    return <Link to={`/share/share-group-type-admin/detail/${id}`}>{name || id}</Link>;
  };
  const typesValue = () => {
    if (!shareTypes.length) return '-';
    return shareTypes.map((it) => {
      const { id, name } = it || {};
      if (!id) return null;
      if (!isAdmin) return <div key={id}>{name ? `${name}(${id})` : id}</div>;
      return (
        <div key={id}>
          <Link to={`/share/share-type-admin/detail/${id}`}>{name || id}</Link>
        </div>
      );
    });
  };
  return (
    <>
      <DetailCard
        title={t('Base Info')}
        items={[
          { label: t('Project ID'), value: detail.project_id },
          { label: t('Availability Zone'), value: detail.availability_zone },
          { label: t('Host'), value: detail.host },
        ]}
      />
      <DetailCard
        title={t('Share Network')}
        items={[
          {
            label: t('Share Network'),
            value: detail.share_network_id,
            render: () =>
              shareNetworkLink(detail.share_network_id, shareNetwork?.name || detail.share_network_id, isAdmin),
          },
        ]}
      />
      <DetailCard
        title={t('Share Group Type')}
        column={1}
        items={[
          { label: t('Share Group Type'), value: shareGroupType.id, render: groupTypeValue },
          { label: t('Share Types'), value: shareTypes.length, render: typesValue },
        ]}
      />
    </>
  );
}

export default function ShareGroupDetail() {
  const navigate = useNavigate();
  return (
    <ResourceDetail
      policy="share_group:get"
      breadcrumb={[t('Share File Storage'), { title: t('Share Groups'), path: '/share/share-group' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/share/share-group-admin' : '/share/share-group')}
      fetch={(id, ctx) => fetchShareGroupDetail(id, ctx)}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Description'), value: d.description },
        { label: t('Status'), value: d.status, render: () => shareGroupStatus()[d.status] || d.status || '-' },
        { label: t('Created At'), value: formatTime(d.created_at) },
      ]}
      tabs={(d, { isAdmin }) => [
        { key: 'baseInfo', label: t('Base Info'), render: () => <GroupBaseInfo detail={d} isAdmin={isAdmin} /> },
        {
          key: 'share',
          label: t('Shares'),
          render: () => (
            <ShareTable filterKey="share_group_id" filterValue={d.id} hide={['share_group_id']} navigate={navigate} />
          ),
        },
      ]}
      actions={({ isAdmin }) => shareGroupActionConfigs({ isAdmin }).rowActions}
    />
  );
}
