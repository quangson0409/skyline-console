import React, { useEffect, useState } from 'react';
import { Select, Tag } from 'antd';
import { keystoneApi } from '@/api/keystone';
import { cinderApi } from '@/api/cinder';
import { useAuthStore } from '@/store/authStore';
import { currentProjectId } from '@/api/endpoints';
import { t } from '@/core/i18n';

/* ---------- port of legacy resources/glance/image.jsx ---------- */

export const imageStatus = () => ({
  active: t('Active'),
  saving: t('Saving'),
  queued: t('Queued'),
  pending_delete: t('Pending Delete'),
  killed: t('Killed'),
  deactivated: t('Deactivated'),
  deleted: t('Deleted'),
  importing: t('Importing'),
});

export const imageVisibility = () => ({
  public: t('Public'),
  private: t('Private'),
  shared: t('Shared'),
});

export const imageOS = () => ({
  centos: t('CentOS'),
  ubuntu: t('Ubuntu'),
  fedora: t('Fedora'),
  windows: t('Windows'),
  debian: t('Debian'),
  almalinux: t('AlmaLinux'),
  rocky: t('Rocky Linux'),
  rhel: t('Red Hat'),
  oraclelinux: t('Oracle Linux'),
  arch: t('Arch Linux'),
  freebsd: t('FreeBSD'),
  others: t('Others'),
});

export const imageUsage = () => ({
  common: t('Common Server'),
  ironic: t('Bare Metal'),
  ironic_enroll: t('Bare Metal Enroll'),
  octavia: t('Load Balancer'),
  trove: t('Database'),
  magnum: t('Container'),
  heat: t('Application Template'),
});

export const imageFormatsConsole = () => ({
  raw: t('RAW'),
  qcow2: t('QCOW2'),
  iso: t('ISO'),
});

export const imageFormatsAdmin = () => ({
  aki: t('AKI'),
  ari: t('ARI'),
  ami: t('AMI'),
  vdi: t('VDI'),
  vhd: t('VHD'),
  vmdk: t('VMDK'),
});

export const imageFormats = () => ({ ...imageFormatsConsole(), ...imageFormatsAdmin() });

export const imageContainerFormats = () => ({ bare: 'Bare', docker: 'Docker' });

export const imageProperties = () => ({
  id: t('ID'),
  checksum: t('Checksum'),
  members: t('Members'),
  min_disk: t('Min. Disk'),
  min_ram: t('Min. RAM'),
  name: t('Name'),
  owner: t('Owner'),
  updated_at: t('Updated At'),
  visibility: t('Visibility'),
  description: t('Description'),
  architecture: t('Architecture'),
  kernel_id: t('Kernel ID'),
  ramdisk_id: t('Ramdisk ID'),
  created_at: t('Created At'),
  container_format: t('Container Format'),
  disk_format: t('Disk Format'),
  is_public: t('Is Public'),
  type: t('Type'),
  protected: t('Protected'),
  size: t('Size'),
  status: t('Status'),
});

/* legacy resources/nova/flavor.js */
export const NoSetValue = 'noSelect';
export const cpuPolicyOptions = () => [
  { value: NoSetValue, label: t('Not select') },
  { value: 'dedicated', label: t('Dedicated') },
  { value: 'shared', label: t('Shared') },
];
export const cpuThreadPolicyOptions = () => [
  { value: NoSetValue, label: t('Not select') },
  { value: 'prefer', label: t('Prefer (Thread siblings are preferred)') },
  { value: 'isolate', label: t('Isolate (No multithreading)') },
  { value: 'require', label: t('Require (Need multithreading)') },
];

export const yesNoOptions = () => [
  { value: 'yes', label: t('Yes') },
  { value: 'no', label: t('No') },
];

export const toOptions = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));
export const toFilterOptions = (map) => Object.entries(map).map(([key, label]) => ({ key, label }));

export const transitionStatusList = ['saving', 'queued', 'pending_delete'];

export const isOwner = (item) => Boolean(item?.owner) && currentProjectId() === item.owner;

export const parseBdm = (item) => {
  const raw = item?.block_device_mapping;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** bfv vm has bdm; non-bfv has instance_uuid; image_type added by nova */
export const isSnapshot = (item = {}) =>
  item.image_type === 'snapshot' || parseBdm(item)[0]?.source_type === 'snapshot' || Boolean(item.instance_uuid);

export const canImageCreateInstance = (item) =>
  item?.status === 'active' && (item.usage_type === 'common' || item.usage_type === undefined);

export const canImageCreateIronicInstance = (item) =>
  item?.status === 'active' && (item.usage_type === 'ironic' || item.usage_type === undefined);

export const canSnapshotCreateInstance = (item) => item?.status === 'active';

/** legacy ImageStore mapper: unknown os_distro -> 'others', keep raw data in originData */
export const mapImage = (data = {}) => {
  const os = imageOS()[data.os_distro] ? data.os_distro : 'others';
  return {
    originData: { ...data },
    ...data,
    os_distro: os,
    project_id: data.owner,
    project_name: data.owner_project_name || data.project_name,
  };
};

export const VisibilityTag = ({ value }) => {
  if (!value) return '-';
  const color = { public: 'green', private: 'gold', shared: 'blue', community: 'purple' }[value];
  return (
    <Tag color={color} style={{ borderRadius: 10, fontSize: 11 }}>
      {imageVisibility()[value] || value}
    </Tag>
  );
};

/* ---------- projects (legacy ProjectStore.fetchProjectsWithDomain) ---------- */

export const fetchProjectOptions = async () => {
  try {
    const res = await keystoneApi.listProjects();
    return (res?.projects || []).map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }));
  } catch {
    const { projects = [] } = useAuthStore.getState();
    return projects.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` }));
  }
};

/** Controlled project selector (replaces legacy select-table with projectTableOptions) */
export const ProjectSelect = ({ value, onChange, multiple = false, placeholder }) => {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchProjectOptions().then((opts) => {
      if (alive) {
        setOptions(opts);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Select
      value={value}
      onChange={onChange}
      mode={multiple ? 'multiple' : undefined}
      options={options}
      loading={loading}
      showSearch
      allowClear
      optionFilterProp="label"
      placeholder={placeholder || t('Please select')}
      style={{ width: '100%' }}
    />
  );
};

/* ---------- cinder helpers for "Create Volume" ---------- */

export const fetchVolumeTypeOptions = async () => {
  const res = await cinderApi.listVolumeTypes().catch(() => ({}));
  return (res?.volume_types || []).map((vt) => ({ value: vt.id, label: vt.name }));
};

/** Text describing remaining volume quota (legacy getQuotaInfo for volume create) */
export const fetchVolumeQuotaText = async () => {
  try {
    const res = await cinderApi.getQuotaSet();
    const q = res?.quota_set || {};
    const fmt = (it) => {
      if (!it || typeof it !== 'object') return '-';
      const used = (it.in_use || 0) + (it.reserved || 0);
      return it.limit === -1 ? `${used} / ${t('Unlimited')}` : `${used} / ${it.limit}`;
    };
    return `${t('Quota')}: ${t('Volume')} ${fmt(q.volumes)}, ${t('Volume Capacity (GiB)')} ${fmt(q.gigabytes)}`;
  } catch {
    return '';
  }
};
