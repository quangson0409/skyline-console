import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, InputNumber, Select, Space, Switch, Table, Tag, Tooltip, Empty } from 'antd';
import { DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import apiClient from '@/api/client';
import { novaApi } from '@/api/nova';
import { glanceApi } from '@/api/glance';
import { keystoneApi } from '@/api/keystone';
import { nameColumn, textColumn, deleteAction, IdNameCell } from '@/components/ResourcePage';
import { t } from '@/core/i18n';

/* ------------------------------------------------------------------ */
/* Port of legacy src/resources/nova/flavor.js                         */
/* ------------------------------------------------------------------ */

export const cpuPolicyList = () => ({
  dedicated: t('Dedicated'),
  shared: t('Shared'),
});

export const cpuThreadPolicyList = () => [
  { label: t('Prefer (Thread siblings are preferred)'), value: 'prefer' },
  { label: t('Isolate (No multithreading)'), value: 'isolate' },
  { label: t('Require (Need multithreading)'), value: 'require' },
];

export const cpuThreadPolicyMap = () => ({
  prefer: t('Prefer'),
  isolate: t('Isolate'),
  require: t('Require'),
});

export const pageTypeList = () => [
  { label: t('Large (Optimal performance)'), value: 'large' },
  { label: t('Small (Not recommended)'), value: 'small' },
  { label: t('Any (Random)'), value: 'any' },
  { label: t('Custom'), value: 'custom' },
];

export const pageTypeMap = () => ({
  large: t('Large'),
  small: t('Small'),
  any: t('Any'),
});

export const flavorArchitectures = () => ({
  x86_architecture: t('x86 Architecture'),
  heterogeneous_computing: t('Heterogeneous Computing'),
  bare_metal: t('Bare Metal'),
  arm_architecture: t('ARM Architecture'),
  custom: t('Custom'),
  all: t('All Flavors'),
});

export const x86CategoryList = () => ({
  general_purpose: t('General Purpose'),
  compute_optimized: t('Compute Optimized'),
  memory_optimized: t('Memory Optimized'),
  big_data: t('Big Data'),
  local_ssd: t('Local SSD'),
  high_clock_speed: t('High Clock Speed'),
});

export const ironicCategoryList = () => ({ general_purpose: t('General Purpose') });
export const armCategoryList = x86CategoryList;
export const heterogeneousCategoryList = () => ({
  compute_optimized_type_with_gpu: t('Compute Optimized Type with GPU'),
  visualization_compute_optimized_type_with_gpu: t('Visualization Compute Optimized Type with GPU'),
  compute_optimized_type: t('Compute Optimized Type'),
});
export const bareMetalCategoryList = () => ({ general_purpose: t('General Purpose') });
export const flavorCategoryList = () => ({ ...x86CategoryList(), ...heterogeneousCategoryList() });

/** Category list used by each architecture tab (legacy searchFilters) */
export const categoryListByArch = {
  x86_architecture: x86CategoryList,
  arm_architecture: armCategoryList,
  heterogeneous_computing: heterogeneousCategoryList,
  bare_metal: bareMetalCategoryList,
};

export const hasIOPSTypes = [
  'general_purpose',
  'compute_optimized',
  'memory_optimized',
  'high_clock_speed',
  'compute_optimized_type_with_gpu',
  'visualization_compute_optimized_type_with_gpu',
  'compute_optimized_type',
];
export const hasEphemeralTypes = ['big_data', 'local_ssd', 'compute_optimized_type_with_gpu'];

export const categoryHasIOPS = (category) => Boolean(category) && hasIOPSTypes.indexOf(category) >= 0;
export const categoryHasEphemeral = (category) => Boolean(category) && hasEphemeralTypes.indexOf(category) >= 0;
export const isGpuCategory = (category) => Boolean(category) && category.indexOf('_gpu') >= 0;
export const isGpuVisual = (category) => category === 'visualization_compute_optimized_type_with_gpu';
export const isComputeOptimized = (category) => category === 'compute_optimized_type';
export const isBareMetal = (architecture) => architecture === 'bare_metal';

export const isBareMetalFlavor = (data) => {
  const { extra_specs: extra = {} } = data?.originData || data || {};
  return isBareMetal(extra[':architecture']) || extra['trait:CUSTOM_GOLD'] === 'required';
};

export const DEFAULT_ARCHITECTURES = ['x86_architecture', 'heterogeneous_computing', 'bare_metal', 'arm_architecture'];

export const getFamilyItemValue = (settings) => {
  const item = (settings || []).find((it) => it?.key === 'flavor_families');
  return Array.isArray(item?.value) ? item.value : [];
};

/**
 * Legacy getAllArchitecture: architectures configured in the Skyline "flavor_families" setting.
 * When the setting is missing the default architecture list is used so flavors stay reachable.
 */
export const getAllArchitecture = (settings, withCustom = true) => {
  const architectures = getFamilyItemValue(settings)
    .map((it) => it?.architecture)
    .filter(Boolean);
  const list = architectures.length ? architectures : [...DEFAULT_ARCHITECTURES];
  if (withCustom) list.push('custom');
  return list;
};

export const getFlavorArchInfo = (flavor) => {
  const { architecture = '', category = '' } = flavor || {};
  if (!architecture) return '-';
  const archs = flavorArchitectures();
  if (architecture === 'custom') return archs[architecture];
  return `${archs[architecture] || architecture} - ${flavorCategoryList()[category] || category}`;
};

/** Port of legacy utils formatSize(ram, 2): ram in MiB */
export const formatRam = (ram) => {
  if (ram === undefined || ram === null || ram === '') return '-';
  let size = Number(ram);
  if (Number.isNaN(size)) return String(ram);
  const units = ['MiB', 'GiB', 'TiB', 'PiB'];
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size = parseFloat((size / 1024).toFixed(2));
    idx += 1;
  }
  return `${size} ${units[idx]}`;
};

