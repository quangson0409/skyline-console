import React from 'react';
import { Breadcrumb, Progress, Tabs, Tag, Tooltip } from 'antd';
import { novaApi } from '@/api/nova';
import { placementApi } from '@/api/placement';
import ResourcePage, { nameColumn, statusColumn } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { canSeeTab } from '../_shared';
import { usePolicyStore } from '@/core/policy';
import { useSearchParams } from 'react-router-dom';
import { getGiBValue, sinceTime } from '../_shared';
import { KpiCards } from '@/components/MetricCards';

/* ------------------------------------------------------------------ */
/* helpers (legacy resources/nova/service.js + stores/nova/hypervisor) */
/* ------------------------------------------------------------------ */
export const serviceStatus = () => ({ enabled: t('Enabled'), disabled: t('Disabled') });
export const serviceState = () => ({ up: t('Up'), down: t('Down') });

/** Applies placement allocation ratios (VCPU/PCPU/MEMORY_MB) like legacy listDidFetch */
export const applyInventories = (item, inventoriesRes) => {
  const next = { ...item };
  if (next.hypervisor_type !== 'ironic') {
    const inv = inventoriesRes?.inventories || {};
    const { allocation_ratio, total: vcpuTotal } = inv.VCPU || {};
    const { allocation_ratio: pcpuRatio, total: pcpuTotal } = inv.PCPU || {};
    const { allocation_ratio: memoryRatio } = inv.MEMORY_MB || {};
    let totalVcpus = 0;
    const cpuTypes = [];
    if (pcpuTotal !== undefined) {
      totalVcpus += pcpuTotal * (pcpuRatio || 1.0);
      cpuTypes.push('pCPU');
    }
    if (allocation_ratio && vcpuTotal !== undefined) {
      totalVcpus += vcpuTotal * allocation_ratio;
      cpuTypes.push('vCPU');
    }
    if (totalVcpus > 0) {
      next.vcpus = totalVcpus;
      next.cpu_type = cpuTypes.join('+');
    }
    if (memoryRatio) next.memory_mb = (next.memory_mb || 0) * memoryRatio;
  }
  next.vcpus_used_percent = (next.vcpus && Number(((next.vcpus_used / next.vcpus) * 100).toFixed(2))) || 0;
  next.memory_mb_percent =
    (next.memory_mb && Number(((next.memory_mb_used / next.memory_mb) * 100).toFixed(2))) || 0;
  next.storage_percent = (next.local_gb && Number(((next.local_gb_used / next.local_gb) * 100).toFixed(2))) || 0;
  next.memory_mb_used_gb = getGiBValue(next.memory_mb_used);
  next.memory_mb_gb = getGiBValue(next.memory_mb);
  return next;
};

export const mapHypervisor = (h = {}) => ({
  ...h,
  name: h?.service?.host || h?.hypervisor_hostname,
  service_host: h?.service?.host || '',
  service_id: h?.service?.id,
  disabled_reason: h?.service?.disabled_reason,
});

export const fetchHypervisors = async () => {
  const res = await novaApi.listHypervisorsV();
  const list = (res?.hypervisors || []).map(mapHypervisor);
  const inventories = await Promise.all(list.map((it) => placementApi.getInventories(it.id).catch(() => null)));
  return list.map((it, idx) => applyInventories(it, inventories[idx]));
};

const ironicTip = () => (
  <Tooltip title={t('vCPUs and RAM are not used for bare metal scheduling.')}>
    <span>-</span>
  </Tooltip>
);

const UsageBar = ({ percent = 0, label, color }) => (
  <div style={{ width: 160 }}>
    <div style={{ fontSize: 12, marginBottom: 2 }}>
      {label} <span style={{ color: '#94a3b8' }}>({percent}%)</span>
    </div>
    <Progress
      percent={Number(percent) || 0}
      size="small"
      showInfo={false}
      strokeColor={percent > 85 ? '#ef4444' : color || '#0068ff'}
    />
  </div>
);

export const cpuRender = (_, r) =>
  r.hypervisor_type === 'ironic' ? (
    ironicTip()
  ) : (
    <Tooltip title={`${t(r.cpu_type || 'vCPU')}: ${r.vcpus_used} / ${r.vcpus}`}>
      <span>
        <UsageBar percent={r.vcpus_used_percent} label={`${r.vcpus_used ?? 0} / ${r.vcpus ?? 0}`} />
      </span>
    </Tooltip>
  );

export const memoryRender = (_, r) =>
  r.hypervisor_type === 'ironic' ? (
    ironicTip()
  ) : (
    <UsageBar percent={r.memory_mb_percent} label={`${r.memory_mb_used_gb} / ${r.memory_mb_gb}`} color="#10b981" />
  );

