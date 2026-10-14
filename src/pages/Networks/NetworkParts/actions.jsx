/**
 * Network / Subnet actions (ports of legacy pages/network/containers/Network/actions/*,
 * containers/Subnet/actions/* and Overview/components/NetworkQuickStart).
 */
import { nameRule as sharedNameRule } from '@/components/form/rules';
import React, { useEffect } from 'react';
import { Alert, Form, Input, InputNumber, Select } from 'antd';
import { neutronApi } from '@/api/neutron';
import { keystoneApi } from '@/api/keystone';
import { deleteAction } from '@/components/ResourcePage';
import { listAll } from '@/pages/Network/common';
import { isCidr, isIPv4, isIPv6 } from '@/components/network/ip';
import { t } from '@/core/i18n';
import { withProjectQuota } from '@/components/Quota/utils';
import { fetchNeutronQuota as fetchNeutronQuotaData, neutronQuotaItems } from '@/components/Quota/services';
import {
  physicalNetworkArray,
  segmentationNetworkArray,
  segmentationNetworkRequireArray,
  segMax,
  segTip,
  subnetIpv6Tip,
  ipv6ModeOptions,
  ipVersionStrOptions,
  dhcpOptions,
  getAllocationPools,
  getHostRouters,
  getAllocationPoolsIntoLines,
  getDNSIntoLines,
  getHostRoutesIntoLines,
  splitToArray,
  subnetRules,
  buildSubnetBody,
  createSubnetRequest,
  fetchNeutronQuota,
  getFirstIpFromCidr,
  checkAllocationPools,
  checkDNS,
  checkHostRoutes,
} from './utils';

/* ---------------- helpers ---------------- */
// legacy 'input-name' with withoutChinese (CreateNetwork / CreateSubnet / Edit / NetworkQuickStart)
const nameRule = () => sharedNameRule({ withoutChinese: true });

const projectOptions = async () => {
  try {
    const res = await keystoneApi.listProjects();
    return (res?.projects || []).map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }));
  } catch {
    return [];
  }
};

const yesNoRadio = () => [
  { label: t('Yes'), value: true },
  { label: t('No'), value: false },
];

/** Owner check used by legacy Edit/Delete network (checkSystemAdmin || own project) */
const ownsOrAdmin = (item, { projectId, hasAdminRole }) =>
  Boolean(hasAdminRole) || (item?.project_id || item?.tenant_id) === projectId;

/** Segmentation id input with tip depending on the provider network type */
function SegIdInput({ value, onChange, form }) {
  const type = Form.useWatch('provider_network_type', form) || 'geneve';
  return (
    <div>
      <InputNumber value={value} onChange={onChange} min={1} max={segMax(type)} style={{ width: '100%' }} />
      <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{segTip(type)}</div>
    </div>
  );
}

/** Project select with a warning when the subnet project differs from the network project */
function SubnetProjectSelect({ value, onChange, options, networkProjectId }) {
  return (
    <div>
      <Select value={value} onChange={onChange} options={options} showSearch optionFilterProp="label" />
      {value && networkProjectId && value !== networkProjectId ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 8 }}
          message={t(
            'The selected project is different from the project to which the network belongs. That is, the subnet to be created is not under the same project as the network. Please do not continue unless you are quite sure what you are doing.'
          )}
        />
      ) : null}
    </div>
  );
}

