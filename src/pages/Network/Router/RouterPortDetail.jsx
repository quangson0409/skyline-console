import React from 'react';
import { useParams } from 'react-router-dom';
import { neutronApi } from '@/api/neutron';
import ResourceDetail from '@/components/ResourceDetail';
import { formatTime, yesNo } from '@/components/ResourcePage';
import DetailCard from '@/components/DetailCard';
import { t } from '@/core/i18n';
import { adminSuffix, networkLink, networkStatus } from '../common';

const isEmptyObj = (v) => !v || (typeof v === 'object' && !Object.keys(v).length);

const fetchPort = async (id) => {
  const port = (await neutronApi.getPort(id))?.port;
  if (!port) return port;
  const item = { ...port };
  if (item.network_id) {
    try {
      const network = (await neutronApi.getNetwork(item.network_id))?.network;
      item.network = network;
      item.network_name = network?.name;
    } catch {
      // ignore
    }
  }
  return item;
};

function PortBaseDetail({ port, isAdmin }) {
  const dnsAssignment = port.dns_assignment || [];
  const fixedIps = port.fixed_ips || [];
  const portInfo = [
    {
      label: t('Network Name'),
      value: port.network_name,
      render: () => (port.network_id ? networkLink(port.network_id, port.network_name || port.network_id, isAdmin) : '-'),
    },
    { label: t('Network ID'), value: port.network_id, copyable: true },
    { label: t('MAC Address'), value: port.mac_address },
    { label: t('Port Security'), value: port.port_security_enabled, render: () => yesNo(port.port_security_enabled) },
    isAdmin && { label: t('DNS Name'), value: port.dns_name },
    port.mac_state && { label: t('MAC Learning State'), value: port.mac_state },
    port.qos_policy_id && { label: t('QoS Policy ID'), value: port.qos_policy_id },
  ].filter(Boolean);

  const host = dnsAssignment[0] || {};
  const ip = fixedIps[0] || {};
  const binding = [{ label: t('vNIC Type'), value: port['binding:vnic_type'] }];
  if (port['binding:host_id']) {
    binding.push(
      { label: t('Host'), value: port['binding:host_id'] },
      {
        label: t('Profile'),
        value: port['binding:profile'],
        render: (value) =>
          isEmptyObj(value)
            ? '-'
            : Object.keys(value).map((key) => (
                <div key={key}>
                  <b>{key}</b>: <b>{String(value[key])}</b>
                </div>
              )),
      },
      { label: t('VIF Type'), value: port['binding:vif_type'] },
      {
        label: t('VIF Details'),
        value: port['binding:vif_details'],
        render: (value) =>
          isEmptyObj(value)
            ? '-'
            : Object.keys(value).map((key) => (
                <div key={key}>
                  <b>{key}</b> <span>{String(value[key])}</span>
                </div>
              )),
      }
    );
  }

  return (
    <div>
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
            { label: t('Subnet ID'), value: ip.subnet_id, copyable: true },
          ]}
        />
      ) : null}
      {isAdmin ? (
        <DetailCard
          title={t('Attached Device')}
          items={[
            { label: t('Device Owner'), value: port.device_owner },
            { label: t('Device ID'), value: port.device_id, copyable: true },
          ]}
        />
      ) : null}
      <DetailCard title={t('Binding')} items={binding} />
    </div>
  );
}

export default function RouterPortDetail() {
  const { routerId } = useParams();
  return (
    <ResourceDetail
      breadcrumb={[
        t('Network'),
        { title: t('Routers'), path: '/network/router' },
        { title: routerId, path: `/network/router/detail/${routerId}` },
      ]}
      backPath={({ isAdmin }) => `/network/router${adminSuffix(isAdmin)}/detail/${routerId}`}
      fetch={fetchPort}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Name'), value: d.name },
          { label: t('Status'), value: d.status, render: () => networkStatus()[d.status] || d.status || '-' },
          isAdmin && { label: t('Project ID'), value: d.tenant_id || d.project_id, copyable: true },
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) => [
        { key: 'detail', label: t('Detail'), render: () => <PortBaseDetail port={d} isAdmin={isAdmin} /> },
      ]}
    />
  );
}
