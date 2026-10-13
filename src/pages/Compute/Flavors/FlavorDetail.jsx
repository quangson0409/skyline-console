import React from 'react';
import { Col, Row, Tag } from 'antd';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { nameColumn, statusColumn, timeColumn, projectColumn, textColumn } from '@/components/ResourcePage';
import DetailCard from '@/components/DetailCard';
import { novaApi } from '@/api/nova';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
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

/** Legacy "Instances" tab: Instance list filtered by flavor (flavor column removed) */
function FlavorInstances({ flavorId, isAdmin }) {
  const projectMap = useProjectMap();
  const addresses = (server, type) =>
    Object.values(server.addresses || {})
      .flat()
      .filter((a) => (a?.['OS-EXT-IPS:type'] || 'fixed') === type)
      .map((a) => a.addr);
  return (
    <ResourcePage
      embedded
      fetch={async () => {
        const params = { flavor: flavorId };
        if (isAdmin) params.all_tenants = 1;
        const res = await novaApi.listServersV(params);
        return (res?.servers || []).map((s) => ({
          ...s,
          project_id: s.tenant_id || s.project_id,
          host: s['OS-EXT-SRV-ATTR:host'],
          fixed_addresses: addresses(s, 'fixed'),
          floating_addresses: addresses(s, 'floating'),
        }));
      }}
      deps={[flavorId, isAdmin]}
      columns={[
        nameColumn({ linkTo: (r) => `/compute/${isAdmin ? 'instance-admin' : 'instance'}/detail/${r.id}` }),
        isAdmin && projectColumn(projectMap),
        isAdmin && textColumn(t('Host'), 'host'),
        {
          title: t('Instance IP'),
          dataIndex: 'fixed_addresses',
          key: 'fixed_addresses',
          render: (v) => (v?.length ? v.map((ip) => <div key={ip}>{ip}</div>) : '-'),
        },
        {
          title: t('Floating IP'),
          dataIndex: 'floating_addresses',
          key: 'floating_addresses',
          render: (v) => (v?.length ? v.map((ip) => <div key={ip}>{ip}</div>) : '-'),
        },
        statusColumn(),
        {
          title: t('Locked'),
          dataIndex: 'locked',
          key: 'locked',
          render: (v) => (v ? <Tag color="orange">{t('Locked')}</Tag> : t('Not locked')),
        },
        timeColumn(),
      ].filter(Boolean)}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'fixed_addresses', label: t('Instance IP') },
        ...(isAdmin
          ? [
              { name: 'project_id', label: t('Project ID') },
              { name: 'host', label: t('Host') },
            ]
          : []),
        { name: 'status', label: t('Status') },
      ]}
    />
  );
}

export default function FlavorDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Compute'), { title: t('Flavors'), path: '/compute/flavor' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/compute/flavor-admin' : '/compute/flavor')}
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
      tabs={(d, { isAdmin }) => [
        { key: 'detail', label: t('Detail'), render: () => <FlavorBaseDetail detail={d} /> },
        {
          key: 'members',
          label: t('Instances'),
          render: () => (d.id ? <FlavorInstances flavorId={d.id} isAdmin={isAdmin} /> : null),
        },
      ]}
      actions={({ isAdmin }) => (isAdmin ? flavorRowActions() : null)}
    />
  );
}

