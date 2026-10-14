import React, { useEffect, useState } from 'react';
import { Form, Spin } from 'antd';
import { manilaApi } from '@/api/manila';
import { neutronApi } from '@/api/neutron';
import { nameColumn, IdNameCell, timeColumn, textColumn, projectColumn, yesNo, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { ResourcePopover, selectTableField, SelectTable } from '../shareShared';

/* ------------------------------------------------------------------ stores/manila/share-network */
export const fetchShareNetworks = async ({ isAdmin } = {}) => {
  const res = await manilaApi.listShareNetworks({ all_tenants: isAdmin ? 1 : 0 });
  return res?.share_networks || [];
};

/** ShareNetworkStore.detailDidFetch: resolves neutron subnets / networks of every share network subnet */
export const fetchShareNetworkDetail = async (id) => {
  const item = (await manilaApi.getShareNetwork(id))?.share_network;
  if (!item) return item;
  const subnets = item.share_network_subnets || [];
  const subnetIds = [...new Set(subnets.map((it) => it.neutron_subnet_id).filter(Boolean))];
  const netIds = [...new Set(subnets.map((it) => it.neutron_net_id).filter(Boolean))];
  const [subnetResults, netResults] = await Promise.all([
    Promise.all(subnetIds.map((sid) => neutronApi.getSubnet(sid).then((r) => r?.subnet).catch(() => null))),
    Promise.all(netIds.map((nid) => neutronApi.getNetwork(nid).then((r) => r?.network).catch(() => null))),
  ]);
  return {
    ...item,
    subnets: subnets.map((it) => subnetResults.find((s) => s && s.id === it.neutron_subnet_id) || { id: it.neutron_subnet_id }),
    networks: subnets.map((it) => netResults.find((n) => n && n.id === it.neutron_net_id) || { id: it.neutron_net_id }),
  };
};

/* ------------------------------------------------------------------ resources/manila/share-network */
export const shareNetworkColumns = ({ isAdmin, projectMap, selectMode = false } = {}) =>
  [
    selectMode
      ? nameColumn()
      : nameColumn({ linkTo: (r) => `/share/${isAdmin ? 'share-network-admin' : 'share-network'}/detail/${r.id}` }),
    !selectMode && isAdmin && projectColumn(projectMap),
    textColumn(t('Description'), 'description'),
    {
      title: t('Neutron Net'),
      dataIndex: 'networks',
      key: 'networks',
      render: (_, record) => {
        const subnets = record.share_network_subnets || [];
        if (!subnets.length) return '-';
        return (
          <div>
            {subnets.map((it) => (
              <div key={it.id || it.neutron_net_id} style={{ marginBottom: 4 }}>
                <IdNameCell
                  id={it.neutron_net_id}
                  href={
                    !selectMode && it.neutron_net_id
                      ? `/network/${isAdmin ? 'networks-admin' : 'networks'}/detail/${it.neutron_net_id}`
                      : undefined
                  }
                  bold={false}
                />
              </div>
            ))}
            {!selectMode ? (
              <ResourcePopover kind="network" ids={subnets.map((it) => it.neutron_net_id).filter(Boolean)} />
            ) : null}
          </div>
        );
      },
    },
    {
      title: t('Neutron Subnet'),
      dataIndex: 'share_network_subnets',
      key: 'share_network_subnets',
      render: (_, record) => {
        const subnets = record.share_network_subnets || [];
        if (!subnets.length) return '-';
        return (
          <div>
            {subnets.map((it) => (
              <div key={it.id || it.neutron_subnet_id} style={{ marginBottom: 4 }}>
                <IdNameCell id={it.neutron_subnet_id} bold={false} />
              </div>
            ))}
            {!selectMode ? (
              <ResourcePopover kind="subnet" ids={subnets.map((it) => it.neutron_subnet_id).filter(Boolean)} />
            ) : null}
          </div>
        );
      },
    },
    timeColumn(),
  ].filter(Boolean);

/* ------------------------------------------------------------------ actions */
const ROUTER_OWNERS = [
  'network:router_interface',
  'network:ha_router_replicated_interface',
  'network:router_interface_distributed',
];

/** ShareNetwork/actions/Create getSubnets: only subnets connected to a router are selectable */
function SubnetPicker({ value, onChange, form }) {
  const network = Form.useWatch('network', form);
  const networkId = (network || [])[0];
  const [subnets, setSubnets] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!networkId) {
      setSubnets([]);
      return undefined;
    }
    setLoading(true);
    Promise.all([
      neutronApi.listSubnets({ network_id: networkId }).catch(() => ({})),
      neutronApi.listPorts({ network_id: networkId }).catch(() => ({})),
    ]).then(([sr, pr]) => {
      if (!alive) return;
      const routerPorts = (pr?.ports || []).filter((it) => ROUTER_OWNERS.includes(it.device_owner));
      setSubnets(
        (sr?.subnets || []).map((subnet) => ({
          ...subnet,
          selectable: routerPorts.some((port) => (port.fixed_ips || []).some((ip) => ip.subnet_id === subnet.id)),
        }))
      );
      setLoading(false);
    });
    if ((value || []).length) onChange?.([]);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkId]);
  return (
    <Spin spinning={loading}>
      <SelectTable
        value={value}
        onChange={onChange}
        data={subnets}
        disabledFunc={(record) => !record.selectable}
        columns={[
          nameColumn(),
          { title: t('CIDR'), dataIndex: 'cidr', key: 'cidr' },
          {
            title: t('Allocation Pools'),
            dataIndex: 'allocation_pools',
            key: 'allocation_pools',
            render: (v) => (!v || !v.length ? '-' : `${v[0].start} -- ${v[0].end}`),
          },
          timeColumn(),
        ]}
      />
    </Spin>
  );
}

