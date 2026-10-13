/**
 * VPN (legacy containers/VPN TabList) - /network/vpn and /network/vpn-admin.
 * One antd Tabs page, each tab an embedded ResourcePage; active tab synced with ?tab=.
 */
import React from 'react';
import { Breadcrumb, Card, Result, Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { hasEndpoint } from '@/api/endpoints';
import { useTranslation } from '@/core/i18n';
import VpnServicesTab from './VpnServicesTab';
import EndpointGroupsTab from './EndpointGroupsTab';
import { IkePoliciesTab, IpsecPoliciesTab } from './PolicyTabs';
import IpsecSiteConnectionsTab from './IpsecSiteConnectionsTab';

const tabDefs = (t) => [
  { key: 'vpn_gateway', label: t('VPN Gateways'), Component: VpnServicesTab },
  { key: 'vpn_endpoint_groups', label: t('VPN Endpoint Groups'), Component: EndpointGroupsTab },
  { key: 'ike_policy', label: t('IKE Policies'), Component: IkePoliciesTab },
  { key: 'ipsec_policy', label: t('IPsec Policies'), Component: IpsecPoliciesTab },
  { key: 'ipsec_site_connections', label: t('IPsec Site Connections'), Component: IpsecSiteConnectionsTab },
];

export default function VpnPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = tabDefs(t);
  const requested = searchParams.get('tab');
  const activeKey = tabs.some((tab) => tab.key === requested) ? requested : tabs[0].key;
  // legacy checkEndpoint: the page requires the neutron_vpn endpoint
  const endpointError = !hasEndpoint('neutron_vpn');

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb items={[{ title: t('Network') }, { title: t('VPN') }]} style={{ marginBottom: 16, fontSize: 13 }} />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t('VPN')}
        </h1>
      </div>
      {endpointError ? (
        <Result status="warning" title={t('VPN')} subTitle={t('The service is not available (no endpoint found).')} />
      ) : (
        <Card variant="borderless" style={{ borderRadius: 8 }}>
          <Tabs
            activeKey={activeKey}
            onChange={(key) => {
              const next = new URLSearchParams(searchParams);
              next.set('tab', key);
              setSearchParams(next, { replace: true });
            }}
            items={tabs.map(({ key, label, Component }) => ({
              key,
              label,
              children: key === activeKey ? <Component /> : null,
            }))}
          />
        </Card>
      )}
    </div>
  );
}
