/**
 * Select-table form fields used by the instance action modals
 * (port of the legacy select-table / volume-select-table / network-select-table form items).
 * Every component is a controlled antd form control: value = { selectedRowKeys, selectedRows }.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Form, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { neutronApi } from '@/api/neutron';
import { novaApi } from '@/api/nova';
import { cinderApi } from '@/api/cinder';
import { glanceApi } from '@/api/glance';
import { currentProjectId } from '@/api/endpoints';
import { IdNameCell, formatSize } from '@/components/ResourcePage/helpers';
import { t } from '@/core/i18n';
import SelectTable, { col, mapCol, unitCol, timeCol } from '@/pages/Instances/Create/components/SelectTable';
import { getImageColumns } from '@/pages/Instances/Create/steps/BaseStep';
import {
  canImageCreateInstance,
  getImageOS,
  getImageSystemTabs,
  imageFormats,
  imageOS,
  imageStatus,
  isSnapshot,
} from '@/pages/Instances/Create/utils';
import { fetchHypervisors, cpuRender, memoryRender } from '@/pages/Compute/Hypervisors/HypervisorList';
import { getInterfaceWithReason, getPortsAndReasons } from '@/pages/Networks/FloatingIps/helpers';
import { isIPv4, isIPv6, listAll } from '@/pages/Network/common';
import { portStatus } from '@/pages/Network/Port/helpers';
import { volumeStatus } from '@/pages/Storage/Volumes/volumeShared';

/** antd rule: a select-table value must contain at least one selected row */
export const selectTableRule = (label) => ({
  required: true,
  validator: (_, value) =>
    value?.selectedRowKeys?.length
      ? Promise.resolve()
      : Promise.reject(new Error(t('Please select {label}!', { label }))),
});

const ipList = (value) =>
  Array.isArray(value) && value.length ? value.map((it) => <div key={it}>{it}</div>) : '-';

