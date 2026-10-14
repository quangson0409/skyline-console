import React from 'react';
import { Form, Select, DatePicker } from 'antd';
import { barbicanApi } from '@/api/barbican';
import { t } from '@/core/i18n';
import { downloadSecretPayload, toIso, disabledPastDate } from '../common';
import { noChineseRule, nameRule } from '@/components/form/rules';

/**
 * Port of legacy pages/barbican/containers/Secret/actions (Create / Delete),
 * plus a "Download Payload" extension.
 */

const SECRET_CONFIG = {
  KEY: { BIT_LENGTH: 256, ALGORITHM: 'aes' },
  ASYMMETRIC: { BIT_LENGTH: 2048, ALGORITHM: 'rsa' },
};

const CONTENT_TYPE_OPTIONS = [
  { label: 'text/plain', value: 'text/plain' },
  { label: 'application/octet-stream', value: 'application/octet-stream' },
  { label: 'application/x-pkcs12', value: 'application/x-pkcs12' },
  { label: 'application/x-pem-file', value: 'application/x-pem-file' },
];

const ORDER_CONTENT_TYPE_OPTIONS = [
  { label: 'application/octet-stream', value: 'application/octet-stream' },
  { label: 'text/plain', value: 'text/plain' },
  { label: 'application/x-pkcs12', value: 'application/x-pkcs12' },
  { label: 'application/x-pem-file', value: 'application/x-pem-file' },
];

const ALGORITHM_OPTIONS = [
  { label: 'AES', value: 'aes' },
  { label: 'DES', value: 'des' },
  { label: '3DES', value: '3des' },
  { label: 'RSA', value: 'rsa' },
  { label: 'DSA', value: 'dsa' },
  { label: 'EC', value: 'ec' },
];

const ASYMMETRIC_ALGORITHM_OPTIONS = [
  { label: 'RSA', value: 'rsa' },
  { label: 'DSA', value: 'dsa' },
];

const BIT_LENGTH_OPTIONS = [128, 192, 256, 1024, 2048, 4096].map((v) => ({ label: String(v), value: v }));

const MODE_OPTIONS = [
  { label: 'CBC', value: 'cbc' },
  { label: 'CTR', value: 'ctr' },
];

const creationTypeOptions = () => [
  { label: t('Create Secret Directly'), value: 'direct', title: t('Create a secret with your own payload content') },
  {
    label: t('Create Secret via Order'),
    value: 'order',
    title: t('Create a secret through order (for certificates, keys, etc.)'),
  },
];

const requestTypeOptions = () => [
  { label: t('Key'), value: 'key', title: t('Symmetric keys, private keys, and passphrases') },
  { label: t('Asymmetric Key'), value: 'asymmetric', title: t('Asymmetric key pairs (public/private)') },
];

const secretTypeOptions = () => [
  { label: t('Select Secret Type'), value: '' },
  { label: t('Opaque'), value: 'opaque', title: t('Default secret type for arbitrary data') },
  { label: t('Symmetric'), value: 'symmetric', title: t('Symmetric keys') },
  { label: t('Public'), value: 'public', title: t('Public keys') },
  { label: t('Private'), value: 'private', title: t('Private keys') },
  { label: t('Certificate'), value: 'certificate', title: t('Certificates') },
  { label: t('Passphrase'), value: 'passphrase', title: t('Passphrases') },
];

const isDirect = (v) => (v?.creationType || 'direct') === 'direct';
const isOrder = (v) => v?.creationType === 'order';

/** Select whose options/placeholder option follow the creation method (single field name per form) */
function ModeAwareSelect({ value, onChange, direct, order, emptyLabel }) {
  const form = Form.useFormInstance();
  const creationType = Form.useWatch('creationType', form) || 'direct';
  const requestType = Form.useWatch('request_type', form);
  const opts = typeof (creationType === 'direct' ? direct : order) === 'function'
    ? (creationType === 'direct' ? direct : order)({ requestType })
    : creationType === 'direct'
      ? direct
      : order;
  const options = creationType === 'direct' && emptyLabel ? [{ label: emptyLabel, value: '' }, ...opts] : opts;
  return <Select value={value} onChange={onChange} options={options} style={{ width: '100%' }} />;
}

