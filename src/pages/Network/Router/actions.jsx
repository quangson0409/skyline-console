/**
 * Router actions - port of legacy pages/network/containers/Router/actions/* and
 * StaticRouter/actions/*. Payloads are identical to the legacy store calls
 * (stores/neutron/router.js, stores/neutron/static-route.js).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Form, Select, Tag, Space } from 'antd';
import { neutronApi } from '@/api/neutron';
import { deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { useAuthStore } from '@/store/authStore';
import { listAll, cidrRule, ipRule } from '../common';

export const routerStatus = () => ({
  ACTIVE: t('Active'),
  ERROR: t('Error'),
});

export const getRouterState = (state) => (state ? t('Up') : t('Down'));

export const ROUTER_INTERFACE_OWNERS = [
  'network:router_interface_distributed',
  'network:router_interface',
  'network:ha_router_replicated_interface',
];

/** legacy RouterStore.mapper */
export const mapRouter = (data) => {
  const item = data || {};
  const externalGateway = item.external_gateway_info;
  return {
    ...item,
    hasExternalGateway: !!externalGateway,
    externalNetworkId: (externalGateway && externalGateway.network_id) || '',
    externalNetworkName: (externalGateway && externalGateway.network_name) || '',
    externalFixedIps: (externalGateway && externalGateway.external_fixed_ips) || [],
  };
};

const currentProjectId = () => useAuthStore.getState()?.currentProject?.id;

const toList = (target) => (Array.isArray(target) ? target : target ? [target] : []);

const allocationPoolText = (value) => {
  if (!value || value.length === 0) return '-';
  return `${value[0].start} -- ${value[0].end}`;
};

const networkOptionLabel = (n) => (
  <Space size={4}>
    <span>{n.name || n.id}</span>
    {n.shared ? <Tag color="blue">{t('Shared')}</Tag> : null}
    {n['router:external'] ? <Tag color="purple">{t('External')}</Tag> : null}
  </Space>
);

const fetchExternalNetworkOptions = async () => {
  const nets = await listAll.networks({ 'router:external': true });
  return nets.map((n) => ({
    value: n.id,
    label: `${n.name || n.id}${n.status ? ` (${n.status})` : ''}`,
  }));
};

/* ---------------- Create ---------------- */
const quotaLeft = (q) => {
  if (!q || q.limit === undefined || q.limit === null) return undefined;
  if (Number(q.limit) === -1) return Infinity;
  return Number(q.limit) - Number(q.used || 0) - Number(q.reserved || 0);
};

export const createRouterAction = () => ({
  id: 'create',
  type: 'modal',
  policy: 'create_router',
  title: t('Create Router'),
  width: 800,
  getDefaultValues: () => ({ openExternalNetwork: false, hints: [] }),
  getFormItems: async () => {
    const [zones, extNets, quotaRes] = await Promise.all([
      neutronApi.listAvailabilityZones().catch(() => ({})),
      fetchExternalNetworkOptions(),
      neutronApi.getQuota(currentProjectId()).catch(() => ({})),
    ]);
    const aZones = (zones?.availability_zones || []).filter(
      (it) => it.state === 'available' && it.resource === 'router'
    );
    const quota = quotaRes?.quota?.router;
    const left = quotaLeft(quota);
    return [
      quota
        ? {
            name: 'quota-alert',
            type: 'alert',
            alertType: left === 0 ? 'warning' : 'info',
            message: `${t('Router')} ${t('Quota')}: ${t('Used')} ${quota.used ?? 0} / ${
              Number(quota.limit) === -1 ? t('Unlimited') : quota.limit
            }${left === 0 ? ` - ${t('Quota exceeded')}` : ''}`,
          }
        : null,
      { name: 'name', label: t('Name'), type: 'input', required: true },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
      {
        name: 'hints',
        label: t('Availability Zone Hints'),
        type: 'select',
        mode: 'multiple',
        options: aZones.map((z) => ({ value: z.name, label: `${z.name} (${z.state}, ${z.resource})` })),
      },
      {
        name: 'openExternalNetwork',
        label: t('Options'),
        render: () => <CheckLabel text={t('External Gateway')} />,
        tip: t('When enabled, router will use the external network as its default gateway.'),
      },
      {
        name: 'externalNetwork',
        label: t('External Gateway'),
        type: 'select',
        required: true,
        options: extNets,
        visible: (values) => !!values.openExternalNetwork,
      },
    ].filter(Boolean);
  },
  onSubmit: async (values) => {
    const quotaRes = await neutronApi.getQuota(currentProjectId()).catch(() => ({}));
    if (quotaLeft(quotaRes?.quota?.router) === 0) {
      throw new Error(t('Quota exceeded'));
    }
    const { openExternalNetwork, externalNetwork, hints, ...others } = values;
    const extGateway = openExternalNetwork
      ? { external_gateway_info: { network_id: externalNetwork } }
      : null;
    const availability_zone_hints = hints || [];
    return neutronApi.createRouter({
      ...others,
      ...extGateway,
      availability_zone_hints,
    });
  },
});

