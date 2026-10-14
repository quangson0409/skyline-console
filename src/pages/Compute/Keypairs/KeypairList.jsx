import React from 'react';
import { Tag, message } from 'antd';
import { novaApi } from '@/api/nova';
import ResourcePage, { nameColumn, deleteAction, CopyText } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { KpiCards, TextareaFromFile, downloadText } from '../_shared';

export const keypairNameRegex = /^[a-zA-Z][\w_-]{0,127}$/;
export const keypairNameMessage = () =>
  t(
    'The name should start with upper letter, lower letter, and be a string of 1 to 128, characters can only contain "0-9, a-z, A-Z, -, _".'
  );

/** Nova list returns [{ keypair: {...} }]; legacy mapper uses name as id and keeps origin id */
export const mapKeypair = (data) => {
  const item = data?.keypair ? { ...data.keypair } : { ...data };
  item.origin_id = item.id;
  item.id = item.name;
  return item;
};

export const fetchKeypairs = async () => {
  const res = await novaApi.listKeypairsV();
  return (res?.keypairs || []).map(mapKeypair);
};

const fetchKeypairQuota = async (projectId) => {
  if (!projectId) return null;
  try {
    const res = await novaApi.getQuotaSet(projectId);
    return res?.quota_set?.key_pairs || null;
  } catch {
    return null;
  }
};

export const createKeypairAction = ({ projectId, used = 0 } = {}) => ({
  id: 'create-keypair',
  type: 'modal',
  policy: 'os_compute_api:os-keypairs:create',
  title: t('Create Keypair'),
  description: t('Quota of key pairs means: the number of allowed key pairs for each user.'),
  getDefaultValues: () => ({ type: 'create' }),
  getFormItems: async () => {
    const quota = await fetchKeypairQuota(projectId);
    const limit = quota?.limit;
    const full = limit !== undefined && limit !== -1 && used >= limit;
    return [
      quota && {
        type: 'alert',
        name: 'quota',
        alertType: full ? 'warning' : 'info',
        message: `${t('Key Pair')}: ${t('Used')} ${used} / ${t('Quota')} ${limit === -1 ? t('Unlimit') : limit}`,
      },
      {
        name: 'type',
        label: t('Create Type'),
        type: 'radio',
        options: [
          { value: 'create', label: t('Create Keypair') },
          { value: 'import', label: t('Import Keypair') },
        ],
      },
      {
        name: 'name',
        label: t('Keypair Name'),
        type: 'input',
        required: true,
        tip: keypairNameMessage(),
        rules: [{ pattern: keypairNameRegex, message: `${t('Invalid: ')}${keypairNameMessage()}` }],
      },
      {
        name: 'public_key',
        label: t('Public Key'),
        required: true,
        visible: (values) => values.type === 'import',
        render: () => <TextareaFromFile placeholder="ssh-rsa AAAAB3NzaC1yc2E... user@hostname" />,
      },
    ].filter(Boolean);
  },
  onSubmit: async (values) => {
    const { name, public_key, type } = values;
    const isImport = type === 'import';
    const params = { name, type: 'ssh' };
    if (isImport && public_key) params.public_key = public_key.trim();
    const res = await novaApi.createKeypairV(params);
    if (!isImport && res?.keypair?.private_key) {
      downloadText(res.keypair.private_key, `${name}.pem`);
      message.info(t('Private key file downloaded (.pem)'));
    }
    return res;
  },
});

export const deleteKeypairAction = () => ({
  ...deleteAction({
    name: t('Keypair'),
    title: t('Delete Keypair'),
    onDelete: (it) => novaApi.deleteKeypairV(it.name),
  }),
  policy: 'os_compute_api:os-keypairs:delete',
});

export const keypairColumns = () => [
  nameColumn({
    title: t('Keypair Name'),
    idIndex: 'name',
    linkTo: (r) => `/compute/keypair/detail/${encodeURIComponent(r.name)}`,
  }),
  {
    title: t('Fingerprint'),
    dataIndex: 'fingerprint',
    key: 'fingerprint',
    render: (fp) =>
      fp ? (
        <CopyText value={fp}>
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>{fp}</span>
        </CopyText>
      ) : (
        '-'
      ),
  },
  {
    title: t('Key Type'),
    dataIndex: 'type',
    key: 'type',
    render: (type) => (
      <Tag color="blue" style={{ textTransform: 'uppercase', fontWeight: 600, borderRadius: 10 }}>
        {type || 'ssh'}
      </Tag>
    ),
  },
];

export default function KeypairList() {
  return (
    <ResourcePage
      title={t('Keypairs')}
      breadcrumb={[t('Compute'), t('Keypairs')]}
      description={t('Manage SSH public keys for secure passwordless login to instances.')}
      rowKey="name"
      fetch={fetchKeypairs}
      columns={keypairColumns}
      header={({ data }) => (
        <KpiCards
          items={[
            { title: t('Total Keypairs'), value: data.length },
            { title: t('SSH Protocol'), value: 'RSA / Ed25519', color: '#10b981' },
          ]}
        />
      )}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'fingerprint', label: t('Fingerprint') },
        { name: 'type', label: t('Key Type') },
      ]}
      primaryActions={({ projectId, data }) => [createKeypairAction({ projectId, used: data.length })]}
      batchActions={[deleteKeypairAction()]}
      rowActions={{ firstAction: deleteKeypairAction(), moreActions: [] }}
    />
  );
}
