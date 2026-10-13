/** VPN Endpoint Groups tab (legacy containers/VPN/EndpointGroup) */
import React, { useState } from 'react';
import { Form, Popover } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { neutronApi } from '@/api/neutron';
import ResourcePage, { nameColumn, textColumn, projectColumn, useIsAdminPage } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { listAll } from '../common';
import {
  vpnLists,
  listParams,
  nameField,
  descriptionField,
  deleteWithCheck,
  isCurrentProjectOrAdmin,
  isPeerCidr,
  RouterSelectTable,
  SubnetSelectTable,
  PopUpSubnet,
} from './helpers';

export const endpointGroupTypeText = (type) => {
  switch (type) {
    case 'subnet':
      return t('Local');
    case 'cidr':
      return t('Peer');
    default:
      return '';
  }
};

/** legacy getPortsWithFixedIPs + getSubnetToRouter(ports, [router], false) */
const subnetIdsOfRouter = async (routerId) => {
  const ports = await listAll.ports({
    device_owner: ['network:router_interface_distributed', 'network:router_interface', 'network:ha_router_replicated_interface'],
    fields: ['fixed_ips', 'device_id', 'device_owner'],
  });
  const ids = new Set();
  ports
    .filter((p) => p.device_id === routerId)
    .forEach((p) => (p.fixed_ips || []).forEach((f) => ids.add(f.subnet_id)));
  return ids;
};

/** Router picker + subnet multi-select of the local endpoint group form */
function LocalSubnetPicker({ value, onChange, form, allSubnets }) {
  const routerId = Form.useWatch('router_id', form);
  const [state, setState] = useState({ routerId: undefined, subnets: [], loading: false });

  React.useEffect(() => {
    if (!routerId || routerId === state.routerId) return;
    setState((s) => ({ ...s, loading: true }));
    subnetIdsOfRouter(routerId).then((ids) => {
      setState({ routerId, subnets: (allSubnets || []).filter((s) => ids.has(s.id)), loading: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerId]);

  return <SubnetSelectTable value={value} onChange={onChange} subnets={routerId ? state.subnets : []} loading={state.loading} />;
}

export const createEndpointGroupAction = (ctx) => ({
  id: 'create-vpn-endpoint-group',
  type: 'modal',
  title: t('Create VPN Endpoint Group'),
  buttonText: t('Create'),
  width: 960,
  getDefaultValues: () => ({ type: 'subnet' }),
  getFormItems: async () => {
    const allSubnets = await listAll.subnets();
    return [
      nameField(),
      descriptionField(),
      {
        name: 'type',
        label: t('Type'),
        type: 'select',
        required: true,
        options: [
          { label: t('Peer'), value: 'cidr' },
          { label: t('Local'), value: 'subnet' },
        ],
      },
      {
        name: 'router_id',
        label: t('Router'),
        required: true,
        visible: (v) => v.type === 'subnet',
        render: ({ form }) => (
          <RouterSelectTable
            projectId={ctx.projectId}
            isAdmin={false}
            onPicked={() => form.setFieldValue('subnet_id', [])}
          />
        ),
      },
      {
        name: 'subnet_id',
        label: t('Subnet'),
        required: true,
        visible: (v) => v.type === 'subnet',
        render: ({ form }) => <LocalSubnetPicker form={form} allSubnets={allSubnets} />,
      },
      {
        name: 'endpoints',
        label: t('Peer Network Segment'),
        type: 'textarea',
        required: true,
        visible: (v) => v.type === 'cidr',
        extra: t(
          'Please fill in the peer network segment and subnet mask of CIDR format, the written subnets should be under the same router, one per line.'
        ),
        rules: [
          {
            validator: (_, value) => {
              if (!value) return Promise.resolve();
              const bad = String(value)
                .split('\n')
                .some((i) => !isPeerCidr(i));
              return bad
                ? Promise.reject(new Error(t('Invalid: CIDR Format Error (e.g. 10.10.10.0/24)')))
                : Promise.resolve();
            },
          },
        ],
      },
    ];
  },
  onSubmit: (values) => {
    const { name, description, type, ...rest } = values;
    const data = { name, description, type };
    if (type === 'subnet') {
      data.endpoints = rest.subnet_id;
    } else if (type === 'cidr') {
      data.endpoints = rest.endpoints.split('\n');
    }
    return neutronApi.createEndpointGroup(data);
  },
});

export const editEndpointGroupAction = () => ({
  id: 'edit-vpn-endpoint-groups',
  type: 'modal',
  title: t('Edit VPN Endpoint Groups'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [nameField(), descriptionField()],
  onSubmit: ({ name, description }, item) => neutronApi.updateEndpointGroup(item.id, { name, description }),
});

export const deleteEndpointGroupAction = (ctx) =>
  deleteWithCheck({
    id: 'delete-vpn-endpoint-group',
    title: t('Delete VPN Endpoint Groups'),
    actionName: t('Delete VPN Endpoint Groups'),
    reason: t('the VPN Endpoint policy is in use'),
    allowed: (item) => isCurrentProjectOrAdmin(item, ctx),
    connectionParams: (item) => {
      if (item.type === 'cidr') return { peer_ep_group_id: item.id };
      if (item.type === 'subnet') return { local_ep_group_id: item.id };
      return {};
    },
    onDelete: (item) => neutronApi.deleteEndpointGroup(item.id),
  });

export default function EndpointGroupsTab() {
  const projectMap = useProjectMap();
  const isAdminPage = useIsAdminPage();
  return (
    <ResourcePage
      embedded
      title={t('VPN Endpoint Groups')}
      fetch={(ctx) => vpnLists.endpointGroups(listParams(ctx))}
      columns={({ isAdmin }) =>
        [
          nameColumn(),
          isAdmin && projectColumn(projectMap),
          textColumn(t('Description'), 'description'),
          { title: t('Type'), dataIndex: 'type', key: 'type', render: endpointGroupTypeText },
          {
            title: t('Endpoint Counts'),
            dataIndex: 'endpoints',
            key: 'endpoints',
            render: (endpoints, record) => (
              <>
                {(endpoints || []).length}{' '}
                <Popover
                  content={<PopUpSubnet record={record} />}
                  title={record.type === 'cidr' ? t('Peer Network') : t('Local Network')}
                  destroyTooltipOnHide
                >
                  <FileTextOutlined style={{ cursor: 'pointer', color: '#64748b' }} />
                </Popover>
              </>
            ),
          },
        ].filter(Boolean)
      }
      filterParams={[{ name: 'name', label: t('Name') }, isAdminPage && { name: 'project_id', label: t('Project ID') }].filter(
        Boolean
      )}
      primaryActions={(ctx) => (ctx.isAdmin ? [] : [createEndpointGroupAction(ctx)])}
      batchActions={(ctx) => [deleteEndpointGroupAction(ctx)]}
      rowActions={(ctx) =>
        ctx.isAdmin
          ? { firstAction: deleteEndpointGroupAction(ctx), moreActions: [] }
          : { firstAction: editEndpointGroupAction(), moreActions: [{ action: deleteEndpointGroupAction(ctx) }] }
      }
    />
  );
}
