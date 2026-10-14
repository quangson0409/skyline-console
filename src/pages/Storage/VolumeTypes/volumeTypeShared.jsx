import React from 'react';
import { cinderApi } from '@/api/cinder';
import { keystoneApi } from '@/api/keystone';
import { nameColumn, IdNameCell, textColumn, boolColumn, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { selectTableField, renderSpecs } from '../shared';

/* ------------------------------------------------------------------ resources/cinder/volume-type */
export const consumerTypes = () => ({
  'front-end': t('Front-End'),
  'back-end': t('Back-End'),
  both: t('Both of Front-End and Back-End'),
});

export const controls = () => ({
  'front-end': t('Front-End'),
  'back-end': t('Back-End'),
});

export const multiTip = () => t('"Shared" volume can be mounted on multiple instances');

export const hasEncryption = (item) => {
  const { encryption } = item || {};
  if (!encryption || typeof encryption !== 'object' || !Object.keys(encryption).length) return false;
  return !encryption.deleted_at;
};

const consumerOptions = () => Object.entries(consumerTypes()).map(([value, label]) => ({ value, label }));

/** QoS spec keys offered by legacy QosSpec/Detail/ExtraSpec/actions/Create */
export const QOS_KEYS = [
  'read_iops_sec',
  'read_iops_sec_per_gb',
  'read_iops_sec_per_gb_min',
  'read_iops_sec_max',
  'write_iops_sec',
  'write_iops_sec_per_gb',
  'write_iops_sec_per_gb_min',
  'write_iops_sec_max',
  'total_iops_sec',
  'total_iops_sec_per_gb',
  'total_iops_sec_per_gb_min',
  'total_iops_sec_max',
  'read_bytes_sec',
  'read_bytes_sec_per_gb',
  'read_bytes_sec_per_gb_min',
  'read_bytes_sec_max',
  'write_bytes_sec',
  'write_bytes_sec_per_gb',
  'write_bytes_sec_per_gb_min',
  'write_bytes_sec_max',
  'total_bytes_sec',
  'total_bytes_sec_per_gb',
  'total_bytes_sec_per_gb_min',
  'total_bytes_sec_max',
];

/* ------------------------------------------------------------------ fetchers (stores/cinder/volume-type) */
export const mapVolumeType = (data) => {
  const { extra_specs: { multiattach = 'False' } = {} } = data || {};
  return { ...data, multiattach: multiattach === '<is> True' };
};

export const fetchVolumeTypes = async ({ params = {}, showQoS = true, showEncryption = true } = {}) => {
  const query = { is_public: 'None', ...params };
  const res = await cinderApi.listVolumeTypes(query);
  const items = (res?.volume_types || []).map(mapVolumeType);
  if (!items.length) return items;
  if (showQoS) {
    const qosIds = [...new Set(items.filter((it) => it.qos_specs_id).map((it) => it.qos_specs_id))];
    const qosItems = await Promise.all(
      qosIds.map((id) =>
        cinderApi
          .getQosSpec(id)
          .then((r) => r?.qos_specs)
          .catch(() => null)
      )
    );
    items.forEach((it) => {
      if (it.qos_specs_id) {
        it.qos_specs = qosItems.find((q) => q && q.id === it.qos_specs_id);
        it.qos_specs_name = it.qos_specs?.name;
        it.qos_props = it.qos_specs?.specs || {};
      }
    });
  }
  if (!showEncryption) return items;
  const encryptions = await Promise.all(items.map((it) => cinderApi.getVolumeTypeEncryption(it.id).catch(() => ({}))));
  return items.map((it, idx) => {
    const enc = encryptions[idx];
    return { ...it, encryption: enc && enc.volume_type_id === it.id ? enc : enc?.encryption || {} };
  });
};

export const fetchVolumeTypeDetail = async (id) => {
  let raw = (await cinderApi.getVolumeType(id))?.volume_type;
  if (!raw) {
    // fall back to the list (private types may not be readable by id in some deployments)
    raw = ((await cinderApi.listVolumeTypes({ is_public: 'None' }))?.volume_types || []).find((it) => it.id === id);
  }
  if (!raw) throw new Error(t('Resource not found or failed to load'));
  const item = mapVolumeType(raw);
  try {
    item.encryption = (await cinderApi.getVolumeTypeEncryption(id)) || {};
  } catch {
    item.encryption = {};
  }
  return item;
};

export const fetchQosSpecs = async () => (await cinderApi.listQosSpecs())?.qos_specs || [];

const fetchProjects = async () => {
  try {
    const res = await keystoneApi.listProjects();
    return res?.projects || [];
  } catch {
    return [];
  }
};

const projectTableColumns = () => [
  nameColumn({ title: t('Project ID/Name') }),
  textColumn(t('Domain ID'), 'domain_id'),
  boolColumn(t('Enabled'), 'enabled'),
  textColumn(t('Description'), 'description'),
];

const accessField = (name, projects, extra = {}) => ({
  ...selectTableField({
    name,
    label: t('Access Control'),
    data: projects,
    columns: projectTableColumns(),
    multiple: true,
  }),
  visible: (values) => !values.isPublic,
  ...extra,
});

/* ------------------------------------------------------------------ volume type actions */
export const createVolumeTypeAction = ({ existingNames = () => [] } = {}) => ({
  id: 'create',
  type: 'modal',
  policy: 'volume_extension:type_create',
  title: t('Create Volume Type'),
  width: 900,
  getDefaultValues: () => ({ isPublic: true, multiattach: false }),
  getFormItems: async () => {
    const projects = await fetchProjects();
    const names = existingNames();
    return [
      {
        name: 'name',
        label: t('Name'),
        type: 'input',
        required: true,
        rules: [
          {
            validator: (_, v) =>
              v && names.includes(v) ? Promise.reject(new Error(t('Name already exists'))) : Promise.resolve(),
          },
        ],
      },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
      { name: 'multiattach', label: t('Shared'), type: 'checkbox', tip: multiTip() },
      { name: 'isPublic', label: t('Public'), type: 'checkbox' },
      accessField('accessControl', projects),
    ];
  },
  onSubmit: async (values) => {
    const { multiattach, isPublic = false, accessControl = [], ...rest } = values;
    const body = { ...rest };
    let projectIds = [];
    if (multiattach) body.extra_specs = { multiattach: '<is> True' };
    if (isPublic) {
      body['os-volume-type-access:is_public'] = true;
    } else {
      body['os-volume-type-access:is_public'] = false;
      projectIds = [...(accessControl || [])];
    }
    const res = await cinderApi.createVolumeType(body);
    const id = res?.volume_type?.id;
    if (id && projectIds.length) {
      await Promise.all(projectIds.map((project) => cinderApi.volumeTypeAction(id, { addProjectAccess: { project } })));
    }
    return res;
  },
});

export const editVolumeTypeAction = ({ existingNames = () => [] } = {}) => ({
  id: 'edit',
  type: 'modal',
  policy: 'volume_extension:type_update',
  title: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  getFormItems: (item) => {
    const names = existingNames().filter((n) => n !== item.name);
    return [
      {
        name: 'name',
        label: t('Name'),
        type: 'input',
        required: true,
        rules: [
          {
            validator: (_, v) =>
              v && names.includes(v) ? Promise.reject(new Error(t('Name already exists'))) : Promise.resolve(),
          },
        ],
      },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
    ];
  },
  onSubmit: (values, item) => cinderApi.updateVolumeType(item.id, values),
});

export const deleteVolumeTypeAction = () => ({
  ...deleteAction({ name: t('Volume Type'), title: t('Delete Volume Type'), onDelete: (it) => cinderApi.deleteVolumeType(it.id) }),
  policy: 'volume_extension:type_delete',
});

export const manageQosAction = () => ({
  id: 'manage-qos',
  type: 'modal',
  policy: 'volume_extension:qos_specs_manage:update',
  title: t('Manage QoS Spec'),
  width: 900,
  getDefaultValues: (item) => ({
    volumeType: item.name,
    qosSpec: item.qos_specs_id ? [item.qos_specs_id] : [],
  }),
  getFormItems: async () => {
    const qos = await fetchQosSpecs().catch(() => []);
    return [
      { name: 'volumeType', label: t('Volume Type'), type: 'label' },
      selectTableField({
        name: 'qosSpec',
        label: t('QoS Spec'),
        data: qos,
        columns: [
          nameColumn(),
          { title: t('Consumer'), dataIndex: 'consumer', key: 'consumer', render: (v) => consumerTypes()[v] || v },
          { title: t('Specs'), dataIndex: 'specs', key: 'specs', render: renderSpecs },
        ],
      }),
    ];
  },
  onSubmit: async ({ qosSpec = [] }, item) => {
    const qosId = (qosSpec || [])[0];
    if (item.qos_specs_id) await cinderApi.disassociateQosSpec(item.qos_specs_id, item.id);
    if (qosId) await cinderApi.associateQosSpec(qosId, item.id);
  },
});

export const manageAccessAction = () => ({
  id: 'manage-access',
  type: 'modal',
  policy: [
    'volume_extension:volume_type_access',
    'volume_extension:volume_type_access:addProjectAccess',
    'volume_extension:volume_type_access:removeProjectAccess',
  ],
  title: t('Manage Access'),
  width: 900,
  getDefaultValues: async (item) => {
    let current = [];
    if (!item.is_public) {
      try {
        const res = await cinderApi.getVolumeTypeAccess(item.id);
        current = (res?.volume_type_access || []).map((it) => it.project_id);
      } catch {
        current = [];
      }
    }
    // keep the original access list on the item for the diff in onSubmit
    item.__currentAccess = current;
    return { name: item.name, isPublic: Boolean(item.is_public), access: current };
  },
  getFormItems: async () => {
    const projects = await fetchProjects();
    return [
      { name: 'name', label: t('Volume Type'), type: 'label' },
      { name: 'isPublic', label: t('Public'), type: 'checkbox' },
      accessField('access', projects),
    ];
  },
  onSubmit: async ({ access = [], isPublic }, item) => {
    const currentAccess = item.__currentAccess || [];
    const { id, is_public: publicOld } = item;
    const newPublic = Boolean(isPublic) !== Boolean(publicOld) ? Boolean(isPublic) : undefined;
    let adds = [];
    let dels = [];
    if (!isPublic) {
      adds = (access || []).filter((it) => !currentAccess.includes(it));
      dels = currentAccess.filter((it) => !(access || []).includes(it));
    }
    const more = adds.length > 0 || dels.length > 0;
    if (newPublic !== undefined) {
      await cinderApi.updateVolumeType(id, { is_public: newPublic });
      if (newPublic || !more) return undefined;
    }
    await Promise.all(dels.map((project) => cinderApi.volumeTypeAction(id, { removeProjectAccess: { project } })));
    await Promise.all(adds.map((project) => cinderApi.volumeTypeAction(id, { addProjectAccess: { project } })));
    return undefined;
  },
});

export const createEncryptionAction = () => ({
  id: 'create-encryption',
  type: 'modal',
  policy: 'volume_extension:volume_type_encryption:create',
  title: t('Create Encryption'),
  allowed: (item) => !hasEncryption(item),
  getDefaultValues: (item) => ({ name: item.name }),
  formItems: [
    { name: 'name', label: t('Volume Type'), type: 'label' },
    {
      name: 'provider',
      label: t('Provider'),
      type: 'input',
      required: true,
      placeholder: t('Please input provider'),
      tip: t('The Provider is the encryption provider format (e.g. "luks")'),
    },
    {
      name: 'control_location',
      label: t('Control Location'),
      type: 'select',
      required: true,
      options: Object.entries(controls()).map(([value, label]) => ({ value, label })),
    },
    { name: 'cipher', label: t('Cipher'), type: 'input', placeholder: t('Please input cipher') },
    { name: 'key_size', label: t('Key Size (bits)'), type: 'number', min: 1, placeholder: t('Please input key size') },
  ],
  onSubmit: ({ name, ...values }, item) => {
    const body = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    return cinderApi.createVolumeTypeEncryption(item.id, body);
  },
});

export const deleteEncryptionAction = () => ({
  id: 'delete-encryption',
  type: 'confirm',
  policy: 'volume_extension:volume_type_encryption:delete',
  title: t('Delete Encryption'),
  actionName: t('Delete Encryption'),
  isDanger: true,
  allowed: (item) => hasEncryption(item),
  onSubmit: (item) => cinderApi.deleteVolumeTypeEncryption(item.id, item.encryption?.encryption_id),
});

export const volumeTypeRowActions = (opts) => ({
  firstAction: manageQosAction(),
  moreActions: [
    { action: manageAccessAction() },
    { action: createEncryptionAction() },
    { action: deleteEncryptionAction() },
    { action: editVolumeTypeAction(opts) },
    { action: deleteVolumeTypeAction() },
  ],
});

export const volumeTypeColumns = () => [
  nameColumn({ linkTo: (r) => `/storage/volume-type-admin/detail/${r.id}` }),
  textColumn(t('Description'), 'description'),
  {
    title: t('Associated QoS Spec ID/Name'),
    dataIndex: 'qos_specs_name',
    key: 'qos_specs_name',
    render: (v, r) =>
      r.qos_specs_id ? (
        <IdNameCell id={r.qos_specs_id} name={v} href={`/storage/volume-type-admin/qos/detail/${r.qos_specs_id}`} bold={false} />
      ) : (
        '-'
      ),
  },
  {
    title: t('Encryption'),
    dataIndex: 'encryption',
    key: 'encryption',
    render: (v) => (v && v.provider) || '-',
  },
  boolColumn(t('Public'), 'is_public'),
  { ...boolColumn(t('Shared'), 'multiattach'), title: <span title={multiTip()}>{t('Shared')}</span>, width: 120 },
];

/* ------------------------------------------------------------------ extra specs (volume type) */
export const extraSpecsToList = (obj = {}) =>
  Object.entries(obj || {}).map(([key, value]) => ({ id: key, keyname: key, name: key, value }));

export const extraSpecColumns = () => [
  { title: t('Parameter'), dataIndex: 'keyname', key: 'keyname' },
  { title: t('Value'), dataIndex: 'value', key: 'value', render: (v) => (v === undefined || v === null ? '-' : String(v)) },
];

export const typeExtraSpecActions = (typeId) => {
  const create = {
    id: 'create',
    type: 'modal',
    policy: 'volume_extension:types_extra_specs:create',
    title: t('Create Extra Spec'),
    formItems: [
      { name: 'keyname', label: t('Parameter'), type: 'input', required: true, placeholder: t('Please input a parameter') },
      { name: 'value', label: t('Value'), type: 'input', required: true, placeholder: t('Please input a value') },
    ],
    onSubmit: ({ keyname, value }) => cinderApi.setVolumeTypeExtraSpecs(typeId, { [keyname]: value }),
  };
  const edit = {
    id: 'edit',
    type: 'modal',
    policy: 'volume_extension:types_extra_specs:update',
    title: t('Edit Extra Spec'),
    buttonText: t('Edit'),
    getDefaultValues: (item) => ({ keyname: item.keyname, value: item.value }),
    formItems: [
      { name: 'keyname', label: t('Parameter'), type: 'input', disabled: true },
      { name: 'value', label: t('Value'), type: 'input', placeholder: t('Please input value') },
    ],
    onSubmit: ({ value }, item) => cinderApi.setVolumeTypeExtraSpecs(typeId, { [item.keyname]: value }),
  };
  const del = {
    ...deleteAction({
      name: t('Extra Specs'),
      title: t('Delete Extra Specs'),
      onDelete: (it) => cinderApi.deleteVolumeTypeExtraSpec(typeId, it.keyname),
    }),
    policy: 'volume_extension:types_extra_specs:delete',
  };
  return { create, edit, del };
};

/* ------------------------------------------------------------------ QoS spec actions */
export const createQosAction = () => ({
  id: 'create',
  type: 'modal',
  policy: 'volume_extension:qos_specs_manage:create',
  title: t('Create QoS Spec'),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: t('Please input name') },
    { name: 'consumer', label: t('Consumer'), type: 'select', required: true, options: consumerOptions() },
  ],
  onSubmit: (values) => cinderApi.createQosSpec(values),
});