/** Subnet form fields shared by Create Network (with create_subnet) and Create Subnet */
const subnetFields = (cond = () => true) => {
  const more = (v) => cond(v) && Boolean(v.more);
  const isV6 = (v) => cond(v) && v.ip_version === 'ipv6';
  return {
    ipVersion: { name: 'ip_version', label: t('IP Version'), type: 'select', required: true, options: ipVersionStrOptions(), visible: cond },
    raMode: {
      name: 'ipv6_ra_mode',
      label: t('Router Advertisements Mode'),
      type: 'select',
      options: ipv6ModeOptions(),
      tip: subnetIpv6Tip(),
      rules: subnetRules.raMode,
      visible: isV6,
    },
    addressMode: {
      name: 'ipv6_address_mode',
      label: t('IP Distribution Mode'),
      type: 'select',
      options: ipv6ModeOptions(),
      tip: subnetIpv6Tip(),
      visible: isV6,
    },
    rest: [
      { name: 'more', label: t('Advanced Options'), type: 'switch', visible: cond },
      { name: 'disable_gateway', label: t('Disable Gateway'), type: 'switch', visible: more },
      {
        name: 'gateway_ip',
        label: t('Gateway IP'),
        type: 'input',
        tip: t('If no gateway is specified, the first IP address will be defaulted.'),
        rules: subnetRules.gateway,
        visible: (v) => more(v) && !v.disable_gateway,
      },
      { name: 'enable_dhcp', label: t('DHCP'), type: 'radio', options: dhcpOptions(), visible: more },
      {
        name: 'allocation_pools',
        label: t('Allocation Pools'),
        type: 'textarea',
        rows: 3,
        tip: t('IP address allocation pools, one enter per line (e.g. {ip})', {
          ip: '192.168.1.2,192.168.1.200 / 1001:1001::,1001:1002::',
        }),
        rules: subnetRules.pools,
        visible: more,
      },
      {
        name: 'dns',
        label: t('DNS'),
        type: 'textarea',
        rows: 3,
        tip: t('One entry per line (e.g. {ip})', { ip: '114.114.114.114 / 1001:1001::' }),
        rules: subnetRules.dns,
        visible: more,
      },
      {
        name: 'host_routes',
        label: t('Host Routes'),
        type: 'textarea',
        rows: 3,
        tip: t('Additional routes announced to the instance, one entry per line (e.g. {ip})', {
          ip: '192.168.200.0/24,10.56.1.254 / 1001:1001::/64,1001:1001',
        }),
        rules: subnetRules.hostRoutes,
        visible: more,
      },
    ],
  };
};

const cidrTip = () =>
  `${t(
    'It is recommended that you use the private network address 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16'
  )} / ${t('e.g. 2001:Db8::/48')}`;

/* ---------------- Network actions ---------------- */
const createNetworkDefaults = (isAdmin, projectId) => ({
  enable_dhcp: true,
  provider_network_type: 'geneve',
  ip_version: 'ipv4',
  disable_gateway: false,
  more: false,
  create_subnet: false,
  port_security_enabled: true,
  ipv6_ra_mode: 'slaac',
  ipv6_address_mode: 'slaac',
  ...(isAdmin ? { project_id: projectId } : {}),
});

