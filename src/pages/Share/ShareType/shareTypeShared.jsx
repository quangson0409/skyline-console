import React from 'react';
import { manilaApi } from '@/api/manila';
import { nameColumn, textColumn, yesNo, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  yesNoOptions,
  fetchProjectsWithDomain,
  accessControlField,
  keyValueField,
  kvToObj,
  specsToList,
} from '../shareShared';

/* ------------------------------------------------------------------ stores/manila/share-type */
export const mapShareType = (data) => ({ ...data, is_public: data?.['share_type_access:is_public'] ?? data?.is_public });

export const fetchShareTypes = async ({ all = false, params = {} } = {}) => {
  const query = { ...params };
  if (all) query.is_public = 'all';
  const res = await manilaApi.listShareTypes(query);
  return (res?.share_types || []).map(mapShareType);
};

export const fetchShareTypeDetail = async (id) => {
  const item = (await manilaApi.getShareType(id))?.share_type;
  return item ? mapShareType(item) : item;
};

export const extraSpecApi = (id) => ({
  list: async () => specsToList((await manilaApi.listShareTypeExtraSpecs(id))?.extra_specs),
  set: (obj) => manilaApi.setShareTypeExtraSpecs(id, obj),
  remove: (key) => manilaApi.deleteShareTypeExtraSpec(id, key),
});

/* ------------------------------------------------------------------ resources/manila/share-type */
export const shareTypeColumns = () => [
  nameColumn({ linkTo: (r) => `/share/share-type-admin/detail/${r.id}` }),
  textColumn(t('Description'), 'description'),
  {
    title: t('Public'),
    dataIndex: 'share_type_access:is_public',
    key: 'is_public',
    render: (v, r) => yesNo(v ?? r.is_public),
  },
  {
    title: t('Driver Handles Share Servers'),
    dataIndex: 'extra_specs',
    key: 'dhss',
    render: (v) => {
      const val = v?.driver_handles_share_servers;
      return val === undefined ? '-' : String(val);
    },
  },
];

/** ShareTypeStore.updateProjectAccess */
const addAccess = (id, projects = []) =>
  Promise.all(projects.map((project) => manilaApi.shareTypeAction(id, { addProjectAccess: { project } })));
const removeAccess = (id, projects = []) =>
  Promise.all(projects.map((project) => manilaApi.shareTypeAction(id, { removeProjectAccess: { project } })));

const uniqueName = (names) => ({
  validator: (_, v) => (v && names.includes(v) ? Promise.reject(new Error(t('Name already exists'))) : Promise.resolve()),
});

/* ------------------------------------------------------------------ actions */
export const createShareTypeAction = ({ existingNames = () => [] } = {}) => ({
  id: 'create',
  type: 'modal',
  title: t('Create Share Type'),
  width: 960,
  getDefaultValues: () => ({ isPublic: true, accessControl: [], extra: [] }),
  getFormItems: async () => {
    const projects = await fetchProjectsWithDomain();
    return [
      { name: 'name', label: t('Name'), type: 'input', required: true, rules: [uniqueName(existingNames())] },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
      {
        name: 'driver_handles_share_servers',
        label: t('Driver Handles Share Servers'),
        type: 'select',
        required: true,
        options: yesNoOptions(),
      },
      { name: 'isPublic', label: t('Public'), type: 'checkbox' },
      accessControlField('accessControl', projects),
      keyValueField({ name: 'extra', label: t('Extra Specs'), addText: t('Add Extra Spec') }),
    ];
  },
  onSubmit: async (values) => {
    const { driver_handles_share_servers, isPublic = false, accessControl = [], extra = [], ...rest } = values;
    const body = { ...rest };
    const extraSpecs = kvToObj(extra);
    extraSpecs.driver_handles_share_servers = driver_handles_share_servers;
    body.extra_specs = extraSpecs;
    let projectIds = [];
    if (isPublic) {
      body['os-share-type-access:is_public'] = true;
    } else {
      body['os-share-type-access:is_public'] = false;
      projectIds = [...(accessControl || [])];
    }
    const res = await manilaApi.createShareType(body);
    const id = res?.share_type?.id;
    if (id && projectIds.length) await addAccess(id, projectIds);
    return res;
  },
});

export const editShareTypeAction = ({ existingNames = () => [] } = {}) => ({
  id: 'edit',
  type: 'modal',
  title: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  getFormItems: (item) => [
    {
      name: 'name',
      label: t('Name'),
      type: 'input',
      required: true,
      rules: [uniqueName(existingNames().filter((n) => n !== item.name))],
    },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => manilaApi.updateShareType(item.id, values),
});

export const deleteShareTypeAction = () => ({
  ...deleteAction({
    name: t('Share Type'),
    title: t('Delete Share Type'),
    onDelete: (it) => manilaApi.deleteShareType(it.id),
  }),
  actionName: t('Delete Share Type'),
});

export const manageShareTypeAccessAction = () => ({
  id: 'manage-access',
  type: 'modal',
  title: t('Manage Access'),
  width: 960,
  getDefaultValues: async (item) => {
    let current = [];
    if (!item.is_public) {
      try {
        const res = await manilaApi.getShareTypeAccess(item.id);
        current = (res?.share_type_access || []).map((it) => it.project_id);
      } catch {
        current = [];
      }
    }
    item.__currentAccess = current;
    return { name: item.name, isPublic: Boolean(item.is_public), access: current };
  },
  getFormItems: async () => {
    const projects = await fetchProjectsWithDomain();
    return [
      { name: 'name', label: t('Share Type'), type: 'label' },
      { name: 'isPublic', label: t('Public'), type: 'checkbox' },
      accessControlField('access', projects),
    ];
  },
  onSubmit: async ({ access = [], isPublic }, item) => {
    const current = item.__currentAccess || [];
    const { id, is_public: publicOld } = item;
    const newPublic = Boolean(isPublic) !== Boolean(publicOld) ? Boolean(isPublic) : undefined;
    let adds = [];
    let dels = [];
    if (!isPublic) {
      adds = (access || []).filter((it) => !current.includes(it));
      dels = current.filter((it) => !(access || []).includes(it));
    }
    const more = adds.length > 0 || dels.length > 0;
    if (newPublic !== undefined) {
      await manilaApi.updateShareType(id, { 'share_type_access:is_public': newPublic });
      if (newPublic || !more) return undefined;
    }
    await removeAccess(id, dels);
    return addAccess(id, adds);
  },
});

export const shareTypeActionConfigs = ({ existingNames } = {}) => {
  const del = deleteShareTypeAction();
  return {
    primaryActions: [createShareTypeAction({ existingNames })],
    batchActions: [del],
    rowActions: {
      firstAction: editShareTypeAction({ existingNames }),
      moreActions: [{ action: manageShareTypeAccessAction() }, { action: del }],
    },
  };
};
