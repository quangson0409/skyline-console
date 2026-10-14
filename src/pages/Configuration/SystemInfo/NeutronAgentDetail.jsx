import React, { useState } from 'react';
import { Col, Popover, Row, Spin, Table, Typography } from 'antd';
import apiClient from '@/api/client';
import { serviceBase } from '@/api/endpoints';
import { neutronApi } from '@/api/neutron';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import ResourcePage, { formatTime, nameColumn, statusColumn, projectColumn, yesNo, IdNameCell } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { getErrorMessage } from '@/hooks/useResource';
import { sinceTime } from '../shared';
import { JsonBlock } from '@/components/CodeBlock';
import { SearchSelectTable as SelectTable, selectTableRequired } from '@/components/SelectTable';
import { agentRowActions, agentStateText, agentStatusText } from './SystemInfo';

/** Legacy pages/configuration/containers/SystemInfo/NeutronAgent/Detail (+ Network / Router tabs) */

const agentBase = (agentId) => `${serviceBase('neutron')}/agents/${agentId}`;
export const agentApi = {
  listDhcpNetworks: (agentId) => apiClient.get(`${agentBase(agentId)}/dhcp-networks`),
  addDhcpNetwork: (agentId, networkId) => apiClient.post(`${agentBase(agentId)}/dhcp-networks`, { network_id: networkId }),
  removeDhcpNetwork: (agentId, networkId) => apiClient.delete(`${agentBase(agentId)}/dhcp-networks/${networkId}`),
  listL3Routers: (agentId) => apiClient.get(`${agentBase(agentId)}/l3-routers`),
  addL3Router: (agentId, routerId) => apiClient.post(`${agentBase(agentId)}/l3-routers`, { router_id: routerId }),
  removeL3Router: (agentId, routerId) => apiClient.delete(`${agentBase(agentId)}/l3-routers/${routerId}`),
};

const statusSorter = {
  sorter: (a, b) => String(a.status || '').localeCompare(String(b.status || '')),
  defaultSortOrder: 'descend',
};

const networkStatus = () => ({ ACTIVE: t('Active'), BUILD: t('Build'), DOWN: t('Down'), ERROR: t('Error') });
const routerStatus = () => ({ ACTIVE: t('Active'), DOWN: t('Down'), ERROR: t('Error') });

const mapRouter = (r = {}) => {
  const gw = r.external_gateway_info;
  return {
    ...r,
    hasExternalGateway: !!gw,
    externalNetworkId: gw?.network_id || '',
    externalNetworkName: gw?.network_name || '',
    externalFixedIps: gw?.external_fixed_ips || [],
  };
};

/** legacy router store: external network names are resolved from the network list */
const withExternalNames = (routers, networks = []) => {
  const names = new Map(networks.map((n) => [n.id, n.name]));
  return routers.map((r) => ({ ...r, externalNetworkName: r.externalNetworkName || names.get(r.externalNetworkId) || '' }));
};

const fetchExternalNetworks = async () => {
  try {
    return (await neutronApi.listNetworks({ 'router:external': true }))?.networks || [];
  } catch {
    return [];
  }
};

/** legacy default sort of the select tables (networkSortProps / routerSortProps): status descend */
const byStatusDesc = (rows) => [...rows].sort((a, b) => String(b.status || '').localeCompare(String(a.status || '')));

/** legacy add: every selected item is required; report the ones that failed instead of a plain success */
const addAll = async (ids, add) => {
  const results = await Promise.allSettled(ids.map((id) => add(id)));
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? `${ids[i]}: ${getErrorMessage(r.reason, t('Operation failed'))}` : null))
    .filter(Boolean);
  if (failed.length) {
    throw new Error(
      `${t('{failed} of {total} failed', { failed: failed.length, total: ids.length })}: ${failed.join('; ')}`
    );
  }
  return results.map((r) => r.value);
};

/** legacy PopoverSubnets: subnet count, the popover lists name and CIDR of each subnet */
function SubnetCount({ subnetIds = [] }) {
  const [state, setState] = useState({ loading: false, rows: null });
  const count = subnetIds.length;
  if (!count) return 0;
  const load = async (open) => {
    if (!open || state.rows || state.loading) return;
    setState({ loading: true, rows: null });
    const rows = await Promise.all(
      subnetIds.map((id) =>
        neutronApi
          .show('subnets', id)
          .then((res) => res?.subnet || { id })
          .catch(() => ({ id }))
      )
    );
    setState({ loading: false, rows });
  };
  return (
    <Popover
      trigger="click"
      onOpenChange={load}
      content={
        <div style={{ minWidth: 280 }}>
          {state.loading || !state.rows ? (
            <Spin size="small" />
          ) : (
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={state.rows}
              columns={[
                { title: t('Name'), dataIndex: 'name', key: 'name', render: (v, r) => v || r.id },
                { title: t('CIDR'), dataIndex: 'cidr', key: 'cidr', render: (v) => v || '-' },
              ]}
            />
          )}
        </div>
      }
    >
      <Typography.Link className="subnet-count-popover" onClick={(e) => e.stopPropagation()}>
        {count}
      </Typography.Link>
    </Popover>
  );
}

