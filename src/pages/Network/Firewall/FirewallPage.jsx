import React from 'react';
import { Breadcrumb, Card, Result, Tabs } from 'antd';
import { hasEndpoint } from '@/api/endpoints';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ResourcePage, { nameColumn, statusColumn, textColumn, projectColumn, yesNo, IdNameCell } from '@/components/ResourcePage';
import { useIsAdminPage } from '@/components/ResourcePage/helpers';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { detailPath } from '../common';
import {
  firewallStatus,
  adminState,
  protocolInfos,
  actionInfos,
  mapOptions,
  yesNoOptions,
  defaultFilter,
  fetchFirewalls,
  fetchPolicies,
  fetchRules,
  fetchRulesByPolicy,
  idNameList,
} from './helpers';
import { firewallActions, policyActions, ruleActions } from './actions';

const dash = (v) => (v === undefined || v === null || v === '' ? '-' : String(v));

/* ------------------------------ Firewalls ------------------------------ */
export function FirewallList() {
  const navigate = useNavigate();
  const isAdmin = useIsAdminPage();
  const projectMap = useProjectMap();
  const actionsOf = (ctx) => firewallActions({ ...ctx, navigate, projectMap });
  return (
    <ResourcePage
      policy="get_firewall_group"
      embedded
      fetch={fetchFirewalls}
      columns={({ isAdmin }) =>
        [
          nameColumn({ linkTo: (r) => detailPath('firewall', r.id, isAdmin) }),
          isAdmin ? projectColumn(projectMap) : null,
          textColumn(t('Description'), 'description'),
          {
            title: t('Ingress Policy'),
            dataIndex: 'ingressPolicyName',
            key: 'ingressPolicyName',
            render: (v, r) =>
              r.ingress_firewall_policy_id ? (
                <IdNameCell
                  id={r.ingress_firewall_policy_id}
                  name={v}
                  href={detailPath('firewall-policy', r.ingress_firewall_policy_id, isAdmin)}
                  bold={false}
                />
              ) : (
                '-'
              ),
          },
          {
            title: t('Egress Policy'),
            dataIndex: 'egressPolicyName',
            key: 'egressPolicyName',
            render: (v, r) =>
              r.egress_firewall_policy_id ? (
                <IdNameCell
                  id={r.egress_firewall_policy_id}
                  name={v}
                  href={detailPath('firewall-policy', r.egress_firewall_policy_id, isAdmin)}
                  bold={false}
                />
              ) : (
                '-'
              ),
          },
          {
            title: t('Associated Ports'),
            dataIndex: 'ports',
            key: 'ports',
            render: (v) => (Array.isArray(v) ? v.length : 0),
          },
          statusColumn({ textMap: firewallStatus() }),
          {
            title: t('Admin State'),
            dataIndex: 'admin_state_up',
            key: 'admin_state_up',
            render: (v) => (v === undefined ? '-' : adminState()[String(v)]),
          },
        ].filter(Boolean)
      }
      filterParams={[
        { label: t('Name'), name: 'name' },
        { label: t('Status'), name: 'status', options: mapOptions(firewallStatus()) },
        { label: t('Admin State'), name: 'admin_state_up', options: mapOptions(adminState()) },
        defaultFilter(t('Hide Default Firewalls')),
        // legacy List adminPageHasProjectFilter
        isAdmin && { label: t('Project ID'), name: 'project_id' },
      ].filter(Boolean)}
      // legacy Firewall list initFilter { notDefault: true }: default firewalls hidden on first load
      initialFilters={{ notDefault: 'true' }}
      primaryActions={(ctx) => actionsOf(ctx).primaryActions}
      batchActions={(ctx) => actionsOf(ctx).batchActions}
      rowActions={(ctx) => actionsOf(ctx).rowActions}
    />
  );
}

/* ------------------------------- Policies ------------------------------ */
export function PolicyList() {
  const navigate = useNavigate();
  const isAdmin = useIsAdminPage();
  const projectMap = useProjectMap();
  const actionsOf = (ctx) => policyActions({ ...ctx, navigate });
  return (
    <ResourcePage
      policy="get_firewall_policy"
      embedded
      fetch={fetchPolicies}
      columns={({ isAdmin }) =>
        [
          nameColumn({ linkTo: (r) => detailPath('firewall-policy', r.id, isAdmin) }),
          isAdmin ? projectColumn(projectMap) : null,
          textColumn(t('Description'), 'description'),
          {
            title: t('Rules'),
            dataIndex: 'rules',
            key: 'rules',
            render: (v) => idNameList(v, 'firewall-rule', isAdmin),
          },
          {
            title: t('Firewalls'),
            dataIndex: 'firewalls',
            key: 'firewalls',
            render: (v) => idNameList(v, 'firewall', isAdmin),
          },
          { title: t('Shared'), dataIndex: 'shared', key: 'shared', width: 80, render: yesNo },
          { title: t('Audited'), dataIndex: 'audited', key: 'audited', width: 100, render: yesNo },
        ].filter(Boolean)
      }
      filterParams={[
        { label: t('Name'), name: 'name' },
        { label: t('Shared'), name: 'shared', options: yesNoOptions() },
        { label: t('Audited'), name: 'audited', options: yesNoOptions() },
        defaultFilter(t('Hide Default Policies')),
        isAdmin && { label: t('Project ID'), name: 'project_id' },
      ].filter(Boolean)}
      primaryActions={(ctx) => actionsOf(ctx).primaryActions}
      batchActions={(ctx) => actionsOf(ctx).batchActions}
      rowActions={(ctx) => actionsOf(ctx).rowActions}
    />
  );
}

