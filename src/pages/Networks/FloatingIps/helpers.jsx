/**
 * Floating IP helpers - port of legacy resources/neutron/floatingip.js, the
 * select-table form items used by Associate / Port Forwarding actions and the
 * "can reach subnet" computation from resources/neutron/router.jsx.
 */
import React, { useMemo, useState } from 'react';
import { Input, Table, Space, Spin, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import apiClient from '@/api/client';
import { serviceBase, hasEndpoint, currentProjectId } from '@/api/endpoints';
import { neutronApi } from '@/api/neutron';
import { t } from '@/core/i18n';
import { isIPv4, listAll } from '@/pages/Network/common';

export const floatingIpStatus = () => ({
  AVAILABLE: t('Available'),
  PENDING: t('Pending'),
  ACTIVE: t('Active'),
  ERROR: t('Error'),
  DOWN: t('Down'),
});

export const resourceType = () => ({
  compute: t('Instance'),
  Octavia: t('Load Balancer'),
  'network:router_gateway': t('Router'),
  database: t('Database Instance'),
});

export const portForwardingProtocols = () => ({
  tcp: t('TCP'),
  udp: t('UDP'),
});

export const qosEnabled = () => hasEndpoint('neutron_qos');

/** Legacy getPortForwardingName */
export const getPortForwardingName = (pf = {}, fip = '') => {
  if (!pf || !Object.keys(pf).length) return '';
  const { protocol, external_port, external_port_range, internal_ip_address, internal_port, internal_port_range } = pf;
  const protocolLabel = portForwardingProtocols()[protocol] || protocol;
  const name = `${external_port || external_port_range} => ${internal_ip_address}:${internal_port || internal_port_range}`;
  return `${protocolLabel}: ${fip ? `${fip}:${name}` : name}`;
};

/** Legacy disableFIPAssociate */
export const hasPortForwardings = (record) => !!(record?.port_forwardings || []).length;

/** Floating IP bound to something (legacy Release.needForceRelease) */
export const isFipAssociated = (it) =>
  !(it?.fixed_ip_address == null && it?.status === 'DOWN' && it?.port_details == null);

/** Legacy enablePFW(): both port-forwarding extensions must be enabled */
let pfwCache = null;
export const fetchPfwEnabled = async () => {
  if (pfwCache !== null) return pfwCache;
  try {
    const res = await neutronApi.listExtensions();
    const aliases = (res?.extensions || []).map((e) => e.alias);
    pfwCache = aliases.includes('floating-ip-port-forwarding') && aliases.includes('expose-port-forwarding-in-fip');
  } catch {
    pfwCache = false;
  }
  return pfwCache;
};

/* ---------------- Octavia (load balancer name for "Associated Resource") ---------------- */
export const getLoadBalancer = async (id) => {
  const res = await apiClient.get(`${serviceBase('octavia')}/lbaas/loadbalancers/${id}`);
  return res?.loadbalancer || {};
};

/* ---------------- Port range validation (legacy utils/validate) ---------------- */
const isValidPort = (s) => {
  if (/^\d+$/.test(s) && (s === '0' || s[0] !== '0')) {
    const p = parseInt(s, 10);
    return p >= 0 && p <= 65535;
  }
  return false;
};
export const isPortRange = (input) => {
  const parts = String(input ?? '').split(':');
  if (parts.length > 2) return false;
  return parts.every(isValidPort);
};
export const portRangeRule = () => ({
  validator: (_, value) => {
    if (value === undefined || value === null || value === '') return Promise.resolve();
    const v = String(value);
    if (isPortRange(v)) {
      const ports = v.split(':');
      if (Number(ports[0]) > Number(ports[1])) {
        return Promise.reject(new Error(`${t('Invalid: ')}${t('The starting number must be less than the ending number')}`));
      }
      return Promise.resolve();
    }
    return Promise.reject(new Error(`${t('Invalid: ')}${t('Enter an integer value between 1 and 65535.')}`));
  },
});

/* ---------------- Reachability (legacy getCanReachSubnetIdsWithRouterId) ---------------- */
export const getCanReachSubnets = async (floatingNetworkId, projectId = currentProjectId()) => {
  const routers = await listAll.routers({ fields: ['id', 'external_gateway_info'], project_id: projectId });
  const filtered = routers.filter(
    (r) => r.external_gateway_info && r.external_gateway_info.network_id === floatingNetworkId
  );
  const ports = await listAll.ports({
    device_owner: [
      'network:router_interface_distributed',
      'network:router_interface',
      'network:ha_router_replicated_interface',
    ],
    fields: ['fixed_ips', 'device_id', 'device_owner'],
  });
  const result = [];
  ports.forEach((port) => {
    const router = filtered.find((r) => r.id === port.device_id);
    if (router) {
      (port.fixed_ips || []).forEach((it) => result.push({ subnet_id: it.subnet_id, router_id: port.device_id }));
    }
  });
  return result;
};

/** Legacy getInterfaceWithReason: interfaces (nova interfaces or neutron ports) -> fixed ip rows */
export const getInterfaceWithReason = async (interfaces = []) => {
  const rows = [];
  (interfaces || []).forEach((i) => {
    const port_id = i.port_id || i.id;
    const mac_address = i.mac_addr || i.mac_address || '';
    const network_id = i.net_id || i.network_id;
    (i.fixed_ips || []).forEach((f) => {
      rows.push({ port_id, fixed_ip_address: f.ip_address, mac_address, subnet_id: f.subnet_id, network_id });
    });
  });
  const netIds = [...new Set(rows.map((r) => r.network_id).filter(Boolean))];
  const [networks, externalNetworks, fips] = await Promise.all([
    Promise.all(netIds.map((id) => neutronApi.getNetwork(id).then((r) => r?.network).catch(() => null))),
    listAll.networks({ 'router:external': true }),
    Promise.all(
      rows.map((r) =>
        isIPv4(r.fixed_ip_address) ? listAll.floatingips({ fixed_ip_address: r.fixed_ip_address }) : Promise.resolve([])
      )
    ),
  ]);
  const netMap = Object.fromEntries(networks.filter(Boolean).map((n) => [n.id, n]));
  return rows.map((r, idx) => {
    const fip = fips[idx]?.[0];
    return {
      ...r,
      network_name: netMap[r.network_id]?.name || r.network_id,
      'router:external': externalNetworks.some((n) => (n.subnets || []).includes(r.subnet_id)),
      floatingIP: (fip && fip.port_id === r.port_id && fip.floating_ip_address) || '',
    };
  });
};

/** Legacy getPortsAndReasons (forOneFIP) */
export const getPortsAndReasons = (interfaces, canReach, forOneFIP = true) =>
  (interfaces || []).map((it) => {
    let available = true;
    let reason = '';
    const name = it.fixed_ip_address;
    if (!isIPv4(name)) {
      reason = t('It is IPv6 type.');
      available = false;
    } else if (it['router:external']) {
      reason = t('Is external network port');
      available = false;
    } else if (it.floatingIP) {
      reason = `${t('Is associate to floating IP: ')} ${it.floatingIP}`;
      available = false;
    } else if ((canReach || []).findIndex((c) => c.subnet_id === it.subnet_id) < 0) {
      reason = forOneFIP ? t('It is unreachable for this floating IP.') : t('It is unreachable for all floating IPs.');
      available = false;
    }
    return { ...it, key: `${it.port_id}-${name}`, name, available, reason };
  });

/* ---------------- SelectTable (legacy select-table form item, single select) ---------------- */
export function SelectTable({
  data = [],
  columns = [],
  rowKey = 'id',
  loading = false,
  value,
  onChange,
  disabledFunc,
  searchKeys = ['name', 'id'],
  pageSize = 5,
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data || [];
    return (data || []).filter((it) =>
      searchKeys.some((k) => {
        const v = typeof k === 'function' ? k(it) : it[k];
        return v !== undefined && v !== null && String(v).toLowerCase().includes(s);
      })
    );
  }, [data, q, searchKeys]);
  const getKey = (r) => (typeof rowKey === 'function' ? rowKey(r) : r[rowKey]);
  const selectedKey = value ? getKey(value) : undefined;
  return (
    <div>
      <Input
        allowClear
        size="small"
        prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
        placeholder={t('Search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: 240, marginBottom: 8 }}
      />
      <Spin spinning={loading}>
        <Table
          size="small"
          rowKey={getKey}
          columns={columns}
          dataSource={list}
          pagination={{ pageSize, size: 'small', hideOnSinglePage: true }}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selectedKey !== undefined ? [selectedKey] : [],
            getCheckboxProps: (r) => ({ disabled: disabledFunc ? !!disabledFunc(r) : false }),
            onChange: (_keys, rows) => onChange?.(rows[0] || null),
          }}
          onRow={(r) => ({
            onClick: () => {
              if (disabledFunc && disabledFunc(r)) return;
              onChange?.(r);
            },
          })}
        />
      </Spin>
    </div>
  );
}