/* ------------------------------------------------------------------ */
/* actions                                                            */
/* ------------------------------------------------------------------ */
export const disableServiceAction = ({ hostKey = 'host', idKey = 'id' } = {}) => ({
  id: 'disable-host',
  type: 'modal',
  policy: 'os_compute_api:os-services:update',
  title: t('Disable Compute Host'),
  buttonText: t('Disable'),
  isDanger: true,
  description: t('After disable the compute service, the new instance will not schedule to the compute node.'),
  allowed: (item) => item.status === 'enabled' && Boolean(item[idKey]),
  getDefaultValues: (item) => ({ host: item[hostKey] || item.id }),
  formItems: [
    { name: 'host', label: t('Current Host'), type: 'label' },
    {
      name: 'disabled_reason',
      label: t('Reason'),
      type: 'textarea',
      rows: 3,
      rules: [{ max: 64, message: `${t('Reason')} <= 64` }],
    },
  ],
  onSubmit: (values, item) => {
    const body = { status: 'disabled' };
    if (values.disabled_reason) body.disabled_reason = values.disabled_reason;
    return novaApi.updateServiceV(item[idKey], body);
  },
});

export const enableServiceAction = ({ idKey = 'id' } = {}) => ({
  id: 'enable-host',
  type: 'confirm',
  policy: 'os_compute_api:os-services:update',
  title: t('Enable Compute Host'),
  buttonText: t('Enable'),
  actionName: t('Enable compute host'),
  allowed: (item) => item.status === 'disabled' && Boolean(item[idKey]),
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await novaApi.updateServiceV(it[idKey], { status: 'enabled' });
    }
  },
});

/* ------------------------------------------------------------------ */
/* Hypervisors tab                                                    */
/* ------------------------------------------------------------------ */
export const hypervisorColumns = () => [
  nameColumn({
    title: t('ID/Name'),
    dataIndex: 'service_host',
    linkTo: (r) => `/compute/hypervisors-admin/detail/${r.id}`,
  }),
  {
    title: t('Hostname'),
    dataIndex: 'hypervisor_hostname',
    key: 'hypervisor_hostname',
    sorter: (a, b) => String(a.hypervisor_hostname || '').localeCompare(String(b.hypervisor_hostname || '')),
  },
  {
    title: t('Type'),
    dataIndex: 'hypervisor_type',
    key: 'hypervisor_type',
    render: (type, r) => (
      <span>
        <b>{type || '-'}</b>{' '}
        {r.hypervisor_version ? <span style={{ fontSize: 11, color: '#94a3b8' }}>({r.hypervisor_version})</span> : null}
      </span>
    ),
  },
  {
    title: t('State'),
    dataIndex: 'state',
    key: 'state',
    render: (state) => (
      <Tag color={state === 'up' ? 'success' : 'error'} style={{ borderRadius: 10, textTransform: 'uppercase' }}>
        {serviceState()[state] || state || '-'}
      </Tag>
    ),
  },
  {
    title: t('Status'),
    dataIndex: 'status',
    key: 'status',
    render: (status, r) => (
      <Tooltip title={r.disabled_reason ? `${t('Reason: ')} ${r.disabled_reason}` : ''}>
        <Tag color={status === 'enabled' ? 'blue' : 'warning'} style={{ borderRadius: 10, textTransform: 'uppercase' }}>
          {serviceStatus()[status] || status || '-'}
        </Tag>
      </Tooltip>
    ),
  },
  {
    title: t('CPU (Core)'),
    dataIndex: 'vcpus_used_percent',
    key: 'vcpus_used_percent',
    sorter: (a, b) => a.vcpus_used_percent - b.vcpus_used_percent,
    render: cpuRender,
  },
  {
    title: t('Configured Memory (GiB)'),
    dataIndex: 'memory_mb_percent',
    key: 'memory_mb_percent',
    sorter: (a, b) => a.memory_mb_percent - b.memory_mb_percent,
    render: memoryRender,
  },
  {
    title: t('Local Disk'),
    key: 'disk',
    render: (_, r) => {
      if (r.local_gb === undefined) return '-';
      const used = r.local_gb_used ?? (r.local_gb || 0) - (r.free_disk_gb || 0);
      return (
        <span style={{ fontSize: 12 }}>
          <b>{used || 0}</b> / {r.local_gb || 0} GiB
        </span>
      );
    },
  },
  {
    title: t('Instances'),
    dataIndex: 'running_vms',
    key: 'running_vms',
    sorter: (a, b) => (a.running_vms || 0) - (b.running_vms || 0),
    render: (vms) =>
      vms === undefined ? (
        '-'
      ) : (
        <Tag color="geekblue" style={{ borderRadius: 10 }}>
          <b>{vms}</b>
        </Tag>
      ),
  },
];

const hypervisorKpis = (data) => {
  const sum = (k) => data.reduce((acc, h) => acc + (Number(h[k]) || 0), 0);
  return [
    { title: t('Total Hypervisors'), value: data.length },
    {
      title: t('vCPUs Allocation'),
      value: sum('vcpus_used'),
      suffix: `/ ${Number(sum('vcpus').toFixed(2))}`,
      color: '#10b981',
    },
    {
      title: t('RAM Allocation'),
      value: (sum('memory_mb_used') / 1024).toFixed(1),
      suffix: `/ ${(sum('memory_mb') / 1024).toFixed(1)} GiB`,
      color: '#8b5cf6',
    },
    { title: t('Running Instances'), value: sum('running_vms'), color: '#0284c7' },
  ];
};

