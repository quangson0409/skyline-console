import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { glanceApi } from '@/api/glance';
import ResourcePage, { nameColumn, statusColumn, timeColumn, formatSize } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import {
  imageStatus,
  imageVisibility,
  imageUsage,
  imageOS,
  imageFormats,
  imageContainerFormats,
  toFilterOptions,
  isSnapshot,
  mapImage,
  VisibilityTag,
} from './helpers';
import { imageRowActions, deleteImageAction } from './actions';

/** legacy Image.updateFetchParams: glance filters per tab */
export const imageTabParams = (tab, projectId) => {
  switch (tab) {
    case 'public':
      return { visibility: 'public' };
    case 'shared':
      return { visibility: 'shared', member_status: 'accepted' };
    case 'all':
      return {};
    case 'project':
    default:
      return { owner: projectId };
  }
};

export const fetchImages = async ({ isAdmin, projectId, tab = 'project' }) => {
  const params = isAdmin ? {} : imageTabParams(tab, projectId);
  const res = await glanceApi.listAllImages({ sort_key: 'created_at', sort_dir: 'desc', ...params });
  // legacy ImageStore.listDidFetch: instance snapshots are listed on their own page
  return (res?.images || []).filter((it) => !isSnapshot(it)).map(mapImage);
};

const mapText = (map) => (v) => (v === undefined || v === null || v === '' ? '-' : map[v] || v);

export const imageColumns = ({ isAdmin, tab, projectMap = {} }) =>
  [
    nameColumn({ linkTo: (r) => `/compute/${isAdmin ? 'image-admin' : 'image'}/detail/${r.id}` }),
    (isAdmin || tab === 'all') && {
      title: t('Project ID/Name'),
      dataIndex: 'owner',
      key: 'owner',
      render: (value, r) => (
        <div>
          <span>{r.project_name || projectMap[value] || '-'}</span>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{value || '-'}</div>
        </div>
      ),
    },
    {
      title: t('Description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (v) => v || '-',
    },
    { title: t('Use Type'), dataIndex: 'usage_type', key: 'usage_type', render: mapText(imageUsage()) },
    {
      title: t('Container Format'),
      dataIndex: 'container_format',
      key: 'container_format',
      render: mapText(imageContainerFormats()),
    },
    {
      title: t('Type'),
      dataIndex: 'os_distro',
      key: 'os_distro',
      render: (v) => (
        <Tag color="blue" style={{ borderRadius: 10, fontSize: 11 }}>
          {imageOS()[v] || v || '-'}
        </Tag>
      ),
    },
    statusColumn({ textMap: imageStatus() }),
    {
      title: t('Visibility'),
      dataIndex: 'visibility',
      key: 'visibility',
      render: (v) => <VisibilityTag value={v} />,
    },
    {
      title: t('Disk Format'),
      dataIndex: 'disk_format',
      key: 'disk_format',
      render: (v) => <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{imageFormats()[v] || v || '-'}</span>,
    },
    {
      title: t('Size'),
      dataIndex: 'size',
      key: 'size',
      sorter: (a, b) => (a.size || 0) - (b.size || 0),
      render: (v) => formatSize(v),
    },
    {
      title: t('Minimum Disk'),
      key: 'minRequirements',
      render: (_, r) => {
        const ram = Number(r.min_ram) || 0;
        return (
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {t('Disk')}: <b>{Number(r.min_disk) || 0} GB</b> | RAM:{' '}
            <b>{ram >= 1024 ? `${(ram / 1024).toFixed(0)} GB` : `${ram} MB`}</b>
          </span>
        );
      },
    },
    timeColumn(),
  ].filter(Boolean);

export default function ImageList() {
  const navigate = useNavigate();
  const projectMap = useProjectMap();
  const { hasAdminRole } = useAuthStore();
  const [tab, setTab] = useState('project');

  const tabOptions = [
    { value: 'project', label: t('Current Project Images') },
    { value: 'public', label: t('Public Images') },
    { value: 'shared', label: t('Shared Images') },
    hasAdminRole && { value: 'all', label: t('All Images') },
  ].filter(Boolean);

  const filterParams = [
    { name: 'name', label: t('Name') },
    { name: 'status', label: t('Status'), options: toFilterOptions(imageStatus()) },
    ...(['public', 'shared'].includes(tab)
      ? []
      : [{ name: 'visibility', label: t('Visibility'), options: toFilterOptions(imageVisibility()) }]),
    { name: 'disk_format', label: t('Disk Format'), options: toFilterOptions(imageFormats()) },
  ];

  return (
    <ResourcePage
      title={t('Images')}
      breadcrumb={[t('Compute'), t('Images')]}
      description={t('Manage operating system templates (Golden Images) used to create instances quickly.')}
      fetch={(ctx) => fetchImages({ ...ctx, tab })}
      deps={[tab]}
      header={({ isAdmin }) =>
        isAdmin ? null : (
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={tabOptions.map((o) => ({ key: o.value, label: o.label }))}
          />
        )
      }
      columns={({ isAdmin }) => imageColumns({ isAdmin, tab: isAdmin ? null : tab, projectMap })}
      searchFields={['name', 'id', 'disk_format']}
      filterParams={filterParams}
      primaryActions={({ isAdmin }) => [
        {
          id: 'image-create',
          type: 'custom',
          title: t('Create Image'),
          icon: <PlusOutlined />,
          onExecute: () => navigate(isAdmin ? '/compute/image-admin/create' : '/compute/image/create'),
        },
      ]}
      batchActions={({ isAdmin }) => [deleteImageAction({ isAdmin })]}
      rowActions={({ isAdmin }) => imageRowActions({ isAdmin, navigate })}
      interval={15000}
    />
  );
}
