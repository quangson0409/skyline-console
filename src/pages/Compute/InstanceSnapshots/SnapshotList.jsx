import React from 'react';
import { useNavigate } from 'react-router-dom';
import { glanceApi } from '@/api/glance';
import { cinderApi } from '@/api/cinder';
import apiClient from '@/api/client';
import { serviceBase, currentProjectId, versionHeaders } from '@/api/endpoints';
import ResourcePage, { nameColumn, statusColumn, timeColumn, formatSize, deleteAction, IdNameCell } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { KpiCards } from '@/pages/Compute/_shared';
import {
  imageStatus,
  imageFormats,
  isSnapshot,
  parseBdm,
  canSnapshotCreateInstance,
  fetchVolumeTypeOptions,
  fetchVolumeQuotaText,
} from '@/pages/Compute/Images/helpers';
import { buildPatch } from '@/pages/Compute/Images/actions';

export const snapshotStatusOptions = () => [
  { key: 'active', label: t('Active') },
  { key: 'queued', label: t('Queued') },
  { key: 'saving', label: t('Saving') },
];

/** legacy InstanceSnapshotStore list: own project unless admin, keep only snapshots */
export const fetchInstanceSnapshots = async ({ isAdmin, projectId, owner } = {}) => {
  const params = { sort_key: 'created_at', sort_dir: 'desc' };
  if (owner) params.owner = owner;
  else if (!isAdmin && projectId) params.owner = projectId;
  const res = await glanceApi.listAllImages(params);
  return (res?.images || []).filter(isSnapshot).map((it) => ({
    originData: { ...it },
    ...it,
    project_id: it.owner || it.project_id,
    project_name: it.owner_project_name || it.project_name,
  }));
};

/** cinder snapshot show (cinderApi has no getter for a single snapshot) */
export const getVolumeSnapshot = (id) =>
  apiClient.get(`${serviceBase('cinder')}/${currentProjectId()}/snapshots/${id}`, versionHeaders('cinder'));

/** Loads boot-volume info of a bfv snapshot (legacy detailDidFetch) */
export const fetchSnapshotVolumeInfo = async (item) => {
  const boot = parseBdm(item).find((it) => it.boot_index === 0);
  const info = { snapshotId: null, snapshotDetail: null, volumeDetail: null, instanceId: null };
  if (boot?.snapshot_id) {
    info.snapshotId = boot.snapshot_id;
    try {
      const res = await getVolumeSnapshot(boot.snapshot_id);
      info.snapshotDetail = res?.snapshot || null;
      if (info.snapshotDetail?.volume_id) {
        const vol = await cinderApi.getVolume(info.snapshotDetail.volume_id);
        info.volumeDetail = vol?.volume || null;
        info.instanceId = info.volumeDetail?.attachments?.[0]?.server_id || '';
      }
    } catch {
      // volume / snapshot may be gone
    }
  } else {
    info.instanceId = item.instance_uuid;
  }
  return info;
};

/* ---------------- actions (legacy InstanceSnapshot/actions) ---------------- */

export const editSnapshotAction = () => ({
  id: 'edit',
  type: 'modal',
  title: t('Edit Instance Snapshot'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: t('Please input name') },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => {
    const ops = buildPatch(item.originData || item, values);
    if (!ops.length) return Promise.resolve();
    return glanceApi.updateImage(item.id, ops);
  },
});

export const deleteSnapshotAction = () =>
  deleteAction({
    name: t('Instance Snapshot'),
    title: t('Delete Instance Snapshot'),
    onDelete: (it) => glanceApi.deleteImage(it.id),
  });

export const createInstanceFromSnapshotAction = ({ navigate }) => ({
  id: 'instance-create',
  type: 'custom',
  title: t('Create Instance'),
  allowed: canSnapshotCreateInstance,
  onExecute: (item) => navigate(`/compute/instance?snapshot=${item.id}`),
});

const snapshotMinSize = (item, snapshotDetail) => {
  const boot = parseBdm(item).find((it) => it.boot_index === 0) || {};
  const bigger = Math.max(
    Number(item.min_disk) || 0,
    Math.ceil((Number(item.size) || 0) / 1024 / 1024 / 1024),
    1,
    Number(boot.volume_size) || 1
  );
  return bigger || Math.max(Number(snapshotDetail?.size) || 0, 1);
};

