import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, Space, Popover, Table, Spin, Progress, Tag } from 'antd';
import { MinusCircleOutlined, PlusOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { manilaApi } from '@/api/manila';
import { keystoneApi } from '@/api/keystone';
import { neutronApi } from '@/api/neutron';
import { currentProjectId } from '@/api/endpoints';
import ResourcePage, {
  nameColumn,
  IdNameCell,
  textColumn,
  boolColumn,
  yesNo,
  deleteAction,
} from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { selectTableField } from '@/pages/Storage/shared';

export { SelectTable, selectTableField } from '@/pages/Storage/shared';

/* ================================================================== resources/manila/share */
export const shareStatus = () => ({
  creating: t('Creating'),
  creating_from_snapshot: t('Creating From Snapshot'),
  deleting: t('Deleting'),
  deleted: t('Deleted'),
  error: t('Error'),
  error_deleting: t('Error Deleting'),
  available: t('Available'),
  inactive: t('Inactive'),
  manage_starting: t('Manage Starting'),
  manage_error: t('Manage Error'),
  unmanage_starting: t('Unmanage Starting'),
  unmanage_error: t('Unmanage Error'),
  unmanaged: t('Unmanaged'),
  extending: t('Extending'),
  extending_error: t('Extending Error'),
  shrinking: t('Shrinking'),
  shrinking_error: t('Shrinking Error'),
  shrinking_possible_data_loss_error: t('Shrinking Possible Data Loss Error'),
  migrating: t('Migrating'),
  migrating_to: t('Migrating To'),
  replication_change: t('Replication Change'),
  reverting: t('Reverting'),
  reverting_error: t('Reverting Error'),
});

export const accessRuleStatus = () => ({
  active: t('Active'),
  error: t('Error'),
  syncing: t('Syncing'),
});

export const replicaState = () => ({
  active: t('Active'),
  error: t('Error'),
  in_sync: t('Syncing'),
  out_of_sync: t('Out of Sync'),
});

export const shareProtocol = () => ({
  NFS: t('NFS'),
  CIFS: t('CIFS'),
  GlusterFS: t('GlusterFS'),
  HDFS: t('HDFS'),
  CephFS: t('CephFS'),
  MAPRFS: t('MapR-FS'),
});

export const shareVisibility = () => ({
  public: t('Public'),
  private: t('Private'),
});

export const shareAccessRuleState = () => ({
  new: t('New'),
  active: t('Active'),
  error: t('Error'),
  queued_to_apply: t('Queued To Apply'),
  queued_to_deny: t('Queued To Deny'),
  denying: t('Denying'),
  applying: t('Applying'),
});

export const shareAccessLevel = () => ({
  rw: t('Read and write'),
  ro: t('Read only'),
});

export const shareAccessType = () => ({
  ip: t('IP'),
  cert: t('Cert'),
  user: t('User'),
  cephx: t('CephX'),
});

/* resources/manila/share-group */
export const shareGroupStatus = () => ({
  available: t('Available'),
  error: t('Error'),
  creating: t('Creating'),
  deleting: t('Deleting'),
});

/* resources/manila/share-server */
export const shareServerStatus = () => ({
  active: t('Active'),
  error: t('Error'),
  creating: t('Creating'),
  deleting: t('Deleting'),
});

/* resources/manila/share-type */
export const yesNoOptions = () => [
  { label: t('Yes'), value: true },
  { label: t('No'), value: false },
];

export const checkShareTypeSupportServer = (item) => {
  const { extra_specs = {} } = item || {};
  const { driver_handles_share_servers: driver } = extra_specs || {};
  return driver === 'True' || driver === 'true' || driver === true;
};

export const shareTypeTip = () =>
  t(
    'Note that when using a share type with the driver_handles_share_servers extra spec as False, you should not provide a share network.'
  );

export const mapOptions = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));
export const filterOptions = (map) => Object.entries(map).map(([key, label]) => ({ key, label }));

export const isMine = (item) => Boolean(item) && item.project_id === currentProjectId();

/** Every manila status that means "still working" (legacy list watcher) */
export const manilaIsTransition = (item = {}) => {
  const s = String(item?.status || item?.state || '').toLowerCase();
  if (!s) return false;
  if (/error/.test(s)) return false;
  return /(ing|_starting|^new$|^queued|^migrating_to$)/.test(s);
};

