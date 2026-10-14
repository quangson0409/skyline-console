import React, { useEffect } from 'react';
import { Form } from 'antd';
import { manilaApi } from '@/api/manila';
import ResourcePage, {
  nameColumn,
  IdNameCell,
  statusColumn,
  timeColumn,
  textColumn,
  projectColumn,
  yesNo,
  deleteAction,
} from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import { withQuota } from '@/components/Quota/utils';
import { fetchManilaQuota, shareQuotaItems } from '@/components/Quota/services';
import {
  shareStatus,
  shareProtocol,
  mapOptions,
  filterOptions,
  isMine,
  manilaIsTransition,
  checkShareTypeSupportServer,
  shareTypeTip,
  fetchShareQuota,
  keyValueField,
  kvToObj,
  selectTableField,
  SelectTable,
  shareTypeSelectColumns,
} from '../shareShared';
import { shareNetworkColumns, fetchShareNetworks } from '../ShareNetwork/shareNetworkShared';
import { shareGroupColumns, fetchShareGroups } from '../ShareGroup/shareGroupShared';

/* ------------------------------------------------------------------ fetchers (stores/manila/share) */
export const mapShare = (data) => ({ ...data, isMine: isMine(data) });

export const fetchShares = async ({ isAdmin, params = {} } = {}) => {
  const query = { ...params, all_tenants: isAdmin ? 1 : 0, is_public: true };
  const res = await manilaApi.listShares(query);
  return (res?.shares || []).map(mapShare);
};

/** ShareStore.detailDidFetch */
export const fetchShareDetail = async (id) => {
  const item = (await manilaApi.getShare(id))?.share;
  if (!item) return item;
  const { share_group_id, share_network_id } = item;
  const [exportRes, accessRes, groupRes, networkRes] = await Promise.all([
    manilaApi.listShareExportLocations(id).catch(() => ({})),
    manilaApi.listAccessRules(id).catch(() => ({})),
    share_group_id ? manilaApi.getShareGroup(share_group_id).catch(() => ({})) : null,
    share_network_id ? manilaApi.getShareNetwork(share_network_id).catch(() => ({})) : null,
  ]);
  return {
    ...mapShare(item),
    exportLocations: exportRes?.export_locations || [],
    accessList: accessRes?.access_list || [],
    shareGroup: share_group_id ? groupRes?.share_group || { id: share_group_id } : undefined,
    shareNetwork: share_network_id ? networkRes?.share_network || { id: share_network_id } : undefined,
  };
};

/* ------------------------------------------------------------------ columns */
export const shareColumns = ({ isAdmin, projectMap, hide = [] } = {}) =>
  [
    nameColumn({ linkTo: (r) => `/share/${isAdmin ? 'share-admin' : 'share'}/detail/${r.id}` }),
    isAdmin && projectColumn(projectMap),
    textColumn(t('Description'), 'description'),
    textColumn(t('Availability Zone'), 'availability_zone'),
    !hide.includes('share_type_name') && {
      title: t('Share Type'),
      dataIndex: 'share_type_name',
      key: 'share_type_name',
      render: (v, r) => <IdNameCell id={r.share_type} name={v} bold={false} />,
    },
    {
      title: t('Size'),
      dataIndex: 'size',
      key: 'size',
      sorter: (a, b) => (a.size || 0) - (b.size || 0),
      render: (v) => (v === undefined || v === null ? '-' : `${v} GiB`),
    },
    {
      title: t('Protocol'),
      dataIndex: 'share_proto',
      key: 'share_proto',
      render: (v) => shareProtocol()[v] || v || '-',
    },
    { title: t('Public'), dataIndex: 'is_public', key: 'is_public', render: (v) => yesNo(v) },
    statusColumn({ textMap: shareStatus() }),
    !hide.includes('share_network_id') && {
      title: t('Share Network'),
      dataIndex: 'share_network_id',
      key: 'share_network_id',
      render: (v) => (
        <IdNameCell id={v} href={v ? `/share/${isAdmin ? 'share-network-admin' : 'share-network'}/detail/${v}` : undefined} bold={false} />
      ),
    },
    !hide.includes('share_group_id') && {
      title: t('Share Group'),
      dataIndex: 'share_group_id',
      key: 'share_group_id',
      render: (v) => (
        <IdNameCell id={v} href={v ? `/share/${isAdmin ? 'share-group-admin' : 'share-group'}/detail/${v}` : undefined} bold={false} />
      ),
    },
    timeColumn(),
  ].filter(Boolean);

