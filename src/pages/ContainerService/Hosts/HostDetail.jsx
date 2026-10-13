import React from 'react';
import { Row, Col } from 'antd';
import { zunApi } from '@/api/zun';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { stringifyContent } from '../common';
import { mapHost } from './HostList';

function HostInfoTab({ d }) {
  const one = { xs: 1, sm: 1, md: 1 };
  return (
    <Row gutter={16}>
      <Col xs={24} xl={12}>
        <DetailCard title={t('Containers Info')} column={one} items={[{ label: t('Total Containers'), value: d.total_containers }]} />
        <DetailCard
          title={t('System Info')}
          column={one}
          items={[
            { label: t('Architecture'), value: d.architecture },
            { label: t('Kernel Version'), value: d.kernel_version },
            { label: t('OS'), value: d.os },
            { label: t('OS Type'), value: d.os_type },
          ]}
        />
      </Col>
      <Col xs={24} xl={12}>
        <DetailCard
          title={t('Resources')}
          column={one}
          items={[
            { label: t('Memory (MiB)'), value: d.mem_total !== undefined ? `${d.mem_used ?? 0} / ${d.mem_total}` : undefined },
            { label: t('Disk Quota Supported'), value: d.disk_quota_supported === undefined ? undefined : d.disk_quota_supported ? t('Yes') : t('No') },
            { label: t('Runtimes'), render: () => stringifyContent(d.runtimes) },
            { label: t('Enable CPU Pinning'), value: d.enable_cpu_pinning === undefined ? undefined : d.enable_cpu_pinning ? t('Yes') : t('No') },
            { label: t('Labels'), render: () => stringifyContent(d.labels) },
          ]}
        />
      </Col>
    </Row>
  );
}

export default function HostDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Container Service'), { title: t('Hosts'), path: '/container-service/hosts-admin' }]}
      backPath="/container-service/hosts-admin"
      fetch={async (id) => {
        const raw = await zunApi.getHost(id);
        return mapHost({ ...raw, uuid: raw.uuid || id });
      }}
      info={(d) => [
        { label: t('ID'), value: d.uuid, copyable: true },
        { label: t('Hostname'), value: d.name },
        { label: t('CPU (Core)'), value: `${d.cpu_used ?? 0} / ${d.cpus ?? 0}` },
        { label: t('Configured Memory (GiB)'), value: `${d.mem_used_gb} / ${d.mem_total_gb}` },
        { label: t('Configured Disk (GiB)'), value: `${d.disk_used ?? 0} / ${d.disk_total ?? 0}` },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
      ]}
      tabs={(d) => [{ key: 'detail', label: t('Detail'), render: () => <HostInfoTab d={d} /> }]}
    />
  );
}
