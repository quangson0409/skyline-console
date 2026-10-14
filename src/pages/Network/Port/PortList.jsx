import React from 'react';
import ResourcePage, { nameColumn, statusColumn, projectColumn, IdNameCell } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { adminSuffix, detailPath } from '../common';
import { portStatus, deviceOwnerOptions, fetchPorts, ROUTER_OWNERS } from './helpers';
import {
  createPortAction,
  editPortAction,
  attachInstanceAction,
  detachInstanceAction,
  associateFipAction,
  disassociateFipAction,
  modifyQosAction,
  manageSecurityGroupAction,
  deletePortAction,
} from './actions';

export * from './actions';
export { portStatus, fetchPorts, fetchPortDetail, fetchFixedIps, normalizePort, deviceOwnerOptions } from './helpers';

/** Detail route of a port depending on where the list is rendered (legacy getPortDetailRoute) */
export const portDetailPath = (record, { isAdmin, networkId, subnetId, instanceId } = {}) => {
  const sfx = adminSuffix(isAdmin);
  if (subnetId) {
    return `/network/networks${sfx}/detail/${networkId || record.network_id}/subnet/${subnetId}/port/${record.id}`;
  }
  if (networkId) return `/network/networks${sfx}/detail/${networkId}/port/${record.id}`;
  if (instanceId) return `/network/instance${sfx}/detail/${instanceId}/port/${record.id}`;
  return detailPath('port', record.id, isAdmin);
};

/** Legacy renderResource for the "Bind Resource" column */
export const renderBindResource = (record, isAdmin) => {
  const { device_id, device_owner, server_name } = record || {};
  if (!device_owner) return device_id || '-';
  let href;
  let name;
  if (device_owner === 'compute:nova') {
    href = `/compute/instance${adminSuffix(isAdmin)}/detail/${device_id}?tab=interface`;
    name = server_name;
  } else if (ROUTER_OWNERS.includes(device_owner)) {
    href = detailPath('router', device_id, isAdmin);
  } else if (device_owner === 'network:floatingip') {
    href = detailPath('floatingip', device_id, isAdmin);
  }
  return (
    <div>
      <div>{device_owner}</div>
      {device_id ? <IdNameCell id={device_id} name={name} href={href} bold={false} /> : '-'}
    </div>
  );
};

const ipList = (value) =>
  Array.isArray(value) && value.length ? value.map((it) => <div key={it}>{it}</div>) : '-';

export const portColumns = ({ isAdmin, projectMap, networkId, subnetId, instanceId } = {}) => {
  const networkMode = Boolean(networkId) && !subnetId;
  return [
    nameColumn({ linkTo: (r) => portDetailPath(r, { isAdmin, networkId, subnetId, instanceId }) }),
    isAdmin && { ...projectColumn(projectMap), title: t('Project ID/Name') },
    !instanceId && {
      title: t('Bind Resource'),
      dataIndex: 'server_name',
      key: 'server_name',
      render: (_, r) => renderBindResource(r, isAdmin),
    },
    !networkMode && {
      title: t('Network ID/Name'),
      dataIndex: 'network_name',
      key: 'network_name',
      render: (v, r) =>
        r.network_id ? (
          <IdNameCell id={r.network_id} name={v} href={detailPath('networks', r.network_id, isAdmin)} bold={false} />
        ) : (
          '-'
        ),
    },
    { title: t('IPv4'), dataIndex: 'ipv4', key: 'ipv4', render: ipList },
    { title: t('IPv6'), dataIndex: 'ipv6', key: 'ipv6', render: ipList },
    {
      title: t('MAC Address'),
      dataIndex: 'mac_address',
      key: 'mac_address',
      sorter: (a, b) => String(a.mac_address || '').localeCompare(String(b.mac_address || '')),
      render: (v) => v || '-',
    },
    {
      ...statusColumn({ textMap: portStatus() }),
      sorter: (a, b) => String(a.status || '').localeCompare(String(b.status || '')),
    },
  ].filter(Boolean);
};

