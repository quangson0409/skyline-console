import React from 'react';
import { Col, Row, Tag } from 'antd';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { t } from '@/core/i18n';
import InstanceTable from '../_shared/InstanceTable';
import { filterTabsByPolicy } from '../_shared';
import {
  fetchFlavorDetail,
  flavorArchitectures,
  flavorCategoryList,
  formatRam,
  bandwidthRender,
  categoryHasIOPS,
  categoryHasEphemeral,
  isGpuCategory,
  isComputeOptimized,
  isBareMetal,
  cpuPolicyList,
  cpuThreadPolicyMap,
  pageTypeMap,
  flavorRowActions,
} from './helpers';

const mapValue = (map, v) => (v === undefined || v === null || v === '' ? '-' : map[v] || v);

/** Legacy Detail/BaseDetail left cards */
const buildCards = (d) => {
  const { category, architecture, disk, usbType } = d;
  const cards = [];
  const extra = d.originData?.extra_specs || {};

  if (isBareMetal(architecture)) {
    const listOf = (prefix) => {
      const keys = Object.keys(extra).filter((k) => k.indexOf(prefix) === 0);
      return keys.length ? keys.map((k) => <div key={k}>{`${k.replace(prefix, '')} = ${extra[k]}`}</div>) : '-';
    };
    cards.push({
      title: t('Base Info'),
      items: [
        { label: t('Resource Class Properties'), render: () => listOf('resources:') },
        { label: t('Trait Properties'), render: () => listOf('trait:') },
      ],
    });
  } else {
    const items = [{ label: t('Internal Network Bandwidth (Gbps)'), value: bandwidthRender(d['quota:vif_outbound_average']) }];
    if (categoryHasEphemeral(category)) {
      items.push({ label: t('Ephemeral Disk (GiB)'), value: d['OS-FLV-EXT-DATA:ephemeral'] });
    }
    if (categoryHasIOPS(category)) {
      items.push({ label: t('Storage IOPS'), value: d['quota:disk_total_iops_sec'] || '-' });
    }
    if (!isComputeOptimized(category)) {
      items.push({ label: t('NUMA Node Count'), value: d['hw:numa_nodes'] });
      items.push({ label: t('Memory Page Size'), value: mapValue(pageTypeMap(), d['hw:mem_page_size']) });
    }
    cards.push({ title: t('Base Info'), items });
  }
  if (disk) {
    cards.push({ title: t('Disk Info'), items: [{ label: t('Root Disk (GiB)'), value: disk }] });
  }
  if (isGpuCategory(category)) {
    cards.push({
      title: t('GPU Info'),
      items: [
        { label: t('GPU Type'), value: d.gpuType },
        { label: t('GPU Count'), value: d.gpuCount },
      ],
    });
  }
  if (usbType && usbType !== '-') {
    cards.push({
      title: t('USB Info'),
      items: [
        { label: t('USB Controller'), value: usbType },
        { label: t('Number of USB Controllers'), value: d.usbCount },
      ],
    });
  }
  if (isComputeOptimized(category)) {
    const nodes = Number(d['hw:numa_nodes']) || 0;
    const numa = Array.from({ length: nodes }).map((_, index) => ({
      label: `${t('NUMA Node')}-${index + 1}`,
      render: () => (
        <div>
          <span style={{ marginRight: 16 }}>
            {t('CPU')} : {d[`hw:numa_cpus.${index}`] ?? '-'}
          </span>
          {t('Memory (MiB)')} : {d[`hw:numa_mem.${index}`] ?? '-'}
        </div>
      ),
    }));
    cards.push({
      title: t('Compute Optimized Info'),
      items: [
        { label: t('NUMA Node Count'), value: d['hw:numa_nodes'] },
        ...numa,
        { label: t('CPU Policy'), value: mapValue(cpuPolicyList(), d['hw:cpu_policy']) },
        { label: t('CPU Thread Policy'), value: mapValue(cpuThreadPolicyMap(), d['hw:cpu_thread_policy']) },
        { label: t('Memory Page Size'), value: mapValue(pageTypeMap(), d['hw:mem_page_size']) },
      ],
    });
  }
  return cards;
};

function FlavorBaseDetail({ detail }) {
  const cards = buildCards(detail);
  return (
    <Row gutter={16}>
      <Col xs={24} lg={14}>
        {cards.map((c) => (
          <DetailCard key={c.title} title={c.title} items={c.items} column={{ xs: 1, sm: 1, md: 2 }} />
        ))}
      </Col>
      <Col xs={24} lg={10}>
        <DetailCard
          title={t('Parameters')}
          column={1}
          items={[
            {
              label: '',
              render: () => (
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {JSON.stringify(detail.originData || {}, null, 4)}
                </pre>
              ),
            },
          ]}
        />
      </Col>
    </Row>
  );
}

export default function FlavorDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Compute'), { title: t('Flavors'), path: '/compute/flavor' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/compute/flavor-admin' : '/compute/flavor')}
      title={t('Flavor')}
      policy="os_compute_api:os-flavor-extra-specs:index"
      fetch={(id) => fetchFlavorDetail(id)}
      statusField="__none__"
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Architecture'), value: mapValue(flavorArchitectures(), d.architecture) },
        { label: t('Category'), value: mapValue(flavorCategoryList(), d.category) },
        { label: t('vCPU'), value: d.vcpus },
        { label: t('Memory'), value: formatRam(d.ram) },
        { label: t('Public'), render: () => (d.is_public ? <Tag color="green">{t('Yes')}</Tag> : <Tag>{t('No')}</Tag>) },
        { label: t('Description'), value: d.description },
      ]}
      tabs={(d, { isAdmin }) =>
        filterTabsByPolicy([
          { key: 'detail', label: t('Detail'), render: () => <FlavorBaseDetail detail={d} /> },
          {
            key: 'members',
            label: t('Instances'),
            // legacy Instance list (inFlavorDetailPage): backend paging with flavor_id, legacy actions
            policy: isAdmin ? 'os_compute_api:servers:index:get_all_tenants' : 'os_compute_api:servers:index',
            render: () => (d.id ? <InstanceTable flavorId={d.id} /> : null),
          },
        ])
      }
      actions={({ isAdmin }) => (isAdmin ? flavorRowActions() : null)}
    />
  );
}

