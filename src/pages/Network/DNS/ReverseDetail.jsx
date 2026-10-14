import React from 'react';
import { useParams } from 'react-router-dom';
import { designateApi } from '@/api/designate';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { t } from '@/core/i18n';
import { zoneStatus } from './common';
import { reverseRowActions } from './ReverseList';

export default function ReverseDetail() {
  const { id: routeId } = useParams();
  return (
    <ResourceDetail
      policy="get_image"
      breadcrumb={[t('Network'), { title: t('Reverse DNS'), path: '/network/dns/reverse' }]}
      backPath="/network/dns/reverse"
      title={(d) => d.address || d.id || routeId}
      fetch={(id) => designateApi.getReverseFloatingip(decodeURIComponent(id))}
      tabs={(d) => [
        {
          key: 'detail',
          label: t('Detail'),
          render: () => (
            <DetailCard
              title={t('Base Info')}
              column={{ xs: 1, md: 2 }}
              items={[
                { label: t('Address'), value: d.address },
                { label: t('PTR Domain Name'), value: d.ptrdname },
                { label: t('Description'), value: d.description },
                { label: t('ID'), value: d.id, copyable: true },
                { label: t('Time To Live'), value: d.ttl },
                { label: t('Status'), value: d.status, render: () => zoneStatus()[d.status] || d.status || '-' },
                { label: t('Action'), value: d.action },
              ]}
            />
          ),
        },
      ]}
      actions={reverseRowActions()}
    />
  );
}
