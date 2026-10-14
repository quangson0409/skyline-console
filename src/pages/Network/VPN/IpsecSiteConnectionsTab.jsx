/** IPsec Site Connections tab (legacy containers/VPN/IPsecSiteConnection) */
import React from 'react';
import { neutronApi } from '@/api/neutron';
import ResourcePage, {
  nameColumn,
  statusColumn,
  textColumn,
  projectColumn,
  useIsAdminPage,
  IdNameCell,
} from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { detailPath } from '../common';
import { isIPv4, isIPv6 } from '@/components/network/ip';
import {
  vpnStatus,
  vpnStatusOptions,
  vpnLists,
  listParams,
  nameField,
  descriptionField,
  isCurrentProjectOrAdmin,
  pskRule,
  confirmPskRule,
  LocalSubnet,
  PeerCidrs,
} from './helpers';

export const ipsecDetailPath = (id, isAdmin) => detailPath('ipsec-site-connection', id, isAdmin);

const createDefaults = () => ({
  mtu: 1500,
  initiator: 'bi-directional',
  action: 'hold',
  interval: 30,
  timeout: 120,
});

const selectOptions = (list) => list.map((i) => ({ label: i.name || i.id, value: i.id }));

export const createIpsecSiteConnectionAction = (ctx) => ({
  id: 'create-ipsec-site-connection',
  type: 'modal',
  policy: 'create_ipsec_site_connection',
  title: t('Create IPsec Site Connection'),
  buttonText: t('Create'),
  width: 760,
  getDefaultValues: () => ({ ...createDefaults(), more: false }),
  getFormItems: async () => {
    // legacy global stores listFilterByProject -> only resources of the current project
    const params = ctx.projectId ? { project_id: ctx.projectId } : {};
    const [services, ikes, ipsecs, groups] = await Promise.all([
      vpnLists.services(params),
      vpnLists.ikePolicies(params),
      vpnLists.ipsecPolicies(params),
      vpnLists.endpointGroups(params),
    ]);
    const more = (v) => Boolean(v.more);
    return [
      nameField(),
      descriptionField(),
      { name: 'vpnservice_id', label: t('VPN Service'), type: 'select', options: selectOptions(services), required: true },
      { name: 'ikepolicy_id', label: t('IKE Policy'), type: 'select', options: selectOptions(ikes), required: true },
      { name: 'ipsecpolicy_id', label: t('IPsec Policy'), type: 'select', options: selectOptions(ipsecs), required: true },
      {
        name: 'local_ep_group_id',
        label: t('Local Endpoint Group'),
        type: 'select',
        options: selectOptions(groups.filter((i) => i.type === 'subnet')),
        required: true,
      },
      {
        name: 'local_subnet',
        label: t('Local Subnet'),
        render: ({ form }) => <LocalSubnet form={form} groups={groups} />,
      },
      {
        name: 'peer_address',
        label: t('Peer Gateway Public Address'),
        type: 'input',
        required: true,
        extra: t('Peer gateway public address for the IPsec site connection'),
        rules: [
          {
            validator: (_, value) =>
              !value || isIPv4(value) || isIPv6(value)
                ? Promise.resolve()
                : Promise.reject(new Error(`${t('Invalid')} ${t('Peer Gateway Public Address')}`)),
          },
        ],
      },
      {
        name: 'peer_ep_group_id',
        label: t('Peer Endpoint Group'),
        type: 'select',
        options: selectOptions(groups.filter((i) => i.type === 'cidr')),
        required: true,
      },
      {
        name: 'peer_cidrs',
        label: t('Peer CIDRs'),
        render: ({ form }) => <PeerCidrs form={form} groups={groups} />,
      },
      {
        name: 'password',
        label: t('Pre-Shared Key (PSK) String'),
        type: 'password',
        required: true,
        rules: [pskRule()],
      },
      {
        name: 'confirmPassword',
        label: t('Confirm Shared Key'),
        type: 'password',
        required: true,
        rules: [confirmPskRule()],
      },
      { name: 'more', label: t('Advanced Options'), type: 'switch' },
      {
        name: 'mtu',
        label: t('MTU'),
        type: 'number',
        min: 68,
        required: true,
        visible: more,
        tip: t(
          'The maximum transmission unit (MTU) value to address fragmentation. Minimum value is 68 for IPv4, and 1280 for IPv6.'
        ),
      },
      {
        name: 'initiator',
        label: t('Initiator Mode'),
        type: 'select',
        options: ['bi-directional', 'response-only'].map((i) => ({ label: i, value: i })),
        required: true,
        visible: more,
        tip: t('Indicates whether this VPN can only respond to connections or both respond to and initiate connections.'),
      },
      {
        name: 'action',
        label: t('DPD Action'),
        type: 'select',
        options: ['clear', 'hold', 'restart', 'disabled', 'restart-by-peer'].map((i) => ({ label: i, value: i })),
        required: true,
        visible: more,
        tip: t('DPD actions controls the use of Dead Peer Detection Protocol.'),
      },
      {
        name: 'interval',
        label: t('DPD Interval (s)'),
        type: 'number',
        min: 0,
        required: true,
        visible: more,
        tip: t('Sec for DPD delay, > 0'),
      },
      {
        name: 'timeout',
        label: t('DPD timeout (s)'),
        type: 'number',
        min: 0,
        required: true,
        visible: more,
        tip: t('Sec for DPD timeout, > 0 & > DPD Interval'),
      },
    ];
  },
  onSubmit: (values) => {
    // legacy: merge({}, defaultValue, values) so hidden advanced options keep their defaults
    const merged = { ...createDefaults() };
    Object.entries(values).forEach(([k, v]) => {
      if (v !== undefined) merged[k] = v;
    });
    // eslint-disable-next-line no-unused-vars
    const { interval, timeout, action, password, confirmPassword, more, local_subnet, peer_cidrs, ...rest } = merged;
    return neutronApi.createIpsecSiteConnection({
      ...rest,
      psk: password,
      peer_id: rest.peer_address,
      dpd: { interval, timeout, action },
    });
  },
});

