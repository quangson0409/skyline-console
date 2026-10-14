/** VPN Gateways tab (legacy containers/VPN/VPNGateway) */
import React from 'react';
import { neutronApi } from '@/api/neutron';
import ResourcePage, { nameColumn, statusColumn, textColumn, projectColumn, useIsAdminPage, IdNameCell } from '@/components/ResourcePage';
import { detailPath } from '../common';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import {
  vpnStatus,
  vpnStatusOptions,
  vpnLists, vpnServerSide,
  listParams,
  nameField,
  descriptionField,
  deleteWithCheck,
  RouterSelectTable,
} from './helpers';

export const createVpnServiceAction = (ctx) => ({
  id: 'create-vpn',
  type: 'modal',
  policy: 'create_vpnservice',
  title: t('Create VPN'),
  buttonText: t('Create'),
  width: 960,
  formItems: [
    nameField(),
    descriptionField(),
    {
      name: 'router_id',
      label: t('Router'),
      required: true,
      render: () => (
        <RouterSelectTable projectId={ctx.projectId} isAdmin={false} disabledFunc={(item) => !item.external_gateway_info} />
      ),
    },
  ],
  onSubmit: ({ name, description, router_id }) =>
    neutronApi.createVpnService({
      name,
      description,
      router_id,
    }),
});

export const editVpnServiceAction = () => ({
  id: 'edit-vpn',
  type: 'modal',
  policy: 'update_vpnservice',
  title: t('Edit VPN'),
  buttonText: t('Edit'),
  allowed: (item) => item.status === 'ACTIVE',
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [nameField(), descriptionField()],
  onSubmit: ({ name, description }, item) => neutronApi.updateVpnService(item.id, { name, description }),
});

// legacy allowedCheckFunc referenced `checkSystemAdmin` without calling it, so it is always allowed
export const deleteVpnServiceAction = () =>
  deleteWithCheck({
    id: 'delete-vpnservice',
    policy: 'delete_vpnservice',
    title: t('Delete VPN'),
    actionName: t('Delete VPN'),
    reason: t('The VPN gateway is in use'),
    connectionParams: (item) => ({ vpnservice_id: item.id }),
    onDelete: (item) => neutronApi.deleteVpnService(item.id),
  });

export default function VpnServicesTab() {
  const projectMap = useProjectMap();
  const isAdminPage = useIsAdminPage();
  return (
    <ResourcePage
      policy="get_vpnservice"
      embedded
      title={t('VPN Gateways')}
      fetch={(ctx) => vpnLists.services(listParams(ctx))}
      serverSide={vpnServerSide.services}
      columns={({ isAdmin }) =>
        [
          nameColumn(),
          isAdmin && projectColumn(projectMap),
          textColumn(t('Description'), 'description'),
          {
            title: t('External IP'),
            key: 'external_ip',
            dataIndex: 'external_v4_ip',
            render: (_, r) => r.external_v4_ip || r.external_v6_ip || '-',
          },
          textColumn(t('Router ID'), 'router_id', {
            render: (v) => (v ? <IdNameCell id={v} href={detailPath('router', v, isAdmin)} bold={false} /> : '-'),
          }),
          statusColumn({ textMap: vpnStatus() }),
        ].filter(Boolean)
      }
      filterParams={vpnServiceFilters(isAdminPage)}
      primaryActions={(ctx) => (ctx.isAdmin ? [] : [createVpnServiceAction(ctx)])}
      batchActions={[deleteVpnServiceAction()]}
      rowActions={({ isAdmin }) =>
        isAdmin
          ? { firstAction: deleteVpnServiceAction(), moreActions: [] }
          : { firstAction: editVpnServiceAction(), moreActions: [{ action: deleteVpnServiceAction() }] }
      }
    />
  );
}

export const vpnServiceFilters = (isAdmin) =>
  [
    { name: 'name', label: t('Name') },
    isAdmin && { name: 'project_id', label: t('Project ID') },
    { name: 'status', label: t('Status'), options: vpnStatusOptions() },
    { name: 'router_id', label: t('Router ID') },
    { name: 'external_v4_ip', label: t('External IPv4') },
    { name: 'external_v6_ip', label: t('External IPv6') },
  ].filter(Boolean);
