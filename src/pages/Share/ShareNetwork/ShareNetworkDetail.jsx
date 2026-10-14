import React from 'react';
import { useNavigate } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { networkLink } from '../shareShared';
import { ShareTable } from '../Share/shareActions';
import { fetchShareNetworkDetail, shareNetworkActionConfigs } from './shareNetworkShared';

function SubnetCards({ detail, isAdmin }) {
  const { share_network_subnets: shareSubnets = [], networks = [], subnets = [] } = detail;
  if (!shareSubnets.length) {
    return <DetailCard title={t('Share Network Subnets')} items={[{ label: t('Share Network Subnet'), value: null }]} />;
  }
  return shareSubnets.map((shareSubnet, index) => {
    const subnet = subnets[index] || {};
    const network = networks[index] || {};
    return (
      <DetailCard
        key={shareSubnet.id || index}
        title={`${t('Share Network Subnet')} ${index + 1}`}
        items={[
          { label: t('ID'), value: shareSubnet.id, copyable: true },
          {
            label: t('Neutron Net'),
            value: network.id,
            render: () => networkLink(network.id || shareSubnet.neutron_net_id, network.name, isAdmin),
          },
          { label: t('Neutron Subnet'), value: subnet.name || shareSubnet.neutron_subnet_id },
          { label: t('IP Version'), value: shareSubnet.ip_version ?? shareSubnet.ip_vesion },
          { label: t('Network Type'), value: shareSubnet.network_type },
          { label: t('Segmentation ID'), value: shareSubnet.segmentation_id },
          { label: t('Availability Zone'), value: shareSubnet.availability_zone },
          { label: t('CIDR'), value: shareSubnet.cidr },
          { label: t('Gateway'), value: shareSubnet.gateway },
          { label: t('MTU'), value: shareSubnet.mtu },
          { label: t('Created At'), value: formatTime(shareSubnet.created_at) },
        ]}
      />
    );
  });
}

export default function ShareNetworkDetail() {
  const navigate = useNavigate();
  return (
    <ResourceDetail
      policy="share_network:show"
      breadcrumb={[t('Share File Storage'), { title: t('Share Networks'), path: '/share/share-network' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/share/share-network-admin' : '/share/share-network')}
      fetch={(id) => fetchShareNetworkDetail(id)}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Description'), value: d.description },
        { label: t('Project ID'), value: d.project_id },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
      ]}
      tabs={(d, { isAdmin }) => [
        { key: 'baseInfo', label: t('Base Info'), render: () => <SubnetCards detail={d} isAdmin={isAdmin} /> },
        {
          key: 'share',
          label: t('Shares'),
          render: () => (
            <ShareTable filterKey="share_network_id" filterValue={d.id} hide={['share_network_id']} navigate={navigate} />
          ),
        },
      ]}
      actions={({ isAdmin }) => shareNetworkActionConfigs({ isAdmin }).rowActions}
    />
  );
}
