import React from 'react';
import { Progress } from 'antd';
import { zunApi } from '@/api/zun';
import ResourcePage, { nameColumn } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { getGiBValue } from '@/components/Quota/utils';

/** Legacy stores/zun/hosts.js mapper */
export const mapHost = (data) => {
  const { mem_total, mem_used, cpus, cpu_used, disk_total, disk_used } = data;
  return {
    ...data,
    id: data.uuid,
    name: data.hostname,
    cpu_percent: cpus ? Number(((cpu_used / cpus) * 100).toFixed(2)) : 0,
    memory_percent: mem_total ? Number(((mem_used / mem_total) * 100).toFixed(2)) : 0,
    mem_total_gb: getGiBValue(mem_total),
    mem_used_gb: getGiBValue(mem_used),
    disk_percent: disk_total ? Number(((disk_used / disk_total) * 100).toFixed(2)) : 0,
  };
};

const usage = (percent, label) => (
  <div style={{ minWidth: 140 }}>
    <Progress percent={percent} size="small" showInfo={false} status={percent >= 90 ? 'exception' : 'normal'} />
    <div style={{ fontSize: 12, color: '#64748b' }}>
      {label} ({percent}%)
    </div>
  </div>
);

export default function HostList() {
  return (
    <ResourcePage
      policy="host:get_all"
      title={t('Hosts')}
      breadcrumb={[t('Container Service'), t('Hosts')]}
      description={t('Compute hosts running the Zun container service.')}
      rowKey="uuid"
      fetch={async () => {
        const res = await zunApi.listHosts();
        return (res?.hosts || []).map(mapHost);
      }}
      columns={[
        nameColumn({ idIndex: 'uuid', linkTo: (r) => `/container-service/hosts-admin/detail/${r.uuid}` }),
        { title: t('Architecture'), dataIndex: 'architecture', key: 'architecture', render: (v) => v || '-' },
        { title: t('Total Containers'), dataIndex: 'total_containers', key: 'total_containers', render: (v) => v ?? '-' },
        {
          title: t('CPU (Core)'),
          dataIndex: 'cpu_percent',
          key: 'cpu_percent',
          width: 180,
          render: (v, r) => usage(v, `${r.cpu_used ?? 0} / ${r.cpus ?? 0}`),
        },
        {
          title: t('Configured Memory (GiB)'),
          dataIndex: 'memory_percent',
          key: 'memory_percent',
          width: 180,
          render: (v, r) => usage(v, `${r.mem_used_gb} / ${r.mem_total_gb}`),
        },
        {
          title: t('Configured Disk (GiB)'),
          dataIndex: 'disk_percent',
          key: 'disk_percent',
          width: 180,
          render: (v, r) => usage(v, `${r.disk_used ?? 0} / ${r.disk_total ?? 0}`),
        },
      ]}
      filterParams={[{ name: 'name', label: t('Name') }]}
    />
  );
}
