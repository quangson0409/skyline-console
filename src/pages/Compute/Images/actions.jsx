import React from 'react';
import { glanceApi } from '@/api/glance';
import { cinderApi } from '@/api/cinder';
import { hasEndpoint } from '@/api/endpoints';
import { deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  NoSetValue,
  imageOS,
  toOptions,
  isOwner,
  yesNoOptions,
  cpuPolicyOptions,
  cpuThreadPolicyOptions,
  canImageCreateInstance,
  canImageCreateIronicInstance,
  ProjectSelect,
  fetchVolumeTypeOptions,
  fetchVolumeQuotaText,
} from './helpers';
import { KeyValueList, MetadataTransfer, loadMetadefProperties } from './MetadataEditor';

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const origin = (item) => item?.originData || item || {};

/** Builds the legacy JSON-patch diff (replace existing / add new truthy values) */
export const buildPatch = (originData, newValues) => {
  const ops = [];
  Object.keys(newValues).forEach((key) => {
    const value = newValues[key];
    if (value === undefined) return;
    if (has(originData, key) && originData[key] !== value) {
      ops.push({ op: 'replace', path: `/${key}`, value });
    } else if (!has(originData, key) && value) {
      ops.push({ op: 'add', path: `/${key}`, value });
    }
  });
  return ops;
};

const advancedVisible = (values) => Boolean(values.more);

/* ---------------- Edit (legacy Image/actions/Edit) ---------------- */
export const editImageAction = ({ isAdmin } = {}) => ({
  id: 'image-edit',
  type: 'modal',
  policy: 'modify_image',
  title: t('Edit Image'),
  buttonText: t('Edit'),
  allowed: (item) => (item.status === 'active' && isOwner(item)) || isAdmin,
  getDefaultValues: (item) => ({
    name: item.name,
    os_distro: item.os_distro,
    os_version: item.os_version,
    os_admin_user: item.os_admin_user,
    min_disk: item.min_disk,
    min_ram: item.min_ram !== undefined ? item.min_ram / 1024 : undefined,
    visibility: item.visibility === 'public',
    protected: Boolean(item.protected),
    description: item.description,
    more: false,
    hw_qemu_guest_agent: item.hw_qemu_guest_agent,
    hw_cpu_policy: item.hw_cpu_policy || NoSetValue,
    hw_cpu_thread_policy: item.hw_cpu_thread_policy || NoSetValue,
  }),
  getFormItems: () => {
    const enableCinder = hasEndpoint('cinder');
    const zeroTip = t('If the value is set to 0, it means unlimited');
    return [
      { name: 'name', label: t('Name'), type: 'input', required: true },
      { name: 'os_distro', label: t('OS'), type: 'select', options: toOptions(imageOS()), required: true },
      { name: 'os_version', label: t('OS Version'), type: 'input', required: true },
      {
        name: 'os_admin_user',
        label: t('OS Admin'),
        type: 'input',
        required: true,
        tip: t('In general, administrator for Windows, root for Linux, please fill by image uploading.'),
      },
      enableCinder && {
        name: 'min_disk',
        label: t('Min. System Disk (GiB)'),
        type: 'number',
        min: 0,
        max: 500,
        required: true,
        tip: zeroTip,
      },
      { name: 'min_ram', label: t('Min. Memory (GiB)'), type: 'number', min: 0, max: 500, required: true, tip: zeroTip },
      isAdmin && { name: 'visibility', label: `${t('Visibility')} - ${t('Public')}`, type: 'switch' },
      { name: 'protected', label: `${t('Protection')} - ${t('Protected')}`, type: 'switch' },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 3, rules: [{ max: 255 }] },
      { name: 'more', label: t('Advanced Options'), type: 'switch' },
      {
        name: 'hw_qemu_guest_agent',
        label: t('QEMU Guest Agent Enabled'),
        type: 'radio',
        options: yesNoOptions(),
        visible: advancedVisible,
        tip: t(
          'It is recommended to install and use this agent. The instance created with this image can be used to modify the password (QEMU Guest Agent needs to be installed when creating the image).'
        ),
      },
      {
        name: 'hw_cpu_policy',
        label: t('CPU Policy'),
        type: 'select',
        options: cpuPolicyOptions(),
        visible: advancedVisible,
        required: true,
      },
      {
        name: 'hw_cpu_thread_policy',
        label: t('CPU Thread Policy'),
        type: 'select',
        options: cpuThreadPolicyOptions(),
        visible: advancedVisible,
        required: true,
      },
    ].filter(Boolean);
  },
  onSubmit: (values, item) => {
    const data = origin(item);
    const {
      more,
      protected: isProtected = false,
      visibility,
      hw_cpu_policy,
      hw_cpu_thread_policy,
      min_ram,
      ...rest
    } = values;
    const newValues = {
      protected: isProtected,
      // non-admin forms do not render the field: keep the value legacy pre-filled (public or not)
      visibility: (visibility ?? data.visibility === 'public') ? 'public' : 'private',
      ...rest,
    };
    if (typeof min_ram === 'number') newValues.min_ram = min_ram * 1024;
    if (hw_cpu_policy !== NoSetValue) newValues.hw_cpu_policy = hw_cpu_policy || data.hw_cpu_policy;
    if (hw_cpu_thread_policy !== NoSetValue) {
      newValues.hw_cpu_thread_policy = hw_cpu_thread_policy || data.hw_cpu_thread_policy;
    }
    const ops = buildPatch(data, newValues);
    if (data.hw_cpu_policy && hw_cpu_policy === NoSetValue) ops.push({ op: 'remove', path: '/hw_cpu_policy' });
    if (data.hw_cpu_thread_policy && hw_cpu_thread_policy === NoSetValue) {
      ops.push({ op: 'remove', path: '/hw_cpu_thread_policy' });
    }
    if (!ops.length) return Promise.resolve();
    return glanceApi.updateImage(item.id, ops);
  },
});

