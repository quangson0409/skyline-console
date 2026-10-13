/** IKE Policies + IPsec Policies tabs (legacy containers/VPN/IKEPolicy, IPsecPolicy) */
import React from 'react';
import { Descriptions, Popover } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { neutronApi } from '@/api/neutron';
import ResourcePage, { nameColumn, textColumn, projectColumn, useIsAdminPage, formatTime } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import {
  vpnLists,
  listParams,
  nameField,
  descriptionField,
  deleteWithCheck,
  isCurrentProjectOrAdmin,
  inUseMessage,
  renderLifetime,
  dash,
  StaticText,
  authAlgorithmOptions,
  encryptionAlgorithmOptions,
  pfsOptions,
  ikePolicyIKEVersionOptions,
  ipsecPolicyEncapsulationModeOptions,
  ipsecPolicyTransformProtocolOptions,
} from './helpers';

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));

const lifetimeColumn = () => ({
  title: t('Lifetime'),
  dataIndex: 'lifetime',
  key: 'lifetime',
  render: renderLifetime,
});

const lifetimeField = () => ({ name: 'lifetimeValue', label: t('Lifetime Value'), type: 'number', min: 0, required: true });

const withLifetime = ({ lifetimeValue, ...rest }) => ({
  lifetime: { units: 'seconds', value: lifetimeValue },
  ...rest,
});

/** Name column with an info popover listing every policy attribute */
const policyNameColumn = (fields) => {
  const base = nameColumn();
  return {
    ...base,
    render: (value, record) => (
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        {base.render(value, record)}
        <Popover
          title={record.name || record.id}
          content={
            <Descriptions size="small" column={1} style={{ maxWidth: 420 }}>
              {fields.map(([label, key, render]) => (
                <Descriptions.Item key={key} label={label}>
                  {render ? render(record[key]) : dash(record[key])}
                </Descriptions.Item>
              ))}
            </Descriptions>
          }
        >
          <InfoCircleOutlined style={{ color: '#94a3b8', marginTop: 4, cursor: 'pointer' }} />
        </Popover>
      </div>
    ),
  };
};

/**
 * Legacy Edit (IKE/IPsec): when the policy is referenced by connections a "Status: In Use"
 * row is shown whose validator blocks the submit.
 */
const inUseField = async (item, connectionParams, editName) => {
  const connections = await vpnLists.connections(connectionParams);
  if (!connections.length) return null;
  return {
    name: 'canSubmit',
    label: t('Status'),
    render: () => <StaticText>{t('In Use')}</StaticText>,
    rules: [
      {
        validator: () =>
          Promise.reject(
            new Error(inUseMessage({ action: editName, name: item.name, reason: t('the policy is in use'), connections }))
          ),
      },
    ],
  };
};

/* ================= IKE policy ================= */
const ikeFormFields = (upper) => [
  { name: 'auth_algorithm', label: t('Auth Algorithm'), type: 'select', options: authAlgorithmOptions(upper), required: true },
  {
    name: 'encryption_algorithm',
    label: t('Encryption Algorithm'),
    type: 'select',
    options: encryptionAlgorithmOptions(upper),
    required: true,
  },
  { name: 'pfs', label: t('PFS'), type: 'select', options: pfsOptions(), required: true },
  lifetimeField(),
  { name: 'ike_version', label: t('IKE Version'), type: 'select', options: ikePolicyIKEVersionOptions(), required: true },
];

export const createIkePolicyAction = () => ({
  id: 'create-vpn-ike-policy',
  type: 'modal',
  title: t('Create VPN IKE Policy'),
  buttonText: t('Create'),
  getDefaultValues: () => ({
    auth_algorithm: 'sha1',
    encryption_algorithm: 'aes-128',
    pfs: 'group5',
    lifetimeValue: 3600,
    ike_version: 'v1',
  }),
  formItems: [nameField(), descriptionField(), ...ikeFormFields(false)],
  onSubmit: (values) => neutronApi.createIkePolicy(withLifetime(values)),
});

