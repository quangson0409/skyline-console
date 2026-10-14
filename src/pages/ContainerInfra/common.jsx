import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { novaApi } from '@/api/nova';
import { neutronApi } from '@/api/neutron';
import { glanceApi } from '@/api/glance';
import { formatSize, IdNameCell } from '@/components/ResourcePage';
import { t } from '@/core/i18n';

/** Legacy resources/magnum/cluster.js */
export const clusterStatus = () => ({
  CREATE_IN_PROGRESS: t('CREATE IN PROGRESS'),
  CREATE_COMPLETE: t('CREATE COMPLETE'),
  CREATE_FAILED: t('CREATE FAILED'),
  UPDATE_IN_PROGRESS: t('UPDATE IN PROGRESS'),
  UPDATE_COMPLETE: t('UPDATE COMPLETE'),
  UPDATE_FAILED: t('UPDATE FAILED'),
  DELETE_IN_PROGRESS: t('DELETE IN PROGRESS'),
  DELETE_COMPLETE: t('DELETE COMPLETE'),
  DELETE_FAILED: t('DELETE FAILED'),
  RESUME_COMPLETE: t('RESUME COMPLETE'),
  RESUME_FAILED: t('RESUME FAILED'),
  RESTORE_COMPLETE: t('RESTORE COMPLETE'),
  ROLLBACK_IN_PROGRESS: t('ROLLBACK IN PROGRESS'),
  ROLLBACK_COMPLETE: t('ROLLBACK COMPLETE'),
  ROLLBACK_FAILED: t('ROLLBACK FAILED'),
  SNAPSHOT_COMPLETE: t('SNAPSHOT COMPLETE'),
  CHECK_COMPLETE: t('CHECK COMPLETE'),
  ADOPT_COMPLETE: t('ADOPT COMPLETE'),
});

export const healthStatus = () => ({
  HEALTHY: t('HEALTHY'),
  UNHEALTHY: t('UNHEALTHY'),
  UNKNOWN: t('UNKNOWN'),
});

export const defaultTip = () => t('If it’s not set, the value of this in the template will be used.');

export const toOptions = (map) => Object.entries(map).map(([key, label]) => ({ key, label }));

export const isClusterTransition = (item = {}) => /IN_PROGRESS/.test(String(item.status || ''));

/** "{key} : {value}" list used by labels / faults / health log cards */
export const renderKeyValueList = (value) => {
  const entries = Object.entries(value || {});
  if (!entries.length) return '-';
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {entries.map(([key, val]) => (
        <li key={key} style={{ wordBreak: 'break-all' }}>
          {key} : {typeof val === 'object' ? JSON.stringify(val) : String(val)}
        </li>
      ))}
    </ul>
  );
};

export const deletedText = (id) => `${id} (${t('The resource has been deleted')})`;

/** Resource link that falls back to "<id> (The resource has been deleted)" like legacy cards */
export const refLink = ({ id, original, name, to }) => {
  if (original) return deletedText(original);
  if (!id) return '-';
  return to ? <Link to={to}>{name || id}</Link> : name || id;
};

export const keypairLink = (name) =>
  name ? <Link to={`/compute/keypair/detail/${encodeURIComponent(name)}`}>{name}</Link> : '-';

/* ------------------------------------------------------------------ */
/* Key / value list (legacy add-select + KeyValueInput)               */
/* ------------------------------------------------------------------ */

export const labelsToList = (labels) =>
  Object.entries(labels || {}).map(([key, value]) => ({ key, value: value === null || value === undefined ? '' : String(value) }));

export const listToLabels = (list) =>
  (list || []).reduce((acc, it) => {
    if (it && it.key) acc[it.key] = it.value ?? '';
    return acc;
  }, {});

