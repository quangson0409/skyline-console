/** IPsec Site Connection detail (legacy containers/VPN/IPsecSiteConnection/Detail) */
import React from 'react';
import { neutronApi } from '@/api/neutron';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { vpnStatus, renderLifetime, dash } from './helpers';
import { ipsecSiteConnectionRowActions } from './IpsecSiteConnectionsTab';

const vpnListPath = (isAdmin) => `/network/vpn${isAdmin ? '-admin' : ''}?tab=ipsec_site_connections`;

/** legacy fetchDetailWithPolicyDetail: connection + its IKE / IPsec policy details */
const fetchDetail = async (id) => {
  const detail = (await neutronApi.getIpsecSiteConnection(id))?.ipsec_site_connection;
  if (!detail) return detail;
  const [ikeDetail, ipsecDetail] = await Promise.all([
    detail.ikepolicy_id
      ? neutronApi
          .getIkePolicy(detail.ikepolicy_id)
          .then((r) => r?.ikepolicy)
          .catch(() => undefined)
      : undefined,
    detail.ipsecpolicy_id
      ? neutronApi
          .getIpsecPolicy(detail.ipsecpolicy_id)
          .then((r) => r?.ipsecpolicy)
          .catch(() => undefined)
      : undefined,
  ]);
  return { ...detail, ikeDetail: ikeDetail || {}, ipsecDetail: ipsecDetail || {} };
};

const ikeItems = (d = {}) => [
  { label: t('Name'), value: d.name },
  { label: t('Description'), value: d.description || '-' },
  { label: t('Auth Algorithm'), value: d.auth_algorithm },
  { label: t('Encryption Algorithm'), value: d.encryption_algorithm },
  { label: t('IKE Version'), value: d.ike_version },
  { label: t('Lifetime'), value: d.lifetime, render: renderLifetime },
  { label: t('PFS'), value: d.pfs },
];

const ipsecItems = (d = {}) => [
  { label: t('Name'), value: d.name },
  { label: t('Description'), value: d.description },
  { label: t('Auth Algorithm'), value: d.auth_algorithm },
  { label: t('Encapsulation Mode'), value: d.encapsulation_mode },
  { label: t('Encryption Algorithm'), value: d.encryption_algorithm },
  { label: t('Transform Protocol'), value: d.transform_protocol },
  { label: t('Lifetime'), value: d.lifetime, render: renderLifetime },
  { label: t('PFS'), value: d.pfs },
];

const advancedItems = (d = {}) => [
  { label: t('MTU'), value: d.mtu },
  { label: t('Initiator Mode'), value: d.initiator },
  { label: t('DPD Action'), value: d.dpd?.action },
  { label: t('DPD Interval (s)'), value: d.dpd?.interval },
  { label: t('DPD timeout (s)'), value: d.dpd?.timeout },
];

export default function IpsecSiteConnectionDetail() {
  return (
    <ResourceDetail
      breadcrumb={[
        t('Network'),
        { title: t('VPN'), path: '/network/vpn?tab=ipsec_site_connections' },
        t('IPsec Site Connection'),
      ]}
      backPath={({ isAdmin }) => vpnListPath(isAdmin)}
      fetch={fetchDetail}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Name'), value: d.name },
          isAdmin && { label: t('Project ID'), value: d.project_id, copyable: true },
          { label: t('VPN Service ID'), value: d.vpnservice_id, copyable: true },
          { label: t('Status'), value: d.status, render: (v) => (v ? vpnStatus()[v] || v : '-') },
          { label: t('Local Endpoint Group ID'), value: d.local_ep_group_id },
          { label: t('Peer Endpoint Group ID'), value: d.peer_ep_group_id },
          { label: t('Peer Address'), value: d.peer_address },
          { label: t('Peer ID'), value: d.peer_id },
          { label: t('Admin State'), value: d.admin_state_up, render: (v) => (v ? t('Yes') : t('No')) },
          { label: t('Description'), value: dash(d.description) },
          d.created_at && { label: t('Created At'), value: formatTime(d.created_at) },
        ].filter(Boolean)
      }
      tabs={() => [
        {
          key: 'detail',
          label: t('Detail'),
          render: (d) => (
            <div>
              <DetailCard title={t('IKE Policy')} items={ikeItems(d.ikeDetail)} column={{ xs: 1, sm: 2 }} />
              <DetailCard title={t('IPsec Policy')} items={ipsecItems(d.ipsecDetail)} column={{ xs: 1, sm: 2 }} />
              <DetailCard title={t('Advanced Options')} items={advancedItems(d)} column={{ xs: 1, sm: 2 }} />
            </div>
          ),
        },
      ]}
      actions={(ctx) => ipsecSiteConnectionRowActions(ctx)}
    />
  );
}