/** Checkbox that works as a Form.Item child (value / onChange injected) */
function CheckLabel({ value, checked, onChange, text }) {
  const isChecked = checked ?? value ?? false;
  return (
    <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <input type="checkbox" checked={!!isChecked} onChange={(e) => onChange?.(e.target.checked)} />
      <span>{text}</span>
    </label>
  );
}

/* ---------------- Edit ---------------- */
export const editRouterAction = () => ({
  id: 'edit-router',
  type: 'modal',
  policy: 'update_router',
  title: t('Edit Router'),
  buttonText: t('Edit'),
  allowed: (item) => item?.name !== 'Default Router',
  getDefaultValues: (item) => ({ name: item?.name, description: item?.description }),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: t('Please input name') },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => neutronApi.updateRouter(item.id, values),
});

/* ---------------- Delete ---------------- */
const fetchConnectedSubnets = async (router) => {
  const [subnets, ports] = await Promise.all([listAll.subnets(), listAll.ports({ device_id: router.id })]);
  const connect = [];
  ports.forEach((port) => {
    if (ROUTER_INTERFACE_OWNERS.includes(port.device_owner)) {
      (port.fixed_ips || []).forEach((ip) => {
        const subnet = subnets.find((it) => it.id === ip.subnet_id);
        if (subnet) connect.push(subnet);
      });
    }
  });
  return connect;
};

export const deleteRouterAction = () => ({
  ...deleteAction({
    name: t('Router'),
    title: t('Delete Router'),
    allowed: (item) => !item?.external_gateway_info,
    onDelete: (it) => neutronApi.deleteRouter(it.id),
  }),
  policy: 'delete_router',
  actionName: t('delete router'),
  onSubmit: async (target) => {
    const list = toList(target);
    if (list.length === 1) {
      // legacy single delete checks the connected subnets first
      const item = list[0];
      const connect = await fetchConnectedSubnets(item);
      if (connect.length) {
        throw new Error(
          t('Unable to {action}, because : {reason}, instance: {name}.', {
            action: t('delete router'),
            name: item.name,
            reason: t('the router has connected subnet'),
          })
        );
      }
    }
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await neutronApi.deleteRouter(it.id);
    }
  },
});

/* ---------------- Gateway ---------------- */
export const setGatewayAction = () => ({
  id: 'set-gateway',
  type: 'modal',
  policy: 'update_router',
  title: t('External Gateway'),
  buttonText: t('Open External Gateway'),
  allowed: (item) => !item?.external_gateway_info,
  getDefaultValues: (item) => ({ name: item?.name || item?.id }),
  getFormItems: async () => [
    { name: 'name', label: t('Name'), type: 'label' },
    {
      name: 'externalNetwork',
      label: t('External Gateway'),
      type: 'select',
      required: true,
      options: await fetchExternalNetworkOptions(),
    },
  ],
  onSubmit: (values, item) =>
    neutronApi.updateRouter(item.id, {
      external_gateway_info: { network_id: values.externalNetwork },
    }),
});

