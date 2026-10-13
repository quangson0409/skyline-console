import React from 'react';
import { Tooltip } from 'antd';
import { novaApi } from '@/api/nova';
import { placementApi } from '@/api/placement';
import ResourceDetail from '@/components/ResourceDetail';
import { t } from '@/core/i18n';
import InstanceTable from '../_shared/InstanceTable';
import {
  applyInventories,
  mapHypervisor,
  serviceState,
  serviceStatus,
  disableServiceAction,
  enableServiceAction,
} from './HypervisorList';

/** legacy HypervisorStore.fetchDetail: inventories + nested (vGPU) resource provider */
export const fetchHypervisorDetail = async (id) => {
  const res = await novaApi.getHypervisorV(id);
  const item = mapHypervisor({ id, ...(res?.hypervisor || {}) });
  let providers = [];
  try {
    const rp = await placementApi.listResourceProviders({ in_tree: id });
    providers = (rp?.resource_providers || []).filter((it) => it.uuid !== id);
  } catch {
    providers = [];
  }
  const [base, invVGPU, usageVGPU] = await Promise.all([
    placementApi.getInventories(id).catch(() => null),
    providers.length ? placementApi.getInventories(providers[0].uuid).catch(() => null) : null,
    providers.length ? placementApi.getUsages(providers[0].uuid).catch(() => null) : null,
  ]);
  const detail = applyInventories(item, base);
  const vgpuInv = invVGPU?.inventories?.VGPU;
  if (vgpuInv && usageVGPU) {
    detail.vgpus = (vgpuInv.allocation_ratio || 1) * (vgpuInv.total || 0);
    detail.vgpus_used = usageVGPU?.usages?.VGPU ?? 0;
  }
  return detail;
};

const ironicTip = () => (
  <Tooltip title={t('vCPUs and RAM are not used for bare metal scheduling.')}>
    <span>-</span>
  </Tooltip>
);

export default function HypervisorDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Compute'), { title: t('Hypervisors'), path: '/compute/hypervisors-admin' }]}
      backPath="/compute/hypervisors-admin"
      title={(d) => d.service_host || d.hypervisor_hostname || d.id}
      statusField="state"
      fetch={fetchHypervisorDetail}
      info={(d) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Hostname'), value: d.service_host },
          { label: t('Hypervisor Hostname'), value: d.hypervisor_hostname },
          { label: t('Type'), value: d.hypervisor_type },
          { label: t('Hypervisor Version'), value: d.hypervisor_version },
          { label: t('Host IP'), value: d.host_ip },
          { label: t('State'), value: serviceState()[d.state] || d.state },
          {
            label: t('Status'),
            value: serviceStatus()[d.status] || d.status,
            render: () => (
              <span>
                {serviceStatus()[d.status] || d.status || '-'}
                {d.disabled_reason ? ` (${t('Reason: ')} ${d.disabled_reason})` : ''}
              </span>
            ),
          },
          {
            label: t('CPU (Core)'),
            value: d.vcpus,
            render: () =>
              d.hypervisor_type === 'ironic'
                ? ironicTip()
                : `${d.vcpus_used ?? '-'} / ${d.vcpus ?? '-'} (${t(d.cpu_type || 'vCPU')})`,
          },
          {
            label: t('Configured Memory (GiB)'),
            value: d.memory_mb_gb,
            render: () => (d.hypervisor_type === 'ironic' ? ironicTip() : `${d.memory_mb_used_gb} / ${d.memory_mb_gb}`),
          },
          d.vgpus ? { label: t('vGPU (Core)'), value: `${d.vgpus_used} / ${d.vgpus}` } : null,
          d.local_gb !== undefined
            ? { label: t('Local Disk'), value: `${d.local_gb_used ?? '-'} / ${d.local_gb} GiB` }
            : null,
          d.running_vms !== undefined ? { label: t('Instances'), value: String(d.running_vms) } : null,
        ].filter(Boolean)
      }
      tabs={(d) => [
        {
          key: 'members',
          label: t('Instances'),
          render: () => (
            <InstanceTable
              isAdmin
              deps={[d.service_host]}
              fetchServers={async () => {
                if (!d.service_host) return [];
                const res = await novaApi.listServersV({ all_tenants: true, host: d.service_host });
                return res?.servers || [];
              }}
            />
          ),
        },
      ]}
      actions={() => ({
        firstAction: null,
        moreActions: [
          { action: disableServiceAction({ hostKey: 'service_host', idKey: 'service_id' }) },
          { action: enableServiceAction({ idKey: 'service_id' }) },
        ],
      })}
    />
  );
}
