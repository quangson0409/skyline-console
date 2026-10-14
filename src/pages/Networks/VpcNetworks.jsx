/**
 * Networks list - port of legacy pages/network/containers/Network/index.jsx (project TabList:
 * Current Project / Shared / External / All networks) and Network.jsx (admin list).
 */
import React from 'react';
import { Breadcrumb, Popover, Tabs, Tag } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
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
import { useAuthStore } from '@/store/authStore';
import { detailPath, networkStatus } from '@/pages/Network/common';
import { t } from '@/core/i18n';
import { sortParams, pageParams } from '@/api/paging';
import {
  createNetworkAction,
  quickCreateNetworkAction,
  editNetworkAction,
  createSubnetAction,
  deleteNetworkAction,
} from './NetworkParts/actions';

const yesNoOptions = () => [
  { key: 'true', label: t('Yes') },
  { key: 'false', label: t('No') },
];

const tabParams = (tab, { isAdmin, projectId }) => {
  if (isAdmin || tab === 'allNetwork') return { all_projects: true };
  if (tab === 'projectNetwork') return { project_id: projectId };
  if (tab === 'sharedNetwork') return { shared: true };
  if (tab === 'externalNetwork') return { 'router:external': true };
  return {};
};

const mapNetworks = (networks, subnets, ctx) => {
  const subMap = Object.fromEntries((subnets || []).map((s) => [s.id, s]));
  return (networks || []).map((n) => {
    const subnetDetails = (n.subnets || []).map((id) => subMap[id]).filter(Boolean);
    const external = Boolean(n['router:external']);
    const pid = n.project_id || n.tenant_id;
    return {
      ...n,
      shared: Boolean(n.shared),
      'router:external': external,
      subnetDetails,
      cidr: subnetDetails
        .map((s) => s.cidr)
        .filter(Boolean)
        .join(', '),
      network_type_label: external ? 'external' : 'internal',
      // "Project Range" filter helper: every row matches "all", own rows also match "current"
      project_range: pid === ctx.projectId ? 'all current' : 'all',
    };
  });
};

export const fetchNetworks = async (tab, ctx) => {
  const params = tabParams(tab, ctx);
  const [netsRes, subsRes] = await Promise.all([
    neutronApi.listNetworks(params),
    neutronApi.listSubnets().catch(() => ({})),
  ]);
  return mapNetworks(netsRes?.networks, subsRes?.subnets, ctx);
};

/**
 * Server-side list (legacy Network container isFilterByBackend / isSortByBackend, NetworkStore):
 * neutron /networks?limit&marker&sort_key&sort_dir + the tab scope (project_id / shared /
 * router:external; nothing on the admin and "all" lists - legacy drops all_projects) and the
 * name / shared / router:external / project_id filters. New-console filters are mapped to
 * neutron params: Type -> router:external, Project Range "current" -> project_id, keyword -> name.
 * Subnets are loaded for the page networks only. No count -> "has next" paging.
 */
export const fetchNetworksPage = async (tab, { ctx = {}, limit, marker, filters = {}, sortKey, sortDir } = {}) => {
  const { network_type_label: type, project_range: range, keyword, ...rest } = filters;
  const { all_projects, ...scope } = tabParams(tab, ctx);
  const params = { ...pageParams({ limit, marker }), ...scope, ...rest, ...sortParams('neutron', sortKey, sortDir) };
  if (type && params['router:external'] === undefined) params['router:external'] = type === 'external';
  if (range === 'current' && ctx.projectId) params.project_id = ctx.projectId;
  if (keyword && !params.name) params.name = keyword;
  const res = await neutronApi.listPage('networks', 'networks', params);
  const ids = res.items.map((n) => n.id);
  const subsRes = ids.length ? await neutronApi.listSubnets({ network_id: ids }).catch(() => ({})) : {};
  return { ...res, items: mapNetworks(res.items, subsRes?.subnets, ctx) };
};

const SubnetCount = ({ record }) => {
  const ids = record.subnets || [];
  if (!Array.isArray(ids) || !ids.length) return 0;
  const content = (
    <div style={{ maxWidth: 360 }}>
      {ids.map((id) => {
        const s = (record.subnetDetails || []).find((it) => it.id === id);
        return (
          <div key={id} style={{ fontSize: 12, padding: '2px 0' }}>
            <span style={{ fontWeight: 600 }}>{s?.name || id}</span>
            {s?.cidr ? <span style={{ color: '#64748b', fontFamily: 'monospace' }}> {s.cidr}</span> : null}
          </div>
        );
      })}
    </div>
  );
  return (
    <Popover title={t('Subnets')} content={content}>
      <a>{ids.length}</a>
    </Popover>
  );
};