/* ---------------- Delete ---------------- */
export const deleteImageAction = ({ isAdmin } = {}) => ({
  ...deleteAction({
    name: t('Image'),
    title: t('Delete Image'),
    allowed: (item) => item.status !== 'deleted' && !item.protected && (isOwner(item) || isAdmin),
    onDelete: (it) => glanceApi.deleteImage(it.id),
  }),
  policy: 'delete_image',
});

/* ---------------- Create Instance / Ironic (navigate) ---------------- */
export const createInstanceFromImageAction = ({ isAdmin, navigate }) => ({
  id: 'instance-create',
  type: 'custom',
  policy: 'os_compute_api:servers:create:trusted_certs',
  title: t('Create Instance'),
  allowed: (item) => !isAdmin && canImageCreateInstance(item),
  onExecute: (item) =>
    navigate(`/compute/instance?image=${item.id}&os_distro=${encodeURIComponent(item.os_distro || '')}`),
});

export const createIronicFromImageAction = ({ isAdmin, navigate }) => ({
  id: 'ironic-create',
  type: 'custom',
  policy: 'os_compute_api:servers:create:trusted_certs',
  title: t('Create Ironic Instance'),
  allowed: (item) => !isAdmin && hasEndpoint('ironic') && canImageCreateIronicInstance(item),
  onExecute: (item) =>
    navigate(`/compute/instance?image=${item.id}&os_distro=${encodeURIComponent(item.os_distro || '')}&type=ironic`),
});

/* ---------------- Create Volume (legacy Image/actions/CreateVolume) ---------------- */
const imageMinSize = (item) =>
  Math.max(Number(item.min_disk) || 0, Math.ceil((Number(item.size) || 0) / 1024 / 1024 / 1024));

export const createVolumeFromImageAction = ({ isAdmin } = {}) => ({
  id: 'create-volume',
  type: 'modal',
  policy: 'volume:create_from_image',
  title: t('Create Volume'),
  allowed: () => hasEndpoint('cinder') && !isAdmin,
  getDefaultValues: (item) => ({ image: item.name || item.id, size: imageMinSize(item) }),
  getFormItems: async (item) => {
    const minSize = imageMinSize(item);
    const [types, quota] = await Promise.all([fetchVolumeTypeOptions(), fetchVolumeQuotaText()]);
    return [
      quota && { name: 'quota', type: 'alert', message: quota },
      { name: 'image', label: t('Image'), type: 'label' },
      { name: 'name', label: t('Volume Name'), type: 'input', required: true, placeholder: t('Please input name') },
      {
        name: 'volume_type',
        label: t('Volume Type'),
        type: 'select',
        required: true,
        options: types,
        placeholder: t('Please select volume type'),
      },
      {
        name: 'size',
        label: t('Capacity (GiB)'),
        type: 'number',
        min: minSize,
        required: true,
        tip: `${t('Min. Size')}: ${minSize}GiB`,
      },
    ].filter(Boolean);
  },
  onSubmit: ({ name, size, volume_type }, item) =>
    cinderApi.createVolume({ imageRef: item.id, name, size, volume_type }),
});

/* ---------------- Manage Access (members) ---------------- */
const createMember = async (id, member) => {
  await glanceApi.createMember(id, member);
  return glanceApi.updateMember(id, member, 'accepted');
};

export const updateImageMembers = async (id, adds = [], dels = []) => {
  await Promise.all(adds.map((m) => createMember(id, m)));
  await Promise.all(dels.map((m) => glanceApi.deleteMember(id, m)));
};

export const createImageMembers = (id, members = []) => Promise.all(members.map((m) => createMember(id, m)));

export const manageAccessAction = () => {
  let currentMembers = [];
  return {
    id: 'manage-access',
    type: 'modal',
    policy: ['get_members', 'add_member', 'delete_member'],
    title: t('Manage Access'),
    width: 800,
    allowed: (item) => item.visibility === 'shared',
    getDefaultValues: async (item) => {
      const res = await glanceApi.listMembers(item.id).catch(() => ({}));
      currentMembers = (res?.members || []).map((m) => m.member_id);
      return { name: item.name || item.id, members: currentMembers };
    },
    formItems: [
      { name: 'name', label: t('Image Name'), type: 'label' },
      {
        name: 'members',
        label: t('Project'),
        required: true,
        render: () => <ProjectSelect multiple />,
      },
    ],
    onSubmit: ({ members }, item) => {
      if (!members) return Promise.resolve();
      const adds = members.filter((m) => !currentMembers.includes(m));
      const dels = currentMembers.filter((m) => !members.includes(m));
      return updateImageMembers(item.id, adds, dels);
    },
  };
};