/* ================================================================== quota helpers */
/** stores/keystone/project updateQuotaData: adds used / left (-1 = unlimited) */
export const updateQuotaData = (quota = {}) => {
  const data = JSON.parse(JSON.stringify(quota || {}));
  Object.keys(data).forEach((key) => {
    const it = data[key];
    if (it && typeof it === 'object') {
      if (it.in_use !== undefined) it.used = it.in_use;
      const { limit, used = 0, reserved = 0 } = it;
      it.left = limit === -1 ? -1 : (Number(limit) || 0) - (Number(used) || 0) - (Number(reserved) || 0);
    }
  });
  return data;
};

export const fetchShareQuota = async () => {
  try {
    const res = await manilaApi.getQuotaDetail(currentProjectId());
    return updateQuotaData(res?.quota_set || {});
  } catch {
    return {};
  }
};

const quotaTitle = () => ({
  shares: t('Share'),
  gigabytes: t('Share Capacity (GiB)'),
  share_networks: t('Share Network'),
  share_groups: t('Share Group'),
});

/** Quota usage panel (legacy FormAction quota side bar) */
export function QuotaInfo({ quota = {}, keys = ['shares', 'gigabytes'], wishes = [1, 1] }) {
  const items = keys.filter((k) => quota[k]);
  if (!items.length) return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
        padding: 12,
        border: '1px solid #e2e8f0',
        borderRadius: 8,
      }}
    >
      {items.map((key, idx) => {
        const { limit, used = 0, reserved = 0, left } = quota[key];
        const unlimited = limit === -1;
        const wish = Number(wishes[idx]) || 0;
        const percent = unlimited || !limit ? 0 : Math.min(100, Math.round(((used + reserved + wish) / limit) * 100));
        const exceeded = !unlimited && left < wish;
        return (
          <div key={key}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{quotaTitle()[key] || key}</div>
            <Progress percent={percent} size="small" status={exceeded ? 'exception' : 'normal'} showInfo={!unlimited} />
            <div style={{ fontSize: 12 }}>
              {t('Used')}: {used} · {t('Reserved')}: {reserved} · {t('Add')}: {wish} · {t('Quota')}:{' '}
              {unlimited ? t('Unlimited') : limit}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== key / value list */
/** legacy updateObjToAddSelectArray */
export const objToKV = (obj) =>
  obj && typeof obj === 'object' && !Array.isArray(obj) ? Object.keys(obj).map((key) => ({ key, value: obj[key] })) : [];

/** legacy updateAddSelectValueToObj */
export const kvToObj = (arr = []) => {
  const obj = {};
  (arr || []).forEach(({ key, value } = {}) => {
    if (key) obj[key] = value;
  });
  return obj;
};

/** ShareType/actions/Create keyValueValidator: every row needs key and value */
export const keyValueRule = () => ({
  validator: (_, values) => {
    if (!values || !values.length) return Promise.resolve();
    const bad = values.find(({ key, value } = {}) => !key || !value);
    return bad ? Promise.reject(new Error(t('Please enter complete key value!'))) : Promise.resolve();
  },
});

/** "add-select" + KeyValueInput form item */
export function KeyValueList({ value, onChange, addText }) {
  const list = Array.isArray(value) ? value : [];
  const update = (idx, patch) => onChange?.(list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const remove = (idx) => onChange?.(list.filter((_, i) => i !== idx));
  return (
    <div>
      {list.map((it, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <Space key={idx} style={{ display: 'flex', marginBottom: 8 }} align="baseline" wrap>
          <Input
            placeholder={t('Key')}
            value={it.key}
            onChange={(e) => update(idx, { key: e.target.value })}
            style={{ width: 200 }}
          />
          <Input
            placeholder={t('Value')}
            value={it.value ?? ''}
            onChange={(e) => update(idx, { value: e.target.value })}
            style={{ width: 240 }}
          />
          <MinusCircleOutlined style={{ color: '#94a3b8' }} onClick={() => remove(idx)} />
        </Space>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange?.([...list, { key: '', value: '' }])}>
        {addText || t('Add')}
      </Button>
    </div>
  );
}

export const keyValueField = ({ name = 'extra', label, addText } = {}) => ({
  name,
  label: label || t('Extra Specs'),
  rules: [keyValueRule()],
  render: () => <KeyValueList addText={addText || t('Add Extra Spec')} />,
});

export const specsToList = (specs) =>
  Object.keys(specs || {}).map((key) => ({ id: key, keyName: key, name: key, value: specs[key] }));

/**
 * Key/value sub-resource tab (share metadata, share type extra specs, share group type group specs).
 * api = { list(), set(obj), remove(key) }
 */
export const keyValueActions = ({ api, kind = 'extra', canDelete }) => {
  const labels =
    kind === 'metadata'
      ? {
          create: t('Create Share Metadata'),
          edit: t('Edit Share Metadata'),
          del: t('Delete Share Metadata'),
        }
      : { create: t('Create Extra Spec'), edit: t('Edit Extra Spec'), del: t('Delete Extra Specs') };
  const create = {
    id: 'create',
    type: 'modal',
    title: labels.create,
    formItems: [
      { name: 'keyName', label: t('Key'), type: 'input', required: true, placeholder: t('Please input key') },
      { name: 'value', label: t('Value'), type: 'input', required: true, placeholder: t('Please input value') },
    ],
    onSubmit: ({ keyName, value }) => api.set({ [keyName]: value }),
  };
  const edit = {
    id: 'edit',
    type: 'modal',
    title: labels.edit,
    buttonText: t('Edit'),
    getDefaultValues: (item) => ({ keyName: item.keyName, value: item.value }),
    formItems: [
      { name: 'keyName', label: t('Key'), type: 'input', disabled: true, placeholder: t('Please input key') },
      { name: 'value', label: t('Value'), type: 'input', placeholder: t('Please input value') },
    ],
    onSubmit: ({ value }, item) => api.set({ [item.keyName]: value }),
  };
  const del = {
    ...deleteAction({ name: '', title: labels.del, onDelete: (it) => api.remove(it.keyName), allowed: canDelete }),
    actionName: labels.del,
  };
  return { create, edit, del };
};

export function KeyValueTab({ api, kind, readOnly = false, deleteOnly = false, canDelete }) {
  const { create, edit, del } = keyValueActions({ api, kind, canDelete });
  return (
    <ResourcePage
      embedded
      rowKey="keyName"
      fetch={api.list}
      columns={[textColumn(t('Key'), 'keyName'), textColumn(t('Value'), 'value')]}
      filterParams={[{ name: 'keyName', label: t('Key') }]}
      searchFields={['keyName', 'value']}
      primaryActions={readOnly || deleteOnly ? [] : [create]}
      batchActions={readOnly ? [] : [del]}
      rowActions={readOnly ? undefined : { firstAction: del, moreActions: deleteOnly ? [] : [{ action: edit }] }}
      autoRefreshEnabled={false}
    />
  );
}

/* ================================================================== projects (access control) */
export const fetchProjectsWithDomain = async () => {
  try {
    const [pr, dr] = await Promise.all([
      keystoneApi.listProjects(),
      keystoneApi.listDomains ? keystoneApi.listDomains().catch(() => ({})) : Promise.resolve({}),
    ]);
    const domains = dr?.domains || [];
    return (pr?.projects || []).map((it) => ({
      ...it,
      domainName: domains.find((d) => d.id === it.domain_id)?.name,
    }));
  } catch {
    return [];
  }
};

export const projectTableColumns = () => [
  nameColumn({ title: t('Project ID/Name') }),
  {
    title: t('Domain ID/Name'),
    dataIndex: 'domain_id',
    key: 'domain_id',
    render: (v, r) => <IdNameCell id={v} name={r.domainName} bold={false} />,
  },
  boolColumn(t('Enabled'), 'enabled'),
  textColumn(t('Description'), 'description'),
];

export const accessControlField = (name, projects, visibleKey = 'isPublic') => ({
  ...selectTableField({
    name,
    label: t('Access Control'),
    data: projects,
    columns: projectTableColumns(),
    multiple: true,
  }),
  visible: (values) => !values[visibleKey],
});

/* ================================================================== select-table columns */
/** resources/manila/share-type shareTypeColumns (first column replaced by idNameColumn) */
export const shareTypeSelectColumns = () => [
  nameColumn(),
  textColumn(t('Description'), 'description'),
  { title: t('Public'), dataIndex: 'is_public', key: 'is_public', render: (v) => yesNo(v) },
];

export const shareGroupTypeSelectColumns = () => [
  nameColumn(),
  { title: t('Public'), dataIndex: 'is_public', key: 'is_public', render: (v) => yesNo(v) },
  {
    title: t('Share Types'),
    dataIndex: 'shareTypes',
    key: 'shareTypes',
    render: (v) =>
      (v || []).length
        ? (v || []).map((it) => (
            <div key={it.id} style={{ marginBottom: 4 }}>
              <IdNameCell id={it.id} name={it.name} bold={false} />
            </div>
          ))
        : '-',
  },
];

export const networkLink = (id, label, isAdmin) =>
  id ? <Link to={`/network/${isAdmin ? 'networks-admin' : 'networks'}/detail/${id}`}>{label || id}</Link> : '-';

export const shareNetworkLink = (id, label, isAdmin) =>
  id ? <Link to={`/share/${isAdmin ? 'share-network-admin' : 'share-network'}/detail/${id}`}>{label || id}</Link> : '-';

export const shareGroupLink = (id, label, isAdmin) =>
  id ? <Link to={`/share/${isAdmin ? 'share-group-admin' : 'share-group'}/detail/${id}`}>{label || id}</Link> : '-';

export const shareLink = (id, label, isAdmin) =>
  id ? <Link to={`/share/${isAdmin ? 'share-admin' : 'share'}/detail/${id}`}>{label || id}</Link> : '-';

/* ================================================================== popovers */
/** components/Popover/PopoverNetworks / PopoverSubnets: lazy table of neutron resources */
export function ResourcePopover({ ids = [], kind = 'network' }) {
  const [rows, setRows] = useState(null);
  if (!ids.length) return null;
  const load = async () => {
    if (rows) return;
    const getter = kind === 'network' ? neutronApi.getNetwork : neutronApi.getSubnet;
    const res = await Promise.all(
      [...new Set(ids)].map((id) =>
        getter(id)
          .then((r) => r?.[kind] || { id })
          .catch(() => ({ id }))
      )
    );
    setRows(res);
  };
  const columns =
    kind === 'network'
      ? [
          { title: t('Network Name'), dataIndex: 'name', key: 'name', render: (v, r) => <IdNameCell id={r.id} name={v} /> },
          { title: t('External'), dataIndex: 'router:external', key: 'ext', render: (v) => yesNo(v) },
          { title: t('Shared Network'), dataIndex: 'shared', key: 'shared', render: (v) => yesNo(v) },
          { title: t('Status'), dataIndex: 'status', key: 'status', render: (v) => v || '-' },
        ]
      : [
          { title: t('ID/Name'), dataIndex: 'name', key: 'name', render: (v, r) => <IdNameCell id={r.id} name={v} /> },
          { title: t('CIDR'), dataIndex: 'cidr', key: 'cidr', render: (v) => v || '-' },
        ];
  return (
    <Popover
      trigger="click"
      onOpenChange={(open) => open && load()}
      content={
        rows ? (
          <Table size="small" rowKey="id" columns={columns} dataSource={rows} pagination={false} />
        ) : (
          <Spin size="small" />
        )
      }
    >
      <InfoCircleOutlined style={{ color: '#94a3b8', cursor: 'pointer', marginLeft: 4 }} />
    </Popover>
  );
}

/* ================================================================== export locations */
export function ExportLocations({ locations = [], showReplica = true }) {
  if (!locations.length) return <span style={{ color: '#94a3b8' }}>-</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {locations.map((location, index) => (
        <div key={location.id || index} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {t('Export Location')} {index + 1}
          </div>
          <div>
            <b>{t('Path')}: </b>
            <span style={{ wordBreak: 'break-all' }}>{location.path}</span>
          </div>
          <div>
            <b>{t('Preferred')}: </b>
            {location.preferred ? t('Yes') : t('No')}
          </div>
          <div>
            <b>{t('Is admin only')}: </b>
            {location.is_admin_only ? t('Yes') : t('No')}
          </div>
          {showReplica ? (
            <div>
              <b>{t('Share Replica ID')}: </b>
              {location.share_instance_id || '-'}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export const tagList = (values = []) =>
  values.length ? (
    <Space size={[4, 4]} wrap>
      {values.map((v) => (
        <Tag key={v}>{v}</Tag>
      ))}
    </Space>
  ) : (
    '-'
  );