export const createNetworkAction = ({ isAdmin, projectId, hasAdminRole }) => ({
  id: 'create-network',
  type: 'modal',
  policy: ['create_network', 'create_subnet'],
  title: t('Create Network'),
  width: isAdmin ? 860 : 680,
  getDefaultValues: () => createNetworkDefaults(isAdmin, projectId),
  // legacy CreateNetwork showQuota: 1 network (+ 1 subnet when "Create Subnet" is on)
  quota: withProjectQuota(
    (pid) => fetchNeutronQuotaData(pid),
    (values) => (isAdmin ? values.project_id || projectId : projectId),
    (quota, values) => neutronQuotaItems(quota, ['network', 'subnet'], [1, values.create_subnet ? 1 : 0])
  ),
  getFormItems: async () => {
    const [zonesRes, projects] = await Promise.all([
      neutronApi.listAvailabilityZones().catch(() => ({})),
      isAdmin ? projectOptions() : Promise.resolve([]),
    ]);
    const zones = (zonesRes?.availability_zones || [])
      .filter((it) => it.state === 'available' && it.resource === 'network')
      .map((it) => ({ value: it.name, label: it.name }));
    const withSubnet = (v) => Boolean(v.create_subnet);
    const sf = subnetFields(withSubnet);
    return [
      { name: 'name', label: t('Network Name'), type: 'input', required: true, rules: [nameRule()] },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
      { name: 'availableZone', label: t('Availability Zone'), type: 'select', placeholder: t('Please select'), options: zones },
      {
        name: 'mtu',
        label: t('MTU'),
        type: 'number',
        min: 68,
        max: 9000,
        tip: t('Minimum value is 68 for IPv4, and 1280 for IPv6.'),
      },
      { name: 'create_subnet', label: t('Create Subnet'), type: 'switch' },
      hasAdminRole && { name: 'shared', label: t('Shared Network'), type: 'switch' },
      { name: 'port_security_enabled', label: t('Port Security'), type: 'switch' },
      isAdmin && { name: 'external_network', label: t('External Network'), type: 'switch' },
      isAdmin && { name: 'project_id', label: t('Project'), type: 'select', required: true, options: projects },
      isAdmin && {
        name: 'provider_network_type',
        label: t('Provider Network Type'),
        type: 'select',
        required: true,
        options: [
          { label: t('GENEVE'), value: 'geneve' },
          { label: t('VXLAN'), value: 'vxlan' },
          { label: t('Flat'), value: 'flat' },
          { label: t('VLAN'), value: 'vlan' },
          { label: t('GRE'), value: 'gre' },
        ],
      },
      isAdmin && {
        name: 'provider_physical_network',
        label: t('Provider Physical Network'),
        type: 'input',
        required: true,
        visible: (v) => physicalNetworkArray.includes(v.provider_network_type),
      },
      isAdmin && {
        name: 'provider_segmentation_id',
        label: t('Segmentation ID'),
        render: ({ form }) => <SegIdInput form={form} />,
        rules: [
          ({ getFieldValue }) => ({
            validator: (_, value) => {
              const type = getFieldValue('provider_network_type');
              if (value === undefined || value === null || value === '') {
                return segmentationNetworkRequireArray.includes(type)
                  ? Promise.reject(new Error(`${t('Please input')} ${t('Segmentation ID')}`))
                  : Promise.resolve();
              }
              return value >= 1 && value <= segMax(type) ? Promise.resolve() : Promise.reject(new Error(segTip(type)));
            },
          }),
        ],
        visible: (v) => segmentationNetworkArray.includes(v.provider_network_type),
      },
      { name: 'subnet_name', label: t('Subnet Name'), type: 'input', required: true, rules: [nameRule()], visible: withSubnet },
      sf.ipVersion,
      sf.raMode,
      sf.addressMode,
      {
        name: 'cidr',
        label: t('CIDR'),
        type: 'input',
        placeholder: '192.168.0.0/24',
        required: true,
        rules: subnetRules.cidr(),
        tip: cidrTip(),
        visible: withSubnet,
      },
      ...sf.rest,
    ].filter(Boolean);
  },
  onSubmit: async (formValues) => {
    const values = { ...createNetworkDefaults(isAdmin, projectId), ...formValues };
    const {
      name,
      project_id,
      provider_network_type,
      provider_physical_network,
      provider_segmentation_id,
      shared,
      external_network,
      availableZone,
      allocation_pools,
      host_routes,
      description,
      mtu,
      port_security_enabled,
      ...rest
    } = values;
    const quota = await fetchNeutronQuota(isAdmin ? project_id || projectId : projectId);
    const noLeft = (k) => quota?.[k] && quota[k].left === 0;
    if (noLeft('network') || (rest.create_subnet && noLeft('subnet'))) {
      throw new Error(t('Quota exceeded'));
    }
    let data = { name, description, port_security_enabled };
    if (availableZone) data.availability_zone_hints = [availableZone];
    if (mtu) data.mtu = mtu;
    if (isAdmin) {
      data = {
        ...data,
        'router:external': external_network,
        project_id: project_id || projectId,
        'provider:network_type': provider_network_type,
        'provider:physical_network': provider_physical_network,
        'provider:segmentation_id': provider_segmentation_id,
      };
    }
    if (hasAdminRole) data = { ...data, shared };
    const res = await neutronApi.createNetwork(data);
    const network = res?.network || {};
    if (rest.create_subnet) {
      try {
        const subnet = await createSubnetRequest({
          ...rest,
          allocation_pools: getAllocationPools(allocation_pools),
          host_routes: getHostRouters(host_routes),
          project_id: network.project_id,
          network_id: network.id,
        });
        return { network, subnet };
      } catch (e) {
        const detail = e?.response?.data?.NeutronError?.message || e.message;
        throw new Error(
          `${t('Unable to {action}, instance: {name}.', { action: t('Create Subnet'), name: values.subnet_name })} ${
            detail || ''
          }`
        );
      }
    }
    return res;
  },
});

/** Legacy Overview NetworkQuickStart (primary action of the network list) */
const DEFAULT_CIDR = { ipv4: '192.168.0.0/24', ipv6: '1001:1001::/64' };
const DEFAULT_DNS = { ipv4: '1.1.1.1', ipv6: '1001:1001::2' };

