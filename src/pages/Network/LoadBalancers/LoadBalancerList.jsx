import React from 'react';
import { useNavigate } from 'react-router-dom';
import ResourcePage, {
  nameColumn,
  statusColumn,
  timeColumn,
  projectColumn,
  useIsAdminPage,
  IdNameCell,
} from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { detailPath } from '@/pages/Network/common';
import {
  operatingStatus,
  provisioningStatus,
  isLbTransition,
  statusOptions,
  lbDetailPath,
  fetchLoadBalancers,
  TitleWithTip,
} from './helpers';
import { createLoadBalancerAction, deleteLoadBalancerAction, lbRowActions } from './actions';

export const operatingStatusTip = () => (
  <div>
    <div>{t('DRAINING: The member is not accepting new connections')}</div>
    <div>{t('DEGRADED: One or more of the entity’s components are in ERROR')}</div>
  </div>
);

export const lbColumns = ({ isAdmin, projectMap }) =>
  [
    nameColumn({ linkTo: (r) => lbDetailPath(r.id, isAdmin) }),
    isAdmin && projectColumn(projectMap),
    {
      title: t('Network ID'),
      dataIndex: 'vip_network_id',
      key: 'vip_network_id',
      render: (v) => (v ? <IdNameCell id={v} href={detailPath('networks', v, isAdmin)} bold={false} /> : '-'),
    },
    { title: t('IP'), dataIndex: 'vip_address', key: 'vip_address', render: (v) => v || '-' },
    { title: t('Floating IP'), dataIndex: 'fip', key: 'fip', render: (v) => v || '-' },
    {
      title: t('Port ID'),
      dataIndex: 'vip_port_id',
      key: 'vip_port_id',
      render: (v) => (v ? <IdNameCell id={v} href={detailPath('port', v, isAdmin)} bold={false} /> : '-'),
    },
    {
      ...statusColumn({ dataIndex: 'operating_status', textMap: operatingStatus() }),
      title: <TitleWithTip title={t('Operating Status')} tip={operatingStatusTip()} />,
    },
    statusColumn({ title: t('Provisioning Status'), dataIndex: 'provisioning_status', textMap: provisioningStatus() }),
    {
      title: t('Listener Number'),
      dataIndex: 'listeners',
      key: 'listeners',
      render: (v) => (v || []).length,
    },
    timeColumn(),
  ].filter(Boolean);

export default function LoadBalancerList() {
  const projectMap = useProjectMap();
  const isAdmin = useIsAdminPage();
  const navigate = useNavigate();
  return (
    <ResourcePage
      title={t('Load Balancers')}
      breadcrumb={[t('Network'), t('Load Balancers')]}
      description={t('Octavia load balancers distribute traffic across back-end members through listeners and pools.')}
      fetch={fetchLoadBalancers}
      isTransition={isLbTransition}
      columns={(ctx) => lbColumns({ isAdmin: ctx.isAdmin, projectMap })}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'vip_address', label: t('IP') },
        { name: 'provisioning_status', label: t('Provisioning Status'), options: statusOptions(provisioningStatus()) },
        { name: 'operating_status', label: t('Operating Status'), options: statusOptions(operatingStatus()) },
        // legacy adminPageHasProjectFilter
        ...(isAdmin ? [{ name: 'project_id', label: t('Project ID') }] : []),
      ]}
      primaryActions={(ctx) => (ctx.isAdmin ? [] : [createLoadBalancerAction({ navigate })])}
      // legacy: batch delete only on the project page
      batchActions={(ctx) => (ctx.isAdmin ? [] : [deleteLoadBalancerAction(ctx)])}
      rowActions={(ctx) => lbRowActions(ctx)}
    />
  );
}