export const bandwidthRender = (value) => (value ? value / 1000 / 125 : '-');

/** Legacy FlavorStore.getGpuInfo */
export const getGpuInfo = (record) => {
  const { extra_specs: extra = {} } = record || {};
  const alias = extra['pci_passthrough:alias'];
  const vgpu = extra['resources:VGPU'];
  const category = extra[':category'];
  let gpuType = '-';
  let gpuCount = '-';
  let usbType = '-';
  let usbCount = '-';
  if (vgpu) {
    [gpuType, gpuCount] = String(vgpu).split(':');
  }
  if (alias) {
    const parts = String(alias).split(',');
    if (category && !category.includes('visualization_')) {
      const [gpu, usb] = parts;
      [gpuType, gpuCount] = gpu.split(':');
      if (usb) [usbType, usbCount] = usb.split(':');
    } else {
      [usbType, usbCount] = parts[0].split(':');
    }
  }
  return { gpuType: gpuType ?? '-', gpuCount: gpuCount ?? '-', usbType: usbType ?? '-', usbCount: usbCount ?? '-' };
};

/** Legacy FlavorStore.mapperBeforeFetchProject */
export const mapFlavor = (data = {}) => {
  const { extra_specs: { key, ...extraRest } = {}, ...rest } = data || {};
  const isPublic = rest['os-flavor-access:is_public'];
  const architecture = extraRest[':architecture'] || 'custom';
  const category = extraRest[':category'];
  return {
    ...rest,
    ...extraRest,
    architecture,
    category,
    ...getGpuInfo(data),
    is_public: isPublic,
    isPublic: isPublic !== false,
    ramText: formatRam(rest.ram),
    categoryKey: category ? `[${category}]` : '',
    originData: data,
  };
};

/* ------------------------------------------------------------------ */
/* Data loading                                                         */
/* ------------------------------------------------------------------ */

/** Skyline settings (legacy stores/skyline/setting: GET /settings, hidden items dropped) */
export const fetchSkylineSettings = async () => {
  try {
    const res = await apiClient.get('/openstack/skyline/api/v1/settings');
    const list = Array.isArray(res?.settings) ? res.settings : Array.isArray(res) ? res : [];
    return list.filter((it) => it && !it.hidden);
  } catch {
    return [];
  }
};

export const getSettingOptions = (settings, key) => {
  const item = (settings || []).find((it) => it?.key === key);
  if (!item) return [];
  if (Array.isArray(item.value)) return item.value.map((it) => ({ value: it, label: it }));
  if (item.value && typeof item.value === 'object') return Object.keys(item.value).map((it) => ({ value: it, label: it }));
  return [];
};

