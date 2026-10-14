import React, { useEffect } from 'react';
import { Form } from 'antd';
import { manilaApi } from '@/api/manila';
import {
  nameColumn,
  IdNameCell,
  statusColumn,
  timeColumn,
  textColumn,
  projectColumn,
  deleteAction,
} from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  shareGroupStatus,
  selectTableField,
  SelectTable,
  shareTypeSelectColumns,
  shareGroupTypeSelectColumns,
  checkShareTypeSupportServer,
  shareTypeTip,
} from '../shareShared';
import { fetchShareGroupTypes, fetchShareGroupTypeDetail } from '../ShareGroupType/shareGroupTypeShared';
import { fetchShareNetworks, shareNetworkColumns } from '../ShareNetwork/shareNetworkShared';

/* ------------------------------------------------------------------ stores/manila/share-group */
export const fetchShareGroups = async ({ isAdmin, params = {} } = {}) => {
  const query = { ...params };
  if (isAdmin) query.all_tenants = 1;
  const res = await manilaApi.listShareGroups(query);
  return res?.share_groups || [];
};

/** ShareGroupStore.detailDidFetch */
export const fetchShareGroupDetail = async (id, { isAdmin } = {}) => {
  const item = (await manilaApi.getShareGroup(id))?.share_group;
  if (!item) return item;
  const { share_network_id, share_group_type_id, share_types = [] } = item;
  const shareGroupType = share_group_type_id
    ? await fetchShareGroupTypeDetail(share_group_type_id, { allProjects: isAdmin }).catch(() => ({
        id: share_group_type_id,
      }))
    : {};
  const shareTypes = (share_types || []).map(
    (it) => (shareGroupType?.shareTypes || []).find((st) => st.id === it) || { id: it }
  );
  let shareNetwork = null;
  if (share_network_id) {
    shareNetwork = (await manilaApi.getShareNetwork(share_network_id).catch(() => ({})))?.share_network || {
      id: share_network_id,
    };
  }
  return { ...item, shareGroupType: shareGroupType || {}, shareTypes, shareNetwork };
};

/* ------------------------------------------------------------------ resources/manila/share-group */
export const shareGroupColumns = ({ isAdmin, projectMap, selectMode = false } = {}) =>
  [
    selectMode
      ? nameColumn()
      : nameColumn({ linkTo: (r) => `/share/${isAdmin ? 'share-group-admin' : 'share-group'}/detail/${r.id}` }),
    !selectMode && isAdmin && projectColumn(projectMap),
    textColumn(t('Description'), 'description'),
    textColumn(t('Availability Zone'), 'availability_zone'),
    {
      title: t('Share Network'),
      dataIndex: 'share_network_id',
      key: 'share_network_id',
      render: (v) => (
        <IdNameCell
          id={v}
          href={!selectMode && v ? `/share/${isAdmin ? 'share-network-admin' : 'share-network'}/detail/${v}` : undefined}
          bold={false}
        />
      ),
    },
    statusColumn({ textMap: shareGroupStatus() }),
    timeColumn(),
  ].filter(Boolean);

/* ------------------------------------------------------------------ actions */
function GroupShareTypePicker({ value, onChange, form, groupTypes }) {
  const groupType = Form.useWatch('shareGroupType', form);
  const gid = (groupType || [])[0];
  const types = groupTypes.find((it) => it.id === gid)?.shareTypes || [];
  useEffect(() => {
    if ((value || []).length) onChange?.([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gid]);
  return <SelectTable value={value} onChange={onChange} data={types} multiple columns={shareTypeSelectColumns()} />;
}

export const createShareGroupAction = () => {
  let groupTypes = [];
  const selectedTypes = (values) => {
    const gt = groupTypes.find((it) => it.id === (values.shareGroupType || [])[0]);
    const ids = values.shareType || [];
    return (gt?.shareTypes || []).filter((it) => ids.includes(it.id));
  };
  const showNetworks = (values) => {
    const rows = selectedTypes(values);
    return rows.length > 0 && !rows.some((it) => !checkShareTypeSupportServer(it));
  };
  return {
    id: 'create',
    type: 'modal',
    policy: 'share_group:create',
    title: t('Create Share Group'),
    width: 960,
    getDefaultValues: () => ({ shareGroupType: [], shareType: [], shareNetwork: [] }),
    getFormItems: async () => {
      const [types, networks, zoneRes] = await Promise.all([
        fetchShareGroupTypes({}).catch(() => []),
        fetchShareNetworks({}).catch(() => []),
        manilaApi.listAvailabilityZones().catch(() => ({})),
      ]);
      groupTypes = types;
      return [
        { name: 'name', label: t('Name'), type: 'input', required: true },
        { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
        {
          name: 'availability_zone',
          label: t('Availability Zone'),
          type: 'select',
          options: (zoneRes?.availability_zones || []).map((it) => ({ value: it.id, label: it.name })),
        },
        selectTableField({
          name: 'shareGroupType',
          label: t('Share Group Type'),
          required: true,
          data: groupTypes,
          columns: shareGroupTypeSelectColumns(),
          disabledFunc: (item) => !(item.shareTypes || []).length,
        }),
        {
          name: 'shareType',
          label: t('Share Type'),
          tip: shareTypeTip(),
          rules: [
            {
              validator: (_, v) =>
                Array.isArray(v) && v.length
                  ? Promise.resolve()
                  : Promise.reject(new Error(`${t('Please select')} ${t('Share Type')}`)),
            },
          ],
          visible: (values) => {
            const gt = groupTypes.find((it) => it.id === (values.shareGroupType || [])[0]);
            return Boolean((gt?.shareTypes || []).length);
          },
          render: ({ form }) => <GroupShareTypePicker form={form} groupTypes={groupTypes} />,
        },
        {
          ...selectTableField({
            name: 'shareNetwork',
            label: t('Share Network'),
            required: true,
            data: networks,
            columns: shareNetworkColumns({ selectMode: true }),
          }),
          visible: showNetworks,
        },
      ];
    },
    onSubmit: (values) => {
      const { shareGroupType = [], shareType = [], shareNetwork = [], ...rest } = values;
      const body = { ...rest, share_group_type_id: shareGroupType[0], share_types: shareType };
      if (showNetworks(values) && (shareNetwork || []).length) body.share_network_id = shareNetwork[0];
      return manilaApi.createShareGroup(body);
    },
  };
};

export const editShareGroupAction = () => ({
  id: 'edit',
  type: 'modal',
  policy: 'share_group:update',
  title: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', required: true },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  ],
  onSubmit: (values, item) => manilaApi.updateShareGroup(item.id, values),
});

export const deleteShareGroupAction = () => ({
  ...deleteAction({
    name: t('Share Group'),
    title: t('Delete Share Group'),
    onDelete: (it) => manilaApi.deleteShareGroup(it.id),
  }),
  policy: 'share_group:delete',
  actionName: t('Delete Share Group'),
});

export const shareGroupActionConfigs = ({ isAdmin }) => {
  const del = deleteShareGroupAction();
  if (isAdmin) {
    return { primaryActions: [], batchActions: [del], rowActions: { firstAction: del, moreActions: [] } };
  }
  return {
    primaryActions: [createShareGroupAction()],
    batchActions: [del],
    rowActions: { firstAction: editShareGroupAction(), moreActions: [{ action: del }] },
  };
};
