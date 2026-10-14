import React from 'react';
import { Link } from 'react-router-dom';
import { Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { cinderApi } from '@/api/cinder';
import { novaApi } from '@/api/nova';
import { glanceApi } from '@/api/glance';
import { useAuthStore } from '@/store/authStore';
import {
  nameColumn,
  IdNameCell,
  statusColumn,
  timeColumn,
  textColumn,
  boolColumn,
  yesNo,
  formatSize,
  formatTime,
} from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { SelectTable, selectTableField, volumeLabel, downloadText, ConfirmCheckbox } from '../shared';

/* =================================================================== resources/cinder/volume */
export const volumeStatus = () => ({
  available: t('Available'),
  'in-use': t('In-use'),
  error: t('Error'),
  creating: t('Creating'),
  error_extending: t('Error Extending'),
  extending: t('Extending'),
  downloading: t('Downloading'),
  attaching: t('Attaching'),
  detaching: t('Detaching'),
  deleting: t('Deleting'),
  error_deleting: t('Error Deleting'),
  'backing-up': t('Backing Up'),
  'restoring-backup': t('Restoring Backup'),
  error_restoring: t('Error Restoring'),
  maintenance: t('Maintained'),
  uploading: t('Uploading'),
  'awaiting-transfer': t('Awaiting Transfer'),
  restoring: t('Restoring'),
  rollbacking: t('Restoring'),
  retyping: t('Retyping'),
  reserved: t('Reserved'),
  reverting: t('Reverting'),
});

export const diskTag = () => ({ os_disk: t('OS Disk'), data_disk: t('Data Disk') });
export const bootableType = () => ({ true: t('Yes'), false: t('No') });
export const multiTip = () => t('"Shared" volume can be mounted on multiple instances');
export const bootableTip = () =>
  t('When the volume is "bootable" and the status is "available", it can be used as a startup source to create an instance.');

export const volumeTransitionStatuses = [
  'creating',
  'extending',
  'downloading',
  'attaching',
  'detaching',
  'deleting',
  'backing-up',
  'restoring-backup',
  'awaiting-transfer',
  'uploading',
  'rollbacking',
  'retyping',
];

export const isOsDisk = (item) => {
  if (item.disk_tag) return item.disk_tag === 'os_disk';
  const att = (item.attachments || [])[0];
  return String(item.bootable) === 'true' && !!att && (att.device === '/dev/vda' || att.device === '/dev/sda');
};
export const canCreateInstance = (item) =>
  String(item.bootable) === 'true' && ['available', 'downloading'].includes(item.status);
export const isAvailable = (item) => item.status === 'available';
export const isAvailableOrInUse = (item) => !!item && ['available', 'in-use'].includes(item.status);
export const isInUse = (item) => item.status === 'in-use';
export const isMultiAttach = (item) => !!item.multiattach;

/** legacy updateVolume mapper (works for skyline extension and native cinder items) */
export const updateVolume = (volume) => {
  const origin = volume.origin_data || {};
  const item = {
    ...volume,
    bootable: volume.bootable === undefined ? volume.bootable : String(volume.bootable),
    host: volume.host || volume['os-vol-host-attr:host'],
    project_id: volume.project_id || volume['os-vol-tenant-attr:tenant_id'],
    description: volume.description || origin.description,
  };
  item.disk_tag = isOsDisk(item) ? 'os_disk' : 'data_disk';
  item.delete_interval =
    volume.metadata && volume.metadata.delete_interval
      ? new Date(formatTime(volume.updated_at)).getTime() + Number(volume.metadata.delete_interval) * 1000
      : null;
  return item;
};

/** stores/cinder/volume list: skyline extension (server_name, project_name) with cinder fallback */
export const fetchVolumes = async ({ isAdmin, params = {} } = {}) => {
  const query = { ...params };
  if (isAdmin) query.all_projects = true;
  let items = null;
  try {
    const res = await cinderApi.listVolumesExtension(query);
    if (Array.isArray(res?.volumes)) items = res.volumes;
  } catch {
    items = null;
  }
  if (!items) {
    const { uuid, all_projects, ...rest } = query;
    const res = await cinderApi.listVolumes(isAdmin ? { ...rest, all_tenants: 1 } : rest);
    items = res?.volumes || [];
    if (uuid) {
      const ids = Array.isArray(uuid) ? uuid : [uuid];
      items = items.filter((v) => ids.includes(v.id));
    }
  }
  return items.map(updateVolume);
};

/** stores/cinder/volume detailDidFetch */
export const fetchVolumeDetail = async (id, { isAdmin } = {}) => {
  const res = await cinderApi.getVolume(id);
  const volume = res?.volume || {};
  let itemInList = {};
  try {
    const list = await fetchVolumes({ isAdmin, params: { uuid: id } });
    itemInList = list.find((v) => v.id === id) || {};
  } catch {
    itemInList = {};
  }
  const item = updateVolume({ ...volume, ...itemInList, attachmentsContrib: itemInList.attachments || volume.attachments });
  if (volume.snapshot_id) {
    try {
      item.snapshot = (await cinderApi.getSnapshot(volume.snapshot_id))?.snapshot;
    } catch {
      item.snapshot = null;
    }
  }
  return item;
};

/* ----------------------------------------------------------------- quota helpers */
const leftOf = (q = {}) => {
  if (!q || q.limit === undefined) return Infinity;
  if (q.limit === -1) return Infinity;
  return Math.max(0, (q.limit || 0) - (q.in_use || 0) - (q.reserved || 0));
};

export const fetchCinderQuota = async () => {
  try {
    return (await cinderApi.getQuotaSet())?.quota_set || {};
  } catch {
    return {};
  }
};

const quotaAlert = (quota, type, extra = []) => {
  const lines = [
    `${t('Volume')}: ${leftOf(quota.volumes) === Infinity ? t('Unlimited') : leftOf(quota.volumes)}`,
    `${t('Volume Capacity (GiB)')}: ${leftOf(quota.gigabytes) === Infinity ? t('Unlimited') : leftOf(quota.gigabytes)}`,
  ];
  if (type && quota[`gigabytes_${type}`]) {
    const l = leftOf(quota[`gigabytes_${type}`]);
    lines.push(`${t('{name} type capacity', { name: type })}: ${l === Infinity ? t('Unlimited') : l}`);
  }
  return {
    type: 'alert',
    name: 'quota',
    alertType: 'info',
    message: `${t('Quota')} (${t('Left')}) - ${[...lines, ...extra].join(' | ')}`,
  };
};

/* ----------------------------------------------------------------- shared option loaders */
export const fetchVolumeTypeList = async () => {
  try {
    const res = await cinderApi.listVolumeTypes();
    const types = res?.volume_types || [];
    // QoS props for the Read/Write IOPS columns of the legacy volume type select table
    const qosIds = [...new Set(types.filter((it) => it.qos_specs_id).map((it) => it.qos_specs_id))];
    const qos = await Promise.all(qosIds.map((qid) => cinderApi.getQosSpec(qid).then((r) => r?.qos_specs).catch(() => null)));
    return types.map((it) => {
      const q = qos.find((x) => x && x.id === it.qos_specs_id);
      const { extra_specs: { multiattach = 'False' } = {} } = it;
      return { ...it, qos_props: q?.specs || {}, multiattach: multiattach === '<is> True' };
    });
  } catch {
    return [];
  }
};

const volumeTypeColumns = () => [
  nameColumn(),
  textColumn(t('Description'), 'description'),
  { title: t('Read IOPS/GB'), key: 'r', render: (_, r) => r.qos_props?.read_iops_sec_per_gb || '-' },
  { title: t('Write IOPS/GB'), key: 'w', render: (_, r) => r.qos_props?.write_iops_sec_per_gb || '-' },
  boolColumn(t('Public'), 'is_public'),
  boolColumn(t('Shared'), 'multiattach'),
];

const snapshotSelectColumns = () => [
  nameColumn(),
  { title: t('Size'), dataIndex: 'size', key: 'size', render: (v) => `${v} GiB` },
  statusColumn({ textMap: volumeStatus() }),
  textColumn(t('Description'), 'description'),
  timeColumn(),
];

const imageOsDistro = (img) => img.os_distro || img.os_type || '-';
const imageMinSize = (img) => {
  if (!img) return 1;
  const sizeGiB = Math.ceil((img.size || 0) / 1024 / 1024 / 1024);
  return Math.max(img.min_disk || 0, sizeGiB, 1);
};

const imageColumns = () => [
  nameColumn(),
  textColumn(t('System'), 'os_distro', { render: (_, r) => imageOsDistro(r) }),
  { title: t('Size'), dataIndex: 'size', key: 'size', render: (v) => formatSize(v) },
  { title: t('Min System Disk'), dataIndex: 'min_disk', key: 'min_disk', render: (v) => `${v || 0} GiB` },
  textColumn(t('Visibility'), 'visibility'),
];

/* =================================================================== actions (Volume/actions) */
export const editVolumeAction = () => ({
  id: 'edit',
  type: 'modal',
  title: t('Edit'),
  allowed: isAvailableOrInUse,
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: t('Please input name') },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => cinderApi.updateVolume(item.id, values),
});

