import React from 'react';
import { barbicanApi } from '@/api/barbican';
import ResourcePage, { nameColumn, timeColumn, textColumn, formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { mapSecret, ExpirationStatus, isExpired } from '../common';
import { createSecretAction, deleteSecretAction, downloadPayloadAction } from './actions';

export const fetchSecrets = async () => (await barbicanApi.listSecrets()).map(mapSecret);

export const secretRowActions = () => ({
  firstAction: deleteSecretAction(),
  moreActions: [{ action: downloadPayloadAction() }],
});

export default function SecretList() {
  return (
    <ResourcePage
      aliasPolicy="barbican:secret:get"
      title={t('Secrets')}
      breadcrumb={[t('Key Manager'), t('Secrets')]}
      description={t('Secrets stored in the Barbican key manager.')}
      fetch={fetchSecrets}
      columns={[
        nameColumn({ linkTo: (r) => `/key-manager/secret/detail/${r.id}` }),
        {
          title: t('Status'),
          dataIndex: 'expiration',
          key: 'expire_status',
          sorter: (a, b) => Number(isExpired(a.expiration)) - Number(isExpired(b.expiration)),
          render: (v) => <ExpirationStatus value={v} />,
        },
        textColumn(t('Algorithm'), 'algorithm'),
        {
          title: t('Expiration'),
          dataIndex: 'expiration',
          key: 'expiration',
          render: (v) => formatTime(v),
        },
        timeColumn({ dataIndex: 'created' }),
      ]}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'algorithm', label: t('Algorithm') },
      ]}
      primaryActions={[createSecretAction()]}
      batchActions={[deleteSecretAction()]}
      rowActions={secretRowActions()}
    />
  );
}
