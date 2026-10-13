import React from 'react';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { nameColumn, statusColumn, formatTime } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { networkLink, portLink } from '@/pages/Network/common';
import {
  operatingStatus,
  provisioningStatus,
  isLbTransition,
  statusOptions,
  lbListPath,
  listenerDetailPath,
  protocolText,
  onOff,
  fetchLoadBalancerDetail,
  fetchListeners,
} from './helpers';
import { lbRowActions, listenerRowActions, listenerPrimaryActions } from './actions';

/** Wraps action submits so the parent detail is refreshed too (legacy forceRefreshTopDetailWhenListRefresh) */
export const withAfterSubmit = (action, after) =>
  action && action.onSubmit
    ? {
        ...action,
        onSubmit: async (...args) => {
          const res = await action.onSubmit(...args);
          after?.();
          return res;
        },
      }
    : action;

export const wrapRowActions = (cfg, after) => ({
  firstAction: withAfterSubmit(cfg.firstAction, after),
  moreActions: (cfg.moreActions || []).map((it) => (it.action ? { ...it, action: withAfterSubmit(it.action, after) } : it)),
});

export const listenerColumns = ({ lbId, isAdmin }) => [
  nameColumn({ linkTo: (r) => listenerDetailPath(lbId, r.id, isAdmin) }),
  statusColumn({ dataIndex: 'provisioning_status', textMap: provisioningStatus() }),
  statusColumn({ title: t('Operating Status'), dataIndex: 'operating_status', textMap: operatingStatus() }),
  { title: t('Protocol'), dataIndex: 'protocol', key: 'protocol', render: (v) => protocolText(v) },
  { title: t('Port'), dataIndex: 'protocol_port', key: 'protocol_port', render: (v) => v ?? '-' },
  { title: t('Connection Limit'), dataIndex: 'connection_limit', key: 'connection_limit', render: (v) => v ?? '-' },
  { title: t('Admin Status'), dataIndex: 'admin_state_up', key: 'admin_state_up', render: (v) => onOff(v) },
];

function Listeners({ lb, isAdmin, refetchDetail }) {
  const after = () => refetchDetail?.({ quiet: true });
  return (
    <ResourcePage
      embedded
      deps={[lb.id, lb.provisioning_status]}
      fetch={() => fetchListeners(lb.id)}
      isTransition={isLbTransition}
      columns={listenerColumns({ lbId: lb.id, isAdmin })}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'provisioning_status', label: t('Status'), options: statusOptions(provisioningStatus()) },
      ]}
      primaryActions={listenerPrimaryActions({ isAdmin, lb }).map((a) => withAfterSubmit(a, after))}
      rowActions={wrapRowActions(listenerRowActions({ isAdmin, lb }), after)}
    />
  );
}

export default function LoadBalancerDetail() {
  const projectMap = useProjectMap();
  return (
    <ResourceDetail
      breadcrumb={[t('Network'), { title: t('Load Balancers'), path: '/network/load-balancers' }]}
      backPath={({ isAdmin }) => lbListPath(isAdmin)}
      fetch={fetchLoadBalancerDetail}
      statusField="provisioning_status"
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Name'), value: d.name },
          {
            label: t('Status'),
            value: d.provisioning_status,
            render: () => provisioningStatus()[d.provisioning_status] || d.provisioning_status || '-',
          },
          {
            label: t('Operating Status'),
            value: d.operating_status,
            render: () => operatingStatus()[d.operating_status] || d.operating_status || '-',
          },
          isAdmin && {
            label: t('Project'),
            value: d.project_id,
            render: () => (
              <span>
                {projectMap[d.project_id] || '-'}
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.project_id}</div>
              </span>
            ),
          },
          {
            label: t('Network'),
            value: d.vip_network_id,
            render: () => networkLink(d.vip_network_id, d.vip_network_name || d.vip_network_id, isAdmin),
          },
          {
            label: t('Subnet'),
            value: d.vip_subnet_id,
            render: () =>
              d.vip_subnet_id ? (
                <span>
                  {d.vip_subnet_name || d.vip_subnet_id}
                  {d.vip_subnet_cidr ? ` (${d.vip_subnet_cidr})` : ''}
                  {d.vip_subnet_name ? <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.vip_subnet_id}</div> : null}
                </span>
              ) : (
                '-'
              ),
          },
          {
            label: t('Flavor'),
            value: d.flavor_id,
            render: () =>
              d.flavor_id ? (
                <span>
                  {d.flavor_name || d.flavor_id}
                  {d.flavor_name ? <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.flavor_id}</div> : null}
                </span>
              ) : (
                '-'
              ),
          },
          { label: t('IP'), value: d.vip_address },
          {
            label: t('Port ID'),
            value: d.vip_port_id,
            render: () => (d.vip_port_id ? portLink(d.vip_port_id, d.vip_port_id, isAdmin) : '-'),
          },
          { label: t('Floating IP'), value: d.fip },
          { label: t('Provider'), value: d.provider },
          { label: t('Admin State Up'), value: onOff(d.admin_state_up) },
          { label: t('Availability Zone'), value: d.availability_zone },
          { label: t('Description'), value: d.description },
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin, refetch }) => [
        {
          key: 'listener',
          label: t('Listeners'),
          render: () => <Listeners lb={d} isAdmin={isAdmin} refetchDetail={refetch} />,
        },
      ]}
      actions={(ctx) => lbRowActions(ctx)}
    />
  );
}