export const portFilters = ({ networkId, subnetId, instanceId } = {}) => {
  const networkMode = Boolean(networkId) && !subnetId;
  return [
    { name: 'name', label: t('Name') },
    !networkMode && { name: 'network_name', label: t('Network') },
    {
      name: 'status',
      label: t('Status'),
      options: [
        { label: t('Active'), key: 'ACTIVE' },
        { label: t('Down'), key: 'DOWN' },
        { label: t('Error'), key: 'ERROR' },
        { label: t('Build'), key: 'BUILD' },
        { label: t('N/A'), key: 'N/A' },
      ],
    },
    !instanceId && {
      name: 'device_owner_group',
      label: t('Device Owner'),
      options: deviceOwnerOptions().map((o) => ({ key: o.key, label: o.label })),
    },
  ].filter(Boolean);
};

/** Action sets (legacy actionConfigs / actionConfigsInDetail / adminActions) */
export const portActionSets = ({ isAdmin, networkId, instanceId, readOnly } = {}) => {
  if (readOnly) return { primary: [], batch: [], row: undefined };
  if (isAdmin) {
    return {
      primary: [],
      batch: [deletePortAction()],
      row: { firstAction: deletePortAction(), moreActions: [] },
    };
  }
  if (instanceId) {
    return {
      primary: [],
      batch: [],
      row: { firstAction: detachInstanceAction(), moreActions: [{ action: modifyQosAction() }] },
    };
  }
  return {
    primary: [createPortAction({ networkId })],
    batch: [deletePortAction()],
    row: {
      firstAction: editPortAction(),
      moreActions: [
        { action: attachInstanceAction() },
        { action: associateFipAction({ isAdmin }) },
        { action: disassociateFipAction({ isAdmin }) },
        { action: detachInstanceAction() },
        { action: modifyQosAction() },
        { action: manageSecurityGroupAction() },
        { action: deletePortAction() },
      ],
    },
  };
};

/**
 * Embedded ports table (legacy Port container rendered inside Network / Subnet / Instance detail).
 *  filters: any neutron list query, e.g. { network_id }, { fixed_ips: ['subnet_id=...'] }, { device_id }
 *  networkId / subnetId / instanceId: parent context (detail links + preset network on create)
 *  readOnly: hide all actions (legacy network/subnet detail had no actions)
 */
export function PortsEmbedded({ filters = {}, networkId, subnetId, instanceId, readOnly = false }) {
  const projectMap = useProjectMap();
  const netId = networkId || filters?.network_id;
  const query = { ...filters };
  if (networkId && !query.network_id) query.network_id = networkId;
  if (instanceId && !query.device_id) query.device_id = instanceId;
  const key = JSON.stringify(query);
  return (
    <ResourcePage
      embedded
      deps={[key, subnetId]}
      fetch={(ctx) => fetchPorts({ ...ctx, filters: query, subnetId })}
      columns={({ isAdmin }) => portColumns({ isAdmin, projectMap, networkId: netId, subnetId, instanceId })}
      filterParams={portFilters({ networkId: netId, subnetId, instanceId })}
      primaryActions={({ isAdmin }) => portActionSets({ isAdmin, networkId: netId, instanceId, readOnly }).primary}
      batchActions={({ isAdmin }) => portActionSets({ isAdmin, networkId: netId, instanceId, readOnly }).batch}
      rowActions={({ isAdmin }) => portActionSets({ isAdmin, networkId: netId, instanceId, readOnly }).row}
    />
  );
}

export default function PortList() {
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      title={t('Ports')}
      breadcrumb={[t('Network'), t('Ports')]}
      description={t('Port mainly used for binding instance and other operations, occupying the quota of the port.')}
      fetch={(ctx) => fetchPorts(ctx)}
      columns={({ isAdmin }) => portColumns({ isAdmin, projectMap })}
      filterParams={portFilters()}
      primaryActions={({ isAdmin }) => portActionSets({ isAdmin }).primary}
      batchActions={({ isAdmin }) => portActionSets({ isAdmin }).batch}
      rowActions={({ isAdmin }) => portActionSets({ isAdmin }).row}
      interval={15000}
    />
  );
}
