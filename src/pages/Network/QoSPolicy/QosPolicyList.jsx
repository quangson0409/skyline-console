import React from 'react';
import { Breadcrumb, Card, Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import ResourcePage, { useIsAdminPage } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import {
  qosPolicyColumns,
  qosPolicyFilters,
  fetchQosPolicies,
  fetchQosPoliciesPage,
  createQosPolicyAction,
  deleteQosPolicyAction,
  qosRowActions,
} from './helpers';

export * from './helpers';

const DESCRIPTION = 'QoS policies limit bandwidth and set DSCP marks on ports, networks and floating IPs.';

/**
 * One QoS policy table. Legacy QoSPolicy.jsx: `tab` = 'project' | 'shared' | 'all' on the
 * tenant page (TabList), undefined on the admin page.
 */
function QosPolicyTable({ tab, embedded }) {
  const projectMap = useProjectMap();
  const { hasAdminRole } = useAuthStore();
  const isProjectTab = tab === 'project';
  const isShared = tab === 'shared';
  // legacy: admin page -> actionConfigs, project tab -> consoleActions, other tabs -> no actions
  const canAct = (isAdmin) => isAdmin || isProjectTab;

  return (
    <ResourcePage
      embedded={embedded}
      policy="get_policy"
      aliasPolicy="neutron:get_policy"
      title={t('QoS Policies')}
      breadcrumb={[t('Network'), t('QoS Policies')]}
      description={t(DESCRIPTION)}
      deps={[tab]}
      fetch={({ projectId }) => fetchQosPolicies({ tab, projectId })}
      serverSide={{ defaultSortKey: 'name', fetchPage: (args) => fetchQosPoliciesPage({ ...args, tab }) }}
      columns={({ isAdmin }) => qosPolicyColumns({ isAdmin, showProject: isAdmin || tab === 'all', projectMap })}
      filterParams={qosPolicyFilters({ shared: isShared, hasAdminRole })}
      primaryActions={({ isAdmin, projectId }) =>
        canAct(isAdmin) ? [createQosPolicyAction({ isAdmin, projectId })] : []
      }
      batchActions={({ isAdmin }) => (canAct(isAdmin) ? [deleteQosPolicyAction()] : [])}
      rowActions={({ isAdmin }) => (canAct(isAdmin) ? qosRowActions({ isAdmin }) : undefined)}
    />
  );
}

export default function QosPolicyList() {
  const isAdmin = useIsAdminPage();
  const { hasAdminRole } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  if (isAdmin) {
    return <QosPolicyTable />;
  }

  const tabs = [
    { key: 'project', label: t('Current Project QoS Policies') },
    { key: 'shared', label: t('Shared QoS Policies') },
    ...(hasAdminRole ? [{ key: 'all', label: t('All QoS Policies') }] : []),
  ];
  const requested = searchParams.get('tab');
  const active = tabs.some((x) => x.key === requested) ? requested : 'project';

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb items={[{ title: t('Network') }, { title: t('QoS Policies') }]} style={{ marginBottom: 16, fontSize: 13 }} />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t('QoS Policies')}
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>{t(DESCRIPTION)}</p>
      </div>
      <Card variant="borderless" style={{ borderRadius: 8 }}>
        <Tabs
          activeKey={active}
          onChange={(key) => setSearchParams(key === 'project' ? {} : { tab: key })}
          destroyOnHidden
          items={tabs.map((tab) => ({
            key: tab.key,
            label: tab.label,
            children: <QosPolicyTable tab={tab.key} embedded />,
          }))}
        />
      </Card>
    </div>
  );
}
