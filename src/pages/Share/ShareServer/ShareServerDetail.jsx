import React from 'react';
import { useNavigate } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { shareServerStatus, shareNetworkLink } from '../shareShared';
import { ShareTable } from '../Share/shareActions';
import { fetchShareServerDetail, shareServerActionConfigs } from './ShareServerList';

export default function ShareServerDetail() {
  const navigate = useNavigate();
  return (
    <ResourceDetail
      breadcrumb={[t('Share File Storage'), { title: t('Share Servers'), path: '/share/share-server-admin' }]}
      backPath="/share/share-server-admin"
      title={(d) => d.id}
      fetch={(id) => fetchShareServerDetail(id)}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Host'), value: d.host },
        { label: t('Status'), value: d.status, render: () => shareServerStatus()[d.status] || d.status || '-' },
        { label: t('Project ID'), value: d.project_id },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
      ]}
      tabs={(d) => {
        const bd = d.backend_details || {};
        return [
          {
            key: 'baseInfo',
            label: t('Base Info'),
            render: () => (
              <>
                <DetailCard
                  title={t('Base Info')}
                  items={[
                    { label: t('Host'), value: d.host },
                    {
                      label: t('Share Network'),
                      value: d.share_network_name,
                      render: () =>
                        d.share_network_name
                          ? shareNetworkLink(d.share_network_id, d.share_network_name, true)
                          : '-',
                    },
                    { label: t('Share Network Subnet'), value: d.share_network_subnet_id },
                  ]}
                />
                <DetailCard
                  title={t('Detail Info')}
                  items={[
                    { label: t('Instance ID'), value: bd.instance_id },
                    { label: t('IP'), value: bd.ip },
                    { label: t('Public Address'), value: bd.public_address },
                    { label: t('Username'), value: bd.username },
                    { label: t('Password'), value: bd.password },
                    { label: t('Router ID'), value: bd.router_id },
                    { label: t('Subnet ID'), value: bd.subnet_id },
                    { label: t('Service Port ID'), value: bd.service_port_id },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'share',
            label: t('Shares'),
            render: () => <ShareTable filterKey="share_server_id" filterValue={d.id} navigate={navigate} />,
          },
        ];
      }}
      actions={() => shareServerActionConfigs().rowActions}
    />
  );
}
