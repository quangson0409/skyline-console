/**
 * Firewall (FWaaS v2) helpers - port of legacy resources/neutron/firewall*.js,
 * stores/neutron/firewall*.js and the Firewall / Policy / Rule actions.
 */
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Table, Tabs, Input, Checkbox, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { neutronApi } from '@/api/neutron';
import { t } from '@/core/i18n';
import { yesNo } from '@/components/ResourcePage';
import { adminSuffix, detailPath, networkLink, routerLink, instanceLink } from '../common';

/* ------------------------------------------------------------------ */
/* constants (resources/neutron/firewall*.js)                          */
/* ------------------------------------------------------------------ */
export const firewallStatus = () => ({
  ACTIVE: t('Active'),
  DOWN: t('Down'),
  ERROR: t('Error'),
  CREATED: t('Created'),
  PENDING_CREATE: t('Pending Create'),
  PENDING_UPDATE: t('Pending Update'),
  PENDING_DELETE: t('Pending Delete'),
  INACTIVE: t('Inactive'),
});

export const adminState = () => ({ true: t('Up'), false: t('Down') });

export const portStatus = () => ({
  ACTIVE: t('Active'),
  BUILD: t('Build'),
  DOWN: t('Down'),
  ERROR: t('Error'),
});

export const actionInfos = () => ({ allow: t('ALLOW'), deny: t('DENY'), reject: t('REJECT') });
export const protocolInfos = () => ({ tcp: t('TCP'), udp: t('UDP'), icmp: t('ICMP'), any: t('ANY') });

export const routerInterfaceOwners = [
  'network:router_interface',
  'network:ha_router_replicated_interface',
  'network:router_interface_distributed',
];

export const mapOptions = (map) => Object.entries(map).map(([key, label]) => ({ key, value: key, label }));
export const yesNoOptions = () => [
  { key: 'true', value: 'true', label: t('Yes') },
  { key: 'false', value: 'false', label: t('No') },
];

/**
 * Legacy getDefaultFilter("Hide Default ..."): Yes hides default resources, No shows all.
 * BaseTable filters with String(item[name]).includes(value), so the record carries
 * a string matching both "true"/"false" (non default) or only "false" (default).
 */
export const defaultFilter = (label) => ({ label, name: 'notDefault', options: yesNoOptions() });
const notDefaultValue = (isDef) => (isDef ? 'false' : 'true|false');

export const isDefaultFirewall = (item) => item?.name === 'default';
export const isDefaultPolicy = (item) => item?.name === 'default egress' || item?.name === 'default ingress';
export const isDefaultRule = (item) =>
  ['default egress ipv4', 'default egress ipv6', 'default ingress ipv4', 'default ingress ipv6'].includes(item?.name);

export const getProjectId = (item) => item?.project_id || item?.tenant_id;
export const isMine = (item, projectId) => !!item && getProjectId(item) === projectId;

/** legacy stores/base itemInCurrentProject (listFilterByProject neutron resources) */
const inCurrentProject = (item, projectId) =>
  getProjectId(item) === projectId || item.is_public || item.shared || item.visibility === 'public';

const safeList = async (promise, key) => {
  try {
    const res = await promise;
    return Array.isArray(res?.[key]) ? res[key] : [];
  } catch {
    return [];
  }
};

/* ------------------------------------------------------------------ */
/* fetchers (stores/neutron/firewall*.js)                              */
/* ------------------------------------------------------------------ */
export const firewallPath = (isAdmin) => `/network/firewall${adminSuffix(isAdmin)}`;
export const firewallTabPath = (isAdmin, tab) => `${firewallPath(isAdmin)}${tab ? `?tab=${tab}` : ''}`;

export async function fetchFirewalls({ isAdmin, projectId } = {}) {
  const res = await neutronApi.listFirewalls();
  let items = (res?.firewall_groups || []).filter(Boolean);
  if (!isAdmin) items = items.filter((it) => inCurrentProject(it, projectId));
  items = items.map((it) => ({
    ...it,
    name: it.name || it.id,
    ports: Array.isArray(it.ports) ? it.ports : [],
    notDefault: notDefaultValue(isDefaultFirewall(it)),
  }));
  if (!items.length) return items;
  const policies = await safeList(neutronApi.listFirewallPolicies(), 'firewall_policies');
  return items.map((it) => {
    const egressPolicy = policies.find((p) => p.id === it.egress_firewall_policy_id);
    const ingressPolicy = policies.find((p) => p.id === it.ingress_firewall_policy_id);
    return {
      ...it,
      egressPolicy,
      egressPolicyName: egressPolicy ? egressPolicy.name : '-',
      ingressPolicy,
      ingressPolicyName: ingressPolicy ? ingressPolicy.name : '-',
    };
  });
}