export const networkColumns = ({ isAdmin, projectId, tab, projectMap }) => {
  const showProject = isAdmin || tab === 'allNetwork';
  return [
    // sortKey: legacy backend sort keys (neutron sort_key)
    { ...nameColumn({ linkTo: (r) => detailPath('networks', r.id, isAdmin) }), sortKey: 'name' },
    showProject && { ...projectColumn(projectMap), title: t('Project ID/Name'), sortKey: 'project_id' },
    !isAdmin &&
      tab !== 'projectNetwork' && {
        title: t('Is Current Project'),
        dataIndex: 'tenant_id',
        key: 'tenant_id',
        render: (value, r) => ((value || r.project_id) === projectId ? t('Yes') : t('No')),
      },
    tab !== 'externalNetwork' && {
      title: t('External'),
      dataIndex: 'router:external',
      key: 'router:external',
      render: (v) =>
        v ? (
          <Tag color="cyan" icon={<GlobalOutlined />}>
            {t('Yes')}
          </Tag>
        ) : (
          yesNo(false)
        ),
    },
    tab !== 'sharedNetwork' && {
      title: t('Shared Network'),
      dataIndex: 'shared',
      key: 'shared',
      render: (v) => yesNo(v),
    },
    { ...statusColumn({ textMap: networkStatus() }), sortKey: 'status' },
    {
      title: t('Subnet Count'),
      dataIndex: 'subnets',
      key: 'subnets',
      render: (_, r) => <SubnetCount record={r} />,
    },
    {
      title: t('Subnet CIDR'),
      dataIndex: 'cidr',
      key: 'cidr',
      render: (v) => (v ? <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{v}</span> : '-'),
    },
    timeColumn(),
  ].filter(Boolean);
};

const networkFilters = (tab) => {
  const name = { name: 'name', label: t('Network Name') };
  const shared = { name: 'shared', label: t('Shared Network'), options: yesNoOptions() };
  const external = { name: 'router:external', label: t('External'), options: yesNoOptions() };
  const type = {
    name: 'network_type_label',
    label: t('Type'),
    options: [
      { key: 'internal', label: t('Internal (Private)') },
      { key: 'external', label: t('External (Gateway)') },
    ],
  };
  const projectRange = {
    name: 'project_range',
    label: t('Project Range'),
    options: [
      { key: 'current', label: t('Current Project') },
      { key: 'all', label: t('All') },
    ],
  };
  const keyword = { name: 'keyword', label: t('Search by Name, ID, or CIDR...') };
  if (!tab) return [name, shared, external, type, { name: 'project_id', label: t('Project ID') }, keyword];
  if (tab === 'sharedNetwork') return [name, external, type, projectRange, keyword];
  if (tab === 'externalNetwork') return [name, shared, projectRange, keyword];
  return [name, shared, external, type, keyword];
};

function NetworkTable({ tab, embedded, projectMap }) {
  return (
    <ResourcePage
      embedded={embedded}
      policy="get_network"
      title={t('Networks')}
      breadcrumb={[t('Network'), t('Networks')]}
      description={t('Software-defined networks (SDN) powered by OpenStack Neutron.')}
      fetch={(ctx) => fetchNetworks(tab, ctx)}
      serverSide={{ defaultSortKey: 'status', fetchPage: (args) => fetchNetworksPage(tab, args) }}
      deps={[tab]}
      columns={(ctx) => networkColumns({ ...ctx, tab, projectMap })}
      filterParams={networkFilters(tab)}
      searchFields={['name', 'id', 'cidr']}
      primaryActions={(ctx) => [createNetworkAction(ctx), quickCreateNetworkAction(ctx)]}
      batchActions={(ctx) => [deleteNetworkAction(ctx)]}
      rowActions={(ctx) => ({
        firstAction: editNetworkAction(ctx),
        moreActions: [{ action: createSubnetAction(ctx) }, { action: deleteNetworkAction(ctx) }],
      })}
    />
  );
}

export default function VpcNetworks() {
  const isAdmin = useIsAdminPage();
  const { hasAdminRole } = useAuthStore();
  const projectMap = useProjectMap();
  const [searchParams, setSearchParams] = useSearchParams();

  if (isAdmin) {
    return <NetworkTable projectMap={projectMap} />;
  }

  const tabs = [
    { key: 'projectNetwork', label: t('Current Project Networks') },
    { key: 'sharedNetwork', label: t('Shared Networks') },
    { key: 'externalNetwork', label: t('External Networks') },
    hasAdminRole && { key: 'allNetwork', label: t('All Networks') },
  ].filter(Boolean);
  const requested = searchParams.get('tab');
  const active = tabs.some((it) => it.key === requested) ? requested : 'projectNetwork';

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb items={[{ title: t('Network') }, { title: t('Networks') }]} style={{ marginBottom: 16, fontSize: 13 }} />
      <div style={{ marginBottom: 12 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t('Networks')}
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
          {t('Software-defined networks (SDN) powered by OpenStack Neutron.')}
        </p>
      </div>
      <Tabs
        activeKey={active}
        onChange={(key) => {
          const next = new URLSearchParams(searchParams);
          next.set('tab', key);
          setSearchParams(next, { replace: true });
        }}
        items={tabs.map((it) => ({
          key: it.key,
          label: it.label,
          children: it.key === active ? <NetworkTable tab={it.key} embedded projectMap={projectMap} /> : null,
        }))}
      />
    </div>
  );
}