function QuickIpVersionSelect({ value, onChange, form }) {
  return (
    <Select
      value={value}
      options={ipVersionStrOptions()}
      onChange={(v) => {
        onChange(v);
        const cidr = DEFAULT_CIDR[v];
        form.setFieldsValue({ subnetCidr: cidr, gatewayIp: getFirstIpFromCidr(cidr), dns: DEFAULT_DNS[v] });
      }}
    />
  );
}

function QuickCidrInput({ value, onChange, form }) {
  return (
    <Input
      value={value}
      placeholder={DEFAULT_CIDR.ipv4}
      onChange={(e) => {
        onChange(e);
        const first = getFirstIpFromCidr(e.target.value);
        if (first) {
          const v = form.getFieldValue('ipVersion') || 'ipv4';
          form.setFieldsValue({ gatewayIp: first, dns: DEFAULT_DNS[v] });
        }
      }}
    />
  );
}

export const quickCreateNetworkAction = ({ projectId }) => ({
  id: 'network-quick-start',
  type: 'modal',
  title: t('Quick Create'),
  // legacy pages/base/containers/Overview/components/NetworkQuickStart static policy
  policy: ['create_network', 'create_subnet', 'create_router'],
  width: 760,
  getDefaultValues: () => ({
    networkName: 'network-1',
    subnetName: 'subnet-1',
    subnetCidr: DEFAULT_CIDR.ipv4,
    ipVersion: 'ipv4',
    gatewayIp: getFirstIpFromCidr(DEFAULT_CIDR.ipv4),
    dns: DEFAULT_DNS.ipv4,
    createRouter: false,
    routerName: 'router-1',
    openExternalNetwork: false,
  }),
  getFormItems: async () => {
    const externals = await listAll.networks({ 'router:external': true });
    return [
      { name: 'networkName', label: t('Network Name'), type: 'input', required: true, rules: [nameRule()] },
      { name: 'subnetName', label: t('Subnet Name'), type: 'input', required: true },
      { name: 'ipVersion', label: t('IP Version'), required: true, render: ({ form }) => <QuickIpVersionSelect form={form} /> },
      {
        name: 'subnetCidr',
        label: t('Subnet CIDR'),
        required: true,
        render: ({ form }) => <QuickCidrInput form={form} />,
        tip: cidrTip(),
        rules: [
          ({ getFieldValue }) => ({
            validator: (_, value) =>
              !value || isCidr(value, (getFieldValue('ipVersion') || 'ipv4') === 'ipv4' ? 4 : 6)
                ? Promise.resolve()
                : Promise.reject(new Error(t('Invalid: ') + t('CIDR'))),
          }),
        ],
      },
      {
        name: 'gatewayIp',
        label: t('Gateway IP'),
        type: 'input',
        tip: t('Auto-populated with first IP from CIDR. You can modify if needed.'),
        rules: [
          ({ getFieldValue }) => ({
            validator: (_, value) => {
              if (!value || !String(value).trim()) return Promise.resolve();
              const v4 = (getFieldValue('ipVersion') || 'ipv4') === 'ipv4';
              if (v4 ? isIPv4(value) : isIPv6(value)) return Promise.resolve();
              return Promise.reject(new Error(v4 ? t('Invalid IP address') : t('Invalid: Please input a valid IPv6.')));
            },
          }),
        ],
      },
      { name: 'dns', label: t('DNS'), type: 'textarea', rows: 2, tip: t('One entry per line (e.g. {ip})', { ip: '1.1.1.1' }) },
      { name: 'createRouter', label: t('Create and Attach Router'), type: 'switch' },
      { name: 'routerName', label: t('Router Name'), type: 'input', required: true, rules: [nameRule()], visible: (v) => v.createRouter },
      {
        name: 'openExternalNetwork',
        label: t('External Gateway'),
        type: 'switch',
        tip: t('Enable external gateway to allow the router to connect to external networks for internet access.'),
        visible: (v) => v.createRouter,
      },
      {
        name: 'externalNetwork',
        label: t('External Network'),
        type: 'select',
        required: true,
        options: externals.map((n) => ({ value: n.id, label: `${n.name || n.id} (${n.status || '-'})` })),
        visible: (v) => v.createRouter && v.openExternalNetwork,
      },
    ];
  },
  onSubmit: async (values) => {
    if (!projectId) throw new Error(t('Current project ID is not available'));
    const isV6 = values.ipVersion === 'ipv6';
    const netRes = await neutronApi.createNetwork({ name: values.networkName, project_id: projectId });
    const network = netRes?.network || {};
    const subnetValues = {
      subnet_name: values.subnetName,
      cidr: values.subnetCidr,
      ip_version: values.ipVersion || 'ipv4',
      enable_dhcp: true,
      dns: values.dns,
      project_id: network.project_id,
      network_id: network.id,
    };
    if (isV6 || values.gatewayIp) subnetValues.gateway_ip = values.gatewayIp;
    if (isV6) {
      subnetValues.ipv6_address_mode = 'slaac';
      subnetValues.ipv6_ra_mode = 'slaac';
    }
    const subRes = await createSubnetRequest(subnetValues);
    const subnet = subRes?.subnet || {};
    if (values.createRouter && network.id && subnet.id) {
      const routerData = { name: values.routerName || 'router-1', project_id: projectId };
      if (values.openExternalNetwork && values.externalNetwork) {
        routerData.external_gateway_info = { network_id: values.externalNetwork };
      }
      const rRes = await neutronApi.createRouter(routerData);
      const router = rRes?.router || rRes || {};
      try {
        await neutronApi.addRouterInterface(router.id, { subnet_id: subnet.id });
      } catch {
        const port = await neutronApi.createPort({ network_id: network.id, fixed_ips: [{ subnet_id: subnet.id }] });
        await neutronApi.addRouterInterface(router.id, { port_id: port?.port?.id });
      }
    }
    return { network, subnet };
  },
});

