import React from 'react';
import { useNavigate } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import { yesNo } from '@/components/ResourcePage';
import { useIsAdminPage } from '@/components/ResourcePage/helpers';
import { t } from '@/core/i18n';
import { fetchPolicyDetail, firewallTabPath } from './helpers';
import { policyActions } from './actions';
import { RuleList } from './FirewallPage';
import { policyTabs } from '../common';

export default function FirewallPolicyDetail() {
  const navigate = useNavigate();
  const isAdminPage = useIsAdminPage();
  return (
    <ResourceDetail
      policy="get_firewall_policy"
      breadcrumb={[
        isAdminPage ? t('Administrator') : t('Network'),
        { title: t('Firewall Policies'), path: firewallTabPath(isAdminPage, 'policies') },
      ]}
      backPath={({ isAdmin }) => firewallTabPath(isAdmin, 'policies')}
      fetch={(id) => fetchPolicyDetail(id)}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Project ID'), value: d.project_id || d.tenant_id },
        { label: t('Description'), value: d.description },
        { label: t('Shared'), value: d.shared, render: () => yesNo(d.shared) },
        { label: t('Audited'), value: d.audited, render: () => yesNo(d.audited) },
      ]}
      tabs={(d) =>
        policyTabs([
          // legacy Firewall/Rule container (get_firewall_rule)
          { key: 'rules', label: t('Policy Rules'), policy: 'get_firewall_rule', render: () => <RuleList policy={d} /> },
        ])
      }
      actions={(ctx) => policyActions({ ...ctx, navigate }).rowActions}
    />
  );
}