export const shareFilters = () => [
  { name: 'name', label: t('Name') },
  { name: 'status', label: t('Status'), options: filterOptions(shareStatus()) },
];

/** checkPolicyRule('share:create_public_share' / 'share:set_public_share'): admin-only by default */
const canSetPublic = () => Boolean(useAuthStore.getState().hasAdminRole);

/* ------------------------------------------------------------------ create */
function ShareGroupPicker({ value, onChange, form, groups }) {
  const shareType = Form.useWatch('shareType', form);
  const typeId = (shareType || [])[0];
  const data = typeId ? groups.filter((it) => (it.share_types || []).includes(typeId)) : [];
  useEffect(() => {
    // legacy onShareTypeChange resets the selectable groups when the type changes
    if ((value || []).length && !data.some((it) => it.id === value[0])) onChange?.([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId]);
  return (
    <SelectTable
      value={value}
      onChange={onChange}
      data={data}
      columns={shareGroupColumns({ selectMode: true })}
      disabledFunc={(item) => item.status !== 'available'}
    />
  );
}

export const createShareAction = () => {
  let ctx = { quota: {}, types: [] };
  const getLimits = () => {
    const { gigabytes = {} } = ctx.quota;
    const limited = gigabytes.limit !== undefined && gigabytes.limit !== -1;
    const left = gigabytes.left;
    const maxSize = left === -1 || left === undefined ? 1000 : left || 1;
    return { limited, maxSize };
  };
  return {
    id: 'create',
    type: 'modal',
    policy: 'share:create',
    title: t('Create Share'),
    width: 960,
    // legacy Share/actions/Create showQuota: 1 share + its capacity (getWishes: [1, size || 1])
    quota: withQuota(
      () => fetchManilaQuota(),
      (quota, values) => shareQuotaItems(quota, ['shares', 'gigabytes'], [1, Number(values.size) || 1])
    ),
    getFormItems: async () => {
      const [quota, typeRes, networks, groups, zoneRes] = await Promise.all([
        fetchShareQuota(),
        manilaApi.listShareTypes().catch(() => ({})),
        fetchShareNetworks({}).catch(() => []),
        fetchShareGroups({}).catch(() => []),
        manilaApi.listAvailabilityZones().catch(() => ({})),
      ]);
      const types = (typeRes?.share_types || []).map((it) => ({
        ...it,
        is_public: it['share_type_access:is_public'] ?? it.is_public,
      }));
      ctx = { quota, types };
      const { limited, maxSize } = getLimits();
      const minSize = 1;
      const supports = (values) => {
        const id = (values.shareType || [])[0];
        const type = types.find((it) => it.id === id);
        return Boolean(type) && checkShareTypeSupportServer(type);
      };
      return [
        { name: 'project', label: t('Project'), type: 'label' },
        {
          name: 'availability_zone',
          label: t('Availability Zone'),
          type: 'select',
          options: (zoneRes?.availability_zones || []).map((it) => ({ value: it.id, label: it.name })),
        },
        { name: 'name', label: t('Name'), type: 'input', required: true },
        { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
        {
          name: 'share_proto',
          label: t('Share Protocol'),
          type: 'select',
          required: true,
          options: mapOptions(shareProtocol()),
        },
        {
          name: 'size',
          label: t('Capacity (GiB)'),
          type: 'number',
          min: minSize,
          max: limited ? maxSize : undefined,
          required: true,
          tip: limited ? `${minSize}GiB-${maxSize}GiB` : undefined,
          rules: [
            {
              validator: (_, v) => {
                const { shares = {} } = ctx.quota;
                if (shares.limit !== undefined && shares.left !== -1 && shares.left < 1) {
                  return Promise.reject(new Error(t('Quota exceeded')));
                }
                if (limited && Number(v) > maxSize) return Promise.reject(new Error(t('Quota exceeded')));
                return Promise.resolve();
              },
            },
          ],
        },
        canSetPublic() && {
          name: 'is_public',
          label: t('Public'),
          type: 'checkbox',
          tip: t('If set then all tenants will be able to see this share.'),
        },
        selectTableField({
          name: 'shareType',
          label: t('Share Type'),
          required: true,
          tip: shareTypeTip(),
          data: types,
          columns: shareTypeSelectColumns(),
        }),
        {
          ...selectTableField({
            name: 'shareNetwork',
            label: t('Share Network'),
            required: true,
            data: networks,
            columns: shareNetworkColumns({ selectMode: true }),
          }),
          visible: supports,
        },
        {
          name: 'shareGroup',
          label: t('Share Group'),
          render: ({ form }) => <ShareGroupPicker form={form} groups={groups} />,
        },
        keyValueField({ name: 'metadata', label: t('Metadata'), addText: t('Add Metadata') }),
      ].filter(Boolean);
    },
    getDefaultValues: () => {
      const { limited, maxSize } = getLimits();
      const { currentProject } = useAuthStore.getState();
      return {
        size: limited && maxSize < 10 ? maxSize : 10,
        project: currentProject?.name || currentProject?.id,
        shareType: [],
        shareGroup: [],
        metadata: [],
      };
    },
    onSubmit: async (values) => {
      const { shareType = [], shareNetwork = [], shareGroup = [], project, metadata, is_public, __quota, ...rest } = values;
      const type = ctx.types.find((it) => it.id === shareType[0]);
      const showNetworks = Boolean(type) && checkShareTypeSupportServer(type);
      const body = { ...rest, share_type: shareType[0], metadata: kvToObj(metadata) };
      if (canSetPublic() && is_public) body.is_public = is_public;
      if (showNetworks && (shareNetwork || []).length) body.share_network_id = shareNetwork[0];
      if ((shareGroup || []).length) body.share_group_id = shareGroup[0];
      return manilaApi.createShare(body);
    },
  };
};

/* ------------------------------------------------------------------ row actions */
export const editShareAction = () => ({
  id: 'edit',
  type: 'modal',
  policy: 'share:update',
  title: t('Edit'),
  allowed: (item) => item.isMine,
  getDefaultValues: (item) => ({
    display_name: item.name,
    display_description: item.description,
    is_public: item.is_public,
  }),
  getFormItems: () =>
    [
      { name: 'display_name', label: t('Name'), type: 'input', required: true },
      { name: 'display_description', label: t('Description'), type: 'textarea', rows: 3 },
      canSetPublic() && {
        name: 'is_public',
        label: t('Public'),
        type: 'checkbox',
        tip: t('If set then all tenants will be able to see this share.'),
      },
    ].filter(Boolean),
  onSubmit: (values, item) => {
    const { is_public, ...rest } = values;
    const body = { ...rest };
    if (canSetPublic()) body.is_public = Boolean(is_public);
    return manilaApi.updateShare(item.id, body);
  },
});

export const deleteShareAction = ({ isAdmin } = {}) => ({
  ...deleteAction({
    name: t('Share'),
    title: t('Delete Share'),
    allowed: (item) => isAdmin || item.isMine,
    onDelete: (it) => manilaApi.deleteShare(it.id, it.share_group_id),
  }),
  policy: 'share:delete',
  actionName: t('Delete Share'),
});

export const extendShareAction = () => {
  let quota = {};
  const info = (item) => {
    const { limit = 10, in_use = 0, reserved = 0 } = quota.gigabytes || {};
    const isQuotaLimited = limit !== -1;
    const leftSize = limit - in_use - reserved;
    return { isQuotaLimited, leftSize, maxSize: (item.size || 0) + leftSize };
  };
  return {
    id: 'extend-share',
    type: 'modal',
    policy: 'share:extend',
    title: t('Extend Share'),
    description: t('After the share is expanded, the share cannot be reduced.'),
    allowed: (item) => item.isMine,
    // share capacity quota (added size = new size - current size)
    quota: withQuota(
      () => fetchManilaQuota(),
      (q, values, item) =>
        shareQuotaItems(q, ['gigabytes'], [Math.max((Number(values.new_size) || 0) - (item?.size || 0), 0)])
    ),
    getFormItems: async (item) => {
      quota = await fetchShareQuota();
      const { isQuotaLimited, leftSize, maxSize } = info(item);
      const minSize = (item.size || 0) + 1;
      if (isQuotaLimited && leftSize < 1) {
        return [{ name: 'quota-alert', type: 'alert', alertType: 'warning', message: t('Quota is not enough for extend share.') }];
      }
      return [
        { name: 'share', label: t('Share'), type: 'label' },
        {
          name: 'new_size',
          label: t('Capacity (GiB)'),
          type: 'number',
          min: minSize,
          max: isQuotaLimited ? maxSize : undefined,
          required: true,
          tip: isQuotaLimited ? `${minSize}GiB-${maxSize}GiB` : undefined,
        },
      ];
    },
    getDefaultValues: (item) => ({
      share: `${item.name || item.id}(${item.size}GiB)`,
      new_size: (item.size || 0) + 1,
    }),
    onSubmit: ({ new_size }, item) => {
      if (!new_size) return Promise.reject(new Error(t('Quota is not enough for extend share.')));
      return manilaApi.shareAction(item.id, { extend: { new_size } });
    },
  };
};

export const resetShareStatusAction = ({ instance = false } = {}) => ({
  id: 'reset',
  type: 'modal',
  policy: instance ? 'share_instance:reset_status' : 'share:reset_status',
  title: t('Reset Status'),
  getDefaultValues: (item) => ({
    name: instance ? item.id : item.name || item.id,
    oldStatus: shareStatus()[item.status] || item.status,
  }),
  getFormItems: (item) => [
    { name: 'name', label: instance ? t('Share Instance') : t('Name'), type: 'label' },
    { name: 'oldStatus', label: t('Current Status'), type: 'label' },
    {
      name: 'status',
      label: t('New Status'),
      type: 'select',
      required: true,
      options: mapOptions(shareStatus()).filter(
        (it) => ['available', 'error'].includes(it.value) && it.value !== item.status
      ),
    },
  ],
  onSubmit: ({ status }, item) =>
    instance
      ? manilaApi.shareInstanceAction(item.id, { reset_status: { status } })
      : manilaApi.shareAction(item.id, { reset_status: { status } }),
});

const detailPath = (item, isAdmin, tab) => `/share/${isAdmin ? 'share-admin' : 'share'}/detail/${item.id}?tab=${tab}`;

export const manageMetadataNavAction = ({ navigate, isAdmin }) => ({
  id: 'manage-metadata',
  type: 'custom',
  policy: 'share:update_share_metadata',
  title: t('Manage Metadata'),
  allowed: (item) => item.isMine,
  onExecute: (item) => navigate(detailPath(item, isAdmin, 'metadata')),
});

export const manageAccessRuleNavAction = ({ navigate, isAdmin }) => ({
  id: 'manage-access-rule',
  type: 'custom',
  policy: 'share_access_rule:index',
  title: t('Manage Access Rule'),
  allowed: (item) => item.isMine,
  onExecute: (item) => navigate(detailPath(item, isAdmin, 'rule')),
});

/** Share/actions/index.jsx */
export const shareActionConfigs = ({ isAdmin, navigate }) => {
  const del = deleteShareAction({ isAdmin });
  if (isAdmin) {
    return {
      primaryActions: [],
      batchActions: [del],
      rowActions: { firstAction: del, moreActions: [{ action: resetShareStatusAction() }] },
    };
  }
  return {
    primaryActions: [createShareAction()],
    batchActions: [del],
    rowActions: {
      firstAction: editShareAction(),
      moreActions: [
        { action: del },
        { action: extendShareAction() },
        { action: manageMetadataNavAction({ navigate, isAdmin }) },
        { action: manageAccessRuleNavAction({ navigate, isAdmin }) },
      ],
    },
  };
};

/** Embedded share list (Shares tab of share group / type / network / server details) */
export function ShareTable({ filterKey, filterValue, hide = [], navigate }) {
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      embedded
      deps={[filterKey, filterValue]}
      fetch={({ isAdmin }) => fetchShares({ isAdmin, params: { [filterKey]: filterValue } })}
      columns={({ isAdmin }) => shareColumns({ isAdmin, projectMap, hide })}
      filterParams={shareFilters()}
      isTransition={manilaIsTransition}
      primaryActions={({ isAdmin }) => shareActionConfigs({ isAdmin, navigate }).primaryActions}
      batchActions={({ isAdmin }) => shareActionConfigs({ isAdmin, navigate }).batchActions}
      rowActions={({ isAdmin }) => shareActionConfigs({ isAdmin, navigate }).rowActions}
    />
  );
}