export const editNetworkAction = (ctx) => ({
  id: 'edit-network',
  type: 'modal',
  policy: 'update_network',
  title: t('Edit'),
  buttonText: t('Edit'),
  allowed: (item) => ownsOrAdmin(item, ctx),
  getDefaultValues: (item) => ({ ...item }),
  getFormItems: async () =>
    [
      { name: 'name', label: t('Network Name'), type: 'input', required: true, rules: [nameRule()] },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
      ctx.hasAdminRole && { name: 'shared', label: t('Shared Network'), type: 'radio', options: yesNoRadio() },
      { name: 'port_security_enabled', label: t('Port Security'), type: 'switch' },
      ctx.isAdmin && { name: 'router:external', label: t('External Network'), type: 'switch' },
    ].filter(Boolean),
  onSubmit: (values, item) => {
    const { name, description, port_security_enabled } = values;
    const data = { name, description, port_security_enabled };
    if (ctx.hasAdminRole) data.shared = values.shared;
    if (ctx.isAdmin) data['router:external'] = values['router:external'];
    return neutronApi.updateNetwork(item.id, data);
  },
});

export const deleteNetworkAction = (ctx) => ({
  ...deleteAction({
    name: t('Network'),
    title: t('Delete Network'),
    onDelete: (it) => neutronApi.deleteNetwork(it.id),
    allowed: (item) => ownsOrAdmin(item, ctx),
  }),
  policy: 'delete_network',
});

/* ---------------- Subnet actions ---------------- */
const createSubnetDefaults = (hasAdminRole, projectId) => ({
  enable_dhcp: true,
  ip_version: 'ipv4',
  disable_gateway: false,
  more: false,
  ipv6_ra_mode: 'slaac',
  ipv6_address_mode: 'slaac',
  ...(hasAdminRole ? { project_id: projectId } : {}),
});

