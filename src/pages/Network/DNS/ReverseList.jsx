import React from 'react';
import { Link } from 'react-router-dom';
import { designateApi } from '@/api/designate';
import ResourcePage, { statusColumn, textColumn } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { zoneStatus } from './common';
import { setReverseAction, unsetReverseAction } from './actions';

export const reverseRowActions = () => ({
  firstAction: setReverseAction(),
  moreActions: [{ action: unsetReverseAction() }],
});

export default function ReverseList() {
  return (
    <ResourcePage
      policy="get_images"
      title={t('Reverse DNS')}
      breadcrumb={[t('Network'), t('Reverse DNS')]}
      description={t('PTR records of floating IP addresses (Designate reverse DNS).')}
      fetch={() => designateApi.listReverseFloatingips()}
      searchFields={['address', 'ptrdname', 'id']}
      columns={[
        {
          title: t('Address'),
          dataIndex: 'address',
          key: 'address',
          sorter: (a, b) => String(a.address || '').localeCompare(String(b.address || '')),
          render: (v, r) => (
            <Link to={`/network/dns/reverse/detail/${encodeURIComponent(r.id)}`} style={{ fontWeight: 600 }}>
              {v || r.id}
            </Link>
          ),
        },
        textColumn(t('PTR Domain Name'), 'ptrdname'),
        statusColumn({ textMap: zoneStatus() }),
      ]}
      rowActions={reverseRowActions()}
    />
  );
}
