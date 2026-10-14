import React from 'react';
import { Link } from 'react-router-dom';
import { neutronApi } from '@/api/neutron';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { formatTime, useIsAdminPage } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { detailPath, networkLink, portLink, policyTabs } from '@/pages/Network/common';
import { fetchPfwEnabled, floatingIpStatus, portForwardingProtocols, qosEnabled } from './helpers';
import {
  associateAction,
  createPortForwardingAction,
  deletePortForwardingAction,
  disassociateAction,
  editFloatingIpAction,
  editPortForwardingAction,
  releaseAction,
} from './actions';
import { PortForwardingPopover } from './FloatingIpList';

const fetchDetail = async (id) => {
  const fip = (await neutronApi.getFloatingIp(id))?.floatingip;
  if (!fip) return fip;
  const extra = {};
  const tasks = [fetchPfwEnabled().then((v) => (extra.pfwEnabled = v))];
  if (fip.router_id) {
    // legacy BaseDetail: router name + its external network ("Network Line")
    tasks.push(
      neutronApi
        .getRouter(fip.router_id)
        .then(async (res) => {
          const router = res?.router || {};
          extra.router_name = router.name;
          const netId = router.external_gateway_info?.network_id;
          if (netId) {
            const net = (await neutronApi.getNetwork(netId).catch(() => ({})))?.network;
            extra.network_name = net?.name || netId;
          }
        })
        .catch(() => {})
    );
  }
  if (!fip.router_id && fip.floating_network_id) {
    tasks.push(
      neutronApi
        .getNetwork(fip.floating_network_id)
        .then((res) => (extra.floating_network_name = res?.network?.name))
        .catch(() => {})
    );
  }
  if (fip.qos_policy_id && qosEnabled()) {
    tasks.push(
      neutronApi
        .getQosPolicy(fip.qos_policy_id)
        .then((res) => (extra.qos_policy_name = res?.policy?.name))
        .catch(() => {})
    );
  }
  await Promise.all(tasks);
  return { ...fip, ...extra, name: fip.floating_ip_address };
};

const pfColumns = () => [
  { title: t('ID'), dataIndex: 'id', key: 'id' },
  {
    title: t('External Port/Port Range'),
    dataIndex: 'external_port',
    key: 'external_port',
    render: (v, r) => v || r.external_port_range || '-',
  },
  { title: t('Internal IP Address'), dataIndex: 'internal_ip_address', key: 'internal_ip_address' },
  {
    title: t('Internal Port/Port Range'),
    dataIndex: 'internal_port',
    key: 'internal_port',
    render: (v, r) => v || r.internal_port_range || '-',
  },
  {
    title: t('Protocol'),
    dataIndex: 'protocol',
    key: 'protocol',
    render: (v) => portForwardingProtocols()[v] || v || '-',
  },
  { title: t('Description'), dataIndex: 'description', key: 'description', render: (v) => v || '-' },
];

function PortForwardingTab({ fip, isAdmin }) {
  return (
    <ResourcePage
      embedded
      deps={[fip.id]}
      fetch={async () => {
        const res = await neutronApi.listPortForwardings(fip.id);
        return (res?.port_forwardings || []).map((pf) => ({
          ...pf,
          fip,
          floating_ip_address: fip.floating_ip_address,
          external_port_text: `${pf.external_port || ''} ${pf.external_port_range || ''}`,
          internal_port_text: `${pf.internal_port || ''} ${pf.internal_port_range || ''}`,
        }));
      }}
      columns={pfColumns()}
      filterParams={[
        {
          name: 'protocol',
          label: t('Protocol'),
          options: Object.entries(portForwardingProtocols()).map(([key, label]) => ({ key, label })),
        },
        { name: 'external_port_text', label: t('External Port/Port Range') },
        { name: 'internal_ip_address', label: t('Internal IP Address') },
        { name: 'internal_port_text', label: t('Internal Port/Port Range') },
        { name: 'description', label: t('Description') },
      ]}
      primaryActions={isAdmin ? [] : [createPortForwardingAction({ fip })]}
      rowActions={
        isAdmin
          ? { firstAction: deletePortForwardingAction({ fip }), moreActions: [] }
          : {
              firstAction: editPortForwardingAction({ fip }),
              moreActions: [{ action: deletePortForwardingAction({ fip }) }],
            }
      }
    />
  );
}

export default function FloatingIpDetail() {
  const isAdminPage = useIsAdminPage();
  return (
    <ResourceDetail
      policy="get_floatingip"
      breadcrumb={[t('Network'), { title: t('Floating IPs'), path: isAdminPage ? '/network/floatingip-admin' : '/network/floatingip' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/network/floatingip-admin' : '/network/floatingip')}
      fetch={fetchDetail}
      title={(d) => d.floating_ip_address || d.id}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Floating IP'), value: d.floating_ip_address, copyable: true },
          { label: t('Status'), value: d.status, render: () => floatingIpStatus()[d.status] || d.status || '-' },
          isAdmin && { label: t('Project ID'), value: d.tenant_id || d.project_id },
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
          { label: t('Description'), value: d.description },
          { label: t('Instance IP'), value: d.fixed_ip_address },
          { label: t('Network Line'), value: d.network_name || d.floating_network_name },
          {
            label: t('Router'),
            value: d.router_id,
            render: () =>
              d.router_id ? (
                <Link to={detailPath('router', d.router_id, isAdmin)}>
                  {d.router_name ? `${d.router_id} (${d.router_name})` : d.router_id}
                </Link>
              ) : (
                '-'
              ),
          },
          {
            label: t('External Network'),
            value: d.floating_network_id,
            render: () => networkLink(d.floating_network_id, d.floating_network_name || d.network_name, isAdmin),
          },
          { label: t('Port'), value: d.port_id, render: () => portLink(d.port_id, d.port_details?.name, isAdmin) },
          qosEnabled() && {
            label: t('QoS Policy'),
            value: d.qos_policy_id,
            render: () =>
              d.qos_policy_id ? (
                <Link to={detailPath('qos-policy', d.qos_policy_id, isAdmin)}>{d.qos_policy_name || d.qos_policy_id}</Link>
              ) : (
                '-'
              ),
          },
          { label: t('DNS Name'), value: d.dns_name },
          { label: t('DNS Domain'), value: d.dns_domain },
          { label: t('Port Forwardings'), value: d.port_forwardings?.length, render: () => <PortForwardingPopover record={d} /> },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) =>
        d.pfwEnabled && d.fixed_ip_address == null
          ? policyTabs([
              {
                key: 'port_forwarding',
                label: t('Port Forwardings'),
                policy: 'get_floatingip_port_forwarding', // legacy FloatingIp/Detail/PortForwarding
                render: () => <PortForwardingTab fip={d} isAdmin={isAdmin} />,
              },
            ])
          : []
      }
      actions={({ isAdmin, detail }) =>
        isAdmin
          ? { firstAction: releaseAction(), moreActions: [] }
          : {
              firstAction: editFloatingIpAction(),
              moreActions: [
                { action: associateAction() },
                { action: disassociateAction() },
                { action: createPortForwardingAction({ enabled: !!detail?.pfwEnabled }) },
                { action: releaseAction() },
              ],
            }
      }
    />
  );
}