/* ---------------- Manage Metadata (glance metadefs) ---------------- */
const NON_METADATA_KEYS = [
  'container_format',
  'disk_format',
  'id',
  'min_disk',
  'min_ram',
  'name',
  'protected',
  'tags',
  'visibility',
  'owner',
  'created_at',
  'is_public',
  'updated_at',
  'status',
  'locations',
  'file',
  'size',
  'image_type',
  'self',
  'virtual_size',
];

const itemMetadata = (item) =>
  Object.fromEntries(Object.entries(origin(item)).filter(([k]) => !NON_METADATA_KEYS.includes(k)));

const splitMetadata = (item, metadata) => {
  const systemKeys = new Set(metadata.map((m) => m.key));
  const customs = [];
  const systems = {};
  if (metadata.length > 0) {
    Object.entries(itemMetadata(item)).forEach(([key, value]) => {
      if (systemKeys.has(key)) systems[key] = value;
      else customs.push({ key, value });
    });
  }
  return { customs, systems };
};

export const manageMetadataAction = ({ isAdmin } = {}) => {
  let metadata = [];
  return {
    id: 'ManageMetadata',
    type: 'modal',
    policy: 'modify_image',
    title: t('Manage Metadata'),
    width: 900,
    allowed: (item) => isOwner(item) || isAdmin,
    getFormItems: async () => {
      metadata = await loadMetadefProperties('OS::Glance::Image');
      return [
        { name: 'name', label: t('Name'), type: 'label' },
        {
          name: 'customs',
          label: t('Custom Metadata'),
          render: () => <KeyValueList />,
          rules: [
            {
              validator: (_, value) =>
                (value || []).some((it) => !it.key || it.value === undefined || it.value === null)
                  ? Promise.reject(new Error(t('Please enter complete key value!')))
                  : Promise.resolve(),
            },
          ],
        },
        {
          name: 'systems',
          label: t('Metadata'),
          render: () => <MetadataTransfer metadata={metadata} />,
          rules: [
            {
              validator: (_, value) =>
                Object.values(value || {}).some((v) => v === undefined)
                  ? Promise.reject(new Error(t('Please input value')))
                  : Promise.resolve(),
            },
          ],
        },
      ];
    },
    getDefaultValues: async (item) => {
      if (!metadata.length) metadata = await loadMetadefProperties('OS::Glance::Image');
      const { customs, systems } = splitMetadata(item, metadata);
      return { name: item.name || item.id, customs, systems };
    },
    onSubmit: (values, item) => {
      const { customs: oldCustoms, systems: oldSystems } = splitMetadata(item, metadata);
      const customs = values.customs || [];
      const systems = values.systems || {};
      const adds = [];
      const replaces = [];
      const removes = [];
      customs.forEach((it) => {
        const old = oldCustoms.find((c) => c.key === it.key);
        if (!old) adds.push(it);
        else if (old.value !== it.value) replaces.push(it);
      });
      Object.keys(systems).forEach((key) => {
        const it = { key, value: systems[key] };
        if (!has(oldSystems, key)) adds.push(it);
        else if (systems[key] !== oldSystems[key]) replaces.push(it);
      });
      oldCustoms.forEach((it) => {
        if (!customs.find((c) => c.key === it.key)) removes.push(it.key);
      });
      Object.keys(oldSystems).forEach((key) => {
        if (!has(systems, key)) removes.push(key);
      });
      const ops = [
        ...adds.map((it) => ({ op: 'add', path: `/${it.key}`, value: it.value })),
        ...replaces.map((it) => ({ op: 'replace', path: `/${it.key}`, value: it.value })),
        ...removes.map((key) => ({ op: 'remove', path: `/${key}` })),
      ];
      if (!ops.length) return Promise.resolve();
      return glanceApi.updateImage(item.id, ops);
    },
  };
};

/** Row/detail action config (legacy actionConfigs / actionConfigsAdmin) */
export const imageRowActions = ({ isAdmin, navigate }) =>
  isAdmin
    ? {
        firstAction: editImageAction({ isAdmin }),
        moreActions: [
          { action: deleteImageAction({ isAdmin }) },
          { action: manageAccessAction() },
          { action: manageMetadataAction({ isAdmin }) },
        ],
      }
    : {
        firstAction: editImageAction({ isAdmin }),
        moreActions: [
          { action: createInstanceFromImageAction({ isAdmin, navigate }) },
          { action: createIronicFromImageAction({ isAdmin, navigate }) },
          { action: createVolumeFromImageAction({ isAdmin }) },
          { action: deleteImageAction({ isAdmin }) },
        ],
      };