const networkColumns = (projectMap, { link = true } = {}) => [
  nameColumn({ linkTo: link ? (r) => `/network/networks-admin/detail/${r.id}` : undefined }),
  { ...projectColumn(projectMap), title: t('Project ID/Name') },
  { title: t('External'), dataIndex: 'router:external', key: 'router:external', render: (v) => yesNo(v) },
  { title: t('Shared Network'), dataIndex: 'shared', key: 'shared', render: (v) => yesNo(v) },
  { ...statusColumn({ textMap: networkStatus() }), ...(link ? {} : statusSorter) },
  {
    title: t('Subnet Count'),
    dataIndex: 'subnets',
    key: 'subnets',
    render: (v) => <SubnetCount subnetIds={v || []} />,
    exportRender: (v) => `${(v || []).length}(${(v || []).join(',')})`,
  },
  { title: t('Created At'), dataIndex: 'created_at', key: 'created_at', render: (v) => sinceTime(v) },
];

const routerColumns = (projectMap, { link = true } = {}) => [
  nameColumn({ linkTo: link ? (r) => `/network/router-admin/detail/${r.id}` : undefined }),
  { ...projectColumn(projectMap), title: t('Project ID/Name') },
  { ...statusColumn({ textMap: routerStatus() }), ...(link ? {} : statusSorter) },
  { title: t('External Gateway'), dataIndex: 'hasExternalGateway', key: 'hasExternalGateway', render: (v) => yesNo(v) },
  {
    title: t('External Network ID/Name'),
    dataIndex: 'externalNetworkName',
    key: 'externalNetworkName',
    render: (v, r) =>
      r.externalNetworkId ? (
        <IdNameCell
          id={r.externalNetworkId}
          name={v}
          href={link ? `/network/networks-admin/detail/${r.externalNetworkId}` : undefined}
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
    render: (v) => (v && v.length ? v.map((it) => <div key={it.ip_address}>{it.ip_address}</div>) : '-'),
  },
  { title: t('Created At'), dataIndex: 'created_at', key: 'created_at', render: (v) => sinceTime(v) },
];

const yesNoOptions = () => [
  { key: 'true', label: t('Yes') },
  { key: 'false', label: t('No') },
];

/** legacy AddNetwork.getSearchFilters / network tab filters */
const networkFilterParams = () => [
  { name: 'name', label: t('Network Name') },
  { name: 'shared', label: t('Shared Network'), options: yesNoOptions() },
  { name: 'router:external', label: t('External'), options: yesNoOptions() },
  { name: 'project_id', label: t('Project ID') },
];

/** legacy routerFilters + Project ID */
const routerFilterParams = () => [
  { name: 'name', label: t('Name') },
  { name: 'status', label: t('Status'), options: Object.entries(routerStatus()).map(([key, label]) => ({ key, label })) },
  { name: 'project_id', label: t('Project ID') },
];

/* ------------------------------------------------ Networks tab ------------------------------------------------ */
const addNetworkAction = (agent, projectMap) => ({
  id: 'add-network',
  type: 'modal',
  policy: 'create_dhcp-network',
  title: t('Add Network'),
  width: 1000,
  adminOnly: true,
  getDefaultValues: () => ({ binary: agent.binary }),
  getFormItems: async () => {
    const [all, current] = await Promise.all([
      neutronApi.listNetworks(),
      agentApi.listDhcpNetworks(agent.id).catch(() => ({})),
    ]);
    const used = (current?.networks || []).map((n) => n.id);
    return [
      { name: 'binary', label: t('Name'), type: 'label' },
      {
        name: 'network',
        label: t('Network'),
        required: true,
        rules: [selectTableRequired(t('Network'))],
        render: () => (
          <SelectTable
            data={byStatusDesc(all?.networks || [])}
            columns={networkColumns(projectMap, { link: false })}
            disabledFunc={(r) => used.includes(r.id)}
            filterParams={networkFilterParams()}
          />
        ),
      },
    ];
  },
  onSubmit: ({ network }) => addAll(network?.selectedRowKeys || [], (id) => agentApi.addDhcpNetwork(agent.id, id)),
});

const removeNetworkAction = () => ({
  id: 'remove',
  type: 'confirm',
  policy: 'delete_dhcp-network',
  title: t('Remove Network'),
  buttonText: t('Remove'),
  actionName: t('remove network'),
  isDanger: true,
  adminOnly: true,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await agentApi.removeDhcpNetwork(it.agentId, it.id);
    }
  },
});