export const editConsumerAction = () => ({
  id: 'editConsumer',
  type: 'modal',
  policy: 'volume_extension:qos_specs_manage:update',
  title: t('Edit Consumer'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({ consumer: item.consumer }),
  formItems: [{ name: 'consumer', label: t('Consumer'), type: 'select', required: true, options: consumerOptions() }],
  onSubmit: ({ consumer }, item) => cinderApi.updateQosSpec(item.id, { consumer }),
});

export const deleteQosAction = () => ({
  ...deleteAction({ name: t('QoS Spec'), title: t('Delete QoS Spec'), onDelete: (it) => cinderApi.deleteQosSpec(it.id) }),
  policy: 'volume_extension:qos_specs_manage:delete',
});

export const qosColumns = () => [
  nameColumn({ linkTo: (r) => `/storage/volume-type-admin/qos/detail/${r.id}` }),
  { title: t('Consumer'), dataIndex: 'consumer', key: 'consumer', render: (v) => consumerTypes()[v] || v || '-' },
  { title: t('Specs'), dataIndex: 'specs', key: 'specs', render: renderSpecs },
];

export const qosKeyActions = (qosId) => {
  const keyOptions = QOS_KEYS.map((k) => ({ value: k, label: k }));
  const create = {
    id: 'create',
    type: 'modal',
    policy: 'volume_extension:qos_specs_manage:update',
    title: t('Create Extra Spec'),
    getDefaultValues: () => ({ keyname: QOS_KEYS[0] }),
    formItems: [
      { name: 'keyname', label: t('Parameter'), type: 'select', required: true, options: keyOptions },
      { name: 'value', label: t('Value'), type: 'number', required: true, tip: t('Please input a number') },
    ],
    onSubmit: ({ keyname, value }) => cinderApi.updateQosSpec(qosId, { [keyname]: String(value) }),
  };
  const edit = {
    id: 'edit',
    type: 'modal',
    policy: 'volume_extension:qos_specs_manage:update',
    title: t('Edit Extra Spec'),
    buttonText: t('Edit'),
    getDefaultValues: (item) => ({ keyname: item.keyname, value: Number.isNaN(Number(item.value)) ? undefined : Number(item.value) }),
    formItems: [
      { name: 'keyname', label: t('Parameter'), type: 'input', disabled: true },
      { name: 'value', label: t('Value'), type: 'number', tip: t('Please input a number') },
    ],
    onSubmit: ({ value }, item) =>
      cinderApi.updateQosSpec(qosId, { [item.keyname]: typeof value === 'number' ? String(value) : null }),
  };
  const del = {
    ...deleteAction({
      name: t('Extra Specs'),
      title: t('Delete Extra Specs'),
      onDelete: (it) => cinderApi.deleteQosSpecKeys(qosId, [it.keyname]),
    }),
    policy: 'volume_extension:qos_specs_manage:update',
  };
  return { create, edit, del };
};
