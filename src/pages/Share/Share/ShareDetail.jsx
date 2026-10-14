import React from 'react';
import { useNavigate } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import ResourcePage, { formatTime, yesNo, textColumn, timeColumn, deleteAction } from '@/components/ResourcePage';
import { manilaApi } from '@/api/manila';
import { t } from '@/core/i18n';
import {
  shareStatus,
  shareProtocol,
  shareAccessRuleState,
  shareAccessLevel,
  shareAccessType,
  mapOptions,
  filterOptions,
  manilaIsTransition,
  shareNetworkLink,
  shareGroupLink,
  ExportLocations,
  KeyValueTab,
  keyValueField,
  kvToObj,
  objToKV,
  specsToList,
} from '../shareShared';
import { fetchShareDetail, shareActionConfigs } from './shareActions';

/* ------------------------------------------------------------------ Detail/BaseDetail */
function ShareBaseInfo({ detail: d, isAdmin }) {
  return (
    <>
      <DetailCard
        title={t('Base Info')}
        items={[
          { label: t('Project ID'), value: d.project_id },
          { label: t('Availability Zone'), value: d.availability_zone },
          { label: t('Host'), value: d.host },
          { label: t('Size'), value: d.size, unit: 'GiB' },
          { label: t('Protocol'), value: shareProtocol()[d.share_proto] || d.share_proto },
          { label: t('Public'), value: d.is_public, render: () => yesNo(d.is_public) },
          {
            label: t('Mount snapshot support'),
            value: d.mount_snapshot_support,
            render: () => yesNo(d.mount_snapshot_support),
          },
          { label: t('Snapshot ID'), value: d.snapshot_id },
          { label: t('Snapshot support'), value: d.snapshot_support, render: () => yesNo(d.snapshot_support) },
          { label: t('Replication Type'), value: d.replication_type },
          { label: t('Access Rules Status'), value: d.access_rules_status },
        ]}
      />
      <DetailCard
        title={t('Share Type')}
        items={[
          { label: t('Share Type ID'), value: d.share_type, copyable: true },
          { label: t('Share Type Name'), value: d.share_type_name },
        ]}
      />
      {d.share_network_id ? (
        <DetailCard
          title={t('Share Network')}
          items={[
            {
              label: t('Share Network'),
              value: d.share_network_id,
              render: () => shareNetworkLink(d.share_network_id, d.shareNetwork?.name || d.share_network_id, isAdmin),
            },
          ]}
        />
      ) : null}
      {d.share_group_id ? (
        <DetailCard
          title={t('Share Group')}
          items={[
            {
              label: t('Share Group'),
              value: d.share_group_id,
              render: () => shareGroupLink(d.share_group_id, d.shareGroup?.name || d.share_group_id, isAdmin),
            },
          ]}
        />
      ) : null}
      <DetailCard
        title={t('Export Locations')}
        column={1}
        items={[{ label: '', value: 1, render: () => <ExportLocations locations={d.exportLocations || []} /> }]}
      />
    </>
  );
}

/* ------------------------------------------------------------------ Detail/AccessRule */
const accessTypeTip = () =>
  t(
    "'ip' rule represents IPv4 or IPv6 address, 'cert' rule represents TLS certificate, 'user' rule represents username or usergroup, 'cephx' rule represents ceph auth ID."
  );

const createAccessRuleAction = (share) => {
  const ipTip = ['NFS', 'CIFS'].includes(share.share_proto);
  const showIpTip = (values) => ipTip && values.access_type === 'ip';
  return {
    id: 'create',
    type: 'modal',
    policy: 'share:allow_access',
    title: t('Add Access Rule'),
    getDefaultValues: () => ({ metadata: [] }),
    formItems: [
      {
        name: 'access_type',
        label: t('Access Type'),
        type: 'select',
        required: true,
        options: mapOptions(shareAccessType()),
        tip: accessTypeTip(),
      },
      {
        name: 'access_level',
        label: t('Access Level'),
        type: 'select',
        required: true,
        options: mapOptions(shareAccessLevel()),
      },
      { name: 'access_to', label: t('Access To'), type: 'input', required: true },
      {
        name: '__ipTip',
        label: ' ',
        visible: showIpTip,
        render: () => (
          <div style={{ fontSize: 12, color: '#d97706', marginTop: -16 }}>
            {t('All network segments are indicated by "*", not "0.0.0.0/0"')}
          </div>
        ),
      },
      keyValueField({ name: 'metadata', label: t('Metadata'), addText: t('Add Metadata') }),
    ],
    onSubmit: ({ metadata, __ipTip, ...rest }) =>
      manilaApi.shareAction(share.id, { allow_access: { ...rest, metadata: kvToObj(metadata) } }),
  };
};

const deleteAccessRuleAction = (share) => ({
  ...deleteAction({
    name: t('Share Access Rule'),
    title: t('Delete Share Access Rule'),
    onDelete: (it) => manilaApi.shareAction(share.id, { deny_access: { access_id: it.id } }),
  }),
  policy: 'share:deny_access',
  actionName: t('Delete Share Access Rule'),
});