export const closeGatewayAction = () => ({
  id: 'clear-gateway',
  type: 'confirm',
  policy: 'update_router',
  title: t('Close External Gateway'),
  buttonText: t('Close External Gateway'),
  actionName: t('Close external gateway'),
  allowed: (item) => !!item?.external_gateway_info,
  onSubmit: async (target) => {
    for (const it of toList(target)) {
      // eslint-disable-next-line no-await-in-loop
      await neutronApi.updateRouter(it.id, { external_gateway_info: null });
    }
  },
});

/* ---------------- SNAT ---------------- */
const snatAction = (enable) => ({
  id: enable ? 'enable-snat' : 'disable-snat',
  type: 'confirm',
  policy: [
    'update_router',
    'update_router:external_gateway_info',
    'update_router:external_gateway_info:network_id',
    'update_router:external_gateway_info:enable_snat',
  ],
  title: enable ? t('Enable SNAT') : t('Disable SNAT'),
  actionName: enable ? t('Enable SNAT') : t('Disable SNAT'),
  allowed: (item) =>
    enable
      ? !!(item?.external_gateway_info && !item.external_gateway_info.enable_snat)
      : !!item?.external_gateway_info?.enable_snat,
  onSubmit: async (target) => {
    for (const it of toList(target)) {
      const { network_id } = it.external_gateway_info || {};
      // eslint-disable-next-line no-await-in-loop
      await neutronApi.updateRouter(it.id, {
        external_gateway_info: { network_id, enable_snat: enable },
      });
    }
  },
});
export const enableSnatAction = () => snatAction(true);
export const disableSnatAction = () => snatAction(false);

/* ---------------- Floating IP (legacy AssociateFip / DisassociateFip) ---------------- */
export const associateFipAction = () => ({
  id: 'associate-fip',
  type: 'modal',
  policy: 'update_router',
  title: t('Associate Floating IP'),
  allowed: (item) => !!item?.hasExternalGateway && (item.externalFixedIps || []).length < 1,
  getDefaultValues: (item) => ({
    name: item?.name || item?.id,
    external_network: item?.external_gateway_info?.network_name || item?.externalNetworkName || item?.externalNetworkId,
  }),
  getFormItems: async (item) => {
    const { network_id } = item?.external_gateway_info || {};
    const fips = (
      await listAll.floatingips({
        floating_network_id: network_id,
        project_id: item?.project_id || item?.tenant_id,
        status: 'DOWN',
      })
    ).filter((it) => !it.router_id);
    return [
      { name: 'name', label: t('Name'), type: 'label' },
      { name: 'external_network', label: t('External Network'), type: 'label' },
      {
        name: 'floatingIp',
        label: t('Floating IP'),
        type: 'select',
        required: true,
        options: fips.map((f) => ({ value: f.id, label: f.floating_ip_address, raw: f })),
      },
    ];
  },
  onSubmit: async (values, item) => {
    const fipRes = await neutronApi.getFloatingIp(values.floatingIp);
    const fip = fipRes?.floatingip || {};
    const networkId = fip.floating_network_id;
    const portAddress = fip.floating_ip_address;
    const result = await neutronApi.listPorts({ network_id: networkId });
    const port = (result?.ports || []).find((it) => {
      const fixedIps = it.fixed_ips;
      return fixedIps && fixedIps.length > 0 && fixedIps[0].ip_address === portAddress;
    });
    const fixedIp = (port && port.fixed_ips[0]) || null;
    if (!fixedIp) throw new Error(t('Operation failed'));
    const oldFixedIps = item.external_gateway_info?.external_fixed_ips || [];
    return neutronApi.updateRouter(item.id, {
      external_gateway_info: {
        network_id: networkId,
        external_fixed_ips: [...oldFixedIps, fixedIp],
      },
    });
  },
});

