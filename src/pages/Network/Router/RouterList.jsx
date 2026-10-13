import React from 'react';
import { neutronApi } from '@/api/neutron';
import ResourcePage, {
  nameColumn,
  statusColumn,
  timeColumn,
  projectColumn,
  yesNo,
  useIsAdminPage,
} from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { detailPath, networkLink, listAll } from '../common';
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

export const routerColumns = ({ isAdmin, projectMap }) =>
  [
    nameColumn({ linkTo: (r) => detailPath('router', r.id, isAdmin) }),
    isAdmin && projectColumn(projectMap),
    statusColumn({ textMap: routerStatus() }),
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
          <div>
            {networkLink(r.externalNetworkId, value || r.externalNetworkId, isAdmin)}
            {value ? <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.externalNetworkId}</div> : null}
          </div>
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
