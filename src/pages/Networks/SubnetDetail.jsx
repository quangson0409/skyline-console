/**
 * Subnet detail - port of legacy pages/network/containers/Subnet/Detail (TabDetail: Detail / Ports).
 */
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { neutronApi } from '@/api/neutron';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime, useIsAdminPage } from '@/components/ResourcePage';
import { PortsEmbedded } from '@/pages/Network/Port/PortList';
import { detailPath, yesNoText } from '@/pages/Network/common';
import { t } from '@/core/i18n';
import { editSubnetAction, deleteSubnetAction } from './NetworkParts/actions';
import { fetchNetworkDetail } from './NetworkDetail';

/** Port of SubnetStore.detailDidFetch (inDetail): subnet + its network + ip availability */
const fetchSubnetDetail = async (id, ctx) => {
  const subnet = (await neutronApi.getSubnet(id))?.subnet;
  if (!subnet) return subnet;
  let network = {};
  const networkId = subnet.network_id || ctx.params?.networkId;
  if (networkId) {
    try {
      network = (await fetchNetworkDetail(networkId, ctx)) || {};
    } catch {
      network = {};
    }
  }
  const ipAvailability = (network.subnet_ip_availability || []).find((it) => it.subnet_id === id) || {};
  return { ...subnet, network, ...ipAvailability, name: subnet.name };
};

const lines = (list, fmt) =>
  Array.isArray(list) && list.length ? (
    <div>
      {list.map((it, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={idx}>{fmt(it)}</div>
      ))}
    </div>
  ) : (
    '-'
  );

export default function SubnetDetail() {
  const { networkId } = useParams();
  const isAdminPage = useIsAdminPage();
  const listPath = isAdminPage ? '/network/networks-admin' : '/network/networks';
  const networkPath = detailPath('networks', networkId, isAdminPage);
  return (
    <ResourceDetail
      breadcrumb={[
        t('Network'),
        { title: t('Networks'), path: listPath },
        { title: networkId, path: networkPath },
      ]}
      backPath={networkPath}
      fetch={fetchSubnetDetail}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Project ID'), value: d.project_id || d.tenant_id, copyable: true },
        { label: t('CIDR'), value: d.cidr },
        { label: t('IP Version'), value: d.ip_version },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
        { label: t('Description'), value: d.description },
      ]}
      tabs={(d, { isAdmin, hasAdminRole }) => [
        {
          key: 'detail',
          label: t('Detail'),
          render: () => (
            <>
              <DetailCard
                title={t('Network Info')}
                items={[
                  { label: t('Network Name'), value: d.network?.name },
                  {
                    label: t('Network ID'),
                    value: d.network?.id || d.network_id,
                    render: (v) => (v ? <Link to={detailPath('networks', v, isAdmin)}>{v}</Link> : '-'),
                  },
                ]}
              />
              <DetailCard
                title={t('Base Info')}
                items={[
                  { label: t('Gateway IP'), value: d.gateway_ip },
                  {
                    label: t('Allocation Pools'),
                    value: d.allocation_pools,
                    render: (v) => lines(v, (p) => `${p?.start} - ${p?.end}`),
                  },
                  { label: t('DHCP Enabled'), value: yesNoText(d.enable_dhcp) },
                  {
                    label: t('Host Routes'),
                    value: d.host_routes,
                    render: (v) => lines(v, (r) => `${r?.destination},${r?.nexthop}`),
                  },
                  { label: t('DNS Nameservers'), value: d.dns_nameservers, render: (v) => lines(v, (x) => x) },
                  { label: t('Subnet Pool'), value: d.subnetpool_id },
                  { label: t('IPv6 Address Mode'), value: d.ipv6_address_mode },
                  { label: t('IPv6 RA Mode'), value: d.ipv6_ra_mode },
                ]}
              />
              {hasAdminRole ? (
                <DetailCard
                  title={t('IP Usage')}
                  items={[
                    { label: t('Total IPs'), value: d.total_ips },
                    { label: t('Used IPs'), value: d.used_ips },
                  ]}
                />
              ) : null}
            </>
          ),
        },
        {
          key: 'ports',
          label: t('Ports'),
          render: () => (
            <PortsEmbedded
              filters={{ network_id: d.network_id || networkId, fixed_ips: [`subnet_id=${d.id}`] }}
              networkId={d.network_id || networkId}
              subnetId={d.id}
            />
          ),
        },
      ]}
      actions={(ctx) => ({
        firstAction: editSubnetAction(ctx),
        moreActions: [{ action: deleteSubnetAction(ctx) }],
      })}
    />
  );
}