export const editIkePolicyAction = () => ({
  id: 'edit-vpn-ike-policy',
  type: 'modal',
  title: t('Edit VPN IKE Policy'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({
    ...pick(item, ['name', 'description', 'auth_algorithm', 'encryption_algorithm', 'pfs', 'ike_version']),
    lifetimeValue: item.lifetime?.value,
  }),
  getFormItems: async (item) => {
    const inUse = await inUseField(item, { ikepolicy_id: item.id }, t('Edit VPN IKE Policy'));
    return [nameField(), inUse, descriptionField(), ...ikeFormFields(true)].filter(Boolean);
  },
  onSubmit: (values, item) => {
    // eslint-disable-next-line no-unused-vars
    const { canSubmit, ...rest } = values;
    return neutronApi.updateIkePolicy(item.id, withLifetime(rest));
  },
});

export const deleteIkePolicyAction = (ctx) =>
  deleteWithCheck({
    id: 'delete-vpn-ike-policy',
    title: t('Delete VPN IKE Policy'),
    actionName: t('Delete VPN IKE Policy'),
    reason: t('the VPN IKE policy is in use'),
    allowed: (item) => isCurrentProjectOrAdmin(item, ctx),
    connectionParams: (item) => ({ ikepolicy_id: item.id }),
    onDelete: (item) => neutronApi.deleteIkePolicy(item.id),
  });

const ikeDetailFields = () => [
  [t('ID'), 'id'],
  [t('Name'), 'name'],
  [t('Description'), 'description'],
  [t('Auth Algorithm'), 'auth_algorithm'],
  [t('Encryption Algorithm'), 'encryption_algorithm'],
  [t('IKE Version'), 'ike_version'],
  [t('Lifetime'), 'lifetime', renderLifetime],
  [t('PFS'), 'pfs'],
  [t('Phase1 Negotiation Mode'), 'phase1_negotiation_mode'],
  [t('Project ID'), 'project_id'],
  [t('Created At'), 'created_at', formatTime],
];

export function IkePoliciesTab() {
  const projectMap = useProjectMap();
  const isAdminPage = useIsAdminPage();
  return (
    <ResourcePage
      embedded
      title={t('IKE Policies')}
      fetch={(ctx) => vpnLists.ikePolicies(listParams(ctx))}
      columns={({ isAdmin }) =>
        [
          policyNameColumn(ikeDetailFields()),
          isAdmin && projectColumn(projectMap),
          textColumn(t('Description'), 'description'),
          textColumn(t('Auth Algorithm'), 'auth_algorithm'),
          textColumn(t('Encryption Algorithm'), 'encryption_algorithm'),
          textColumn(t('IKE Version'), 'ike_version'),
          lifetimeColumn(),
          textColumn(t('PFS'), 'pfs'),
        ].filter(Boolean)
      }
      filterParams={[
        { name: 'name', label: t('Name') },
        isAdminPage && { name: 'project_id', label: t('Project ID') },
        { name: 'auth_algorithm', label: t('Auth Algorithm'), options: authAlgorithmOptions() },
        { name: 'encryption_algorithm', label: t('Encryption Algorithm'), options: encryptionAlgorithmOptions() },
        { name: 'ike_version', label: t('IKE Version'), options: ikePolicyIKEVersionOptions() },
        { name: 'pfs', label: t('PFS'), options: pfsOptions() },
      ].filter(Boolean)}
      primaryActions={(ctx) => (ctx.isAdmin ? [] : [createIkePolicyAction()])}
      batchActions={(ctx) => [deleteIkePolicyAction(ctx)]}
      rowActions={(ctx) =>
        ctx.isAdmin
          ? { firstAction: deleteIkePolicyAction(ctx), moreActions: [] }
          : { firstAction: editIkePolicyAction(), moreActions: [{ action: deleteIkePolicyAction(ctx) }] }
      }
    />
  );
}

/* ================= IPsec policy ================= */
const ipsecFormFields = (upper) => [
  { name: 'auth_algorithm', label: t('Auth Algorithm'), type: 'select', options: authAlgorithmOptions(upper), required: true },
  {
    name: 'encapsulation_mode',
    label: t('Encapsulation Mode'),
    type: 'select',
    options: ipsecPolicyEncapsulationModeOptions(),
    required: true,
  },
  {
    name: 'encryption_algorithm',
    label: t('Encryption Algorithm'),
    type: 'select',
    options: encryptionAlgorithmOptions(upper),
    required: true,
  },
  { name: 'pfs', label: t('PFS'), type: 'select', options: pfsOptions(), required: true },
  lifetimeField(),
  {
    name: 'transform_protocol',
    label: t('Transform Protocol'),
    type: 'select',
    options: ipsecPolicyTransformProtocolOptions(),
    required: true,
  },
];

export const createIpsecPolicyAction = () => ({
  id: 'create-vpn-ipsec-policy',
  type: 'modal',
  title: t('Create VPN IPsec Policy'),
  buttonText: t('Create'),
  getDefaultValues: () => ({
    auth_algorithm: 'sha1',
    encryption_algorithm: 'aes-128',
    pfs: 'group5',
    encapsulation_mode: 'tunnel',
    lifetimeValue: 3600,
    transform_protocol: 'esp',
  }),
  formItems: [nameField(), descriptionField(), ...ipsecFormFields(false)],
  onSubmit: (values) => neutronApi.createIpsecPolicy(withLifetime(values)),
});

export const editIpsecPolicyAction = () => ({
  id: 'edit-vpn-ipsec-policy',
  type: 'modal',
  title: t('Edit VPN IPsec Policy'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({
    ...pick(item, ['name', 'description', 'auth_algorithm', 'encapsulation_mode', 'encryption_algorithm', 'pfs', 'transform_protocol']),
    lifetimeValue: item.lifetime?.value,
  }),
  getFormItems: async (item) => {
    const inUse = await inUseField(item, { ipsecpolicy_id: item.id }, t('Edit VPN IPsec Policy'));
    return [nameField(), inUse, descriptionField(), ...ipsecFormFields(true)].filter(Boolean);
  },
  onSubmit: (values, item) => {
    // eslint-disable-next-line no-unused-vars
    const { canSubmit, ...rest } = values;
    return neutronApi.updateIpsecPolicy(item.id, withLifetime(rest));
  },
});

export const deleteIpsecPolicyAction = (ctx) =>
  deleteWithCheck({
    id: 'delete-vpn-ipsec-policy',
    title: t('Delete VPN IPsec Policy'),
    actionName: t('Delete VPN IPsec Policy'),
    reason: t('the VPN IPsec policy is in use'),
    allowed: (item) => isCurrentProjectOrAdmin(item, ctx),
    connectionParams: (item) => ({ ipsecpolicy_id: item.id }),
    onDelete: (item) => neutronApi.deleteIpsecPolicy(item.id),
  });

const ipsecDetailFields = () => [
  [t('ID'), 'id'],
  [t('Name'), 'name'],
  [t('Description'), 'description'],
  [t('Auth Algorithm'), 'auth_algorithm'],
  [t('Encapsulation Mode'), 'encapsulation_mode'],
  [t('Encryption Algorithm'), 'encryption_algorithm'],
  [t('Transform Protocol'), 'transform_protocol'],
  [t('Lifetime'), 'lifetime', renderLifetime],
  [t('PFS'), 'pfs'],
  [t('Project ID'), 'project_id'],
  [t('Created At'), 'created_at', formatTime],
];

export function IpsecPoliciesTab() {
  const projectMap = useProjectMap();
  const isAdminPage = useIsAdminPage();
  return (
    <ResourcePage
      embedded
      title={t('IPsec Policies')}
      fetch={(ctx) => vpnLists.ipsecPolicies(listParams(ctx))}
      columns={({ isAdmin }) =>
        [
          policyNameColumn(ipsecDetailFields()),
          isAdmin && projectColumn(projectMap),
          textColumn(t('Description'), 'description'),
          textColumn(t('Auth Algorithm'), 'auth_algorithm'),
          textColumn(t('Encapsulation Mode'), 'encapsulation_mode'),
          textColumn(t('Encryption Algorithm'), 'encryption_algorithm'),
          textColumn(t('Transform Protocol'), 'transform_protocol'),
          lifetimeColumn(),
          textColumn(t('PFS'), 'pfs'),
        ].filter(Boolean)
      }
      filterParams={[
        { name: 'name', label: t('Name') },
        isAdminPage && { name: 'project_id', label: t('Project ID') },
        { name: 'auth_algorithm', label: t('Auth Algorithm'), options: authAlgorithmOptions() },
        { name: 'encapsulation_mode', label: t('Encapsulation Mode'), options: ipsecPolicyEncapsulationModeOptions() },
        { name: 'encryption_algorithm', label: t('Encryption Algorithm'), options: encryptionAlgorithmOptions() },
        { name: 'transform_protocol', label: t('Transform Protocol'), options: ipsecPolicyTransformProtocolOptions() },
        { name: 'pfs', label: t('PFS'), options: pfsOptions() },
      ].filter(Boolean)}
      primaryActions={(ctx) => (ctx.isAdmin ? [] : [createIpsecPolicyAction()])}
      batchActions={(ctx) => [deleteIpsecPolicyAction(ctx)]}
      rowActions={(ctx) =>
        ctx.isAdmin
          ? { firstAction: deleteIpsecPolicyAction(ctx), moreActions: [] }
          : { firstAction: editIpsecPolicyAction(), moreActions: [{ action: deleteIpsecPolicyAction(ctx) }] }
      }
    />
  );
}