export function HypervisorTab() {
  return (
    <ResourcePage
      embedded
      title={t('Hypervisors')}
      policy="os_compute_api:os-hypervisors:list"
      fetch={fetchHypervisors}
      columns={hypervisorColumns}
      header={({ data }) => <KpiCards items={hypervisorKpis(data)} />}
      filterParams={[
        { name: 'service_host', label: t('Hostname') },
        { name: 'hypervisor_hostname', label: t('Hypervisor Hostname') },
        { name: 'hypervisor_type', label: t('Type') },
        {
          name: 'state',
          label: t('State'),
          options: Object.entries(serviceState()).map(([key, label]) => ({ key, label })),
        },
        {
          name: 'status',
          label: t('Status'),
          options: Object.entries(serviceStatus()).map(([key, label]) => ({ key, label })),
        },
      ]}
      searchFields={['service_host', 'hypervisor_hostname', 'id']}
      rowActions={{
        firstAction: null,
        moreActions: [
          {
            title: t('Service Control'),
            actions: [
              disableServiceAction({ hostKey: 'service_host', idKey: 'service_id' }),
              enableServiceAction({ idKey: 'service_id' }),
            ],
          },
        ],
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Compute hosts tab                                                  */
/* ------------------------------------------------------------------ */
export const fetchComputeHosts = async () => {
  let res;
  try {
    res = await novaApi.listComputeServicesExt({ binary: 'nova-compute' });
  } catch {
    res = await novaApi.listServicesV({ binary: 'nova-compute' });
  }
  return (res?.services || [])
    .filter((s) => !s.binary || s.binary === 'nova-compute')
    .map((s) => ({ ...s, name: s.host }));
};

export function ComputeHostTab() {
  return (
    <ResourcePage
      embedded
      title={t('Compute Hosts')}
      policy="os_compute_api:os-services:list"
      fetch={fetchComputeHosts}
      columns={() => [
        { title: t('Host'), dataIndex: 'host', key: 'host', sorter: (a, b) => String(a.host).localeCompare(String(b.host)) },
        { title: t('Availability Zone'), dataIndex: 'zone', key: 'zone', render: (v) => v || '-' },
        {
          ...statusColumn({ title: t('Service Status'), textMap: serviceStatus() }),
          render: (value, r) => (
            <Tooltip title={r.disabled_reason ? `${t('Reason: ')} ${r.disabled_reason}` : ''}>
              <Tag color={value === 'enabled' ? 'blue' : 'warning'} style={{ borderRadius: 10 }}>
                {serviceStatus()[value] || value || '-'}
              </Tag>
            </Tooltip>
          ),
        },
        {
          title: t('Service State'),
          dataIndex: 'state',
          key: 'state',
          render: (v) => (
            <Tag color={v === 'up' ? 'success' : 'error'} style={{ borderRadius: 10 }}>
              {serviceState()[v] || v || '-'}
            </Tag>
          ),
        },
        {
          title: t('Last Updated'),
          dataIndex: 'updated_at',
          key: 'updated_at',
          sorter: (a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0),
          render: (v) => <span style={{ color: '#64748b', fontSize: 12 }}>{sinceTime(v)}</span>,
        },
      ]}
      filterParams={[
        { name: 'host', label: t('Host') },
        {
          name: 'status',
          label: t('Service Status'),
          options: Object.entries(serviceStatus()).map(([key, label]) => ({ key, label })),
        },
        {
          name: 'state',
          label: t('Service State'),
          options: Object.entries(serviceState()).map(([key, label]) => ({ key, label })),
        },
      ]}
      searchFields={['host', 'zone', 'id']}
      rowActions={{
        firstAction: null,
        moreActions: [{ action: disableServiceAction() }, { action: enableServiceAction() }],
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Page (legacy TabList: Hypervisors / Compute Hosts)                 */
/* ------------------------------------------------------------------ */
export default function HypervisorList() {
  // legacy TabList: ?tab= keeps the active tab, a tab whose list policy is denied is hidden
  const [searchParams, setSearchParams] = useSearchParams();
  usePolicyStore((st) => st.rules);
  const tabItems = [
    canSeeTab('os_compute_api:os-hypervisors:list') && { key: 'Hypervisor', label: t('Hypervisors'), children: <HypervisorTab /> },
    canSeeTab('os_compute_api:os-services:list') && { key: 'ComputeHost', label: t('Compute Hosts'), children: <ComputeHostTab /> },
  ].filter(Boolean);
  const requested = searchParams.get('tab');
  const tab = tabItems.some((it) => it.key === requested) ? requested : tabItems[0]?.key;
  const setTab = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };
  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb items={[{ title: t('Compute') }, { title: t('Hypervisors') }]} style={{ marginBottom: 16, fontSize: 13 }} />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t('Hypervisors')}
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
          {t('Physical compute nodes monitoring, hardware allocation, and virtualization hypervisors.')}
        </p>
      </div>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        destroyOnHidden
        items={tabItems.length ? tabItems : [{ key: 'Hypervisor', label: t('Hypervisors'), children: <HypervisorTab /> }]}
      />
    </div>
  );
}
