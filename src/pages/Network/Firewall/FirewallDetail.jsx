import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsAdminPage } from '@/components/ResourcePage/helpers';
import { useProjectMap } from '@/hooks/useProjectMap';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { textColumn, nameColumn, statusColumn } from '@/components/ResourcePage';
import DetailCard from '@/components/DetailCard';
import { t } from '@/core/i18n';
import { adminSuffix } from '../common';
import {
  firewallStatus,
  adminState,
  portStatus,
  mapOptions,
  fetchFirewallDetail,
  fetchFirewallPorts,
  firewallTabPath,
  policyLink,
  networkLink,
  routerLink,
} from './helpers';
import { firewallActions } from './actions';

/** legacy Firewall/Detail/Port.jsx */
function FirewallPorts({ detail }) {
  return (
    <ResourcePage
      embedded
      fetch={() => fetchFirewallPorts(detail.ports)}
      deps={[detail]}
      columns={({ isAdmin }) => [
        nameColumn({
          width: 150,
          linkTo: (r) => `/network/firewall${adminSuffix(isAdmin)}/${detail.id}/port/${r.id}`,
        }),
        {
          title: t('Network ID/Name'),
          dataIndex: 'network_name',
          key: 'network_name',
          render: (v, r) => networkLink(r.network?.id || r.network_id, v, isAdmin),
        },
        textColumn(t('Owner'), 'owner', { render: (v, r) => v || r.device_owner || '-' }),
        {
          title: t('Device ID/Name'),
          dataIndex: 'router_name',
          key: 'router_name',
          render: (v, r) => (r.router ? routerLink(r.router.id, v, isAdmin) : '-'),
        },
        statusColumn({ textMap: portStatus() }),
      ]}
      filterParams={[
        { label: t('Network'), name: 'network_name' },
        { label: t('Device'), name: 'router_name' },
        { label: t('Status'), name: 'status', options: mapOptions(portStatus()) },
      ]}
    />
  );
}

export default function FirewallDetail() {
  const navigate = useNavigate();
  const isAdminPage = useIsAdminPage();
  const projectMap = useProjectMap();
  return (
    <ResourceDetail
      breadcrumb={[
        isAdminPage ? t('Administrator') : t('Network'),
        { title: t('Firewalls'), path: firewallTabPath(isAdminPage) },
      ]}
      backPath={({ isAdmin }) => firewallTabPath(isAdmin)}
      fetch={(id) => fetchFirewallDetail(id)}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Name'), value: d.name },
          isAdmin ? { label: t('Project ID'), value: d.tenant_id || d.project_id } : null,
          {
            label: t('Status'),
            value: d.status,
            render: () => firewallStatus()[d.status] || d.status || '-',
          },
          { label: t('Description'), value: d.description },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) => [
        {
          key: 'base',
          label: t('Base Info'),
          render: () => (
            <DetailCard
              title={t('Base Info')}
              items={[
                { label: t('Ingress Policy ID'), value: d.ingress_firewall_policy_id },
                {
                  label: t('Ingress Policy Name'),
                  value: d.ingress?.name,
                  render: () =>
                    d.ingress ? policyLink(d.ingress_firewall_policy_id, d.ingress.name, isAdmin) : '-',
                },
                { label: t('Egress Policy ID'), value: d.egress_firewall_policy_id },
                {
                  label: t('Egress Policy Name'),
                  value: d.egress?.name,
                  render: () => (d.egress ? policyLink(d.egress_firewall_policy_id, d.egress.name, isAdmin) : '-'),
                },
                {
                  label: t('Admin State'),
                  value: d.admin_state_up,
                  render: () => (d.admin_state_up === undefined ? '-' : adminState()[String(d.admin_state_up)]),
                },
              ]}
            />
          ),
        },
        { key: 'ports', label: t('Ports'), render: () => <FirewallPorts detail={d} /> },
      ]}
      actions={(ctx) => firewallActions({ ...ctx, navigate, projectMap }).rowActions}
    />
  );
}
