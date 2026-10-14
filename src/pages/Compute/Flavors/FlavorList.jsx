import React, { useEffect, useState } from 'react';
import { Tabs } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ResourcePage from '@/components/ResourcePage';
import { KpiCards } from '@/components/MetricCards';
import { t } from '@/core/i18n';
import {
  fetchFlavors,
  fetchSkylineSettings,
  flavorArchitectures,
  flavorRowActions,
  deleteFlavorAction,
  getAllArchitecture,
  getColumnsByTab,
  getFlavorFilters,
} from './helpers';

/**
 * Flavors - port of legacy pages/compute/containers/Flavor (TabList of architectures:
 * x86 / Heterogeneous / Bare Metal / ARM / Custom) plus an "All Flavors" tab.
 * Tenant page (compute/flavor) is read-only; admin page (compute/flavor-admin) has the actions.
 */
export default function FlavorList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [architectures, setArchitectures] = useState(null);
  const [stats, setStats] = useState({ total: 0, pub: 0, priv: 0 });

  useEffect(() => {
    let alive = true;
    fetchSkylineSettings().then((settings) => {
      if (alive) setArchitectures([...getAllArchitecture(settings), 'all']);
    });
    return () => {
      alive = false;
    };
  }, []);

  const archList = architectures || [];
  const requested = searchParams.get('tab');
  const tab = archList.includes(requested) ? requested : archList[0];
  const archNames = flavorArchitectures();
  let tabName = '';
  if (tab === 'custom') tabName = `${t('Custom')} ${t('Flavors')}`;
  else if (tab === 'all') tabName = archNames.all;
  else if (tab) tabName = `${archNames[tab] || tab} ${t('Flavors')}`;

  const createAction = {
    id: 'flavor-create',
    type: 'custom',
    policy: 'os_compute_api:os-flavor-manage:create',
    title: t('Create Flavor'),
    icon: <PlusOutlined />,
    onExecute: () =>
      navigate(`/compute/flavor-admin/create${tab && !['custom', 'all'].includes(tab) ? `?tab=${tab}` : ''}`),
  };

  const header = (
    <>
      <KpiCards
        items={[
          { title: t('Total Flavors'), value: stats.total },
          { title: t('Public Flavors'), value: stats.pub, color: '#10b981' },
          { title: t('Private Flavors'), value: stats.priv, color: '#8b5cf6' },
        ]}
      />
      {archList.length ? (
        <Tabs
          activeKey={tab}
          onChange={(key) => setSearchParams({ tab: key }, { replace: true })}
          items={archList.map((key) => ({ key, label: archNames[key] || key }))}
          style={{ marginBottom: 4 }}
        />
      ) : null}
    </>
  );

  return (
    <ResourcePage
      title={t('Flavors')}
      policy="os_compute_api:os-flavor-extra-specs:index"
      breadcrumb={[t('Compute'), t('Flavors')]}
      description={tabName || t('Manage virtual hardware configurations (vCPU, RAM, and Disk storage).')}
      deps={[tab]}
      fetch={async (ctx) => {
        if (!tab) return [];
        const all = await fetchFlavors({ isAdmin: ctx.isAdmin });
        const pub = all.filter((it) => it.is_public).length;
        setStats({ total: all.length, pub, priv: all.length - pub });
        return tab === 'all' ? all : all.filter((it) => it.architecture === tab);
      }}
      header={header}
      columns={(ctx) => getColumnsByTab(tab, ctx)}
      filterParams={getFlavorFilters(tab)}
      primaryActions={(ctx) => (ctx.isAdmin && tab !== 'custom' ? [createAction] : [])}
      batchActions={(ctx) => (ctx.isAdmin ? [deleteFlavorAction()] : [])}
      rowActions={(ctx) => (ctx.isAdmin ? flavorRowActions() : undefined)}
    />
  );
}