/** Legacy FlavorStore list: admin uses is_public=None (all flavors), tab filters by architecture */
export const fetchFlavors = async ({ isAdmin, tab } = {}) => {
  const res = await novaApi.listFlavorsV(isAdmin ? { is_public: 'None' } : {});
  const items = (res?.flavors || []).map(mapFlavor);
  if (!tab || tab === 'all') return items;
  return items.filter((it) => it.architecture === tab);
};

export const fetchFlavorDetail = async (id) => {
  const res = await novaApi.getFlavorV(id);
  const flavor = res?.flavor || res || {};
  let data = { id, ...flavor };
  if (!flavor.extra_specs) {
    try {
      const specs = await novaApi.getFlavorExtraSpecsV(id);
      data = { ...data, extra_specs: specs?.extra_specs || {} };
    } catch {
      data = { ...data, extra_specs: {} };
    }
  }
  return mapFlavor(data);
};

/** Legacy ProjectStore.fetchProjectsWithDomain */
export const fetchProjectsWithDomain = async () => {
  const [pRes, dRes] = await Promise.all([
    keystoneApi.listProjects().catch(() => ({})),
    keystoneApi.listDomains().catch(() => ({})),
  ]);
  const domains = dRes?.domains || [];
  return (pRes?.projects || []).map((p) => ({
    ...p,
    domainName: domains.find((d) => d.id === p.domain_id)?.name,
  }));
};

/** Legacy FlavorStore.updateAccess */
export const updateFlavorAccess = async (id, adds = [], dels = []) => {
  await Promise.all(adds.map((tenant) => novaApi.flavorActionV(id, { addTenantAccess: { tenant } })));
  await Promise.all(dels.map((tenant) => novaApi.flavorActionV(id, { removeTenantAccess: { tenant } })));
};

/** Legacy FlavorStore.updateExtraSpecs(id, adds, updates, dels) */
export const updateExtraSpecs = async (id, adds = [], updates = [], dels = []) => {
  if (adds.length > 0) {
    const body = {};
    adds.forEach((item) => {
      body[item.key] = item.value;
    });
    await novaApi.createFlavorExtraSpecsV(id, body);
  }
  if (updates.length > 0) {
    await Promise.all(updates.map((item) => novaApi.updateFlavorExtraSpecV(id, item.key, item.value)));
  }
  if (dels.length > 0) {
    await Promise.all(dels.map((key) => novaApi.deleteFlavorExtraSpecV(id, key)));
  }
};

/** Legacy MetadataStore.fetchList({ manage: true, resource_types: 'OS::Nova::Flavor' }) */
export const fetchFlavorMetadefs = async () => {
  const resourceType = 'OS::Nova::Flavor';
  let namespaces = [];
  try {
    const res = await glanceApi.listNamespaces({ resource_types: resourceType });
    namespaces = (res?.namespaces || []).filter((it) => it?.namespace);
  } catch {
    return [];
  }
  const details = await Promise.all(
    namespaces.map((it) => glanceApi.getNamespace(it.namespace, { resource_type: resourceType }).catch(() => ({})))
  );
  const result = [];
  namespaces.forEach((ns, index) => {
    const detail = details[index] || {};
    const title = ns.display_name || ns.namespace;
    if (Array.isArray(detail.objects) && detail.objects.length) {
      detail.objects.forEach((ob) => result.push({ id: `${ns.namespace}:${ob.name}`, title: `${title} / ${ob.name}`, properties: ob.properties || {} }));
    } else {
      result.push({ id: ns.namespace, title, properties: detail.properties || {} });
    }
  });
  return result;
};

/* ------------------------------------------------------------------ */
/* Form widgets                                                         */
/* ------------------------------------------------------------------ */

export const projectSelectColumns = () => [
  {
    title: t('Project ID/Name'),
    dataIndex: 'name',
    render: (v, r) => <IdNameCell id={r.id} name={v} />,
  },
  {
    title: t('Domain ID/Name'),
    dataIndex: 'domainName',
    render: (v, r) => <IdNameCell id={r.domain_id} name={v} bold={false} />,
  },
  { title: t('Enabled'), dataIndex: 'enabled', render: (v) => (v ? <Tag color="green">{t('Yes')}</Tag> : <Tag>{t('No')}</Tag>) },
  { title: t('Description'), dataIndex: 'description', render: (v) => v || '-' },
];

