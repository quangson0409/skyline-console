import React from 'react';
import { Card } from 'antd';
import { barbicanApi } from '@/api/barbican';
import { getErrorMessage } from '@/hooks/useResource';
import ResourceDetail from '@/components/ResourceDetail';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { mapSecret, ExpirationStatus, fetchDecodedPayload } from '../common';
import { PayloadViewer } from '@/components/CodeBlock';
import { secretRowActions } from './SecretList';

export const fetchSecretDetail = async (id) => {
  const item = await barbicanApi.getSecret(id);
  const detail = mapSecret({ ...item, id });
  try {
    detail.payload = await fetchDecodedPayload(id, item?.payload_content_type || 'text/plain');
  } catch (err) {
    detail.payloadError = getErrorMessage(err, t('Failed to load the secret content'));
  }
  return detail;
};

export default function SecretDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Key Manager'), { title: t('Secrets'), path: '/key-manager/secret' }]}
      backPath="/key-manager/secret"
      statusField="__none"
      fetch={fetchSecretDetail}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Status'), value: d.expiration, render: (v) => <ExpirationStatus value={v} /> },
        { label: t('Secret Type'), value: d.secret_type },
        { label: t('Algorithm'), value: d.algorithm },
        { label: t('Bit Length'), value: d.bit_length },
        { label: t('Mode'), value: d.mode },
        { label: t('Expiration'), value: formatTime(d.expiration) },
        { label: t('Created At'), value: formatTime(d.created) },
        { label: t('Updated At'), value: formatTime(d.updated) },
        { label: t('Content Types'), value: d.content_types ? Object.values(d.content_types).join(', ') : undefined },
        { label: t('Creator ID'), value: d.creator_id, copyable: true },
      ]}
      tabs={(d) => [
        {
          key: 'detail_info',
          label: t('Detail Info'),
          render: () => (
            <Card variant="borderless" title={t('Secret Content')} styles={{ body: { padding: 0 } }}>
              <PayloadViewer value={d.payload} error={d.payloadError} filename={`${d.name || d.id}.txt`} />
            </Card>
          ),
        },
      ]}
      actions={secretRowActions()}
    />
  );
}
