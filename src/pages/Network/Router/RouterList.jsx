import React from 'react';
import { neutronApi } from '@/api/neutron';
import ResourcePage, {
  nameColumn,
  statusColumn,
  timeColumn,
  projectColumn,
  yesNo,
  useIsAdminPage,
  IdNameCell,
} from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { sortParams, pageParams } from '@/api/paging';
import { detailPath, listAll } from '../common';
import { routerStatus, mapRouter, createRouterAction, deleteRouterAction, routerRowActions } from './actions';

/** legacy RouterStore.updateExternalNetworkForItems */
export const fillExternalNetworkNames = async (items) => {
  const hasExt = items.some((it) => it.external_gateway_info?.network_id);
  if (!hasExt) return items;
  const networks = await listAll.networks({ 'router:external': 'true' });
  items.forEach((it) => {
    const nid = it.external_gateway_info?.network_id;
    if (nid) {
      const network = networks.find((n) => n.id === nid);
      if (network) it.external_gateway_info = { ...it.external_gateway_info, network_name: network.name };
    }
  });
  return items;
};

export const fetchRouters = async ({ isAdmin, projectId }) => {
  // legacy listFilterByProject: non-admin lists only the current project
  const params = isAdmin ? {} : { project_id: projectId };
  const res = await neutronApi.listRouters(params);
  const items = (res?.routers || []).map((it) => ({ ...it }));
  await fillExternalNetworkNames(items);
  return items.map(mapRouter);
};

/**
 * Server-side list (legacy Router container isFilterByBackend / isSortByBackend, RouterStore):
 * neutron /routers?limit&marker&sort_key&sort_dir + project_id unless administrator, name / status
 * (/ project_id) filters; external network names for the page rows. No count -> "has next" paging.
 */
export const fetchRoutersPage = async ({ ctx = {}, limit, marker, filters = {}, sortKey, sortDir } = {}) => {
  const params = { ...pageParams({ limit, marker }), ...filters, ...sortParams('neutron', sortKey, sortDir) };
  if (!ctx.isAdmin && ctx.projectId) params.project_id = ctx.projectId;
  const res = await neutronApi.listPage('routers', 'routers', params);
  const items = res.items.map((it) => ({ ...it }));
  await fillExternalNetworkNames(items);
  return { ...res, items: items.map(mapRouter) };
};

export const routerServerSide = { defaultSortKey: 'status', fetchPage: fetchRoutersPage };

export const routerColumns = ({ isAdmin, projectMap }) =>
  [
    // sortKey: legacy backend sort keys (neutron sort_key)
    { ...nameColumn({ linkTo: (r) => detailPath('router', r.id, isAdmin) }), sortKey: 'name' },
    isAdmin && { ...projectColumn(projectMap), sortKey: 'project_id' },
    { ...statusColumn({ textMap: routerStatus() }), sortKey: 'status' },
    {
      title: t('External Gateway'),
      dataIndex: 'hasExternalGateway',
      key: 'hasExternalGateway',
      render: (v) => yesNo(v),
    },
    {
      title: t('External Network ID/Name'),
      dataIndex: 'externalNetworkName',
      key: 'externalNetworkName',
      render: (value, r) =>
        r.externalNetworkId ? (
          <IdNameCell
            id={r.externalNetworkId}
            name={value}
            href={detailPath('networks', r.externalNetworkId, isAdmin)}
            bold={false}
          />
        ) : (
          '-'
        ),
    },
    {
      title: t('External IP'),
      dataIndex: 'externalFixedIps',
      key: 'externalFixedIps',
      render: (value) =>
        (value || []).length ? value.map((it) => <div key={it.ip_address}>{it.ip_address}</div>) : '-',
    },
    timeColumn(),
  ].filter(Boolean);

export default function RouterList() {
  const projectMap = useProjectMap();
  const isAdmin = useIsAdminPage();
  return (
    <ResourcePage
      title={t('Routers')}
      breadcrumb={[t('Network'), t('Routers')]}
      description={t('Virtual routers connect subnets to each other and to external networks.')}
      fetch={fetchRouters}
      serverSide={routerServerSide}
      columns={(ctx) => routerColumns({ isAdmin: ctx.isAdmin, projectMap })}
      filterParams={[
        { name: 'name', label: t('Name') },
        {
          name: 'status',
          label: t('Status'),
          options: Object.entries(routerStatus()).map(([key, label]) => ({ key, label })),
        },
        // legacy adminPageHasProjectFilter
        ...(isAdmin ? [{ name: 'project_id', label: t('Project ID') }] : []),
      ]}
      primaryActions={(ctx) => (ctx.isAdmin ? [] : [createRouterAction()])}
      batchActions={[deleteRouterAction()]}
      rowActions={(ctx) => routerRowActions(ctx.isAdmin)}
      interval={15000}
    />
  );
}