export async function fetchFirewallDetail(id) {
  const item = (await neutronApi.getFirewall(id))?.firewall_group;
  if (!item) return item;
  const detail = { ...item, ports: Array.isArray(item.ports) ? item.ports : [] };
  const loadPolicy = async (pid) => {
    try {
      return (await neutronApi.getFirewallPolicy(pid))?.firewall_policy;
    } catch {
      return undefined;
    }
  };
  if (detail.ingress_firewall_policy_id) detail.ingress = await loadPolicy(detail.ingress_firewall_policy_id);
  if (detail.egress_firewall_policy_id) detail.egress = await loadPolicy(detail.egress_firewall_policy_id);
  return detail;
}

const mapRule = (it) => ({
  ...it,
  protocol: it.protocol || 'any',
  notDefault: notDefaultValue(isDefaultRule(it)),
});

/** policy listDidFetch / detailDidFetch: attaches rules[] and firewalls[] */
const enrichPolicies = async (items) => {
  if (!items.length) return items;
  const needRules = items.some((it) => (it.firewall_rules || []).length);
  const [allRules, allFirewalls] = await Promise.all([
    needRules ? safeList(neutronApi.listFirewallRules(), 'firewall_rules') : Promise.resolve([]),
    safeList(neutronApi.listFirewalls(), 'firewall_groups'),
  ]);
  const rules = allRules.map(mapRule);
  return items.map((it) => ({
    ...it,
    rules: (it.firewall_rules || []).map((rid) => rules.find((r) => r.id === rid)).filter(Boolean),
    firewalls: allFirewalls.filter(
      (fw) => fw.egress_firewall_policy_id === it.id || fw.ingress_firewall_policy_id === it.id
    ),
  }));
};

const mapPolicy = (it) => ({
  ...it,
  firewall_rules: Array.isArray(it.firewall_rules) ? it.firewall_rules : [],
  notDefault: notDefaultValue(isDefaultPolicy(it)),
});

export async function fetchPolicies({ isAdmin, projectId } = {}) {
  const res = await neutronApi.listFirewallPolicies();
  let items = (res?.firewall_policies || []).filter(Boolean);
  if (!isAdmin) items = items.filter((it) => inCurrentProject(it, projectId));
  return enrichPolicies(items.map(mapPolicy));
}

export async function fetchPolicyDetail(id) {
  const item = (await neutronApi.getFirewallPolicy(id))?.firewall_policy;
  if (!item) return item;
  const [detail] = await enrichPolicies([mapPolicy(item)]);
  return detail;
}

const enrichRules = async (items) => {
  if (!items.length) return items;
  const policies = await safeList(neutronApi.listFirewallPolicies(), 'firewall_policies');
  return items.map((it) => ({
    ...it,
    policies: policies.filter((p) => (p.firewall_rules || []).includes(it.id)),
  }));
};

export async function fetchRules({ isAdmin, projectId } = {}) {
  const res = await neutronApi.listFirewallRules();
  let items = (res?.firewall_rules || []).filter(Boolean);
  if (!isAdmin) items = items.filter((it) => inCurrentProject(it, projectId));
  return enrichRules(items.map(mapRule));
}

/** legacy FirewallRuleStore.fetchListByPolicy: rules of a policy, in policy order */
export async function fetchRulesByPolicy(firewallRules = []) {
  if (!firewallRules?.length) return [];
  const all = await safeList(neutronApi.listFirewallRules(), 'firewall_rules');
  const items = firewallRules.map((rid) => all.find((r) => r.id === rid)).filter(Boolean);
  return enrichRules(items.map(mapRule));
}

export async function fetchRuleDetail(id) {
  const item = (await neutronApi.getFirewallRule(id))?.firewall_rule;
  if (!item) return item;
  const [detail] = await enrichRules([mapRule(item)]);
  return detail;
}

/** legacy PortStore.fetchListByFirewall */
export async function fetchFirewallPorts(ports = []) {
  if (!ports?.length) return [];
  const all = await safeList(neutronApi.skylineExtension('ports', { device_owner: routerInterfaceOwners }), 'ports');
  const data = all.filter((it) => ports.includes(it.id));
  if (!data.length) return data;
  const [networks, routers] = await Promise.all([
    safeList(neutronApi.listNetworks(), 'networks'),
    safeList(neutronApi.listRouters(), 'routers'),
  ]);
  return data.map((it) => {
    const router = routers.find((r) => r.id === it.device_id);
    const network = networks.find((n) => n.id === it.network_id);
    return {
      ...it,
      router,
      network,
      network_name: network?.name || '',
      router_name: router?.name || '',
    };
  });
}