export function KeyValueList({ value, onChange, addText, keyPlaceholder, valuePlaceholder }) {
  const list = Array.isArray(value) ? value : [];
  const update = (idx, patch) => onChange?.(list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {list.map((it, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            placeholder={keyPlaceholder || t('Key')}
            value={it.key}
            onChange={(e) => update(idx, { key: e.target.value })}
            style={{ flex: '1 1 160px', maxWidth: 280 }}
          />
          <span>=</span>
          <Input
            placeholder={valuePlaceholder || t('Value')}
            value={it.value}
            onChange={(e) => update(idx, { value: e.target.value })}
            style={{ flex: '1 1 160px', maxWidth: 280 }}
          />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(list.filter((_, i) => i !== idx))} />
        </div>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange?.([...list, { key: '', value: '' }])}>
        {addText || t('Add')}
      </Button>
    </Space>
  );
}

/** Legacy keyValueValidator: every row needs key and value */
export const keyValueRule = () => ({
  validator: (_, value) =>
    (value || []).some((it) => !it?.key || !it?.value)
      ? Promise.reject(new Error(t('Please input key and value')))
      : Promise.resolve(),
});

/* ------------------------------------------------------------------ */
/* Column sets (legacy resources/magnum/template.js)                  */
/* ------------------------------------------------------------------ */

const flavorArchitectures = () => ({
  x86_architecture: t('X86 Architecture'),
  heterogeneous_computing: t('Heterogeneous Computing'),
  bare_metal: t('Bare Metal'),
  arm_architecture: t('ARM Architecture'),
  custom: t('Custom'),
});

const flavorCategoryList = () => ({
  general_purpose: t('General Purpose'),
  compute_optimized: t('Compute Optimized'),
  memory_optimized: t('Memory Optimized'),
  high_clock_speed: t('High Clock Speed'),
  big_data: t('Big Data'),
  local_ssd: t('Local SSD'),
  high_performance: t('High Performance'),
  compute_optimized_type_with_gpu: t('Compute Optimized Type with GPU'),
  visualization_compute_optimized_type_with_gpu: t('Visualization Compute Optimized Type with GPU'),
  custom: t('Custom'),
});

export const flavorColumns = () => [
  {
    title: t('ID/Name'),
    dataIndex: 'name',
    key: 'name',
    render: (v, r) => <IdNameCell id={r.id} name={v} />,
  },
  {
    title: t('Architecture'),
    dataIndex: 'architecture',
    key: 'architecture',
    render: (v) => flavorArchitectures()[v] || v || '-',
  },
  {
    title: t('Category'),
    dataIndex: 'category',
    key: 'category',
    render: (v) => flavorCategoryList()[v] || v || '-',
  },
  { title: t('CPU'), dataIndex: 'vcpus', key: 'vcpus' },
  { title: t('Memory'), dataIndex: 'ram', key: 'ram', render: (ram) => formatSize((ram || 0) * 1024 * 1024) },
];

export const keypairColumns = () => [
  { title: t('Name'), dataIndex: 'name', key: 'name' },
  { title: t('Fingerprint'), dataIndex: 'fingerprint', key: 'fingerprint' },
];

export const networkColumns = () => [
  {
    title: t('ID/Name'),
    dataIndex: 'name',
    key: 'name',
    render: (v, r) => <IdNameCell id={r.id} name={v} />,
  },
  { title: t('Shared'), dataIndex: 'shared', key: 'shared', render: (v) => (v ? t('Yes') : t('No')) },
  { title: t('External'), dataIndex: 'router:external', key: 'external', render: (v) => (v ? t('Yes') : t('No')) },
  { title: t('Status'), dataIndex: 'status', key: 'status' },
  {
    title: t('Subnet Count'),
    dataIndex: 'subnets',
    key: 'subnets',
    render: (v) => (Array.isArray(v) ? v.length : 0),
  },
];

export const subnetColumns = () => [
  {
    title: t('ID/Name'),
    dataIndex: 'name',
    key: 'name',
    render: (v, r) => <IdNameCell id={r.id} name={v} />,
  },
  { title: t('CIDR'), dataIndex: 'cidr', key: 'cidr' },
  { title: t('IP Version'), dataIndex: 'ip_version', key: 'ip_version', render: (v) => (v ? `IPv${v}` : '-') },
  { title: t('Gateway IP'), dataIndex: 'gateway_ip', key: 'gateway_ip', render: (v) => v || '-' },
];

export const imageColumns = () => [
  {
    title: t('ID/Name'),
    dataIndex: 'name',
    key: 'name',
    render: (v, r) => <IdNameCell id={r.id} name={v} />,
  },
  { title: t('OS'), dataIndex: 'os_distro', key: 'os_distro', render: (v) => v || '-' },
  { title: t('OS Version'), dataIndex: 'os_version', key: 'os_version', render: (v) => v || '-' },
  { title: t('Disk Format'), dataIndex: 'disk_format', key: 'disk_format', render: (v) => (v ? String(v).toUpperCase() : '-') },
  { title: t('Size'), dataIndex: 'size', key: 'size', render: (v) => formatSize(v) },
  { title: t('Visibility'), dataIndex: 'visibility', key: 'visibility', render: (v) => v || '-' },
];

/* ------------------------------------------------------------------ */
/* Lookups                                                            */
/* ------------------------------------------------------------------ */

export const settled = (promises) =>
  Promise.all(
    promises.map((p) =>
      Promise.resolve(p).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason })
      )
    )
  );

