import { manilaApi } from '@/api/manila';
import { nameColumn, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  fetchProjectsWithDomain,
  accessControlField,
  keyValueField,
  kvToObj,
  selectTableField,
  specsToList,
} from '../shareShared';
import { fetchShareTypes } from '../ShareType/shareTypeShared';

/* ------------------------------------------------------------------ stores/manila/share-group-type */
const attachShareTypes = (item, types) => ({
  ...item,
  // filters private types invisible to the current project
  shareTypes: (item.share_types || []).map((typeId) => types.find((it) => it.id === typeId)).filter(Boolean),
});

export const fetchShareGroupTypes = async ({ all = false } = {}) => {
  const params = all ? { is_public: 'all' } : {};
  const res = await manilaApi.listShareGroupTypes(params);
  const items = res?.share_group_types || [];
  if (!items.length) return items;
  const types = await fetchShareTypes({ all }).catch(() => []);
  return items.map((it) => attachShareTypes(it, types));
};

export const fetchShareGroupTypeDetail = async (id, { allProjects = false } = {}) => {
  const item = (await manilaApi.getShareGroupType(id))?.share_group_type;
  if (!item) return item;
  const types = await fetchShareTypes({ all: allProjects }).catch(() => []);
  return attachShareTypes(item, types);
};

export const groupSpecApi = (id) => ({
  list: async () => specsToList((await manilaApi.listGroupSpecs(id))?.group_specs),
  set: (obj) => manilaApi.setGroupSpecs(id, obj),
  remove: (key) => manilaApi.deleteGroupSpec(id, key),
});

/** ShareGroupTypeStore.addProjectAccess / removeProjectAccess */
const addAccess = (id, projects = []) =>
  Promise.all(projects.map((project) => manilaApi.shareGroupTypeAction(id, { addProjectAccess: { project } })));
const removeAccess = (id, projects = []) =>
  Promise.all(projects.map((project) => manilaApi.shareGroupTypeAction(id, { removeProjectAccess: { project } })));

/* ------------------------------------------------------------------ actions */
export const createShareGroupTypeAction = ({ existingNames = () => [] } = {}) => ({
  id: 'create',
  type: 'modal',
  policy: 'share_group_type:create',
  title: t('Create Share Group Type'),
  width: 960,
  getDefaultValues: () => ({ is_public: true, shareTypes: [], accessControl: [], extra: [] }),
  getFormItems: async () => {
    const [types, projects] = await Promise.all([fetchShareTypes({ all: true }).catch(() => []), fetchProjectsWithDomain()]);
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
      selectTableField({
        name: 'shareTypes',
        label: t('Share Types'),
        required: true,
        multiple: true,
        data: types,
        columns: [
          nameColumn(),
          { title: t('Description'), dataIndex: 'description', key: 'description', render: (v) => v || '-' },
          { title: t('Public'), dataIndex: 'is_public', key: 'is_public', render: (v) => (v ? t('Yes') : t('No')) },
        ],
      }),
      { name: 'is_public', label: t('Public'), type: 'checkbox' },
      accessControlField('accessControl', projects, 'is_public'),
      keyValueField({ name: 'extra', label: t('Extra Specs'), addText: t('Add Extra Spec') }),
    ];
  },
  onSubmit: async (values) => {
    const { is_public = false, accessControl = [], extra = [], shareTypes = [], ...rest } = values;
    const body = { is_public: Boolean(is_public), share_types: shareTypes, ...rest, group_specs: kvToObj(extra) };
    const projectIds = is_public ? [] : [...(accessControl || [])];
    const res = await manilaApi.createShareGroupType(body);
    const id = res?.share_group_type?.id;
    if (id && projectIds.length) await addAccess(id, projectIds);
    return res;
  },
});

export const deleteShareGroupTypeAction = () => ({
  ...deleteAction({
    name: t('Share Group Type'),
    title: t('Delete Share Group Type'),
    onDelete: (it) => manilaApi.deleteShareGroupType(it.id),
  }),
  policy: 'share_group_type:delete',
  actionName: t('Delete Share Group Type'),
});

export const manageShareGroupTypeAccessAction = () => ({
  id: 'manage-access',
  type: 'modal',
  policy: [
    'share_group_type:list_project_access',
    'share_group_type:add_project_access',
    'share_group_type:remove_project_access',
  ],
  title: t('Manage Access'),
  width: 960,
  allowed: (item) => !item.is_public,
  getDefaultValues: async (item) => {
    let current = [];
    if (!item.is_public) {
      try {
        const res = await manilaApi.getShareGroupTypeAccess(item.id);
        current = (res?.share_group_type_access || []).map((it) => it.project_id);
      } catch {
        current = [];
      }
    }
    item.__currentAccess = current;
    return { name: item.name, access: current };
  },
  getFormItems: async () => {
    const projects = await fetchProjectsWithDomain();
    return [
      { name: 'name', label: t('Share Group Type'), type: 'label' },
      { ...accessControlField('access', projects), visible: undefined },
    ];
  },
  onSubmit: async ({ access = [] }, item) => {
    const current = item.__currentAccess || [];
    const adds = (access || []).filter((it) => !current.includes(it));
    const dels = current.filter((it) => !(access || []).includes(it));
    await removeAccess(item.id, dels);
    return addAccess(item.id, adds);
  },
});

export const shareGroupTypeActionConfigs = ({ existingNames } = {}) => {
  const del = deleteShareGroupTypeAction();
  return {
    primaryActions: [createShareGroupTypeAction({ existingNames })],
    batchActions: [del],
    rowActions: { firstAction: manageShareGroupTypeAccessAction(), moreActions: [{ action: del }] },
  };
};