const canDelete = (item) => ['available', 'error', 'error_extending'].includes(item.status) && !(item.attachments || []).length;

export const deleteVolumeAction = () => {
  const state = { cascade: true };
  return {
    id: 'delete',
    type: 'confirm',
    title: t('Delete Volume'),
    actionName: t('delete volume'),
    isDanger: true,
    allowed: canDelete,
    // ConfirmAction renders confirmText as the dialog body (no access to the item names there)
    confirmText: (
      <div>
        <p style={{ marginBottom: 16 }}>{t('Are you sure to delete the selected volume(s)?')}</p>
        <ConfirmCheckbox
          state={state}
          field="cascade"
          label={t('Cascading deletion')}
          tip={t(
            'Using cascading deletion, when the volume has snapshots, the associated snapshot will be automatically deleted first, and then the volume will be deleted, thereby improving the success rate of deleting the volume.'
          )}
        />
      </div>
    ),
    onSubmit: async (target) => {
      const list = Array.isArray(target) ? target : [target];
      for (const it of list) {
        // eslint-disable-next-line no-await-in-loop
        await cinderApi.deleteVolumeCascade(it.id, state.cascade);
      }
    },
  };
};

/** Snapshot picker that also syncs the volume type (legacy onSnapshotChange) */
function SnapshotPicker({ value, onChange, form, data, types }) {
  return (
    <SelectTable
      value={value}
      data={data}
      columns={snapshotSelectColumns()}
      onChange={async (keys) => {
        onChange?.(keys);
        const snap = data.find((s) => s.id === keys[0]);
        if (!snap) return;
        let typeId = snap.volume_type_id;
        if (!typeId) {
          try {
            const vol = (await cinderApi.getVolume(snap.volume_id))?.volume;
            typeId = types.find((tp) => tp.name === vol?.volume_type)?.id;
          } catch {
            typeId = undefined;
          }
        }
        if (typeId) form.setFieldsValue({ volume_type: [typeId] });
      }}
    />
  );
}