/** AccessRule/actions/ManageMetadata: PUT the new keys, DELETE the removed ones */
const manageAccessRuleMetadataAction = () => ({
  id: 'manage-metadata',
  type: 'modal',
  policy: ['share_access_metadata:update', 'share_access_metadata:delete'],
  title: t('Manage Metadata'),
  width: 800,
  getDefaultValues: (item) => ({ metadata: objToKV(item.metadata || {}) }),
  formItems: [keyValueField({ name: 'metadata', label: t('Metadata'), addText: t('Add Metadata') })],
  onSubmit: async ({ metadata = [] }, item) => {
    const newValue = kvToObj(metadata);
    const oldValue = item.metadata || {};
    const dels = Object.keys(oldValue).filter((key) => !Object.keys(newValue).includes(key));
    if (Object.keys(newValue).length) await manilaApi.updateAccessRuleMetadata(item.id, newValue);
    return Promise.all(dels.map((key) => manilaApi.deleteAccessRuleMetadata(item.id, key)));
  },
});

function AccessRuleTab({ share, isAdmin }) {
  const del = deleteAccessRuleAction(share);
  let primary = [];
  let batch = [];
  let rows;
  if (isAdmin) {
    batch = [del];
    rows = { firstAction: del, moreActions: [] };
  } else if (share.isMine) {
    primary = [createAccessRuleAction(share)];
    batch = [del];
    rows = { firstAction: del, moreActions: [{ action: manageAccessRuleMetadataAction() }] };
  }
  return (
    <ResourcePage
      embedded
      policy="share_access_rule:index"
      fetch={async () => (await manilaApi.listAccessRules(share.id))?.access_list || []}
      deps={[share.id]}
      columns={[
        textColumn(t('ID'), 'id'),
        {
          title: t('Access Type'),
          dataIndex: 'access_type',
          key: 'access_type',
          render: (v) => shareAccessType()[v] || v || '-',
        },
        textColumn(t('Access To'), 'access_to'),
        {
          title: t('Access Level'),
          dataIndex: 'access_level',
          key: 'access_level',
          render: (v) => shareAccessLevel()[v] || v || '-',
        },
        {
          title: t('State'),
          dataIndex: 'state',
          key: 'state',
          render: (v) => shareAccessRuleState()[v] || v || '-',
        },
        textColumn(t('Access Key'), 'access_key'),
        {
          title: t('Metadata'),
          dataIndex: 'metadata',
          key: 'metadata',
          render: (v) =>
            specsToList(v).length
              ? specsToList(v).map((it) => (
                  <div key={it.keyName} style={{ fontSize: 12 }}>
                    {it.keyName}={String(it.value)}
                  </div>
                ))
              : '-',
        },
        timeColumn(),
        timeColumn({ title: t('Updated At'), dataIndex: 'updated_at' }),
      ]}
      filterParams={[
        { name: 'access_to', label: t('Access To') },
        { name: 'state', label: t('State'), options: filterOptions(shareAccessRuleState()) },
      ]}
      searchFields={['id', 'access_to', 'access_type']}
      isTransition={manilaIsTransition}
      primaryActions={primary}
      batchActions={batch}
      rowActions={rows}
    />
  );
}

/* ------------------------------------------------------------------ Detail/Metadata */
const shareMetadataApi = (id) => ({
  list: async () => specsToList((await manilaApi.listShareMetadata(id))?.metadata),
  set: (obj) => manilaApi.setShareMetadata(id, obj),
  remove: (key) => manilaApi.deleteShareMetadata(id, key),
});

export default function ShareDetail() {
  const navigate = useNavigate();
  return (
    <ResourceDetail
      policy="share:get"
      breadcrumb={[t('Share File Storage'), { title: t('Shares'), path: '/share/share' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/share/share-admin' : '/share/share')}
      fetch={(id) => fetchShareDetail(id)}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Description'), value: d.description },
        { label: t('Status'), value: d.status, render: () => shareStatus()[d.status] || d.status || '-' },
        { label: t('Size'), value: d.size, unit: 'GiB' },
        { label: t('Protocol'), value: shareProtocol()[d.share_proto] || d.share_proto },
        { label: t('Created At'), value: formatTime(d.created_at) },
      ]}
      tabs={(d, { isAdmin }) => [
        { key: 'baseInfo', label: t('Base Info'), render: () => <ShareBaseInfo detail={d} isAdmin={isAdmin} /> },
        {
          key: 'metadata',
          label: t('Metadata'),
          render: () => (
            <KeyValueTab
              api={shareMetadataApi(d.id)}
              kind="metadata"
              viewPolicy="share:get_share_metadata"
              policies={{
                create: 'share:update_share_metadata',
                edit: 'share:update_share_metadata',
                del: 'share:delete_share_metadata',
              }}
              deleteOnly={isAdmin}
              readOnly={!isAdmin && !d.isMine}
            />
          ),
        },
        { key: 'rule', label: t('Access Rules'), render: () => <AccessRuleTab share={d} isAdmin={isAdmin} /> },
      ]}
      actions={({ isAdmin }) => shareActionConfigs({ isAdmin, navigate }).rowActions}
    />
  );
}