/** Port of legacy "select-table" (multi) with projectTableOptions; value = array of project ids */
export function ProjectSelectTable({ value, onChange, projects }) {
  const [list, setList] = useState(projects || []);
  const [loading, setLoading] = useState(!projects);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (projects) return undefined;
    let alive = true;
    fetchProjectsWithDomain()
      .then((data) => alive && setList(data))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [projects]);
  const keys = Array.isArray(value) ? value : [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((it) =>
      ['name', 'id', 'domainName', 'domain_id'].some((k) => String(it[k] ?? '').toLowerCase().includes(s))
    );
  }, [list, q]);
  return (
    <div>
      <Input
        allowClear
        size="small"
        prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
        placeholder={t('Search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: 260, marginBottom: 8 }}
      />
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        columns={projectSelectColumns()}
        dataSource={filtered}
        pagination={{ pageSize: 5, size: 'small', hideOnSinglePage: true }}
        rowSelection={{ type: 'checkbox', selectedRowKeys: keys, preserveSelectedRowKeys: true, onChange: (k) => onChange?.(k) }}
        scroll={{ x: true }}
      />
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
        {t('Selected')}: {keys.length ? keys.map((k) => list.find((p) => p.id === k)?.name || k).join(', ') : '-'}
      </div>
    </div>
  );
}

/** Port of legacy "add-select" + KeyValueInput; value = [{ key, value }] */
export function KeyValueList({ value, onChange, addText, readonlyKeys = [], minCount = 0 }) {
  const list = Array.isArray(value) ? value : [];
  const update = (idx, patch) => onChange?.(list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {list.map((it, idx) => {
        const keyLocked = idx < readonlyKeys.length && readonlyKeys.includes(it.key);
        return (
          // eslint-disable-next-line react/no-array-index-key
          <Space key={idx} style={{ width: '100%' }} align="start">
            <Input
              placeholder={t('Key')}
              value={it.key}
              disabled={keyLocked}
              onChange={(e) => update(idx, { key: e.target.value })}
              style={{ width: 240 }}
            />
            <span>=</span>
            <Input placeholder={t('Value')} value={it.value} onChange={(e) => update(idx, { value: e.target.value })} style={{ width: 240 }} />
            {idx >= Math.max(minCount, 0) ? (
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(list.filter((_, i) => i !== idx))} />
            ) : null}
          </Space>
        );
      })}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange?.([...list, { key: '', value: '' }])}>
        {addText || t('Add')}
      </Button>
    </Space>
  );
}

/** Legacy "add-select" with isInput: value = [string] */
export function StringList({ value, onChange, addText, placeholder }) {
  const list = Array.isArray(value) ? value : [];
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {list.map((it, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <Space key={idx}>
          <Input
            value={it}
            placeholder={placeholder}
            onChange={(e) => onChange?.(list.map((v, i) => (i === idx ? e.target.value : v)))}
            style={{ width: 360 }}
          />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(list.filter((_, i) => i !== idx))} />
        </Space>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange?.([...list, ''])}>
        {addText || t('Add')}
      </Button>
    </Space>
  );
}

/** NUMA nodes editor (legacy NUMAInput in add-select); value = [{ cpu, ram }] */
export function NumaNodesInput({ value, onChange, maxCount = 8, minCount = 1 }) {
  const list = Array.isArray(value) ? value : [];
  const update = (idx, patch) => onChange?.(list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {list.map((it, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <Space key={idx} wrap>
          <span style={{ minWidth: 90, display: 'inline-block' }}>{`${t('NUMA Node')}-${idx + 1}`}</span>
          <span>{t('CPU')}</span>
          <InputNumber min={1} value={it.cpu} onChange={(v) => update(idx, { cpu: v })} />
          <span>{t('Memory (MiB)')}</span>
          <InputNumber min={1} value={it.ram} onChange={(v) => update(idx, { ram: v })} />
          {list.length > minCount ? (
            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(list.filter((_, i) => i !== idx))} />
          ) : null}
        </Space>
      ))}
      {list.length < maxCount ? (
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange?.([...list, { cpu: 1, ram: 1024 }])}>
          {t('Add NUMA Node')}
        </Button>
      ) : null}
    </Space>
  );
}