/** Router interface ports usable by a firewall (legacy Create/ManagePort `ports` getter) */
export async function fetchRouterPorts() {
  const [routers, networks, subnets, ports] = await Promise.all([
    safeList(neutronApi.listRouters(), 'routers'),
    safeList(neutronApi.listNetworks(), 'networks'),
    safeList(neutronApi.listSubnets(), 'subnets'),
    safeList(neutronApi.listPorts(), 'ports'),
  ]);
  const result = [];
  routers.forEach((router) => {
    ports
      .filter((p) => p.device_id === router.id && routerInterfaceOwners.includes(p.device_owner))
      .forEach((port) => {
        const network = networks.find((n) => n.id === port.network_id);
        const fixed = (port.fixed_ips || [])[0] || {};
        const subnet = subnets.find((s) => s.id === fixed.subnet_id);
        result.push({
          ...port,
          device_name: router.name,
          owner: t('Router'),
          network,
          router,
          network_name: network ? network.name : '-',
          name: port.id,
          ip_address: fixed.ip_address,
          subnet,
          subnet_name: (subnet && subnet.name) || '-',
        });
      });
  });
  return result;
}

export async function fetchInstancePorts(projectId) {
  const ports = await safeList(neutronApi.listPorts({ device_owner: 'compute:nova', project_id: projectId }), 'ports');
  return ports.map((it) => ({ ...it, name: it.name || it.id }));
}

/* ------------------------------------------------------------------ */
/* quota (resources/neutron/network fetchNeutronQuota)                 */
/* ------------------------------------------------------------------ */
export async function fetchNeutronQuotaItem(projectId, key) {
  try {
    const res = await neutronApi.getQuota(projectId);
    const q = res?.quota?.[key];
    if (!q || typeof q !== 'object') return null;
    return { limit: q.limit, used: (q.used || 0) + (q.reserved || 0) };
  } catch {
    return null;
  }
}

export const quotaExceeded = (q, wish = 1) =>
  !!q && q.limit !== undefined && q.limit !== -1 && q.used + wish > q.limit;

/* ------------------------------------------------------------------ */
/* custom form controls                                                */
/* ------------------------------------------------------------------ */

/** legacy check-group: value is an object { key: bool } */
export function CheckGroup({ value = {}, onChange, options = [] }) {
  const checked = Object.keys(value || {}).filter((k) => value[k]);
  return (
    <Checkbox.Group
      value={checked}
      onChange={(list) => {
        const next = {};
        options.forEach((o) => {
          if (o.disabled) next[o.value] = !!(value || {})[o.value];
          else next[o.value] = list.includes(o.value);
        });
        onChange?.(next);
      }}
      options={options}
    />
  );
}

const matchSearch = (record, q) => {
  if (!q) return true;
  const s = q.toLowerCase();
  return ['name', 'id', 'network_name', 'device_name', 'ip_address', 'network_id', 'status', 'description']
    .some((k) => record[k] !== undefined && record[k] !== null && String(record[k]).toLowerCase().includes(s));
};