export const fetchFlavors = async () => {
  const res = await novaApi.listFlavors({ is_public: 'None' }).catch(() => novaApi.listFlavors());
  return (res?.flavors || []).map((f) => ({
    ...f,
    architecture: f.extra_specs?.[':architecture'],
    category: f.extra_specs?.[':category'],
  }));
};

export const fetchKeypairs = async () => {
  const res = await novaApi.listKeypairs();
  return (res?.keypairs || []).map((k) => ({ ...(k.keypair || k), id: (k.keypair || k).name }));
};

/**
 * Magnum stores references by id or by name (templates created from the CLI often use names).
 * Find the matching row by id first, then by name.
 */
export const findRef = (list = [], ref) => (ref ? list.find((it) => it.id === ref) || list.find((it) => it.name === ref) : undefined);

/** Show a resource by id, falling back to a "name=" list query (names are accepted by magnum) */
export const resolveFlavor = async (ref) => {
  if (!ref) return null;
  try {
    const res = await novaApi.getFlavor(ref);
    if (res?.flavor) return res.flavor;
  } catch {
    // fall through to name lookup
  }
  const all = await fetchFlavors().catch(() => []);
  return findRef(all, ref) || null;
};

export const resolveNetwork = async (ref) => {
  if (!ref) return null;
  try {
    const res = await neutronApi.getNetwork(ref);
    if (res?.network) return res.network;
  } catch {
    // name lookup below
  }
  const res = await neutronApi.listNetworks({ name: ref }).catch(() => ({}));
  return res?.networks?.[0] || null;
};

export const resolveSubnet = async (ref) => {
  if (!ref) return null;
  try {
    const res = await neutronApi.getSubnet(ref);
    if (res?.subnet) return res.subnet;
  } catch {
    // name lookup below
  }
  const res = await neutronApi.listSubnets({ name: ref }).catch(() => ({}));
  return res?.subnets?.[0] || null;
};

export const resolveImage = async (ref) => {
  if (!ref) return null;
  try {
    const res = await glanceApi.getImage(ref);
    if (res?.id) return res;
  } catch {
    // name lookup below
  }
  const res = await glanceApi.listImages({ name: ref }).catch(() => ({}));
  return res?.images?.[0] || null;
};

/** Legacy getGiBValue (MiB -> GiB) */
export const getGiBValue = (input) => {
  if (typeof input !== 'number' || Number.isNaN(input) || !input) return 0;
  return parseFloat(Number(input / 1024).toFixed(2));
};

/** Legacy updateQuotaData: in_use -> used, left = limit - used - reserved */
export const updateQuotaData = (quota) => {
  const data = JSON.parse(JSON.stringify(quota || {}));
  Object.keys(data).forEach((key) => {
    const it = data[key];
    if (it && typeof it === 'object') {
      if (it.in_use !== undefined) it.used = it.in_use;
      const { used = 0, limit = 0, reserved = 0 } = it;
      it.left = limit === -1 ? -1 : limit - used - (reserved || 0);
    }
  });
  return data;
};

export const getQuotaMessage = (value, quota, name) => {
  const { left = 0 } = quota || {};
  if (left === -1) return '';
  if (value > left) {
    return t('Insufficient {name} quota to create resources (left { quota }, input { input }).', {
      name,
      quota: left,
      input: value,
    });
  }
  return '';
};