const PropertyValueInput = ({ schema = {}, value, onChange }) => {
  if (Array.isArray(schema.enum) && schema.enum.length) {
    return (
      <Select
        style={{ width: 240 }}
        value={value}
        onChange={onChange}
        options={schema.enum.map((e) => ({ value: String(e), label: String(e) }))}
      />
    );
  }
  if (schema.type === 'boolean') {
    return <Switch checked={String(value) === 'true'} onChange={(v) => onChange(v ? 'true' : 'false')} />;
  }
  if (schema.type === 'integer' || schema.type === 'number') {
    return (
      <InputNumber
        style={{ width: 240 }}
        min={schema.minimum}
        max={schema.maximum}
        value={value === undefined || value === '' ? undefined : Number(value)}
        onChange={(v) => onChange(v === null || v === undefined ? undefined : String(v))}
      />
    );
  }
  return <Input style={{ width: 240 }} value={value} onChange={(e) => onChange(e.target.value)} />;
};

/** Port of legacy "metadata-transfer": value = { [key]: value } chosen from glance metadefs */
export function MetadataPicker({ value, onChange, metadata = [] }) {
  const current = value && typeof value === 'object' ? value : {};
  const schemaMap = useMemo(() => {
    const map = {};
    metadata.forEach((ns) => {
      Object.entries(ns.properties || {}).forEach(([k, schema]) => {
        map[k] = { ...schema, namespace: ns.title };
      });
    });
    return map;
  }, [metadata]);
  const options = metadata
    .map((ns) => ({
      label: ns.title,
      options: Object.entries(ns.properties || {})
        .filter(([k]) => !(k in current))
        .map(([k, schema]) => ({ value: k, label: `${schema.title || k} (${k})` })),
    }))
    .filter((g) => g.options.length);
  if (!metadata.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No Data')} />;
  }
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Select
        showSearch
        style={{ width: '100%' }}
        placeholder={t('Please select')}
        value={null}
        options={options}
        onChange={(k) => {
          const schema = schemaMap[k] || {};
          const def = schema.default !== undefined ? String(schema.default) : schema.type === 'boolean' ? 'false' : undefined;
          onChange?.({ ...current, [k]: def });
        }}
        filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
      />
      {Object.keys(current).map((k) => (
        <Space key={k} align="center" wrap>
          <Tooltip title={schemaMap[k]?.description}>
            <span style={{ display: 'inline-block', minWidth: 260, fontFamily: 'monospace', fontSize: 12 }}>
              {schemaMap[k]?.title ? `${schemaMap[k].title} (${k})` : k}
            </span>
          </Tooltip>
          <PropertyValueInput schema={schemaMap[k]} value={current[k]} onChange={(v) => onChange?.({ ...current, [k]: v })} />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => {
              const next = { ...current };
              delete next[k];
              onChange?.(next);
            }}
          />
        </Space>
      ))}
    </Space>
  );
}

/* ------------------------------------------------------------------ */
/* Columns / filters (legacy getBaseColumns, extraColumns, gpuColumns) */
/* ------------------------------------------------------------------ */

const valueMapColumn = (title, dataIndex, mapFn) => ({
  title,
  dataIndex,
  key: dataIndex,
  render: (v) => (v === undefined || v === null || v === '' ? '-' : mapFn()[v] || v),
});

export const getBaseColumns = ({ isAdmin } = {}) => [
  nameColumn({ linkTo: (r) => `/compute/${isAdmin ? 'flavor-admin' : 'flavor'}/detail/${r.id}` }),
  valueMapColumn(t('Category'), 'category', flavorCategoryList),
  { ...textColumn(t('Disk (GiB)'), 'disk'), sorter: (a, b) => (a.disk || 0) - (b.disk || 0) },
  { ...textColumn(t('vCPU'), 'vcpus'), sorter: (a, b) => (a.vcpus || 0) - (b.vcpus || 0) },
  { title: t('Memory'), dataIndex: 'ram', key: 'ram', sorter: (a, b) => (a.ram || 0) - (b.ram || 0), render: (v) => formatRam(v) },
  { title: t('Internal Network Bandwidth (Gbps)'), dataIndex: 'quota:vif_outbound_average', key: 'bandwidth', width: 120, render: bandwidthRender },
  textColumn(t('Ephemeral Disk (GiB)'), 'OS-FLV-EXT-DATA:ephemeral'),
  { title: t('Storage IOPS'), dataIndex: 'quota:disk_total_iops_sec', key: 'iops', render: (v) => v || '-' },
];

