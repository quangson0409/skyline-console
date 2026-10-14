import React from 'react';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import ResourcePage, {
  formatTime,
  yesNo,
  projectColumn,
  statusColumn,
  timeColumn,
  IdNameCell,
} from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { neutronApi } from '@/api/neutron';
import { t } from '@/core/i18n';
import { listAll, detailPath } from '../common';
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

/* ---------------- Floating IPs tab (legacy FloatingIp container in QoS detail) ---------------- */
const floatingIpStatus = () => ({
  AVAILABLE: t('Available'),
  PENDING: t('Pending'),
  ACTIVE: t('Active'),
  ERROR: t('Error'),
  DOWN: t('Down'),
});

const fipEditAction = () => ({
  id: 'edit-fip',
  type: 'modal',
  title: t('Edit Floating IP'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({ description: item.description, qos_policy_id: item.qos_policy_id || undefined }),
  getFormItems: async () => {
    const policies = await listAll.qosPolicies();
    return [
      { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
      {
        name: 'qos_policy_id',
        label: t('QoS Policy'),
        type: 'select',
        tip: t('Choosing a QoS policy can limit bandwidth and DSCP'),
        options: policies.map((p) => ({ value: p.id, label: p.name || p.id })),
      },
    ];
  },
  onSubmit: (values, item) =>
    neutronApi.updateFloatingIp(item.id, {
      description: values.description,
      qos_policy_id: values.qos_policy_id || null,
    }),
});

const fipDisassociateAction = () => ({
  id: 'disassociate',
  type: 'confirm',
  title: t('Disassociate'),
  actionName: t('Disassociate'),
  allowed: (item) => item.fixed_ip_address !== null && item.fixed_ip_address !== undefined && item.status !== 'DOWN',
  onSubmit: (item) => neutronApi.updateFloatingIp(item.id, { port_id: null }),
});

const fipReleaseAction = () => ({
  id: 'release',
  type: 'modal',
  title: t('Release'),
  getDefaultValues: (item) => ({ forceRelease: false, ip: item.floating_ip_address }),
  getFormItems: (item) => [
    { name: 'ip', label: t('Floating IP'), type: 'label' },
    ...(item?.fixed_ip_address
      ? [
          {
            name: 'forceRelease',
            label: t('Force release'),
            type: 'switch',
            tip: t('Floating IP has already been associate, Please check Force release.'),
          },
        ]
      : []),
  ],
  onSubmit: (values, item) => {
    if (item.fixed_ip_address && !values.forceRelease) {
      return Promise.reject(new Error(t('Floating IP has already been associate, Please check Force release.')));
    }
    return neutronApi.deleteFloatingIp(item.id);
  },
});

function FloatingIpTab({ policyId }) {
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      embedded
      deps={[policyId]}
      fetch={async ({ isAdmin, projectId }) => {
        const params = { qos_policy_id: policyId };
        if (!isAdmin && projectId) params.project_id = projectId;
        const res = await neutronApi.listFloatingIps(params);
        return res?.floatingips || [];
      }}
      columns={({ isAdmin }) =>
        [
          {
            title: t('ID/Floating IP'),
            dataIndex: 'floating_ip_address',
            key: 'floating_ip_address',
            render: (v, r) => (
              <IdNameCell id={r.id} name={v} href={`/network/floatingip${isAdmin ? '-admin' : ''}/detail/${r.id}`} />
            ),
          },
          isAdmin && { ...projectColumn(projectMap), title: t('Project ID/Name') },
          { title: t('Description'), dataIndex: 'description', key: 'description', render: (v) => v || '-' },
          {
            title: t('Associated Resource'),
            dataIndex: 'port_id',
            key: 'port_id',
            render: (v, r) =>
              v ? (
                <IdNameCell id={v} name={r.fixed_ip_address} href={detailPath('port', v, isAdmin)} bold={false} />
              ) : (
                '-'
              ),
          },
          statusColumn({ textMap: floatingIpStatus() }),
          timeColumn(),
        ].filter(Boolean)
      }
      filterParams={[
        { name: 'floating_ip_address', label: t('Floating IP') },
        {
          name: 'status',
          label: t('Status'),
          options: Object.entries(floatingIpStatus()).map(([key, label]) => ({ key, label })),
        },
      ]}
      rowActions={({ isAdmin }) =>
        isAdmin
          ? { firstAction: fipReleaseAction(), moreActions: [] }
          : {
              firstAction: fipEditAction(),
              moreActions: [{ action: fipDisassociateAction() }, { action: fipReleaseAction() }],
            }
      }
    />
  );
}

export default function QosPolicyDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Network'), { title: t('QoS Policies'), path: '/network/qos-policy' }]}
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
      tabs={(d) => [
        { key: 'detail', label: t('Detail'), render: () => <RulesTab detail={d} /> },
        { key: 'fip', label: t('Floating IPs'), render: () => <FloatingIpTab policyId={d.id} /> },
      ]}
      actions={({ isAdmin }) => qosRowActions({ isAdmin })}
    />
  );
}
