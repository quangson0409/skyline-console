import React from 'react';
import { Table, Card } from 'antd';
import { neutronApi } from '@/api/neutron';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { nameColumn, statusColumn, timeColumn, formatTime, yesNo } from '@/components/ResourcePage';
import DetailCard from '@/components/DetailCard';
import { t } from '@/core/i18n';
import { networkLink, adminSuffix, renderFixedIps, networkStatus } from '../common';
import {
  routerStatus,
  getRouterState,
  mapRouter,
  routerRowActions,
  connectSubnetAction,
  disconnectSubnetAction,
  createStaticRouteAction,
  deleteStaticRouteAction,
} from './actions';

export const portStatus = () => networkStatus();

const fetchRouterDetail = async (id, { isAdmin }) => {
  const router = (await neutronApi.getRouter(id))?.router;
  if (!router) return router;
  const item = { ...router };
  // legacy fetchExternalGatewayNetworkName
  const { network_id, network_name } = item.external_gateway_info || {};
  if (network_id && !network_name) {
    try {
      const network = (await neutronApi.getNetwork(network_id))?.network;
      item.external_gateway_info = { ...item.external_gateway_info, network_name: network?.name };
    } catch {
      // ignore
    }
  }
  // legacy fetchL3Agents (admin only, null when the API is not available)
  item.l3Agents = null;
  if (isAdmin) {
    try {
      const res = await neutronApi.listRouterL3Agents(id);
      item.l3Agents = res?.agents ?? [];
    } catch (error) {
      item.l3Agents = error?.response?.status === 404 ? null : [];
    }
  }
  return mapRouter(item);
};

const routerPortPath = (routerId, portId, isAdmin) => `/network/router${adminSuffix(isAdmin)}/${routerId}/port/${portId}`;

function RouterPorts({ router, isAdmin }) {
  return (
    <ResourcePage
      embedded
      deps={[router.id]}
      fetch={async () => (await neutronApi.listPorts({ device_id: router.id }))?.ports || []}
      columns={[
        nameColumn({ linkTo: (r) => routerPortPath(router.id, r.id, isAdmin) }),
        {
          title: t('IP Address'),
          dataIndex: 'fixed_ips',
          key: 'fixed_ips',
          render: (value) => renderFixedIps(value),
        },
        { title: t('MAC Address'), dataIndex: 'mac_address', key: 'mac_address', render: (v) => v || '-' },
        { title: t('Associated Resources'), dataIndex: 'device_owner', key: 'device_owner', render: (v) => v || '-' },
        statusColumn({ textMap: portStatus() }),
        timeColumn(),
      ]}
      filterParams={[
        { name: 'name', label: t('Name') },
        {
          name: 'status',
          label: t('Status'),
          options: Object.entries(portStatus()).map(([key, label]) => ({ key, label })),
        },
      ]}
      primaryActions={isAdmin ? [] : [connectSubnetAction(router), disconnectSubnetAction(router)]}
    />
  );
}

function StaticRoutes({ router, isAdmin }) {
  return (
    <ResourcePage
      embedded
      deps={[router.id]}
      fetch={async () => {
        const data = (await neutronApi.getRouter(router.id))?.router || {};
        return (data.routes || []).map((it) => ({
          ...it,
          router_id: router.id,
          id: `${it.destination} - ${it.nexthop}`,
          name: `${it.destination}(${it.nexthop})`,
        }));
      }}
      searchFields={['destination', 'nexthop']}
      columns={[
        { title: t('Destination CIDR'), dataIndex: 'destination', key: 'destination' },
        { title: t('Next Hop'), dataIndex: 'nexthop', key: 'nexthop' },
      ]}
      primaryActions={isAdmin ? [] : [createStaticRouteAction(router.id)]}
      batchActions={[deleteStaticRouteAction()]}
      rowActions={{ firstAction: deleteStaticRouteAction(), moreActions: [] }}
    />
  );
}

function RouterBaseDetail({ router, isAdmin }) {
  const gw = router.external_gateway_info || {};
  const agents = router.l3Agents;
  return (
    <div>
      <DetailCard
        title={t('Availability Zone Info')}
        column={{ xs: 1, sm: 2 }}
        items={[
          { label: t('Current Availability Zones'), value: (router.availability_zones || []).join(',') || '-' },
          { label: t('Availability Zone Hints'), value: (router.availability_zone_hints || []).join(',') || '-' },
        ]}
      />
      <DetailCard
        title={t('Network Info')}
        column={{ xs: 1, sm: 2 }}
        items={[
          {
            label: t('Network Name'),
            value: router.externalNetworkName,
            render: () =>
              router.externalNetworkId
                ? networkLink(router.externalNetworkId, router.externalNetworkName || router.externalNetworkId, isAdmin)
                : '-',
          },
          { label: t('Network ID'), value: router.externalNetworkId, copyable: true },
          { label: t('SNAT Enabled'), value: gw.enable_snat, render: () => yesNo(gw.enable_snat) },
          {
            label: t('External IPs'),
            value: gw.external_fixed_ips,
            render: (value) =>
              !value || value.length === 0
                ? '-'
                : value.map((item, index) => (
                    <ul key={`ip-${index}`} style={{ paddingLeft: 12, margin: 0 }}>
                      <li>
                        <b>{t('Subnet ID')}</b>: {item.subnet_id}
                      </li>
                      <li>
                        <b>{t('IP Address')}</b>: {item.ip_address}
                      </li>
                    </ul>
                  )),
          },
        ]}
      />
      {isAdmin && agents !== null && agents !== undefined ? (
        <Card title={t('L3 Agent')} variant="borderless" style={{ marginBottom: 16 }}>
          <Table
            size="middle"
            rowKey="id"
            pagination={false}
            dataSource={agents || []}
            columns={[
              { title: t('Host'), dataIndex: 'host', key: 'host' },
              { title: t('ID'), dataIndex: 'id', key: 'id' },
              {
                title: t('High Availability Status'),
                dataIndex: 'ha_state',
                key: 'ha_state',
                render: (value) => value || '-',
              },
            ]}
          />
        </Card>
      ) : null}
    </div>
  );
}

export default function RouterDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Network'), { title: t('Routers'), path: '/network/router' }]}
      backPath={({ isAdmin }) => `/network/router${adminSuffix(isAdmin)}`}
      fetch={fetchRouterDetail}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Name'), value: d.name },
          { label: t('Status'), value: d.status, render: () => routerStatus()[d.status] || d.status || '-' },
          { label: t('Admin State'), value: getRouterState(d.admin_state_up) },
          isAdmin && { label: t('Project ID'), value: d.tenant_id || d.project_id, copyable: true },
          { label: t('Description'), value: d.description },
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) => [
        { key: 'detail', label: t('Detail'), render: () => <RouterBaseDetail router={d} isAdmin={isAdmin} /> },
        { key: 'ports', label: t('Ports'), render: () => <RouterPorts router={d} isAdmin={isAdmin} /> },
        {
          key: 'staticRoutes',
          label: t('Static Routes'),
          render: () => <StaticRoutes router={d} isAdmin={isAdmin} />,
        },
      ]}
      actions={({ isAdmin }) => routerRowActions(isAdmin)}
    />
  );
}