export const createShareNetworkAction = () => ({
  id: 'create',
  type: 'modal',
  title: t('Create Share Network'),
  width: 960,
  getDefaultValues: () => ({ network: [], subnet: [] }),
  getFormItems: async () => {
    const networks = (await neutronApi.listNetworks().catch(() => ({})))?.networks || [];
    return [
      { name: 'name', label: t('Name'), type: 'input', required: true },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
      selectTableField({
        name: 'network',
        label: t('Network'),
        required: true,
        data: networks,
        columns: [
          nameColumn(),
          {
            title: t('Subnet Count'),
            dataIndex: 'subnets',
            key: 'subnets',
            render: (v) => (v || []).length,
          },
          { title: t('Shared'), dataIndex: 'shared', key: 'shared', render: (v) => yesNo(v) },
          { title: t('External'), dataIndex: 'router:external', key: 'ext', render: (v) => yesNo(v) },
          textColumn(t('Status'), 'status'),
        ],
      }),
      {
        name: 'subnet',
        label: t('Subnet'),
        tip: t('Only subnets that are already connected to the router can be selected.'),
        rules: [
          {
            validator: (_, v) =>
              Array.isArray(v) && v.length
                ? Promise.resolve()
                : Promise.reject(new Error(`${t('Please select')} ${t('Subnet')}`)),
          },
        ],
        visible: (values) => Boolean((values.network || []).length),
        render: ({ form }) => <SubnetPicker form={form} />,
      },
    ];
  },
  onSubmit: ({ network = [], subnet = [], ...rest }) =>
    manilaApi.createShareNetwork({ neutron_net_id: network[0], neutron_subnet_id: subnet[0], ...rest }),
});

export const editShareNetworkAction = () => ({
  id: 'edit',
  type: 'modal',
  title: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', required: true },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => manilaApi.updateShareNetwork(item.id, values),
});

export const deleteShareNetworkAction = () => ({
  ...deleteAction({
    name: t('Share Network'),
    title: t('Delete Share Network'),
    onDelete: (it) => manilaApi.deleteShareNetwork(it.id),
  }),
  actionName: t('Delete Share Network'),
});

export const shareNetworkActionConfigs = ({ isAdmin }) => {
  const del = deleteShareNetworkAction();
  if (isAdmin) {
    return { primaryActions: [], batchActions: [del], rowActions: { firstAction: del, moreActions: [] } };
  }
  return {
    primaryActions: [createShareNetworkAction()],
    batchActions: [del],
    rowActions: { firstAction: editShareNetworkAction(), moreActions: [{ action: del }] },
  };
};