export const disassociateFipAction = () => ({
  id: 'DisassociateFip',
  type: 'confirm',
  policy: 'update_router',
  title: t('Disassociate Floating IP'),
  actionName: t('disassociate floating IP'),
  allowed: (item) => (item?.external_gateway_info?.external_fixed_ips || []).length > 0,
  onSubmit: async (target) => {
    for (const it of toList(target)) {
      const { network_id } = it.external_gateway_info || {};
      // eslint-disable-next-line no-await-in-loop
      await neutronApi.updateRouter(it.id, {
        external_gateway_info: { network_id, external_fixed_ips: [] },
      });
    }
  },
});

/* ---------------- Connect / Disconnect subnet ---------------- */
function SubnetPicker({ value, onChange, form, excludeSubnetIds }) {
  const networkId = Form.useWatch('network', form);
  const [subnets, setSubnets] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!networkId) {
      setSubnets([]);
      return undefined;
    }
    setLoading(true);
    listAll.subnets({ network_id: networkId }).then((list) => {
      if (!alive) return;
      setSubnets(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [networkId]);
  const prevNetwork = useRef(networkId);
  useEffect(() => {
    // reset the selected subnet when the network changes (not on mount)
    if (prevNetwork.current !== networkId && value !== undefined) onChange?.(undefined);
    prevNetwork.current = networkId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkId]);
  return (
    <Select
      value={value}
      onChange={onChange}
      loading={loading}
      disabled={!networkId}
      placeholder={networkId ? t('Please select') : t('Please select a network first')}
      showSearch
      optionFilterProp="search"
      options={subnets.map((s) => ({
        value: s.id,
        search: `${s.name} ${s.cidr}`,
        disabled: !(s.allocation_pools || []).length || excludeSubnetIds.includes(s.id),
        label: (
          <span>
            {s.name || s.id} <span style={{ color: '#64748b' }}>({s.cidr})</span>{' '}
            <span style={{ color: '#94a3b8', fontSize: 12 }}>{allocationPoolText(s.allocation_pools)}</span>
          </span>
        ),
      }))}
    />
  );
}

/** `bound` is the router used when the action runs without an item (primary action in detail tab) */
export const connectSubnetAction = (bound) => ({
  id: 'connect-subnet',
  type: 'modal',
  policy: 'add_router_interface',
  title: t('Connect Subnet'),
  width: 760,
  getDefaultValues: (item) => ({ name: (item || bound)?.name || (item || bound)?.id }),
  getFormItems: async (item) => {
    const router = item || bound;
    const [networks, ports] = await Promise.all([listAll.networks(), listAll.ports({ device_id: router?.id })]);
    const excludeSubnetIds = [];
    ports.forEach((port) => (port.fixed_ips || []).forEach((it) => excludeSubnetIds.push(it.subnet_id)));
    return [
      { name: 'name', label: t('Name'), type: 'label' },
      {
        name: 'network',
        label: t('Network'),
        required: true,
        render: () => (
          <Select
            showSearch
            optionFilterProp="search"
            placeholder={t('Please select')}
            options={networks.map((n) => ({ value: n.id, label: networkOptionLabel(n), search: `${n.name} ${n.id}` }))}
          />
        ),
      },
      {
        name: 'subnet',
        label: t('Subnet'),
        required: true,
        tip: t('Subnets without allocation pools or already connected to the router cannot be selected.'),
        render: ({ form }) => <SubnetPicker form={form} excludeSubnetIds={excludeSubnetIds} />,
      },
    ];
  },
  // legacy RouterStore.connectSubnet
  onSubmit: async (values, item) => {
    const router = item || bound;
    const id = router.id;
    const subnetId = values.subnet;
    const networkId = values.network;
    try {
      return await neutronApi.addRouterInterface(id, { subnet_id: subnetId });
    } catch (error) {
      const port = await neutronApi.createPort({
        network_id: networkId,
        fixed_ips: [{ subnet_id: subnetId }],
      });
      const portId = port?.port?.id;
      return neutronApi.addRouterInterface(id, { port_id: portId });
    }
  },
});

export const disconnectSubnetAction = (bound) => ({
  id: 'disconnect-subnet',
  type: 'modal',
  policy: 'remove_router_interface',
  title: t('Disconnect Subnet'),
  width: 760,
  getDefaultValues: (item) => ({ name: (item || bound)?.name || (item || bound)?.id }),
  getFormItems: async (item) => {
    const router = item || bound;
    const ports = await listAll.ports({ device_id: router?.id });
    const subnetIds = new Set();
    const networkIds = new Set();
    ports.forEach((port) => {
      if (ROUTER_INTERFACE_OWNERS.includes(port.device_owner)) {
        networkIds.add(port.network_id);
        (port.fixed_ips || []).forEach((ip) => subnetIds.add(ip.subnet_id));
      }
    });
    const [subnets, networks] = await Promise.all([
      Promise.all([...subnetIds].map((id) => neutronApi.getSubnet(id).then((r) => r?.subnet).catch(() => null))),
      Promise.all([...networkIds].map((id) => neutronApi.getNetwork(id).then((r) => r?.network).catch(() => null))),
    ]);
    const options = subnets.filter(Boolean).map((s) => {
      const network = networks.find((n) => n && n.id === s.network_id);
      return {
        value: s.id,
        search: `${s.name} ${s.cidr}`,
        label: (
          <span>
            {s.name || s.id} <span style={{ color: '#64748b' }}>({s.cidr})</span>{' '}
            <span style={{ color: '#94a3b8', fontSize: 12 }}>
              {t('Network')}: {network?.name || '-'} | {allocationPoolText(s.allocation_pools)}
            </span>
          </span>
        ),
      };
    });
    return [
      { name: 'name', label: t('Name'), type: 'label' },
      {
        name: 'subnet',
        label: t('Subnet'),
        required: true,
        render: () => <Select showSearch optionFilterProp="search" placeholder={t('Please select')} options={options} />,
      },
    ];
  },
  onSubmit: (values, item) => neutronApi.removeRouterInterface((item || bound).id, { subnet_id: values.subnet }),
});

/* ---------------- Static routes ---------------- */
export const createStaticRouteAction = (routerId) => ({
  id: 'create',
  type: 'modal',
  policy: 'update_router',
  title: t('Create Static Route'),
  formItems: [
    { name: 'destination', label: t('Destination CIDR'), type: 'input', required: true, rules: [cidrRule()] },
    { name: 'nexthop', label: t('Next Hop'), type: 'input', required: true, rules: [ipRule()] },
  ],
  onSubmit: (values) =>
    neutronApi.addExtraRoutes(routerId, {
      router: { routes: [{ destination: values.destination, nexthop: values.nexthop }] },
    }),
});

export const deleteStaticRouteAction = () => ({
  id: 'delete',
  type: 'confirm',
  policy: 'update_router',
  title: t('Delete Static Route'),
  buttonText: t('Delete'),
  actionName: t('delete static route'),
  isDanger: true,
  onSubmit: async (target) => {
    for (const it of toList(target)) {
      const { destination, nexthop, router_id: id } = it;
      // eslint-disable-next-line no-await-in-loop
      await neutronApi.removeExtraRoutes(id, { router: { routes: [{ destination, nexthop }] } });
    }
  },
});

/* ---------------- action configs (legacy actions/index.jsx) ---------------- */
export const routerRowActions = (isAdmin) =>
  isAdmin
    ? { firstAction: deleteRouterAction(), moreActions: [] }
    : {
        firstAction: editRouterAction(),
        moreActions: [
          { action: connectSubnetAction() },
          { action: disconnectSubnetAction() },
          { action: deleteRouterAction() },
          { action: closeGatewayAction() },
          { action: setGatewayAction() },
          { action: enableSnatAction() },
          { action: disableSnatAction() },
          { action: associateFipAction() },
          { action: disassociateFipAction() },
        ],
      };