/** legacy select-table: value { selectedRowKeys, selectedRows } */
export function SelectTable({ value, onChange, data = [], columns = [], isMulti = false, loading = false, rowKey = 'id' }) {
  const [q, setQ] = useState('');
  const keys = value?.selectedRowKeys || [];
  const list = useMemo(() => (data || []).filter((it) => matchSearch(it, q)), [data, q]);
  return (
    <div>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder={t('Search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 8, maxWidth: 320 }}
      />
      <Table
        size="small"
        rowKey={rowKey}
        loading={loading}
        columns={columns}
        dataSource={list}
        pagination={{ pageSize: 5, size: 'small' }}
        scroll={{ x: 'max-content' }}
        rowSelection={{
          type: isMulti ? 'checkbox' : 'radio',
          selectedRowKeys: keys,
          preserveSelectedRowKeys: true,
          onChange: (selectedRowKeys, selectedRows) => onChange?.({ selectedRowKeys, selectedRows }),
        }}
      />
    </div>
  );
}

/** legacy tab-select-table: one selection shared by several tables */
export function TabSelectTable({ value, onChange, tabs = [] }) {
  const keys = value?.selectedRowKeys || [];
  const rows = value?.selectedRows || [];
  return (
    <Tabs
      size="small"
      items={tabs.map((tab) => {
        const tabKeys = new Set((tab.data || []).map((it) => it.id));
        return {
          key: tab.key,
          label: tab.title,
          children: (
            <SelectTable
              data={tab.data}
              columns={tab.columns}
              loading={tab.loading}
              isMulti
              value={{ selectedRowKeys: keys.filter((k) => tabKeys.has(k)) }}
              onChange={({ selectedRowKeys, selectedRows }) => {
                const otherKeys = keys.filter((k) => !tabKeys.has(k));
                const otherRows = rows.filter((r) => !tabKeys.has(r.id));
                onChange?.({
                  selectedRowKeys: [...otherKeys, ...selectedRowKeys],
                  selectedRows: [...otherRows, ...selectedRows],
                });
              }}
            />
          ),
        };
      })}
    />
  );
}

export const selectRequiredRule = (label) => ({
  required: true,
  validator: (_, v) =>
    v?.selectedRowKeys?.length ? Promise.resolve() : Promise.reject(new Error(`${t('Please select')} ${label}`)),
});

/* ------------------------------------------------------------------ */
/* selection table columns                                             */
/* ------------------------------------------------------------------ */
const dash = (v) => (v === undefined || v === null || v === '' ? '-' : String(v));
const mapText = (map) => (v) => map[v] || dash(v);

export const policyTableColumns = () => [
  { title: t('Name'), dataIndex: 'name', render: dash },
  { title: t('Description'), dataIndex: 'description', render: dash },
  {
    title: t('Rules'),
    dataIndex: 'rules',
    render: (value) =>
      !value?.length ? '-' : value.map((item) => <div key={item.id}>{item.name || item.id}</div>),
  },
  { title: t('Shared Rule'), dataIndex: 'shared', render: yesNo },
  { title: t('Audited'), dataIndex: 'audited', render: yesNo },
];

export const ruleTableColumns = () => [
  { title: t('Rule Name'), dataIndex: 'name', render: (v, r) => v || r.id },
  { title: t('Description'), dataIndex: 'description', render: dash },
  { title: t('Protocol'), dataIndex: 'protocol', render: mapText(protocolInfos()) },
  { title: t('Source IP'), dataIndex: 'source_ip_address', render: dash },
  { title: t('Source Port'), dataIndex: 'source_port', render: dash },
  { title: t('Destination IP'), dataIndex: 'destination_ip_address', render: dash },
  { title: t('Destination Port'), dataIndex: 'destination_port', render: dash },
  { title: t('Rule Action'), dataIndex: 'action', render: mapText(actionInfos()) },
  { title: t('Enabled'), dataIndex: 'enabled', render: yesNo },
  { title: t('Shared Rule'), dataIndex: 'shared', render: yesNo },
];

export const routerPortTableColumns = () => [
  { title: t('Port'), dataIndex: 'id' },
  { title: t('Network'), dataIndex: 'network_name', render: dash },
  { title: t('Subnet'), dataIndex: 'subnet_name', render: dash },
  { title: t('IP Address'), dataIndex: 'ip_address', render: dash },
  { title: t('Owner'), dataIndex: 'owner', render: dash },
  { title: t('Device'), dataIndex: 'device_name', render: dash },
  { title: t('Status'), dataIndex: 'status', render: mapText(portStatus()) },
];

export const instancePortTableColumns = () => [
  { title: t('Port'), dataIndex: 'id' },
  {
    title: t('Bind Resource'),
    dataIndex: 'server_name',
    render: (serverName, item) => {
      const { device_id: deviceId, device_owner: deviceOwner } = item;
      if (deviceId && deviceOwner === 'compute:nova') {
        const text = serverName ? `${deviceId} (${serverName})` : deviceId;
        return (
          <>
            {deviceOwner}
            <br />
            <Link to={`/compute/instance/detail/${deviceId}?tab=interface`}>{text}</Link>
          </>
        );
      }
      return (
        <>
          {deviceOwner}
          {deviceOwner && <br />}
          {deviceId || '-'}
        </>
      );
    },
  },
  { title: t('Network'), dataIndex: 'network_id', render: (v) => networkLink(v, v, false) },
  { title: t('MAC Address'), dataIndex: 'mac_address', render: dash },
  { title: t('Status'), dataIndex: 'status', render: mapText(portStatus()) },
];

/* ------------------------------------------------------------------ */
/* links                                                               */
/* ------------------------------------------------------------------ */
export const firewallLink = (id, name, isAdmin) =>
  id ? <Link to={detailPath('firewall', id, isAdmin)}>{name || id}</Link> : '-';
export const policyLink = (id, name, isAdmin) =>
  id ? <Link to={detailPath('firewall-policy', id, isAdmin)}>{name || id}</Link> : '-';
export const ruleLink = (id, name, isAdmin) =>
  id ? <Link to={detailPath('firewall-rule', id, isAdmin)}>{name || id}</Link> : '-';
export const linkList = (list, linkFn, isAdmin) =>
  !list?.length ? '-' : (
    <Space direction="vertical" size={0}>
      {list.map((it) => (
        <div key={it.id}>{linkFn(it.id, it.name, isAdmin)}</div>
      ))}
    </Space>
  );

export { networkLink, routerLink, instanceLink };