export const extraColumns = () => [
  {
    title: t('Public'),
    dataIndex: 'is_public',
    key: 'is_public',
    render: (v) => (
      <Tag color={v ? 'blue' : 'purple'} style={{ borderRadius: 10, fontSize: 11 }}>
        {v ? t('Public') : t('Private')}
      </Tag>
    ),
  },
];

export const cpuArchColumn = () => textColumn(t('CPU Architecture'), 'cpu_arch');

export const gpuColumns = () => [
  textColumn(t('GPU Type'), 'gpuType'),
  textColumn(t('GPU Count'), 'gpuCount'),
  textColumn(t('NUMA Nodes'), 'hw:numa_nodes'),
  valueMapColumn(t('CPU Policy'), 'hw:cpu_policy', cpuPolicyList),
  valueMapColumn(t('CPU Thread Policy'), 'hw:cpu_thread_policy', cpuThreadPolicyMap),
  valueMapColumn(t('Memory Page'), 'hw:mem_page_size', pageTypeMap),
];

/** Columns of each architecture tab exactly as the legacy tab containers */
export const getColumnsByTab = (tab, ctx) => {
  const base = getBaseColumns(ctx);
  switch (tab) {
    case 'heterogeneous_computing':
      return [...base, ...gpuColumns(), ...extraColumns()];
    case 'bare_metal': {
      const removes = ['quota:vif_outbound_average', 'OS-FLV-EXT-DATA:ephemeral', 'quota:disk_total_iops_sec'];
      return [...base, ...extraColumns()].filter((it) => removes.indexOf(it.dataIndex) < 0);
    }
    case 'custom': {
      const cols = [...base];
      cols.splice(1, 1);
      return [...cols, ...extraColumns()];
    }
    case 'all':
      return [
        base[0],
        { title: t('Architecture'), dataIndex: 'architecture', key: 'architecture', render: (_, r) => getFlavorArchInfo(r) },
        ...base.slice(2),
        ...extraColumns(),
      ];
    default:
      return [...base, ...extraColumns()];
  }
};

/** Legacy getFlavorSearchFilters(category) - client side on derived fields */
export const getFlavorFilters = (tab) => {
  const filters = [
    { name: 'name', label: t('Name') },
    { name: 'vcpus', label: t('CPU') },
    { name: 'ramText', label: t('Memory') },
    { name: 'disk', label: t('Disk') },
  ];
  const catFn = categoryListByArch[tab];
  if (catFn) {
    filters.push({
      name: 'categoryKey',
      label: t('Category'),
      options: Object.entries(catFn()).map(([k, label]) => ({ key: `[${k}]`, label })),
    });
  }
  return filters;
};

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

export const deleteFlavorAction = () => ({
  ...deleteAction({ name: t('Flavor'), onDelete: (it) => novaApi.deleteFlavorV(it.id) }),
  title: t('Delete Flavor'),
  buttonText: t('Delete'),
  actionName: t('delete flavor'),
  description: t(
    "If an instance is using this flavor, deleting it will cause the instance's flavor data to be missing. Are you sure to delete {name}?",
    { name: t('flavor') }
  ),
});

export const editFlavorAction = () => ({
  id: 'edit-flavor',
  type: 'modal',
  title: t('Edit Flavor'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description || '' }),
  formItems: [
    { name: 'name', label: t('Flavor Name'), type: 'label' },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => novaApi.updateFlavorV(item.id, { description: values.description || null }),
});

