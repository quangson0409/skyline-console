import React from 'react';
import { Link } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime, yesNo } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { shareStatus, accessRuleStatus, shareNetworkLink, shareLink, ExportLocations } from '../shareShared';
import { fetchShareInstanceDetail, shareInstanceActionConfigs } from './ShareInstanceList';

export default function ShareInstanceDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Share File Storage'), { title: t('Share Instances'), path: '/share/share-instance-admin' }]}
      backPath="/share/share-instance-admin"
      title={(d) => d.id}
      fetch={(id) => fetchShareInstanceDetail(id)}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Host'), value: d.host },
        { label: t('Status'), value: d.status, render: () => shareStatus()[d.status] || d.status || '-' },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
      ]}
      tabs={(d) => [
        {
          key: 'baseInfo',
          label: t('Base Info'),
          render: () => (
            <>
              <DetailCard
                title={t('Base Info')}
                items={[
                  { label: t('Host'), value: d.host },
                  { label: t('Availability Zone'), value: d.availability_zone },
                  {
                    label: t('Share Network'),
                    value: d.share_network_id,
                    render: () => shareNetworkLink(d.share_network_id, d.share_network_id, true),
                  },
                  {
                    label: t('Share Server'),
                    value: d.share_server_id,
                    render: () =>
                      d.share_server_id ? (
                        <Link to={`/share/share-server-admin/detail/${d.share_server_id}`}>{d.share_server_id}</Link>
                      ) : (
                        '-'
                      ),
                  },
                  { label: t('Share ID'), value: d.share_id, render: () => shareLink(d.share_id, d.share_id, true) },
                  {
                    label: t('Access Rules Status'),
                    value: d.access_rules_status,
                    render: () => accessRuleStatus()[d.access_rules_status] || d.access_rules_status || '-',
                  },
                  { label: t('Progress'), value: d.progress },
                  { label: t('Replica State'), value: d.replica_state },
                  {
                    label: t('Cast Rules To Read Only'),
                    value: d.cast_rules_to_readonly,
                    render: () => yesNo(d.cast_rules_to_readonly),
                  },
                ]}
              />
              <DetailCard
                title={t('Export Locations')}
                column={1}
                items={[
                  {
                    label: '',
                    value: 1,
                    render: () => <ExportLocations locations={d.exportLocations || []} showReplica={false} />,
                  },
                ]}
              />
            </>
          ),
        },
      ]}
      actions={() => shareInstanceActionConfigs().rowActions}
    />
  );
}