const sourceTypes = () => [
  { label: t('Blank Volume'), value: 'blank-volume' },
  { label: t('Image'), value: 'image' },
  { label: t('Volume Snapshot'), value: 'snapshot' },
];

/** Volume/actions/Create (step form in legacy, modal here; route storage/volume/create opens it) */
export const createVolumeAction = () => {
  const ctx = { images: [], snapshots: [], quota: {} };
  const minSizeOf = (values) => {
    if (values.source === 'image') return imageMinSize(ctx.images.find((i) => i.id === (values.image || [])[0]));
    if (values.source === 'snapshot') return Math.max(ctx.snapshots.find((s) => s.id === (values.snapshot || [])[0])?.size || 1, 1);
    return 1;
  };
  return {
    id: 'volume-create',
    type: 'modal',
    title: t('Create Volume'),
    width: 960,
    getDefaultValues: async () => {
      const { currentProject } = useAuthStore.getState();
      const types = await fetchVolumeTypeList();
      const gLeft = leftOf(ctx.quota.gigabytes);
      return {
        project: currentProject?.name || currentProject?.id || '-',
        availableZone: 'noSelect',
        source: 'blank-volume',
        size: gLeft !== Infinity && gLeft < 10 ? gLeft : 10,
        volume_type: types[0] ? [types[0].id] : [],
        count: 1,
      };
    },
    getFormItems: async () => {
      const [zonesRes, imagesRes, snapsRes, types, quota] = await Promise.all([
        cinderApi.listAvailabilityZones().catch(() => ({})),
        glanceApi.listImages({ status: 'active' }).catch(() => ({})),
        cinderApi.listSnapshots().catch(() => ({})),
        fetchVolumeTypeList(),
        fetchCinderQuota(),
      ]);
      ctx.images = (imagesRes?.images || []).filter((i) => i.status === 'active');
      ctx.snapshots = (snapsRes?.snapshots || []).filter((s) => s.status === 'available');
      ctx.quota = quota;
      ctx.types = types;
      const gLeft = leftOf(quota.gigabytes);
      const vLeft = leftOf(quota.volumes);
      return [
        quotaAlert(quota),
        { name: 'project', label: t('Project'), type: 'label' },
        {
          name: 'availableZone',
          label: t('Availability Zone'),
          type: 'select',
          tip: t('Unless you know clearly which AZ to create the volume in, you don not need to fill in here.'),
          options: [
            { label: t('Not select'), value: 'noSelect' },
            ...(zonesRes?.availabilityZoneInfo || [])
              .filter((z) => z.zoneState?.available)
              .map((z) => ({ value: z.zoneName, label: z.zoneName })),
          ],
        },
        { name: 'source', label: t('Data Source Type'), type: 'radio', required: true, options: sourceTypes() },
        {
          ...selectTableField({
            name: 'image',
            label: t('Operating System'),
            required: true,
            data: ctx.images,
            columns: imageColumns(),
          }),
          visible: (v) => v.source === 'image',
        },
        {
          name: 'snapshot',
          label: t('Volume Snapshot'),
          visible: (v) => v.source === 'snapshot',
          rules: [
            {
              validator: (_, v) =>
                Array.isArray(v) && v.length ? Promise.resolve() : Promise.reject(new Error(`${t('Please select')} ${t('Volume Snapshot')}`)),
            },
          ],
          tip: (
            <div>
              <div>{t('The volume type needs to be consistent with the volume type when the snapshot is created.')}</div>
              <div>
                {t(
                  'If the volume associated with the snapshot has changed the volume type, please modify this option manually, if the volume associated with the snapshot keeps the volume type unchanged, please ignore this option. (no need to change).'
                )}
              </div>
            </div>
          ),
          render: ({ form }) => <SnapshotPicker form={form} data={ctx.snapshots} types={types} />,
        },
        selectTableField({
          name: 'volume_type',
          label: t('Volume Type'),
          required: true,
          tip: t('The volume type needs to set "multiattach" in the metadata to support shared volume attributes.'),
          data: types,
          columns: volumeTypeColumns(),
        }),
        {
          name: 'size',
          label: t('Capacity (GiB)'),
          type: 'number',
          required: true,
          min: 1,
          max: gLeft === Infinity ? undefined : gLeft,
          tip: gLeft === Infinity ? undefined : `${t('Max')}: ${gLeft}GiB`,
          rules: [
            ({ getFieldsValue }) => ({
              validator: (_, v) => {
                const min = minSizeOf(getFieldsValue(true));
                if (v !== undefined && v !== null && v < min) {
                  return Promise.reject(new Error(`${t('Min. Size')}: ${min}GiB`));
                }
                return Promise.resolve();
              },
            }),
          ],
        },
        { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: t('Please input name') },
        { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
        {
          name: 'count',
          label: t('Count'),
          type: 'number',
          min: 1,
          max: vLeft === Infinity ? undefined : vLeft,
          required: true,
        },
      ];
    },
    onSubmit: async (data) => {
      const { image, snapshot, size, availableZone, shared, name, description, volume_type, count = 1 } = data;
      const vLeft = leftOf(ctx.quota.volumes);
      const gLeft = leftOf(ctx.quota.gigabytes);
      if (vLeft !== Infinity && vLeft < count) {
        throw new Error(t('Unable to create volume: insufficient quota to create resources.'));
      }
      if (gLeft !== Infinity && gLeft < size * count) {
        throw new Error(t('Unable to create volume: insufficient quota to create resources.'));
      }
      const volume = {
        name,
        size,
        availability_zone: availableZone !== 'noSelect' ? availableZone : null,
        multiattach: shared,
        volume_type: (volume_type || [])[0],
      };
      if (description) volume.description = description;
      if (data.source === 'image' && image?.length) volume.imageRef = image[0];
      if (data.source === 'snapshot' && snapshot?.length) volume.snapshot_id = snapshot[0];
      if (count === 1) return cinderApi.createVolume(volume);
      const results = await Promise.allSettled(
        Array.from({ length: count }, (_, idx) => cinderApi.createVolume({ ...volume, name: `${name}-${idx + 1}` }))
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length === results.length) throw failed[0].reason;
      return results;
    },
  };
};

export const acceptTransferAction = () => ({
  id: 'accept-volume-transfer',
  type: 'modal',
  title: t('Accept Volume Transfer'),
  formItems: [
    { name: 'transfer_id', label: t('Transfer ID'), type: 'input', required: true, placeholder: t('Please input Transfer ID') },
    { name: 'auth_key', label: t('Auth Key'), type: 'input', required: true, placeholder: t('Please input Auth Key') },
  ],
  onSubmit: ({ transfer_id, auth_key }) => cinderApi.acceptTransfer(transfer_id, { auth_key }),
});

export const restoreFromSnapshotAction = () => ({
  id: 'Restore from snapshot',
  type: 'modal',
  title: t('Restore From Snapshot'),
  width: 900,
  allowed: (item) => item.status === 'available',
  getDefaultValues: (item) => ({ volume: volumeLabel(item) }),
  getFormItems: async (item) => {
    const res = await cinderApi.listSnapshots({ volume_id: item.id }).catch(() => ({}));
    const snaps = (res?.snapshots || []).filter((s) => s.volume_id === item.id);
    return [
      { name: 'volume', label: t('Volume'), type: 'label' },
      selectTableField({
        name: 'snapshot',
        label: t('Select Volume Snapshot'),
        required: true,
        data: snaps,
        columns: snapshotSelectColumns().filter((c) => c.key !== 'description'),
      }),
    ];
  },
  onSubmit: ({ snapshot = [] }, item) => cinderApi.volumeAction(item.id, 'revert', { snapshot_id: snapshot[0] }),
});

const INSTANCE_ATTACH_STATUS = ['active', 'paused', 'stopped', 'resized', 'soft-delete', 'shelved', 'shelved_offloaded'];
const allowAttachVolumeInstance = (ins) => {
  const status = String(ins.status || '').toLowerCase();
  const vmState = String(ins['OS-EXT-STS:vm_state'] || '').toLowerCase();
  const task = String(ins['OS-EXT-STS:task_state'] || '').toLowerCase();
  return (INSTANCE_ATTACH_STATUS.includes(status) || INSTANCE_ATTACH_STATUS.includes(vmState)) && task !== 'deleting' && !ins.locked;
};

const instanceColumns = () => [
  nameColumn(),
  statusColumn(),
  {
    title: t('Instance IP'),
    key: 'ip',
    render: (_, r) =>
      Object.values(r.addresses || {})
        .flat()
        .map((a) => a.addr)
        .join(', ') || '-',
  },
  timeColumn({ dataIndex: 'created' }),
];

export const attachVolumeAction = () => ({
  id: 'attach',
  type: 'modal',
  title: t('Attach'),
  width: 900,
  allowed: (item) => isAvailable(item) || isMultiAttach(item),
  getDefaultValues: (item) => ({ volume: volumeLabel(item) }),
  getFormItems: async (item) => {
    const res = await novaApi.listServers().catch(() => ({}));
    const attached = (item.attachments || []).map((a) => a.server_id);
    return [
      { name: 'volume', label: t('Volume'), type: 'label' },
      selectTableField({
        name: 'instance',
        label: t('Instance'),
        required: true,
        data: res?.servers || [],
        columns: instanceColumns(),
        disabledFunc: (ins) => !allowAttachVolumeInstance(ins) || attached.includes(ins.id),
      }),
    ];
  },
  onSubmit: ({ instance = [] }, item) => Promise.all(instance.map((sid) => novaApi.attachVolume(sid, item.id))),
});

export const detachVolumeAction = () => ({
  id: 'detach',
  type: 'modal',
  title: t('Detach'),
  isDanger: true,
  width: 900,
  allowed: (item) => isInUse(item) && !isOsDisk(item) && Array.isArray(item.attachments) && item.attachments.length > 0,
  getDefaultValues: (item) => {
    const ids = [...new Set((item.attachments || []).map((a) => a.server_id))];
    return { volume: volumeLabel(item), instance: ids.length === 1 ? ids : [] };
  },
  getFormItems: async (item) => {
    const ids = [...new Set((item.attachments || []).map((a) => a.server_id))];
    const servers = await Promise.all(
      ids.map((sid) =>
        novaApi
          .getServer(sid)
          .then((r) => r?.server)
          .catch(() => {
            const att = (item.attachments || []).find((a) => a.server_id === sid) || {};
            return { id: sid, name: att.server_name || sid, status: '' };
          })
      )
    );
    return [
      { name: 'volume', label: t('Volume'), type: 'label' },
      selectTableField({
        name: 'instance',
        label: t('Instance'),
        required: true,
        data: servers.filter(Boolean),
        columns: instanceColumns(),
        disabledFunc: (ins) => ins.status && !allowAttachVolumeInstance(ins),
      }),
    ];
  },
  onSubmit: ({ instance = [] }, item) => novaApi.detachVolume(instance[0], item.id),
});

export const createVolumeSnapshotAction = () => ({
  id: 'create-snapshot',
  type: 'modal',
  title: t('Create Volume Snapshot'),
  buttonText: t('Create Snapshot'),
  allowed: isAvailableOrInUse,
  getDefaultValues: (item) => ({ volume: volumeLabel(item) }),
  getFormItems: async (item) => {
    const quota = await fetchCinderQuota();
    const total = leftOf(quota.snapshots);
    const typeLeft = leftOf(quota[`snapshots_${item.volume_type}`]);
    return [
      {
        type: 'alert',
        name: 'quota',
        alertType: total === 0 || typeLeft === 0 ? 'error' : 'info',
        message: `${t('Quota')} (${t('Left')}) - ${t('Volume Snapshot')}: ${total === Infinity ? t('Unlimited') : total} | ${t(
          '{name} type snapshots',
          { name: item.volume_type }
        )}: ${typeLeft === Infinity ? t('Unlimited') : typeLeft}`,
      },
      { name: 'volume', label: t('Volume'), type: 'label' },
      { name: 'name', label: t('Volume Snapshot Name'), type: 'input', required: true, placeholder: t('Please input snapshot name') },
    ];
  },
  onSubmit: ({ name }, item) => cinderApi.createSnapshot({ name, volume_id: item.id, force: item.status === 'in-use' }),
});

export const createVolumeBackupAction = () => ({
  id: 'create-backup',
  type: 'modal',
  title: t('Create Volume Backup'),
  buttonText: t('Create Backup'),
  description: t(
    'When you do online backup of the volume that has been bound, you need to pay attention to the following points:'
  ),
  allowed: isAvailableOrInUse,
  getDefaultValues: (item) => ({ volume: volumeLabel(item), incremental: false }),
  getFormItems: async () => {
    const quota = await fetchCinderQuota();
    const left = leftOf(quota.backups);
    const gLeft = leftOf(quota.backup_gigabytes);
    return [
      {
        type: 'alert',
        name: 'quota',
        alertType: left === 0 ? 'error' : 'info',
        message: `${t('Quota')} (${t('Left')}) - ${t('Volume Backup')}: ${left === Infinity ? t('Unlimited') : left} | ${t(
          'Backup Capacity (GiB)'
        )}: ${gLeft === Infinity ? t('Unlimited') : gLeft}`,
      },
      { name: 'volume', label: t('Volume'), type: 'label' },
      { name: 'name', label: t('Volume Backup Name'), type: 'input', required: true },
      {
        name: 'incremental',
        label: t('Backup Mode'),
        type: 'radio',
        options: [
          { value: false, label: t('Full Backup') },
          { value: true, label: t('Incremental Backup') },
        ],
        tip: t(
          'Incremental backup requires a previous full backup of the volume; the system will create a full backup automatically if none exists.'
        ),
      },
    ];
  },
  onSubmit: ({ name, incremental }, item) =>
    cinderApi.createBackup({ name, incremental, volume_id: item.id, force: isInUse(item) }),
});

export const createImageAction = () => ({
  id: 'create-image',
  type: 'modal',
  title: t('Create Image'),
  allowed: isAvailable,
  getDefaultValues: () => ({ disk_format: 'raw' }),
  formItems: [
    { name: 'image_name', label: t('Image Name'), type: 'input', required: true, placeholder: t('Please input name') },
    {
      name: 'disk_format',
      label: t('Format'),
      type: 'select',
      required: true,
      options: [
        { label: t('RAW'), value: 'raw' },
        { label: t('QCOW2'), value: 'qcow2' },
      ],
    },
  ],
  onSubmit: (values, item) => cinderApi.volumeAction(item.id, 'os-volume_upload_image', values),
});

export const cloneVolumeAction = () => ({
  id: 'clone-volume',
  type: 'modal',
  title: t('Clone Volume'),
  description: t('It is recommended that you perform this cloning operation on a disk without any reading/writing'),
  allowed: isAvailableOrInUse,
  getDefaultValues: async (item) => {
    const types = await fetchVolumeTypeList();
    const current = types.find((tp) => tp.name === item.volume_type);
    return { volume: volumeLabel(item), size: item.size, volume_type: current?.id, more: false };
  },
  getFormItems: async (item) => {
    const [types, quota] = await Promise.all([fetchVolumeTypeList(), fetchCinderQuota()]);
    const gLeft = leftOf(quota.gigabytes);
    return [
      quotaAlert(quota, item.volume_type),
      { name: 'volume', label: t('Volume'), type: 'label' },
      { name: 'name', label: t('Volume Name'), type: 'input', required: true },
      {
        name: 'size',
        label: t('Capacity (GiB)'),
        type: 'number',
        required: true,
        min: item.size,
        max: gLeft === Infinity ? undefined : gLeft,
      },
      { name: 'more', label: t('Advanced Options'), type: 'switch' },
      {
        name: 'volume_type',
        label: t('Volume Type'),
        type: 'select',
        options: types.map((tp) => ({ label: tp.name, value: tp.id })),
        visible: (v) => !!v.more,
      },
    ];
  },
  onSubmit: ({ volume, more, ...rest }, item) => cinderApi.createVolume({ ...rest, source_volid: item.id }),
});

export const bootableAction = () => ({
  id: 'volume-bootable',
  type: 'modal',
  title: t('Bootable'),
  buttonText: t('Bootable'),
  getDefaultValues: (item) => ({ bootable: String(item.bootable) === 'true' }),
  formItems: [{ name: 'bootable', label: t('Bootable'), type: 'switch', tip: bootableTip() }],
  onSubmit: ({ bootable }, item) => cinderApi.volumeAction(item.id, 'os-set_bootable', { bootable: !!bootable }),
});

export const createInstanceAction = (navigate) => ({
  id: 'instance-create',
  type: 'custom',
  title: t('Create Instance'),
  allowed: canCreateInstance,
  onExecute: (item) => {
    const path = `/compute/instance/create?volume=${item.id}`;
    if (navigate) navigate(path);
    else window.location.assign(path);
  },
});

export const extendVolumeAction = () => ({
  id: 'extend-snapshot',
  type: 'modal',
  title: t('Extend Volume'),
  description: t('After the volume is expanded, the volume cannot be reduced.'),
  allowed: isAvailableOrInUse,
  getDefaultValues: (item) => ({ volume: volumeLabel(item), new_size: item.size + 1 }),
  getFormItems: async (item) => {
    const quota = await fetchCinderQuota();
    const gLeft = leftOf(quota.gigabytes);
    const typeLeft = leftOf(quota[`gigabytes_${item.volume_type}`]);
    const left = Math.min(gLeft, typeLeft);
    const max = left === Infinity ? undefined : item.size + left;
    return [
      quotaAlert(quota, item.volume_type),
      { name: 'volume', label: t('Volume'), type: 'label' },
      {
        name: 'new_size',
        label: t('Capacity (GiB)'),
        type: 'number',
        required: true,
        min: item.size + 1,
        max,
        tip: max ? `${item.size + 1}GiB-${max}GiB` : undefined,
      },
    ];
  },
  onSubmit: ({ new_size }, item) => cinderApi.volumeAction(item.id, 'os-extend', { new_size }),
});

export const changeTypeAction = () => ({
  id: 'change-type',
  type: 'modal',
  title: t('Change Type'),
  description: t('If the capacity of the disk is large, the type modify operation may take several hours. Please be cautious.'),
  allowed: (item) => isAvailableOrInUse(item) && !isOsDisk(item),
  getDefaultValues: async (item) => {
    const types = (await fetchVolumeTypeList()).filter((tp) => tp.name !== item.volume_type);
    return { volume: volumeLabel(item), new_type: types[0]?.id };
  },
  getFormItems: async (item) => {
    const types = (await fetchVolumeTypeList()).filter((tp) => tp.name !== item.volume_type);
    return [
      { name: 'volume', label: t('Volume'), type: 'label' },
      {
        name: 'new_type',
        label: t('Volume Type'),
        type: 'select',
        required: true,
        options: types.map((tp) => ({ label: tp.name, value: tp.id })),
      },
    ];
  },
  onSubmit: async ({ new_type }, item) => {
    let snapshots = [];
    try {
      snapshots = ((await cinderApi.listSnapshots({ volume_id: item.id }))?.snapshots || []).filter(
        (s) => s.volume_id === item.id
      );
    } catch {
      snapshots = [];
    }
    const active = snapshots.filter((s) => !['error', 'error_deleting', 'deleting'].includes(s.status));
    if (active.length > 0) {
      throw new Error(
        t(
          'Volume "{name}" cannot be retyped because it has {count} active snapshot(s). To change the volume type, you must first remove all existing snapshots. If you need to preserve the data in the snapshots, you can create new volumes from them first.',
          { name: item.name || item.id, count: active.length }
        )
      );
    }
    return cinderApi.volumeAction(item.id, 'os-retype', { new_type, migration_policy: 'on-demand' });
  },
});

export const createTransferAction = () => ({
  id: 'create-transfer',
  type: 'modal',
  title: t('Create Transfer'),
  description: t(
    'Ownership of a volume can be transferred from one project to another. The transfer process of the volume needs to perform the transfer operation in the original owner\'s project, and complete the "accept" operation in the receiver\'s project.'
  ),
  allowed: (item) => isAvailable(item) && !item.encrypted,
  getDefaultValues: () => ({ name: '' }),
  formItems: [{ name: 'name', label: t('Transfer Name'), type: 'input', required: true, placeholder: t('Please input name') }],
  onSubmit: async ({ name }, item) => {
    const data = await cinderApi.createTransfer({ name, volume_id: item.id });
    if (data && data.transfer) {
      const { id: transferId, name: transferName, auth_key: authKey } = data.transfer;
      downloadText(
        `Volume Transfer ${transferId}.txt`,
        `Transfer Name: ${transferName}\nTransfer ID: ${transferId}\nAuth Key: ${authKey}`
      );
    }
    return data;
  },
});

export const cancelTransferAction = () => ({
  id: 'cancel-transfer',
  type: 'confirm',
  title: t('Cancel Transfer'),
  actionName: t('Cancel Transfer'),
  allowed: (item) => item.status === 'awaiting-transfer',
  onSubmit: async (item) => {
    const res = await cinderApi.listTransfers();
    const found = (res?.transfers || []).find((s) => s.volume_id === item.id);
    if (!found) throw new Error(t('Operation failed'));
    return cinderApi.deleteTransfer(found.id);
  },
});

/* ----------------------------------------------------------------- admin actions */
export const updateStatusAction = () => ({
  id: 'update-status',
  type: 'modal',
  title: t('Update Status'),
  description: t(
    'Do not reset the normally mounted volume to the "available"、"maintenance" or "error" status. The reset state does not remove the volume from the instance. If you need to remove the volume from the instance, please go to the console of the corresponding project and use the "detach" operation.'
  ),
  getDefaultValues: (item) => ({ volume: volumeLabel(item), status: 'available' }),
  formItems: [
    { name: 'volume', label: t('Volume'), type: 'label' },
    {
      name: 'status',
      label: t('Status'),
      type: 'select',
      required: true,
      options: [
        { value: 'available', label: t('Available') },
        { value: 'maintenance', label: t('Maintained') },
        { value: 'error', label: t('Error') },
        { value: 'in-use', label: t('In Use') },
      ],
    },
    {
      type: 'alert',
      name: 'in-use-tip',
      alertType: 'warning',
      message: t('The volume status can be reset to in-use only when the previous status is in-use.'),
    },
  ],
  onSubmit: ({ status }, item) => cinderApi.volumeAction(item.id, 'os-reset_status', { status }),
});

export const migrateVolumeAction = () => ({
  id: 'migrate-volume',
  type: 'modal',
  title: t('Migrate Volume'),
  width: 900,
  allowed: isAvailableOrInUse,
  getDefaultValues: (item) => ({ volume: volumeLabel(item), host: item.host || '-' }),
  getFormItems: async (item) => {
    const res = await cinderApi.listPools().catch(() => ({}));
    const pools = (res?.pools || []).map((pl) => {
      const cap = pl.capabilities || {};
      const used =
        typeof cap.total_capacity_gb === 'number' && typeof cap.free_capacity_gb === 'number'
          ? (cap.total_capacity_gb - cap.free_capacity_gb).toFixed(2)
          : null;
      return { name: pl.name, id: pl.name, ...cap, usedGB: used };
    });
    return [
      { name: 'volume', label: t('Volume'), type: 'label' },
      { name: 'host', label: t('Current Storage Backend'), type: 'label' },
      selectTableField({
        name: 'pool',
        label: t('Target Storage Backend'),
        required: true,
        rowKey: 'name',
        data: pools,
        disabledFunc: (r) => r.name === item.host,
        columns: [
          { title: t('Name'), dataIndex: 'name', key: 'name' },
          textColumn(t('Protocol'), 'storage_protocol'),
          textColumn(t('Backend Name'), 'volume_backend_name'),
          {
            title: t('Storage Capacity (GiB)'),
            key: 'cap',
            render: (_, r) => (r.usedGB ? `${r.usedGB} / ${r.total_capacity_gb}` : '-'),
          },
        ],
      }),
    ];
  },
  onSubmit: ({ pool = [] }, item) => cinderApi.volumeAction(item.id, 'os-migrate_volume', { host: pool[0] }),
});

/* ----------------------------------------------------------------- action configs */
export const volumeActionConfigs = ({ isAdmin, navigate } = {}) => {
  if (isAdmin) {
    return {
      primaryActions: [],
      batchActions: [deleteVolumeAction()],
      rowActions: {
        firstAction: deleteVolumeAction(),
        moreActions: [{ action: updateStatusAction() }, { action: migrateVolumeAction() }],
      },
    };
  }
  return {
    primaryActions: [createVolumeAction(), acceptTransferAction()],
    batchActions: [deleteVolumeAction()],
    rowActions: {
      firstAction: editVolumeAction(),
      moreActions: [
        {
          title: t('Data Protection'),
          actions: [
            createVolumeSnapshotAction(),
            createVolumeBackupAction(),
            createImageAction(),
            cloneVolumeAction(),
            restoreFromSnapshotAction(),
          ],
        },
        {
          title: t('Instance Related'),
          actions: [bootableAction(), createInstanceAction(navigate), attachVolumeAction(), detachVolumeAction()],
        },
        { title: t('Capacity & Type'), actions: [extendVolumeAction(), changeTypeAction()] },
        { action: deleteVolumeAction() },
        { action: createTransferAction() },
        { action: cancelTransferAction() },
      ],
    },
  };
};

/* ----------------------------------------------------------------- columns (getVolumeColumnsList) */
const titleWithTip = (title, tip) => (
  <span>
    {title}{' '}
    <Tooltip title={tip}>
      <QuestionCircleOutlined style={{ color: '#94a3b8', fontSize: 12 }} />
    </Tooltip>
  </span>
);

export const renderAttachments = (value, isAdmin) => {
  if (!value || !value.length) return '-';
  return value.map((it) => (
    <div key={`${it.server_id}-${it.device}`} style={{ fontSize: 12 }}>
      {it.device} {t('on')}{' '}
      <Link to={`/compute/${isAdmin ? 'instance-admin' : 'instance'}/detail/${it.server_id}`}>
        {it.server_name || it.server_id}
      </Link>
    </div>
  ));
};

/* table cell variant of renderAttachments: one ID/Name cell per attached instance */
const renderAttachmentCells = (value, isAdmin) => {
  if (!value || !value.length) return '-';
  return value.map((it) => (
    <div key={`${it.server_id}-${it.device}`} style={{ marginBottom: 4 }}>
      <IdNameCell
        id={it.server_id}
        name={it.server_name}
        href={it.server_id ? `/compute/${isAdmin ? 'instance-admin' : 'instance'}/detail/${it.server_id}` : undefined}
        bold={false}
      />
      {it.device ? <div style={{ fontSize: 11, color: '#94a3b8' }}>{it.device}</div> : null}
    </div>
  ));
};

export const volumeColumns = ({ isAdmin, projectMap = {}, hideAttachments } = {}) =>
  [
    nameColumn({ linkTo: (r) => `/storage/${isAdmin ? 'volume-admin' : 'volume'}/detail/${r.id}` }),
    isAdmin && {
      title: t('Project ID/Name'),
      dataIndex: 'project_name',
      key: 'project_name',
      render: (v, r) => <IdNameCell id={r.project_id} name={v || projectMap[r.project_id]} bold={false} />,
    },
    isAdmin && textColumn(t('Host'), 'host'),
    { title: t('Size'), dataIndex: 'size', key: 'size', sorter: (a, b) => a.size - b.size, render: (v) => <b>{v} GiB</b> },
    statusColumn({ textMap: volumeStatus() }),
    textColumn(t('Type'), 'volume_type', { width: 110 }),
    { title: t('Disk Tag'), dataIndex: 'disk_tag', key: 'disk_tag', render: (v) => diskTag()[v] || '-' },
    !hideAttachments && {
      title: t('Attached To'),
      dataIndex: 'attachments',
      key: 'attachments',
      render: (v) => renderAttachmentCells(v, isAdmin),
    },
    {
      title: titleWithTip(t('Bootable'), bootableTip()),
      dataIndex: 'bootable',
      key: 'bootable',
      render: (v) => bootableType()[String(v)] || '-',
    },
    {
      title: titleWithTip(t('Shared'), multiTip()),
      dataIndex: 'multiattach',
      key: 'multiattach',
      width: 90,
      render: (v) => yesNo(v),
    },
    timeColumn(),
  ].filter(Boolean);

export const volumeFilters = () => [
  { name: 'name', label: t('Name') },
  {
    name: 'status',
    label: t('Status'),
    options: ['available', 'in-use', 'error', 'maintenance'].map((key) => ({ key, label: volumeStatus()[key] })),
  },
  {
    name: 'multiattach',
    label: t('Shared'),
    options: [
      { key: 'true', label: t('Yes') },
      { key: 'false', label: t('No') },
    ],
  },
];