export const manageAccessAction = () => ({
  id: 'manage-access',
  type: 'modal',
  title: t('Manage Access'),
  width: 900,
  allowed: (item) => !item.is_public,
  getDefaultValues: async (item) => {
    const res = await novaApi.getFlavorAccessV(item.id).catch(() => ({}));
    const access = (res?.flavor_access || []).map((it) => it.tenant_id);
    return { name: item.name, access, currentAccess: access };
  },
  getFormItems: async () => {
    const projects = await fetchProjectsWithDomain();
    return [
      { name: 'name', label: t('Flavor Name'), type: 'label' },
      {
        name: 'access',
        label: t('Access Control'),
        rules: [
          {
            validator: (_, v) =>
              Array.isArray(v) && v.length ? Promise.resolve() : Promise.reject(new Error(`${t('Please select')} ${t('Access Control')}`)),
          },
        ],
        render: () => <ProjectSelectTable projects={projects} />,
      },
    ];
  },
  onSubmit: async (values, item) => {
    const { access } = values;
    if (!access) return undefined;
    const res = await novaApi.getFlavorAccessV(item.id).catch(() => ({}));
    const currentAccess = (res?.flavor_access || []).map((it) => it.tenant_id);
    const adds = access.filter((it) => currentAccess.indexOf(it) < 0);
    const dels = currentAccess.filter((it) => access.indexOf(it) < 0);
    return updateFlavorAccess(item.id, adds, dels);
  },
});

const getItemMetadata = (item) => {
  const { extra_specs: extra = {}, originData = {} } = item || {};
  return originData && Object.keys(originData).length ? originData.extra_specs || {} : extra;
};

const parseExistMetadata = (item, metadata) => {
  const customs = [];
  const systems = {};
  const specs = getItemMetadata(item);
  const inSystem = (key) => metadata.some((ns) => Object.keys(ns.properties || {}).indexOf(key) >= 0);
  Object.keys(specs).forEach((key) => {
    if (inSystem(key)) systems[key] = specs[key];
    else customs.push({ key, value: specs[key] });
  });
  return { customs, systems };
};

/** Legacy ManageMetadata: flavor extra specs = custom key/values + glance metadefs (OS::Nova::Flavor) */
export const manageMetadataAction = () => {
  let metadataCache = [];
  return {
    id: 'ManageMetadata',
    type: 'modal',
    title: t('Manage Metadata'),
    width: 900,
    getDefaultValues: async (item) => {
      metadataCache = await fetchFlavorMetadefs();
      const { customs, systems } = parseExistMetadata(item, metadataCache);
      return { name: item.name, customs, systems };
    },
    getFormItems: async () => [
      { name: 'name', label: t('Name'), type: 'label' },
      {
        name: 'customs',
        label: t('Custom Metadata'),
        rules: [
          {
            validator: (_, v) => {
              const bad = (v || []).find((it) => !it?.key || it.value === undefined || it.value === null);
              return bad ? Promise.reject(new Error(t('Please enter complete key value!'))) : Promise.resolve();
            },
          },
        ],
        render: () => <KeyValueList addText={t('Add Custom Metadata')} />,
      },
      {
        name: 'systems',
        label: t('Metadata'),
        rules: [
          {
            validator: (_, v) =>
              Object.keys(v || {}).some((k) => v[k] === undefined)
                ? Promise.reject(new Error(t('Please input value')))
                : Promise.resolve(),
          },
        ],
        render: () => <MetadataPicker metadata={metadataCache} />,
      },
    ],
    onSubmit: async (values, item) => {
      const metadata = metadataCache.length ? metadataCache : await fetchFlavorMetadefs();
      const { customs: oldCustoms, systems: oldSystems } = parseExistMetadata(item, metadata);
      const customs = values.customs || [];
      const systems = values.systems || {};
      const adds = [];
      const removes = [];
      const replaces = [];
      customs.forEach((it) => {
        const oldItem = oldCustoms.find((c) => c.key === it.key);
        if (!oldItem) adds.push({ key: it.key, value: it.value });
        else if (oldItem.value !== it.value) replaces.push({ key: it.key, value: it.value });
      });
      Object.keys(systems).forEach((key) => {
        const entry = { key, value: systems[key] };
        if (!Object.prototype.hasOwnProperty.call(oldSystems, key)) adds.push(entry);
        else if (systems[key] !== oldSystems[key]) replaces.push(entry);
      });
      oldCustoms.forEach((it) => {
        if (!customs.find((c) => c.key === it.key)) removes.push(it.key);
      });
      Object.keys(oldSystems).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(systems, key)) removes.push(key);
      });
      return updateExtraSpecs(item.id, adds, replaces, removes);
    },
  };
};

/** Admin row actions (legacy: Delete + Manage Access; Other tab also Manage Metadata) */
export const flavorRowActions = () => ({
  firstAction: deleteFlavorAction(),
  moreActions: [{ action: manageAccessAction() }, { action: manageMetadataAction() }, { action: editFlavorAction() }],
});

