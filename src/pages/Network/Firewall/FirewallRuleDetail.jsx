import React from 'react';
import { useNavigate } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import { yesNo } from '@/components/ResourcePage';
import { useIsAdminPage } from '@/components/ResourcePage/helpers';
import DetailCard from '@/components/DetailCard';
import { t } from '@/core/i18n';
import { fetchRuleDetail, firewallTabPath, protocolInfos, actionInfos, policyLink, linkList } from './helpers';
import { ruleActions } from './actions';

export default function FirewallRuleDetail() {
  const navigate = useNavigate();
  const isAdminPage = useIsAdminPage();
  return (
    <ResourceDetail
      breadcrumb={[
        isAdminPage ? t('Administrator') : t('Network'),
        { title: t('Firewall Rules'), path: firewallTabPath(isAdminPage, 'rules') },
      ]}
      backPath={({ isAdmin }) => firewallTabPath(isAdmin, 'rules')}
      fetch={(id) => fetchRuleDetail(id)}
      statusField="__none__"
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Project ID'), value: d.tenant_id || d.project_id },
        { label: t('Description'), value: d.description },
      ]}
      tabs={(d, { isAdmin }) => [
        {
          key: 'base',
          label: t('Base Info'),
          render: () => (
            <DetailCard
              title={t('Base Info')}
              items={[
                {
                  label: t('Related Policy'),
                  value: d.policies,
                  render: () => linkList(d.policies, policyLink, isAdmin),
                },
                { label: t('Source IP'), value: d.source_ip_address },
                { label: t('Source Port'), value: d.source_port },
                { label: t('Destination IP'), value: d.destination_ip_address },
                { label: t('Destination Port'), value: d.destination_port },
                {
                  label: t('Rule Action'),
                  value: d.action,
                  render: () => actionInfos()[d.action] || d.action || '-',
                },
                { label: t('Enabled'), value: d.enabled, render: () => yesNo(d.enabled) },
                { label: t('Shared Rule'), value: d.shared, render: () => yesNo(d.shared) },
                {
                  label: t('Protocol'),
                  value: d.protocol,
                  render: () => protocolInfos()[d.protocol] || d.protocol || '-',
                },
                { label: t('IP Version'), value: d.ip_version ? `IPv${d.ip_version}` : undefined },
              ]}
            />
          ),
        },
      ]}
      actions={(ctx) => ruleActions({ ...ctx, navigate }).rowActions}
    />
  );
}