export const fixedIpColumns = (withMac = true, withNetwork = true, withSubnet = false) =>
  [
    { title: t('IP Address'), dataIndex: 'name', key: 'name' },
    withMac && { title: t('MAC Address'), dataIndex: 'mac_address', key: 'mac_address' },
    withNetwork && { title: t('Network'), dataIndex: 'network_name', key: 'network_name' },
    withSubnet && { title: t('Subnet ID'), dataIndex: 'subnet_id', key: 'subnet_id' },
    {
      title: t('Reason'),
      dataIndex: 'reason',
      key: 'reason',
      render: (v) => (v ? <span style={{ color: '#ef4444' }}>{v}</span> : '-'),
    },
  ].filter(Boolean);

export const portSelectColumns = () => [
  {
    title: t('ID/Name'),
    dataIndex: 'name',
    key: 'name',
    render: (v, r) => (
      <div>
        <div>{v || '-'}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.id}</div>
      </div>
    ),
  },
  { title: t('Description'), dataIndex: 'description', key: 'description', render: (v) => v || '-' },
  {
    title: t('Fixed IPs'),
    dataIndex: 'fixed_ips',
    key: 'fixed_ips',
    render: (v) => (v || []).map((d) => <div key={d.ip_address}>{d.ip_address}</div>),
  },
  { title: t('Created At'), dataIndex: 'created_at', key: 'created_at', render: (v) => v || '-' },
];

export const TagList = ({ items }) =>
  items?.length ? (
    <Space size={[4, 4]} wrap>
      {items.map((i) => (
        <Tag key={i}>{i}</Tag>
      ))}
    </Space>
  ) : (
    '-'
  );
