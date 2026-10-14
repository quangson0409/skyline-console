import React, { useEffect, useState } from 'react';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import ResourcePage, { formatTime, yesNo, useIsAdminPage } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import {
  fetchFloatingIps,
  fetchFloatingIpsPage,
  floatingIpServerSide,
  floatingIpColumns,
  floatingIpFilters,
  floatingIpRowActions,
} from '@/pages/Networks/FloatingIps/FloatingIpList';
import { fetchPfwEnabled } from '@/pages/Networks/FloatingIps/helpers';
import { policyTabs } from '../common';
import { fetchQosPolicyDetail, findEgressRule, findIngressRule, findDscpRule, qosRowActions } from './helpers';

/* ---------------- Detail tab (legacy Detail/BaseDetail.jsx) ---------------- */
const mbps = (v) => `${v === undefined || v === null ? '-' : v / 1024} ${t('Mbps')}`;

const bandwidthItems = (rule) => [
  { label: t('Max Bandwidth'), value: mbps(rule?.max_kbps) },
  { label: t('Max Burst'), value: mbps(rule?.max_burst_kbps) },
];

function RulesTab({ detail }) {
  const dscp = findDscpRule(detail) || {};
  return (
    <div>
      <DetailCard title={t('Bandwidth Limit Egress')} items={bandwidthItems(findEgressRule(detail))} />
      <DetailCard title={t('Bandwidth Limit Ingress')} items={bandwidthItems(findIngressRule(detail))} />
      <DetailCard
        title={t('DSCP Marking')}
        items={[{ label: t('Value'), value: dscp.dscp_mark === 0 ? '0' : dscp.dscp_mark || '-' }]}
      />
    </div>
  );
}

/* ---------------- Floating IPs tab (legacy FloatingIp container in QoS detail) ----------------
 * Legacy rendered the whole FloatingIp list filtered by qos_policy_id (backend paged, QoS column
 * hidden) with qosDetailConfigs = the FIP list row actions (Edit / Associate / Disassociate /
 * Create Port Forwarding / Release) and qosDetailAdminConfigs = Release on admin pages.
 */
function FloatingIpTab({ policyId }) {
  const projectMap = useProjectMap();
  const isAdminPage = useIsAdminPage();
  const [pfwEnabled, setPfwEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchPfwEnabled().then((v) => alive && setPfwEnabled(v));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <ResourcePage
      embedded
      policy="get_floatingip"
      deps={[policyId]}
      fetch={(ctx) => fetchFloatingIps({ ...ctx, params: { qos_policy_id: policyId } })}
      serverSide={{
        ...floatingIpServerSide,
        fetchPage: (args) => fetchFloatingIpsPage({ ...args, extraParams: { qos_policy_id: policyId } }),
      }}
      columns={({ isAdmin }) => floatingIpColumns({ isAdmin, projectMap, hideQos: true })}
      filterParams={floatingIpFilters({ isAdmin: isAdminPage })}
      rowActions={({ isAdmin }) => floatingIpRowActions({ isAdmin, pfwEnabled })}
    />
  );
}

export default function QosPolicyDetail() {
  const isAdminPage = useIsAdminPage();
  return (
    <ResourceDetail
      policy="get_policy"
      aliasPolicy="neutron:get_policy"
      breadcrumb={[t('Network'), { title: t('QoS Policies'), path: isAdminPage ? '/network/qos-policy-admin' : '/network/qos-policy' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/network/qos-policy-admin' : '/network/qos-policy')}
      fetch={(id, ctx) => fetchQosPolicyDetail(id, ctx)}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Policy Name'), value: d.name },
          { label: t('Rules Number'), value: String((d.rules || []).length) },
          { label: t('Created At'), value: formatTime(d.created_at) },
          isAdmin && {
            label: t('Project'),
            value: d.project_id,
            render: () => (
              <span>
                {d.project_name || '-'}
                {d.project_id ? <span style={{ color: '#94a3b8', fontSize: 12 }}> ({d.project_id})</span> : null}
              </span>
            ),
          },
          { label: t('Shared Policy'), value: d.shared, render: () => yesNo(d.shared) },
          { label: t('Default Policy'), value: d.is_default, render: () => yesNo(d.is_default) },
          { label: t('Description'), value: d.description },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
        ].filter(Boolean)
      }
      tabs={(d) =>
        policyTabs([
          { key: 'detail', label: t('Detail'), render: () => <RulesTab detail={d} /> },
          {
            key: 'fip',
            label: t('Floating IPs'),
            policy: 'get_floatingip', // legacy FloatingIp container
            render: () => <FloatingIpTab policyId={d.id} />,
          },
        ])
      }
      actions={({ isAdmin }) => qosRowActions({ isAdmin })}
    />
  );
}
