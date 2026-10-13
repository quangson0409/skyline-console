import React from 'react';
import { Typography } from 'antd';
import { novaApi } from '@/api/nova';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { mapKeypair, deleteKeypairAction } from './KeypairList';
import { downloadText } from '../_shared';

const downloadPublicKeyAction = () => ({
  id: 'download-public-key',
  type: 'custom',
  title: t('Download Public Key'),
  allowed: (item) => Boolean(item?.public_key),
  onExecute: (item) => downloadText(item.public_key, `${item.name}.pub`),
});

export default function KeypairDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Compute'), { title: t('Keypairs'), path: '/compute/keypair' }]}
      backPath="/compute/keypair"
      title={(d) => d.name || d.origin_id || d.id}
      fetch={async (id) => {
        const name = decodeURIComponent(id);
        const res = await novaApi.getKeypairV(name);
        return mapKeypair({ name, ...(res?.keypair || {}) });
      }}
      info={(d) => [
        { label: t('ID'), value: d.origin_id },
        { label: t('Name'), value: d.name, copyable: true },
        { label: t('Key Type'), value: d.type },
        { label: t('Created At'), value: formatTime(d.created_at) },
      ]}
      tabs={() => [
        {
          key: 'detail',
          label: t('Detail'),
          render: (d) => (
            <DetailCard
              title={t('Keypair Info')}
              column={1}
              items={[
                { label: t('Fingerprint'), value: d.fingerprint, copyable: true },
                {
                  label: t('Public Key'),
                  value: d.public_key,
                  render: () =>
                    d.public_key ? (
                      <Typography.Paragraph
                        copyable
                        style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', margin: 0 }}
                      >
                        {d.public_key}
                      </Typography.Paragraph>
                    ) : (
                      '-'
                    ),
                },
                { label: t('User ID'), value: d.user_id },
              ]}
            />
          ),
        },
      ]}
      actions={() => ({
        firstAction: deleteKeypairAction(),
        moreActions: [{ action: downloadPublicKeyAction() }],
      })}
    />
  );
}
