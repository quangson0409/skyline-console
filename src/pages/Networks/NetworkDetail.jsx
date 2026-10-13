/**
 * Network detail - port of legacy pages/network/containers/Network/Detail (TabDetail:
 * Detail / Subnets / Ports) incl. admin DHCP agents, project name and IP usage.
 */
import React from 'react';
import { neutronApi } from '@/api/neutron';
import { keystoneApi } from '@/api/keystone';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime, useIsAdminPage } from '@/components/ResourcePage';
import { PortsEmbedded } from '@/pages/Network/Port/PortList';
import { networkStatus, yesNoText } from '@/pages/Network/common';
import { t } from '@/core/i18n';
import { editNetworkAction, createSubnetAction, deleteNetworkAction } from './NetworkParts/actions';
import { SubnetsEmbedded } from './NetworkParts/SubnetTab';
import { sumTotalIps } from './NetworkParts/utils';

const listText = (v) => (Array.isArray(v) ? v.join(', ') : v);

/** Port of NetworkStore.fetchDetailWithAvailabilityAndUsage */
export const fetchNetworkDetail = async (id, { isAdmin, hasAdminRole }) => {
  const network = (await neutronApi.getNetwork(id))?.network;
  if (!network) return network;
  let dhcpAgents;
  let projectName = '';
  if (isAdmin) {
    try {
      const ext = await neutronApi.listExtensions();
      const supported = (ext?.extensions || []).some((it) => it.alias === 'dhcp_agent_scheduler');
      if (supported && hasAdminRole) {
        dhcpAgents = ((await neutronApi.listNetworkDhcpAgents(id))?.agents || []).length;
      }
    } catch {
      // ignore
    }
    const pid = network.tenant_id || network.project_id;
    if (pid) {
      try {
        projectName = (await keystoneApi.getProject(pid))?.project?.name || '';
      } catch {
        // ignore
      }
    }
  }
  let detail = { ...network, dhcp_agents: dhcpAgents ?? 0, projectName };
  if (hasAdminRole) {
    try {
      const used = (await neutronApi.getNetworkIpAvailability(id))?.network_ip_availability;
      if (used) {
        detail = {
          ...detail,
          ...used,
          name: network.name,
          total_ips: sumTotalIps(used.subnet_ip_availability),
        };
      }
    } catch {
      // ignore
    }
  }
  return detail;
};

export const networkActions = (ctx) => ({
  firstAction: editNetworkAction(ctx),
  moreActions: [{ action: createSubnetAction(ctx) }, { action: deleteNetworkAction(ctx) }],
});

export default function NetworkDetail() {
  const isAdminPage = useIsAdminPage();
  const listPath = isAdminPage ? '/network/networks-admin' : '/network/networks';
  return (
    <ResourceDetail
      breadcrumb={[t('Network'), { title: t('Networks'), path: listPath }]}
      backPath={listPath}
      fetch={fetchNetworkDetail}
      info={(d, { isAdmin, hasAdminRole }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Network Name'), value: d.name },
          { label: t('Project ID'), value: d.project_id || d.tenant_id, copyable: true },
          isAdmin && { label: t('Project Name'), value: d.projectName },
          { label: t('Status'), value: d.status, render: () => networkStatus()[d.status] || d.status || '-' },
          hasAdminRole && { label: t('Total IPs'), value: d.total_ips },
          hasAdminRole && { label: t('Used IPs'), value: d.used_ips },
          { label: t('Admin State'), value: yesNoText(d.admin_state_up) },
          { label: t('Shared Network'), value: yesNoText(d.shared) },
          isAdmin && { label: t('DHCP Agents'), value: d.dhcp_agents },
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
          { label: t('Description'), value: d.description },
        ].filter(Boolean)
      }
      tabs={(d) => [
        {
          key: 'detail',
          label: t('Detail'),
          render: () => (
            <DetailCard
              title={t('Base Info')}
              items={[
                { label: t('Availability Zone'), value: listText(d.availability_zones) },
                { label: t('Availability Zone Hints'), value: listText(d.availability_zone_hints) },
                { label: t('MTU'), value: d.mtu },
                { label: t('Router External'), value: yesNoText(d['router:external']) },
                { label: t('Provider Network Type'), value: d['provider:network_type'] },
                { label: t('Provider Physical Network'), value: d['provider:physical_network'] || '-' },
                { label: t('Segmentation ID'), value: d['provider:segmentation_id'] },
                { label: t('Port Security'), value: yesNoText(d.port_security_enabled) },
                { label: t('QoS Policy'), value: d.qos_policy_id || '-' },
              ]}
            />
          ),
        },
        {
          key: 'subnets',
          label: t('Subnets'),
          render: () => <SubnetsEmbedded network={d} />,
        },
        {
          key: 'ports',
          label: t('Ports'),
          render: () => <PortsEmbedded filters={{ network_id: d.id }} networkId={d.id} />,
        },
      ]}
      actions={(ctx) => networkActions(ctx)}
    />
  );
}