export const editIpsecSiteConnectionAction = () => ({
  id: 'edit-ipsec-site-connection',
  type: 'modal',
  policy: 'update_ipsec_site_connection',
  title: t('Edit IPsec Site Connection'),
  buttonText: t('Edit'),
  allowed: (item) => ['ACTIVE', 'DOWN'].includes(item.status),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [nameField(), descriptionField()],
  onSubmit: ({ name, description }, item) => neutronApi.updateIpsecSiteConnection(item.id, { name, description }),
});

export const deleteIpsecSiteConnectionAction = (ctx) => ({
  id: 'delete',
  type: 'confirm',
  policy: 'delete_ipsec_site_connection',
  title: t('Delete IPsec Site Connection'),
  actionName: t('delete ipsec site connection'),
  buttonText: t('Delete'),
  isDanger: true,
  allowed: (item) => isCurrentProjectOrAdmin(item, ctx),
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const item of list) {
      // eslint-disable-next-line no-await-in-loop
      await neutronApi.deleteIpsecSiteConnection(item.id);
    }
  },
});

export const ipsecSiteConnectionRowActions = (ctx) =>
  ctx.isAdmin
    ? { firstAction: deleteIpsecSiteConnectionAction(ctx), moreActions: [] }
    : {
        firstAction: editIpsecSiteConnectionAction(),
        moreActions: [{ action: deleteIpsecSiteConnectionAction(ctx) }],
      };

export default function IpsecSiteConnectionsTab() {
  const projectMap = useProjectMap();
  const isAdminPage = useIsAdminPage();
  return (
    <ResourcePage
      embedded
      title={t('IPsec Site Connections')}
      fetch={(ctx) => vpnLists.connections(listParams(ctx))}
      columns={({ isAdmin }) =>
        [
          nameColumn({ linkTo: (r) => ipsecDetailPath(r.id, isAdmin) }),
          isAdmin && projectColumn(projectMap),
          textColumn(t('Description'), 'description'),
          textColumn(t('Local Endpoint Group ID'), 'local_ep_group_id', {
            render: (v) => (v ? <IdNameCell id={v} bold={false} /> : '-'),
          }),
          textColumn(t('Peer Endpoint Group ID'), 'peer_ep_group_id', {
            render: (v) => (v ? <IdNameCell id={v} bold={false} /> : '-'),
          }),
          textColumn(t('Peer Address'), 'peer_address'),
          statusColumn({ textMap: vpnStatus() }),
        ].filter(Boolean)
      }
      filterParams={[
        { name: 'name', label: t('Name') },
        isAdminPage && { name: 'project_id', label: t('Project ID') },
        { name: 'local_ep_group_id', label: t('Local Endpoint Group ID') },
        { name: 'peer_ep_group_id', label: t('Peer Endpoint Group ID') },
        { name: 'peer_address', label: t('Peer Address') },
        { name: 'status', label: t('Status'), options: vpnStatusOptions() },
      ].filter(Boolean)}
      primaryActions={(ctx) => (ctx.isAdmin ? [] : [createIpsecSiteConnectionAction(ctx)])}
      batchActions={(ctx) => [deleteIpsecSiteConnectionAction(ctx)]}
      rowActions={ipsecSiteConnectionRowActions}
    />
  );
}