const useAsync = (loader, deps = []) => {
  const [state, setState] = useState({ data: [], loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve()
      .then(loader)
      .then((data) => alive && setState({ data: data || [], loading: false }))
      .catch(() => alive && setState({ data: [], loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
};

/* ------------------------------------------------------------------ */
/* Attach Interface: subnet table of the selected network              */
/* ------------------------------------------------------------------ */
export function SubnetSelect({ form, value, onChange, onSubnet }) {
  const network = Form.useWatch('network', form);
  const networkId = network?.selectedRowKeys?.[0];
  const { data, loading } = useAsync(
    () => (networkId ? neutronApi.listSubnets({ network_id: networkId }).then((r) => r?.subnets || []) : []),
    [networkId]
  );
  useEffect(() => {
    // a subnet of another network is no longer valid
    if (value?.selectedRows?.[0] && value.selectedRows[0].network_id !== networkId) onChange?.(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkId]);
  return (
    <SelectTable
      value={value}
      onChange={(v) => {
        onChange?.(v);
        onSubnet?.(v?.selectedRows?.[0]);
      }}
      data={data}
      isLoading={loading}
      filterParams={[{ label: t('Name'), name: 'name' }]}
      columns={[
        col(t('Name'), 'name', { render: (v, r) => v || r.id }),
        col(t('CIDR'), 'cidr'),
        col(t('Allocation Pools'), 'allocation_pools', {
          render: (v) => (v && v.length ? `${v[0].start} -- ${v[0].end}` : '-'),
        }),
      ]}
      selectedLabel={t('Subnet')}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Detach Interface: nova interface attachments                        */
/* ------------------------------------------------------------------ */
export function InterfaceSelect({ value, onChange, interfaces = [] }) {
  const data = useMemo(
    () =>
      interfaces.map((it) => ({
        ...it,
        id: it.port_id,
        name: (it.fixed_ips || []).map((f) => f.ip_address).join(','),
      })),
    [interfaces]
  );
  return (
    <SelectTable
      value={value}
      onChange={onChange}
      data={data}
      isMulti
      filterParams={[{ label: t('IP Address'), name: 'name' }]}
      columns={[
        col(t('IP Address'), 'fixed_ips', {
          render: (v) => (v || []).map((f) => <div key={f.ip_address}>{f.ip_address}</div>),
        }),
        mapCol(t('State'), 'port_state', portStatus()),
        col(t('MAC Address'), 'mac_addr'),
      ]}
      selectedLabel={t('Network Interface')}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Attach Volume: legacy VolumeSelectTable (Available / Shared tabs)   */
/* ------------------------------------------------------------------ */
const volumeSelectColumns = (tab) =>
  [
    col(t('ID/Name'), 'name', { render: (v, r) => <IdNameCell id={r.id} name={v || r.id} bold={false} /> }),
    unitCol(t('Size'), 'size', 'GiB'),
    tab === 'shared' ? mapCol(t('Status'), 'status', volumeStatus()) : null,
    col(t('Type'), 'volume_type'),
    tab === 'available' ? col(t('Shared'), 'multiattach', { render: (v) => (v ? t('Yes') : t('No')) }) : null,
    tab === 'shared'
      ? col(t('Attached To'), 'attachments', {
          render: (v) => (v && v.length ? v.map((a) => <div key={a.attachment_id || a.server_id}>{a.server_name || a.server_id}</div>) : '-'),
        })
      : null,
    timeCol(t('Created At'), 'created_at'),
  ].filter(Boolean);

export function VolumeSelect({ value, onChange, serverId }) {
  const [tab, setTab] = useState('available');
  const { data, loading } = useAsync(
    () =>
      cinderApi
        .listVolumes(tab === 'available' ? { status: 'available' } : { multiattach: true })
        .then((r) => (r?.volumes || []).filter((v) => (tab === 'shared' ? v.multiattach : v.status === 'available'))),
    [tab]
  );
  const disabledFunc =
    tab === 'available'
      ? (record) => record?.volume_image_metadata?.disk_format === 'iso'
      : (record) => (record.attachments || []).some((a) => a.server_id === serverId);
  return (
    <SelectTable
      value={value}
      onChange={onChange}
      data={data}
      isLoading={loading}
      tabs={[
        { label: t('Available'), value: 'available' },
        { label: t('Shared'), value: 'shared' },
      ]}
      tabValue={tab}
      onTabChange={setTab}
      filterParams={[{ label: t('Name'), name: 'name' }]}
      columns={volumeSelectColumns(tab)}
      disabledFunc={disabledFunc}
      selectedLabel={t('Volume')}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Detach Volume: volumes attached to the server (no OS disk)          */
/* ------------------------------------------------------------------ */
export function AttachedVolumeSelect({ value, onChange, volumes = [] }) {
  return (
    <SelectTable
      value={value}
      onChange={onChange}
      data={volumes}
      isMulti
      filterParams={[{ label: t('Name'), name: 'name' }]}
      columns={[
        col(t('Name'), 'name', { render: (v, r) => v || r.id }),
        unitCol(t('Size'), 'size', 'GiB'),
        mapCol(t('Status'), 'status', volumeStatus()),
        col(t('Type'), 'volume_type'),
        timeCol(t('Created At'), 'created_at'),
      ]}
      selectedLabel={t('Volume')}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Associate Floating IP (legacy getFixedIPFormItemForAssociate /      */
/* getFIPFormItemForAssociate + handleFixedIPChange)                   */
/* ------------------------------------------------------------------ */
const ROUTER_INTERFACE_OWNERS = [
  'network:router_interface_distributed',
  'network:router_interface',
  'network:ha_router_replicated_interface',
];

/** legacy getCanReachSubnetIdsWithRouterId: subnets attached to a router with an external gateway */
export const loadReachability = async (projectId = currentProjectId()) => {
  const [routers, ports] = await Promise.all([
    listAll.routers({ fields: ['id', 'external_gateway_info'], project_id: projectId }),
    listAll.ports({ device_owner: ROUTER_INTERFACE_OWNERS, fields: ['fixed_ips', 'device_id', 'device_owner'] }),
  ]);
  const canReach = [];
  ports.forEach((port) => {
    const router = routers.find((r) => r.id === port.device_id && r.external_gateway_info);
    if (router) (port.fixed_ips || []).forEach((f) => canReach.push({ subnet_id: f.subnet_id, router_id: port.device_id }));
  });
  return { routers, canReach };
};

/** Fixed IP rows of the instance interfaces with the reason they cannot get a floating IP */
export const loadFixedIpRows = async (serverId) => {
  const [ifaceRes, reach] = await Promise.all([
    novaApi.listServerInterfacesV(serverId).catch(() => ({})),
    loadReachability(),
  ]);
  const withReason = await getInterfaceWithReason(ifaceRes?.interfaceAttachments || []);
  return { rows: getPortsAndReasons(withReason, reach.canReach, false), reach };
};

/** legacy getFipsFromRouterId for every router reachable from the subnet */
export const loadFipsForSubnet = async (subnetId, reach, projectId = currentProjectId()) => {
  const routerIds = reach.canReach.filter((c) => c.subnet_id === subnetId).map((c) => c.router_id);
  const netIds = [
    ...new Set(
      routerIds.map((rid) => reach.routers.find((r) => r.id === rid)?.external_gateway_info?.network_id).filter(Boolean)
    ),
  ];
  const lists = await Promise.all(
    netIds.map(async (nid) => {
      const [fips, net] = await Promise.all([
        listAll.floatingips({ floating_network_id: nid, status: 'DOWN', project_id: projectId }),
        neutronApi
          .getNetwork(nid)
          .then((r) => r?.network)
          .catch(() => null),
      ]);
      return fips
        .filter((fip) => !fip.fixed_ip_address && !fip.port_details)
        .map((fip) => ({ ...fip, name: fip.floating_ip_address, network_name: net?.name || nid }));
    })
  );
  const map = {};
  lists.flat().forEach((fip) => {
    map[fip.id] = fip;
  });
  return Object.values(map);
};

export function FixedIpSelect({ value, onChange, rows = [], loading = false }) {
  return (
    <SelectTable
      value={value}
      onChange={onChange}
      data={rows}
      rowKey="key"
      isLoading={loading}
      filterParams={[{ label: t('IP Address'), name: 'name' }]}
      disabledFunc={(r) => !r.available}
      columns={[
        col(t('IP Address'), 'name'),
        col(t('MAC Address'), 'mac_address'),
        col(t('Network'), 'network_name'),
        col(t('Subnet ID'), 'subnet_id'),
        col(t('Reason'), 'reason', { render: (v) => (v ? <span style={{ color: '#ef4444' }}>{v}</span> : '-') }),
      ]}
      selectedLabel={t('Instance IP')}
    />
  );
}

export function FipSelect({ form, value, onChange, reach }) {
  const fixed = Form.useWatch('fixed_ip', form);
  const row = fixed?.selectedRows?.[0];
  const subnetId = row?.subnet_id;
  const { data, loading } = useAsync(() => (subnetId && reach ? loadFipsForSubnet(subnetId, reach) : []), [subnetId, reach]);
  useEffect(() => {
    onChange?.(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subnetId]);
  return (
    <SelectTable
      value={value}
      onChange={onChange}
      data={data}
      isLoading={Boolean(subnetId) && loading}
      filterParams={[{ label: t('Floating IP'), name: 'name' }]}
      disabledFunc={(r) => (r.port_forwardings || []).length > 0}
      columns={[col(t('Floating IP'), 'name'), col(t('Network'), 'network_name'), timeCol(t('Created At'), 'created_at')]}
      selectedLabel={t('Floating IP')}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Manage Security Group (port level)                                  */
/* ------------------------------------------------------------------ */
export const loadServerPorts = async (serverId) => {
  const [ports, networks] = await Promise.all([listAll.ports({ device_id: serverId }), listAll.networks()]);
  const netMap = Object.fromEntries(networks.map((n) => [n.id, n.name]));
  return ports.map((p) => {
    const ips = (p.fixed_ips || []).map((f) => f.ip_address);
    return {
      ...p,
      network_name: netMap[p.network_id] || p.network_id,
      ipv4: ips.filter((ip) => isIPv4(ip)),
      ipv6: ips.filter((ip) => isIPv6(ip)),
      security_groups: p.security_groups || [],
    };
  });
};

export function PortSelect({ value, onChange, ports = [] }) {
  return (
    <SelectTable
      value={value}
      onChange={onChange}
      data={ports}
      disabledFunc={(r) => !r.port_security_enabled}
      filterParams={[{ label: t('Network'), name: 'network_name' }]}
      columns={[
        col(t('ID'), 'id'),
        col(t('Network'), 'network_name'),
        col(t('IPv4'), 'ipv4', { render: ipList }),
        col(t('IPv6'), 'ipv6', { render: ipList }),
        col(t('MAC Address'), 'mac_address'),
        mapCol(t('Status'), 'status', portStatus()),
      ]}
      tagKey="id"
      secondTagKey="network_name"
      selectedLabel={t('Port')}
    />
  );
}

export function SecurityGroupSelect({ form, value, onChange }) {
  const port = Form.useWatch('port', form);
  const portRow = port?.selectedRows?.[0];
  const { data, loading } = useAsync(
    () => listAll.securityGroups({ project_id: currentProjectId() }),
    []
  );
  // legacy onPortChange: the port's current security groups become the selection
  useEffect(() => {
    if (!portRow) return;
    const keys = portRow.security_groups || [];
    onChange?.({ selectedRowKeys: keys, selectedRows: data.filter((sg) => keys.includes(sg.id)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portRow?.id, data]);
  return (
    <SelectTable
      value={value}
      onChange={onChange}
      data={data}
      isLoading={loading}
      isMulti
      filterParams={[{ label: t('Name'), name: 'name' }]}
      columns={[
        col(t('ID/Name'), 'name', { render: (v, r) => <IdNameCell id={r.id} name={v} bold={false} /> }),
        col(t('Description'), 'description', { render: (v) => v || '-' }),
      ]}
      selectedLabel={t('Security Group')}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Migrate / Live Migrate: target compute host                         */
/* ------------------------------------------------------------------ */
export function HostSelect({ value, onChange, currentHost }) {
  const { data, loading } = useAsync(
    () =>
      fetchHypervisors().then((list) =>
        list.filter((it) => it.hypervisor_type !== 'ironic').map((it) => ({ ...it, key: it.id }))
      ),
    []
  );
  return (
    <SelectTable
      value={value}
      onChange={onChange}
      data={data}
      isLoading={loading}
      filterParams={[
        { label: t('Hostname'), name: 'service_host' },
        { label: t('Type'), name: 'hypervisor_type' },
      ]}
      disabledFunc={(r) => r.service_host === currentHost || r.status !== 'enabled'}
      columns={[
        col(t('Hostname'), 'service_host'),
        col(t('Type'), 'hypervisor_type'),
        col(t('CPU (Core)'), 'vcpus_used_percent', { render: cpuRender }),
        col(t('Configured Memory (GiB)'), 'memory_mb_percent', { render: memoryRender }),
        col(t('Instances'), 'running_vms'),
      ]}
      tagKey="service_host"
      secondTagKey="hypervisor_type"
      selectedLabel={t('Target Compute Host')}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Rebuild: image with OS tabs / instance snapshot                     */
/* ------------------------------------------------------------------ */
export const loadRebuildSources = async ({ hasAdminRole, projectId }) => {
  const res = await glanceApi.listAllImages({}).catch(() => ({}));
  const all = res?.images || [];
  const images = all
    .filter((it) => canImageCreateInstance(it))
    .map((it) => ({
      ...it,
      key: it.id,
      os_distro: imageOS()[it.os_distro] ? it.os_distro : 'others',
      project_id: it.owner,
      project_name: it.owner_project_name || it.owner,
    }));
  const snapshots = all.filter((it) => isSnapshot(it) && (hasAdminRole || !projectId || it.owner === projectId));
  return { images, snapshots };
};

export function ImageSelect({ value, onChange, images = [], hasAdminRole, projectId }) {
  const tabs = getImageSystemTabs();
  const [tab, setTab] = useState(tabs[0]?.value);
  const data = useMemo(() => images.filter((it) => !tab || getImageOS(it) === tab), [images, tab]);
  return (
    <SelectTable
      value={value}
      onChange={onChange}
      data={data}
      tabs={tabs}
      tabValue={tab}
      onTabChange={setTab}
      filterParams={[{ label: t('Name'), name: 'name' }]}
      columns={getImageColumns({ hasAdminRole, projectId })}
      selectedLabel={t('Image')}
    />
  );
}

export function InstanceSnapshotSelect({ value, onChange, snapshots = [] }) {
  return (
    <SelectTable
      value={value}
      onChange={onChange}
      data={snapshots}
      filterParams={[{ label: t('Name'), name: 'name' }]}
      columns={[
        col(t('Name'), 'name'),
        mapCol(t('Disk Format'), 'disk_format', imageFormats()),
        unitCol(t('Min. System Disk'), 'min_disk', 'GiB'),
        col(t('Min. Memory'), 'min_ram', { render: (v) => `${(v || 0) / 1024}GiB` }),
        mapCol(t('Status'), 'status', imageStatus()),
        timeCol(t('Created At'), 'created_at'),
      ]}
      selectedLabel={t('Instance Snapshot')}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Modify tags (legacy components/Tags)                                */
/* ------------------------------------------------------------------ */
export function TagsInput({ value, onChange, maxLength = 60, maxCount = 50 }) {
  return (
    <Select
      mode="tags"
      value={value}
      onChange={(list) => onChange?.((list || []).map((s) => String(s).trim().slice(0, maxLength)).filter(Boolean).slice(0, maxCount))}
      tokenSeparators={[' ']}
      open={false}
      placeholder={t('Enter a tag and press Enter')}
      style={{ width: '100%' }}
      tagRender={({ label, closable, onClose }) => (
        <Tag closable={closable} onClose={onClose} color="blue" style={{ marginInlineEnd: 4 }}>
          {label}
        </Tag>
      )}
    />
  );
}

/** Read-only table used inside a form (volumes of a boot-from-volume snapshot) */
export function VolumesPreview({ volumes = [] }) {
  if (!volumes.length) return <Typography.Text type="secondary">-</Typography.Text>;
  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }}>
      {volumes.map((v) => (
        <div
          key={v.id}
          style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6 }}
        >
          <IdNameCell id={v.id} name={v.name || v.id} bold={false} />
          <span>{v.size ? `${v.size}GiB` : formatSize(0)}</span>
          <Tooltip title={t('Volume Type')}>
            <Tag>{v.volume_type || '-'}</Tag>
          </Tooltip>
        </div>
      ))}
    </Space>
  );
}