function RequestTypeSelect({ value, onChange }) {
  const form = Form.useFormInstance();
  return (
    <Select
      value={value}
      options={requestTypeOptions()}
      onChange={(v) => {
        onChange?.(v);
        const conf = v === 'key' ? SECRET_CONFIG.KEY : v === 'asymmetric' ? SECRET_CONFIG.ASYMMETRIC : {};
        form.setFieldsValue({ bit_length: conf.BIT_LENGTH, algorithm: conf.ALGORITHM });
      }}
    />
  );
}

function ModeTip({ direct, order }) {
  const form = Form.useFormInstance();
  const creationType = Form.useWatch('creationType', form) || 'direct';
  return <span>{creationType === 'direct' ? direct : order}</span>;
}

const algorithmOptionsFor = ({ requestType }) =>
  requestType === 'asymmetric' ? ASYMMETRIC_ALGORITHM_OPTIONS : ALGORITHM_OPTIONS;

export const createSecretAction = () => ({
  id: 'create-secret',
  type: 'modal',
  policy: ['secrets:post', 'orders:post'],
  title: t('Create Secret'),
  width: 800,
  getDefaultValues: () => ({
    creationType: 'direct',
    name: '',
    payload: '',
    payload_content_type: 'text/plain',
    payload_content_encoding: '',
    algorithm: 'aes',
    bit_length: 256,
    mode: 'cbc',
    secret_type: 'opaque',
    request_type: 'key',
  }),
  getFormItems: () => [
    {
      name: 'creationType',
      label: t('Creation Method'),
      type: 'radio',
      required: true,
      options: creationTypeOptions(),
    },
    {
      name: 'name',
      label: t('Secret Name'),
      type: 'input',
      tip: (
        <ModeTip
          direct={t('Required for direct creation')}
          order={t('Optional. If not provided, a name will be auto-generated')}
        />
      ),
      rules: [
        noChineseRule(),
        nameRule({ withoutChinese: true }), // legacy 'input-name' withoutChinese
        ({ getFieldValue }) => ({
          validator: (_r, value) =>
            (getFieldValue('creationType') || 'direct') === 'direct' && !value
              ? Promise.reject(new Error(t('Secret name is required for direct creation')))
              : Promise.resolve(),
        }),
      ],
    },
    // ---- direct creation
    {
      name: 'payload',
      label: t('Secret Payload'),
      type: 'textarea',
      required: true,
      rows: 6,
      placeholder: t('Enter the secret content'),
      tip: t('The actual secret data to be stored'),
      visible: isDirect,
    },
    // ---- order creation
    {
      name: 'request_type',
      label: t('Request Type'),
      required: true,
      visible: isOrder,
      render: () => <RequestTypeSelect />,
    },
    {
      name: 'payload_content_type',
      label: t('Payload Content Type'),
      required: false,
      rules: [
        ({ getFieldValue }) => ({
          validator: (_r, value) =>
            (getFieldValue('creationType') || 'direct') === 'direct' && !value
              ? Promise.reject(new Error(`${t('Please enter/select')} ${t('Payload Content Type')}!`))
              : Promise.resolve(),
        }),
      ],
      tip: (
        <ModeTip
          direct={t('Required when payload is supplied')}
          order={t('Optional. Type/format of the secret to be generated (default: application/octet-stream)')}
        />
      ),
      render: () => <ModeAwareSelect direct={CONTENT_TYPE_OPTIONS} order={ORDER_CONTENT_TYPE_OPTIONS} />,
    },
    {
      name: 'payload_content_encoding',
      label: t('Payload Content Encoding'),
      type: 'input',
      tip: t('Required if payload content type is "application/octet-stream"'),
      visible: isDirect,
    },
    {
      name: 'secret_type',
      label: t('Secret Type'),
      type: 'select',
      options: secretTypeOptions(),
      tip: t('Optional. Type of secret being stored (default: opaque)'),
      visible: isDirect,
    },
    {
      name: 'algorithm',
      label: t('Algorithm'),
      tip: (
        <ModeTip
          direct={t('Optional. Algorithm used by the secret (default: aes)')}
          order={t('Optional. Algorithm to be used with the requested key (default: aes)')}
        />
      ),
      render: () => (
        <ModeAwareSelect direct={algorithmOptionsFor} order={algorithmOptionsFor} emptyLabel={t('Select Algorithm')} />
      ),
    },
    {
      name: 'bit_length',
      label: t('Bit Length'),
      tip: (
        <ModeTip
          direct={t('Optional. Bit length of the secret (default: 256)')}
          order={t('Optional. Bit length of the requested secret key (default: 256)')}
        />
      ),
      render: () => (
        <ModeAwareSelect direct={BIT_LENGTH_OPTIONS} order={BIT_LENGTH_OPTIONS} emptyLabel={t('Select Bit Length')} />
      ),
    },
    {
      name: 'mode',
      label: t('Mode'),
      tip: (
        <ModeTip
          direct={t('Optional. Algorithm mode, used only for reference (default: cbc)')}
          order={t('Optional. Algorithm mode to be used with the requested key (default: cbc)')}
        />
      ),
      render: () => <ModeAwareSelect direct={MODE_OPTIONS} order={MODE_OPTIONS} emptyLabel={t('Select Mode')} />,
    },
    {
      name: 'expiration',
      label: t('Expiration Date'),
      tip: (
        <ModeTip
          direct={t('Optional. When the secret should expire (ISO 8601 format)')}
          order={t('Optional. Expiration time for the secret in ISO 8601 format')}
        />
      ),
      render: () => <DatePicker showNow={false} disabledDate={disabledPastDate} style={{ width: '100%' }} />,
    },
  ],
  onSubmit: (values) => {
    const { creationType = 'direct' } = values;
    const expiration = toIso(values.expiration);
    if (creationType === 'direct') {
      // legacy SecretsStore.create: drop blank optional attributes
      const { name, payload, payload_content_type } = values;
      const body = { name, payload, payload_content_type };
      const str = (v) => typeof v === 'string' && v.trim() !== '';
      if (str(values.secret_type)) body.secret_type = values.secret_type;
      if (str(values.algorithm)) body.algorithm = values.algorithm;
      if (values.bit_length) body.bit_length = values.bit_length;
      if (str(values.mode)) body.mode = values.mode;
      if (str(values.payload_content_encoding)) body.payload_content_encoding = values.payload_content_encoding;
      if (expiration) body.expiration = expiration;
      return barbicanApi.createSecret(body);
    }
    if (creationType === 'order') {
      // legacy OrdersStore.create
      const meta = {};
      if (values.algorithm) meta.algorithm = values.algorithm;
      if (values.bit_length) meta.bit_length = values.bit_length;
      if (values.mode) meta.mode = values.mode;
      if (values.payload_content_type) meta.payload_content_type = values.payload_content_type;
      if (values.name) meta.name = values.name;
      if (expiration) meta.expiration = expiration;
      return barbicanApi.createOrder({ type: values.request_type, meta });
    }
    return Promise.reject(new Error('Invalid creation type'));
  },
});

export const deleteSecretAction = () => ({
  id: 'delete',
  type: 'confirm',
  policy: 'secret:delete',
  title: t('Delete Secret'),
  actionName: t('delete secret'),
  buttonText: t('Delete'),
  isDanger: true,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await barbicanApi.deleteSecret(it.id);
    }
  },
});

export const downloadPayloadAction = () => ({
  id: 'download-payload',
  type: 'custom',
  // reading the payload is barbican secret:decrypt (legacy Certificate showDetail used the same rule)
  policy: 'secret:decrypt',
  // only stored secrets have a payload (orders still PENDING / ERROR have none)
  allowed: (item) => !item?.status || String(item.status).toUpperCase() === 'ACTIVE',
  title: t('Download Payload'),
  onExecute: (item) => downloadSecretPayload(item),
});