/** network: fixed network (detail page); otherwise the row item is the network */
export const createSubnetAction = (ctx, network) => ({
  id: 'create-subnet',
  type: 'modal',
  policy: 'create_subnet',
  title: t('Create Subnet'),
  width: ctx.hasAdminRole ? 860 : 680,
  allowed: (item) => {
    const net = network || item || {};
    return Boolean(ctx.hasAdminRole) || (net.project_id || net.tenant_id) === ctx.projectId;
  },
  getDefaultValues: () => createSubnetDefaults(ctx.hasAdminRole, ctx.projectId),
  // legacy CreateSubnet showQuota: neutron subnet quota of the target project
  quota: withProjectQuota(
    (pid) => fetchNeutronQuotaData(pid),
    (values) => values.project_id || ctx.projectId,
    (quota) => neutronQuotaItems(quota, ['subnet'], [1])
  ),
  getFormItems: async (item) => {
    const net = network || item || {};
    const [projects, pools] = await Promise.all([
      ctx.hasAdminRole ? projectOptions() : Promise.resolve([]),
      neutronApi
        .listSubnetPools()
        .then((r) => r?.subnetpools || [])
        .catch(() => []),
    ]);
    const poolOption = (pool) => ({
      label: `${pool.name} (${(pool.prefixes || []).join(', ')})${
        pool.default_prefixlen ? ` - Default: /${pool.default_prefixlen}` : ''
      }`,
      value: pool.id,
      version: pool.ip_version,
    });
    const sf = subnetFields();
    const poolsFor = (v) => pools.filter((p) => p.ip_version === (v.ip_version === 'ipv6' ? 6 : 4));
    return [
      { name: 'subnet_name', label: t('Subnet Name'), type: 'input', required: true, rules: [nameRule()] },
      ctx.hasAdminRole && {
        name: 'project_id',
        label: t('Project'),
        required: true,
        render: () => <SubnetProjectSelect options={projects} networkProjectId={net.project_id || net.tenant_id} />,
      },
      { ...sf.ipVersion, visible: undefined },
      pools.length > 0 && {
        name: 'subnetpool_id',
        label: t('Subnet Pool'),
        tip: t('Select a subnet pool to allocate CIDR from the pool instead of specifying it manually'),
        render: ({ form }) => <SubnetPoolSelect form={form} pools={pools} poolOption={poolOption} poolsFor={poolsFor} />,
      },
      {
        name: 'prefixlen',
        label: t('Prefix Length'),
        type: 'number',
        min: 0,
        max: 128,
        tip: t('Prefix length for the subnet (e.g., 64 for IPv6 /64, 24 for IPv4 /24)'),
        rules: [
          ({ getFieldValue }) => ({
            validator: (_, value) => {
              const pool = pools.find((p) => p.id === getFieldValue('subnetpool_id'));
              if (!pool || value === undefined || value === null) return Promise.resolve();
              const min = pool.min_prefixlen ?? 0;
              const max = pool.max_prefixlen ?? 128;
              return value >= min && value <= max
                ? Promise.resolve()
                : Promise.reject(new Error(`${t('Prefix Length')}: ${min} - ${max}`));
            },
          }),
        ],
        visible: (v) => Boolean(v.subnetpool_id),
      },
      { ...sf.raMode, visible: (v) => v.ip_version === 'ipv6' },
      { ...sf.addressMode, visible: (v) => v.ip_version === 'ipv6' },
      {
        name: 'cidr',
        label: t('CIDR'),
        type: 'input',
        placeholder: '192.168.0.0/24',
        required: true,
        rules: subnetRules.cidr(),
        tip: cidrTip(),
        visible: (v) => !v.subnetpool_id,
      },
      ...sf.rest,
    ].filter(Boolean);
  },
  onSubmit: async (formValues, item) => {
    const net = network || item || {};
    const values = { ...createSubnetDefaults(ctx.hasAdminRole, ctx.projectId), ...formValues };
    const quota = await fetchNeutronQuota(values.project_id || ctx.projectId);
    if (quota?.subnet && quota.subnet.left === 0) throw new Error(t('Quota exceeded'));
    const { allocation_pools, host_routes, project_id, ...rest } = values;
    return neutronApi.createSubnet(
      buildSubnetBody({
        ...rest,
        project_id: project_id || ctx.projectId,
        network_id: net.id,
        allocation_pools: getAllocationPools(allocation_pools),
        host_routes: getHostRouters(host_routes),
      })
    );
  },
});