export const createVolumeFromSnapshotAction = () => {
  let defaultType;
  let minSizeCache;
  return {
    id: 'create-volume',
    type: 'modal',
    title: t('Create Volume'),
    description: t('Snapshots can be converted into volume and used to create an instance from the volume.'),
    getFormItems: async (item) => {
      const [types, quota] = await Promise.all([fetchVolumeTypeOptions(), fetchVolumeQuotaText()]);
      const { volumeDetail, snapshotDetail } = await fetchSnapshotVolumeInfo(item);
      defaultType = types.find((it) => it.label === volumeDetail?.volume_type)?.value;
      const minSize = snapshotMinSize(item, snapshotDetail);
      minSizeCache = minSize;
      return [
        quota && { name: 'quota', type: 'alert', message: quota },
        { name: 'snapshot', label: t('Volume Snapshot'), type: 'label' },
        { name: 'name', label: t('Volume Name'), type: 'input', required: true, placeholder: t('Please input name') },
        {
          name: 'size',
          label: t('Capacity (GiB)'),
          type: 'number',
          min: minSize,
          required: true,
          tip: `${t('Min. Size')}: ${minSize}GiB`,
        },
        { name: 'more', label: t('Advanced Options'), type: 'switch' },
        {
          name: 'volume_type',
          label: t('Volume Type'),
          type: 'select',
          options: types,
          placeholder: t('Please select volume type'),
          visible: (values) => Boolean(values.more),
        },
      ].filter(Boolean);
    },
    getDefaultValues: (item) => ({
      snapshot: item.name || item.id,
      size: minSizeCache || snapshotMinSize(item),
      volume_type: defaultType,
      more: false,
    }),
    onSubmit: ({ name, size, volume_type }, item) => {
      const body = { imageRef: item.id, name, size };
      body.volume_type = volume_type || defaultType;
      if (!body.volume_type) delete body.volume_type;
      return cinderApi.createVolume(body);
    },
  };
};

export const snapshotRowActions = ({ isAdmin, navigate }) =>
  isAdmin
    ? { firstAction: editSnapshotAction(), moreActions: [{ action: deleteSnapshotAction() }] }
    : {
        firstAction: editSnapshotAction(),
        moreActions: [
          { action: createInstanceFromSnapshotAction({ navigate }) },
          { action: createVolumeFromSnapshotAction() },
          { action: deleteSnapshotAction() },
        ],
      };

export const snapshotColumns = ({ isAdmin, projectMap = {} }) =>
  [
    nameColumn({
      linkTo: (r) => `/compute/${isAdmin ? 'instance-snapshot-admin' : 'instance-snapshot'}/detail/${r.id}`,
    }),
    isAdmin && {
      title: t('Project ID/Name'),
      dataIndex: 'project_id',
      key: 'project_id',
      render: (value, r) => <IdNameCell id={value} name={r.project_name || projectMap[value]} bold={false} />,
    },
    { title: t('Description'), dataIndex: 'description', key: 'description', ellipsis: true, render: (v) => v || '-' },
    {
      title: t('Disk Format'),
      dataIndex: 'disk_format',
      key: 'disk_format',
      render: (v) => <span style={{ textTransform: 'uppercase' }}>{imageFormats()[v] || v || '-'}</span>,
    },
    statusColumn({ textMap: imageStatus() }),
    {
      title: t('Size'),
      dataIndex: 'size',
      key: 'size',
      sorter: (a, b) => (a.size || 0) - (b.size || 0),
      render: (v) => (v ? formatSize(v) : '-'),
    },
    timeColumn(),
  ].filter(Boolean);

export default function SnapshotList() {
  const navigate = useNavigate();
  const projectMap = useProjectMap();

  return (
    <ResourcePage
      title={t('Instance Snapshots')}
      breadcrumb={[t('Compute'), t('Instance Snapshots')]}
      description={t('Manage instance disk snapshots created from compute virtual machines.')}
      fetch={fetchInstanceSnapshots}
      header={({ data }) => (
        <KpiCards
          items={[
            { title: t('Total Snapshots'), value: data.length },
            {
              title: `${t('Active')} ${t('Snapshots')}`,
              value: data.filter((s) => s.status === 'active').length,
              color: '#10b981',
            },
          ]}
        />
      )}
      columns={({ isAdmin }) => snapshotColumns({ isAdmin, projectMap })}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'status', label: t('Status'), options: snapshotStatusOptions() },
      ]}
      batchActions={[deleteSnapshotAction()]}
      rowActions={({ isAdmin }) => snapshotRowActions({ isAdmin, navigate })}
      interval={15000}
    />
  );
}