/* -------------------------------- Rules -------------------------------- */
export const ruleColumns = ({ isAdmin, projectMap }) =>
  [
    nameColumn({ linkTo: (r) => detailPath('firewall-rule', r.id, isAdmin) }),
    isAdmin ? projectColumn(projectMap) : null,
    textColumn(t('Description'), 'description'),
    {
      title: t('Related Policy'),
      dataIndex: 'policies',
      key: 'policies',
      render: (v) => idNameList(v, 'firewall-policy', isAdmin),
    },
    { title: t('Protocol'), dataIndex: 'protocol', key: 'protocol', render: (v) => protocolInfos()[v] || dash(v) },
    textColumn(t('Source IP'), 'source_ip_address'),
    textColumn(t('Source Port'), 'source_port'),
    textColumn(t('Destination IP'), 'destination_ip_address'),
    textColumn(t('Destination Port'), 'destination_port'),
    { title: t('Rule Action'), dataIndex: 'action', key: 'action', render: (v) => actionInfos()[v] || dash(v) },
    { title: t('Enabled'), dataIndex: 'enabled', key: 'enabled', render: yesNo },
    { title: t('Shared Rule'), dataIndex: 'shared', key: 'shared', render: yesNo },
  ].filter(Boolean);

export const ruleFilters = () => [
  { label: t('Rule Name'), name: 'name' },
  { label: t('Protocol'), name: 'protocol', options: mapOptions(protocolInfos()) },
  { label: t('Rule Action'), name: 'action', options: mapOptions(actionInfos()) },
  { label: t('Enabled'), name: 'enabled', options: yesNoOptions() },
  { label: t('Shared Rule'), name: 'shared', options: yesNoOptions() },
  defaultFilter(t('Hide Default Rules')),
];

/** policy: when given, lists the rules of that policy (legacy Rule list inside Policy detail) */
export function RuleList({ policy }) {
  const navigate = useNavigate();
  const isAdmin = useIsAdminPage();
  const projectMap = useProjectMap();
  const inDetail = !!policy;
  const actionsOf = (ctx) => ruleActions({ ...ctx, navigate }, inDetail);
  return (
    <ResourcePage
      policy="get_firewall_rule"
      embedded
      fetch={(ctx) => (inDetail ? fetchRulesByPolicy(policy.firewall_rules) : fetchRules(ctx))}
      deps={[policy]}
      columns={(ctx) => ruleColumns({ ...ctx, projectMap })}
      filterParams={[...ruleFilters(), isAdmin && { label: t('Project ID'), name: 'project_id' }].filter(Boolean)}
      primaryActions={(ctx) => actionsOf(ctx).primaryActions}
      batchActions={(ctx) => actionsOf(ctx).batchActions}
      rowActions={(ctx) => actionsOf(ctx).rowActions}
    />
  );
}

/* --------------------------------- Page -------------------------------- */
const TAB_KEYS = ['firewalls', 'policies', 'rules'];

export default function FirewallPage() {
  const isAdmin = useIsAdminPage();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TAB_KEYS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'firewalls';
  // legacy checkEndpoint: the page requires the neutron_firewall endpoint
  if (!hasEndpoint('neutron_firewall')) {
    return <Result status="warning" title={t('Firewalls')} subTitle={t('The service is not available (no endpoint found).')} />;
  }

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb
        items={[{ title: isAdmin ? t('Administrator') : t('Network') }, { title: t('Firewalls') }]}
        style={{ marginBottom: 16, fontSize: 13 }}
      />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t('Firewalls')}
        </h1>
      </div>
      <Card variant="borderless" style={{ borderRadius: 8 }}>
        <Tabs
          activeKey={tab}
          onChange={(key) => setSearchParams({ tab: key }, { replace: true })}
          destroyOnHidden
          items={[
            { key: 'firewalls', label: t('Firewalls'), children: <FirewallList /> },
            { key: 'policies', label: t('Firewall Policies'), children: <PolicyList /> },
            { key: 'rules', label: t('Firewall Rules'), children: <RuleList /> },
          ]}
        />
      </Card>
    </div>
  );
}
