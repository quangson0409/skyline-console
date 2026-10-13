import React from 'react';
import { useParams } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import { formatTime, yesNo } from '@/components/ResourcePage';
import { useIsAdminPage } from '@/components/ResourcePage/helpers';
import DetailCard from '@/components/DetailCard';
import { neutronApi } from '@/api/neutron';
import { t } from '@/core/i18n';
import { adminSuffix, networkLink } from '../common';
import { portStatus, firewallTabPath } from './helpers';

/** legacy Router/Port/Detail (PortStore.fetchDetail + detailDidFetch) */
async function fetchPort(id) {
  const item = (await neutronApi.getPort(id))?.port;
  if (!item) return item;
  const detail = { ...item };
  if (item.network_id) {
    try {
      const res = await neutronApi.getNetwork(item.network_id);
      detail.network = res?.network;
      detail.network_name = res?.network?.name;
    } catch {
      // ignore
    }
  }
  return detail;
}

const isEmptyObj = (v) => !v || typeof v !== 'object' || Object.keys(v).length === 0;

/** legacy Router/Port/Detail/BaseDetail cards */
function PortDetailCards({ detail: d, isAdmin }) {
  const portInfo = [
    { label: t('Network Name'), value: d.network_name },
    {
      label: t('Network ID'),
      value: d.network_id,
      render: () => networkLink(d.network_id, d.network_id, isAdmin),
    },
    { label: t('MAC Address'), value: d.mac_address },
    { label: t('Port Security'), value: d.port_security_enabled, render: () => yesNo(d.port_security_enabled) },
    isAdmin ? { label: t('DNS Name'), value: d.dns_name } : null,
    d.mac_state ? { label: t('MAC Learning State'), value: d.mac_state } : null,
    d.qos_policy_id ? { label: t('QoS Policy ID'), value: d.qos_policy_id } : null,
  ].filter(Boolean);

  const dnsAssignment = Array.isArray(d.dns_assignment) ? d.dns_assignment : [];
  const fixedIps = Array.isArray(d.fixed_ips) ? d.fixed_ips : [];
  const host = dnsAssignment[0] || {};
  const ip = fixedIps[0] || {};

  const bind = (k) => d[`binding:${k}`] ?? d[`binding__${k}`];
  let binding = [{ label: t('vNIC Type'), value: bind('vnic_type') }];
  if (bind('host_id')) {
    const profile = bind('profile');
    const vifDetails = bind('vif_details');
    binding = [
      ...binding,
      { label: t('Host'), value: bind('host_id') },
      {
        label: t('Profile'),
        value: profile,
        render: () =>
          isEmptyObj(profile)
            ? '-'
            : Object.keys(profile).map((key) => (
                <div key={key}>
                  <b>{key}</b>: <b>{String(profile[key])}</b>
                </div>
              )),
      },
      { label: t('VIF Type'), value: bind('vif_type') },
      {
        label: t('VIF Details'),
        value: vifDetails,
        render: () =>
          isEmptyObj(vifDetails)
            ? '-'
            : Object.keys(vifDetails).map((key) => (
                <div key={key}>
                  <b>{key}</b> <span>{String(vifDetails[key])}</span>
                </div>
              )),
      },
    ];
  }

  return (
    <>
      <DetailCard title={t('Port Info')} items={portInfo} />
      {dnsAssignment.length > 0 ? (
        <DetailCard
          title={t('DNS Assignment')}
          items={[
            { label: t('Hostname'), value: host.hostname },
            { label: t('IP Address'), value: host.ip_address },
          ]}
        />
      ) : null}
      {fixedIps.length > 0 ? (
        <DetailCard
          title={t('Fixed IPs')}
          items={[
            { label: t('IP Address'), value: ip.ip_address },
            { label: t('Subnet ID'), value: ip.subnet_id },
          ]}
        />
      ) : null}
      {isAdmin ? (
        <DetailCard
          title={t('Attached Device')}
          items={[
            { label: t('Device Owner'), value: d.device_owner },
            { label: t('Device ID'), value: d.device_id },
          ]}
        />
      ) : null}
      <DetailCard title={t('Binding')} items={binding} />
    </>
  );
}

export default function FirewallPortDetail() {
  const { firewallId } = useParams();
  const isAdminPage = useIsAdminPage();
  const firewallDetailPath = (isAdmin) => `/network/firewall${adminSuffix(isAdmin)}/detail/${firewallId}`;
  return (
    <ResourceDetail
      breadcrumb={[
        isAdminPage ? t('Administrator') : t('Network'),
        { title: t('Firewalls'), path: firewallTabPath(isAdminPage) },
        { title: firewallId, path: firewallDetailPath(isAdminPage) },
      ]}
      backPath={({ isAdmin }) => firewallDetailPath(isAdmin)}
      fetch={(id) => fetchPort(id)}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Name'), value: d.name },
          { label: t('Status'), value: d.status, render: () => portStatus()[d.status] || d.status || '-' },
          isAdmin ? { label: t('Project ID'), value: d.tenant_id || d.project_id } : null,
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) => [
        { key: 'detail', label: t('Detail'), render: () => <PortDetailCards detail={d} isAdmin={isAdmin} /> },
      ]}
    />
  );
}