function SubnetPoolSelect({ value, onChange, form, poolOption, poolsFor }) {
  const ipVersion = Form.useWatch('ip_version', form);
  const options = poolsFor({ ip_version: ipVersion }).map(poolOption);
  useEffect(() => {
    if (value && !options.some((o) => o.value === value)) {
      onChange(undefined);
      form.setFieldsValue({ prefixlen: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipVersion]);
  return (
    <Select
      value={value}
      allowClear
      placeholder={t('Please select')}
      options={options}
      onChange={(v) => {
        onChange(v);
        if (!v) form.setFieldsValue({ prefixlen: undefined });
      }}
    />
  );
}

const subnetOwnerOrAdminPage = (item, { isAdmin, projectId }) =>
  Boolean(isAdmin) || (item?.tenant_id || item?.project_id) === projectId;

export const editSubnetAction = (ctx) => ({
  id: 'edit-subnet',
  type: 'modal',
  policy: 'update_subnet',
  title: t('Edit Subnet'),
  buttonText: t('Edit'),
  allowed: (item) => subnetOwnerOrAdminPage(item, ctx),
  getDefaultValues: (item) => ({
    subnet_name: item.name,
    cidr: item.cidr,
    enable_dhcp: item.enable_dhcp,
    allocation_pools: getAllocationPoolsIntoLines(item.allocation_pools),
    host_routes: getHostRoutesIntoLines(item.host_routes),
    dns: getDNSIntoLines(item.dns_nameservers),
    disable_gateway: !item.gateway_ip,
    gateway_ip: item.gateway_ip,
    more: false,
  }),
  getFormItems: (item) => {
    const v4 = item?.ip_version !== 6;
    const more = (v) => Boolean(v.more);
    return [
      { name: 'subnet_name', label: t('Subnet Name'), type: 'input', required: true, rules: [sharedNameRule()] },
      {
        name: 'cidr',
        label: t('CIDR'),
        type: 'input',
        disabled: true,
        required: true,
        tip: t(
          'It is recommended that you use the private network address 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16'
        ),
      },
      { name: 'more', label: t('Advanced Options'), type: 'switch' },
      { name: 'disable_gateway', label: t('Disable Gateway'), type: 'switch', visible: more },
      {
        name: 'gateway_ip',
        label: t('Gateway IP'),
        type: 'input',
        required: true,
        tip: t('If no gateway is specified, the first IP address will be defaulted.'),
        rules: [
          {
            validator: (_, value) =>
              !value || (v4 ? isIPv4(value) : isIPv6(value))
                ? Promise.resolve()
                : Promise.reject(new Error(t('Invalid IP address'))),
          },
        ],
        visible: (v) => more(v) && !v.disable_gateway,
      },
      { name: 'enable_dhcp', label: t('DHCP'), type: 'radio', options: dhcpOptions(), visible: more },
      {
        name: 'allocation_pools',
        label: t('Allocation Pools'),
        type: 'textarea',
        rows: 3,
        tip: t('IP address allocation pools, one enter per line (e.g. 192.168.1.2,192.168.1.200)'),
        rules: [{ validator: checkAllocationPools(v4) }],
        visible: more,
      },
      {
        name: 'dns',
        label: t('DNS'),
        type: 'textarea',
        rows: 3,
        tip: t('One entry per line (e.g. 114.114.114.114)'),
        rules: [{ validator: checkDNS(v4) }],
        visible: more,
      },
      {
        name: 'host_routes',
        label: t('Host Routes'),
        type: 'textarea',
        rows: 3,
        tip: t(
          'Additional routes announced to the instance, one entry per line (e.g. 192.168.200.0/24,10.56.1.254)'
        ),
        rules: [{ validator: checkHostRoutes(v4) }],
        visible: more,
      },
    ];
  },
  onSubmit: (formValues, item) => {
    // hidden (advanced) fields keep their initial value like the legacy form
    const values = { ...editSubnetAction(ctx).getDefaultValues(item), ...formValues };
    const { gateway_ip, allocation_pools, host_routes, dns, disable_gateway, subnet_name, enable_dhcp } = values;
    const data = {
      name: subnet_name,
      enable_dhcp,
      dns_nameservers: splitToArray(dns),
      allocation_pools: getAllocationPools(allocation_pools),
      host_routes: getHostRouters(host_routes),
    };
    if (disable_gateway) {
      data.gateway_ip = null;
    } else if (gateway_ip && gateway_ip !== item.gateway_ip) {
      data.gateway_ip = gateway_ip;
    }
    return neutronApi.updateSubnet(item.id, data);
  },
});

export const deleteSubnetAction = (ctx) => ({
  ...deleteAction({
    name: t('Subnet'),
    title: t('Delete Subnet'),
    onDelete: (it) => neutronApi.deleteSubnet(it.id),
    allowed: (item) => subnetOwnerOrAdminPage(item, ctx),
  }),
  policy: 'delete_subnet',
});