function AgentNetworks({ agent }) {
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      embedded
      policy="get_dhcp-networks"
      deps={[agent.id]}
      fetch={async () => ((await agentApi.listDhcpNetworks(agent.id))?.networks || []).map((n) => ({ ...n, agentId: agent.id }))}
      columns={() => networkColumns(projectMap)}
      filterParams={networkFilterParams()}
      primaryActions={[addNetworkAction(agent, projectMap)]}
      batchActions={[removeNetworkAction()]}
      rowActions={{ firstAction: removeNetworkAction(), moreActions: [] }}
    />
  );
}

/* ------------------------------------------------ Routers tab ------------------------------------------------ */
const addRouterAction = (agent, projectMap) => ({
  id: 'add-router',
  type: 'modal',
  policy: 'create_l3-router',
  title: t('Add Router'),
  width: 1000,
  adminOnly: true,
  getDefaultValues: () => ({ binary: agent.binary }),
  getFormItems: async () => {
    const [all, current, externalNetworks] = await Promise.all([
      neutronApi.listRouters(),
      agentApi.listL3Routers(agent.id).catch(() => ({})),
      fetchExternalNetworks(),
    ]);
    const used = (current?.routers || []).map((n) => n.id);
    return [
      { name: 'binary', label: t('Name'), type: 'label' },
      {
        name: 'router',
        label: t('Router'),
        required: true,
        rules: [selectTableRequired(t('Router'))],
        render: () => (
          <SelectTable
            data={byStatusDesc(withExternalNames((all?.routers || []).map(mapRouter), externalNetworks))}
            columns={routerColumns(projectMap, { link: false })}
            disabledFunc={(r) => used.includes(r.id)}
            filterParams={routerFilterParams()}
          />
        ),
      },
    ];
  },
  onSubmit: ({ router }) => addAll(router?.selectedRowKeys || [], (id) => agentApi.addL3Router(agent.id, id)),
});

const removeRouterAction = () => ({
  id: 'remove',
  type: 'confirm',
  policy: 'delete_l3-router',
  title: t('Remove Router'),
  buttonText: t('Remove'),
  actionName: t('remove router'),
  isDanger: true,
  adminOnly: true,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await agentApi.removeL3Router(it.agentId, it.id);
    }
  },
});

function AgentRouters({ agent }) {
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      embedded
      policy="get_l3-routers"
      deps={[agent.id]}
      fetch={async () => {
        const [res, externalNetworks] = await Promise.all([agentApi.listL3Routers(agent.id), fetchExternalNetworks()]);
        return withExternalNames(
          (res?.routers || []).map((r) => ({ ...mapRouter(r), agentId: agent.id })),
          externalNetworks
        );
      }}
      columns={() => routerColumns(projectMap)}
      filterParams={routerFilterParams()}
      primaryActions={[addRouterAction(agent, projectMap)]}
      batchActions={[removeRouterAction()]}
      rowActions={{ firstAction: removeRouterAction(), moreActions: [] }}
    />
  );
}

export default function NeutronAgentDetail() {
  return (
    <ResourceDetail
      policy="get_agent"
      breadcrumb={[
        t('Global Settings'),
        { title: t('System Info'), path: '/configuration-admin/info?tab=neutronAgent' },
      ]}
      backPath="/configuration-admin/info?tab=neutronAgent"
      nameField="binary"
      statusField="__none"
      fetch={async (id) => (await neutronApi.show('agents', id))?.agent}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Type'), value: d.agent_type },
        { label: t('Service Status'), value: d.admin_state_up, render: () => agentStatusText(d.admin_state_up) },
        { label: t('Service State'), value: d.alive, render: () => agentStateText(d.alive) },
        { label: t('Host'), value: d.host },
        { label: t('Availability Zone'), value: d.availability_zone },
        { label: t('Created At'), value: d.created_at },
        { label: t('Description'), value: d.description },
      ]}
      tabs={(d) =>
        [
          {
            key: 'detail',
            label: t('Detail'),
            render: () => (
              <Row gutter={16}>
                <Col xs={24} lg={12}>
                  <DetailCard
                    title={t('Base Info')}
                    column={1}
                    items={[
                      { label: t('Name'), value: d.binary },
                      { label: t('Topic'), value: d.topic },
                      { label: t('Resources Synced'), value: d.resources_synced === undefined ? '' : String(d.resources_synced) },
                      { label: t('Heartbeat Timestamp'), value: formatTime(d.heartbeat_timestamp) },
                      { label: t('Started At'), value: d.started_at },
                    ]}
                  />
                </Col>
                <Col xs={24} lg={12}>
                  <DetailCard
                    title={t('Configuration')}
                    column={1}
                    items={[{ label: '', render: () => <JsonBlock value={d.configurations || {}} /> }]}
                  />
                </Col>
              </Row>
            ),
          },
          d.agent_type === 'L3 agent' && { key: 'router', label: t('Routers'), render: () => <AgentRouters agent={d} /> },
          d.agent_type === 'DHCP agent' && { key: 'network', label: t('Networks'), render: () => <AgentNetworks agent={d} /> },
        ].filter(Boolean)
      }
      actions={agentRowActions}
    />
  );
}
