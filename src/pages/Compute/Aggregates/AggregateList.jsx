import React, { useState } from 'react';
import { Breadcrumb, Input, Space, Table, Tabs, Tag, Tooltip, message } from 'antd';
import { BlockOutlined } from '@ant-design/icons';
import { novaApi } from '@/api/nova';
import ResourcePage, { deleteAction, yesNo } from '@/components/ResourcePage';
import { getErrorMessage } from '@/hooks/useResource';
import { t } from '@/core/i18n';
import { KpiCards, sinceTime } from '../_shared';
import MetadataEditor, { fetchMetadefs, metadataWithRemovals } from '../_shared/MetadataEditor';
import { fetchComputeHosts, serviceState, serviceStatus } from '../Hypervisors/HypervisorList';

/* ------------------------------------------------------------------ */
/* data                                                               */
/* ------------------------------------------------------------------ */
export const fetchAggregates = async () => {
  const res = await novaApi.listAggregatesV();
  return (res?.aggregates || []).map((a) => ({
    ...a,
    id: String(a.id),
    hosts: a.hosts || [],
    metadata: a.metadata || {},
    hosts_count: (a.hosts || []).length,
  }));
};

/** legacy stores/nova/zone.js fetchListWithoutDetail (create/edit AZ options) */
const fetchZoneNames = async () => {
  try {
    const res = await novaApi.listAvailabilityZonesV();
    return (res?.availabilityZoneInfo || []).map((z) => z.zoneName);
  } catch {
    return [];
  }
};

/** legacy stores/nova/zone.js listDidFetch (AZ tab): keep zones that have nova-compute hosts */
export const fetchAvailabilityZones = async () => {
  const res = await novaApi.listAvailabilityZonesDetailV();
  const data = [];
  (res?.availabilityZoneInfo || []).forEach((item) => {
    const base = { ...item, id: item.zoneName, name: item.zoneName, available: item.zoneState?.available };
    if (item.hosts === null || item.hosts === undefined) {
      data.push(base);
      return;
    }
    const computeHosts = {};
    Object.keys(item.hosts).forEach((key) => {
      if (item.hosts[key]?.['nova-compute']) computeHosts[key] = item.hosts[key];
    });
    if (Object.keys(computeHosts).length) data.push({ ...base, host: computeHosts });
  });
  return data;
};

const yesNoOptions = () => [
  { value: true, label: t('Yes') },
  { value: false, label: t('No') },
];

const azTip = () =>
  t(
    'It is suggested to use the marked AZ directly, too much AZ will lead to the fragmentation of available resources'
  );
const azNewTip = () =>
  t(
    'A host aggregate can be associated with at most one AZ. Once the association is established, the AZ cannot be disassociated.'
  );

/* ------------------------------------------------------------------ */
/* actions                                                            */
/* ------------------------------------------------------------------ */
export const createAggregateAction = () => ({
  id: 'create',
  type: 'modal',
  title: t('Create Host Aggregate'),
  getDefaultValues: async () => {
    const zones = await fetchZoneNames();
    return { isCreate: false, availabilityZone: zones[0] || 'noSelect' };
  },
  getFormItems: async () => {
    const zones = await fetchZoneNames();
    return [
      { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: t('Please input name') },
      { name: 'isCreate', label: t('Create new AZ'), tip: azTip(), type: 'radio', options: yesNoOptions() },
      {
        name: 'availabilityZone',
        label: t('Availability Zone'),
        type: 'select',
        required: true,
        tip: azNewTip(),
        options: [...zones.map((z) => ({ value: z, label: z })), { value: 'noSelect', label: t('Not select') }],
        visible: (v) => !v.isCreate,
      },
      {
        name: 'newAz',
        label: t('New Availability Zone'),
        type: 'input',
        required: true,
        tip: azTip(),
        visible: (v) => Boolean(v.isCreate),
      },
    ];
  },
  onSubmit: (values) => {
    const { isCreate, availabilityZone, newAz, ...rest } = values;
    const curAZ = availabilityZone !== 'noSelect' ? availabilityZone : null;
    return novaApi.createAggregateV({ ...rest, availability_zone: isCreate ? newAz : curAZ });
  },
});

export const editAggregateAction = () => ({
  id: 'edit',
  type: 'modal',
  title: t('Edit Host Aggregate'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({
    isCreate: false,
    name: item.name,
    availabilityZone: item.availability_zone === null ? 'noSelect' : item.availability_zone,
  }),
  getFormItems: async (item) => {
    const hasHost = (item.hosts || []).length > 0;
    const zones = await fetchZoneNames();
    const options = zones.map((z) => ({ value: z, label: z }));
    if (item.availability_zone === null || item.availability_zone === undefined) {
      options.push({ value: 'noSelect', label: t('Not select') });
    } else if (!zones.includes(item.availability_zone)) {
      options.push({ value: item.availability_zone, label: item.availability_zone });
    }
    return [
      { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: t('Please input name') },
      !hasHost && { name: 'isCreate', label: t('Create new AZ'), tip: azTip(), type: 'radio', options: yesNoOptions() },
      !hasHost && {
        name: 'availabilityZone',
        label: t('Availability Zone'),
        type: 'select',
        required: true,
        tip: azNewTip(),
        options,
        visible: (v) => !v.isCreate,
      },
      !hasHost && {
        name: 'newAz',
        label: t('New Availability Zone'),
        type: 'input',
        required: true,
        tip: azTip(),
        visible: (v) => Boolean(v.isCreate),
      },
      hasHost && {
        type: 'alert',
        name: 'az-locked',
        message: `${t('Availability Zone')}: ${item.availability_zone || '-'} - ${azNewTip()}`,
      },
    ].filter(Boolean);
  },
  onSubmit: (values, item) => {
    const { isCreate, availabilityZone, newAz, ...rest } = values;
    const curAZ = availabilityZone !== 'noSelect' ? availabilityZone : null;
    const data = { ...rest };
    if ((item.hosts || []).length === 0) {
      if (isCreate) data.availability_zone = newAz;
      else if (curAZ) data.availability_zone = curAZ;
    }
    return novaApi.updateAggregateV(item.id, data);
  },
});

/** legacy select-table (multi) of compute hosts */
const HostSelectTable = ({ value = [], onChange, hosts = [] }) => {
  const [keyword, setKeyword] = useState('');
  const data = hosts.filter((h) => !keyword || String(h.host).toLowerCase().includes(keyword.toLowerCase()));
  return (
    <div>
      <Input.Search
        allowClear
        placeholder={t('Host')}
        style={{ marginBottom: 8, maxWidth: 280 }}
        onSearch={setKeyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      <Table
        size="small"
        rowKey="host"
        dataSource={data}
        pagination={{ pageSize: 8, size: 'small' }}
        rowSelection={{ selectedRowKeys: value, onChange: (keys) => onChange?.(keys), preserveSelectedRowKeys: true }}
        columns={[
          { title: t('Host'), dataIndex: 'host' },
          { title: t('Availability Zone'), dataIndex: 'zone', render: (v) => v || '-' },
          {
            title: t('Admin Status'),
            dataIndex: 'status',
            render: (v, r) => (
              <Tooltip title={r.disabled_reason ? `${t('Reason: ')} ${r.disabled_reason}` : ''}>
                <span>{serviceStatus()[v] || v || '-'}</span>
              </Tooltip>
            ),
          },
          { title: t('State'), dataIndex: 'state', render: (v) => serviceState()[v] || v || '-' },
          { title: t('Last Updated'), dataIndex: 'updated_at', render: (v) => sinceTime(v) },
        ]}
      />
      <div style={{ fontSize: 12, color: '#64748b' }}>
        {t('Selected')}: {value.length ? value.join(', ') : '-'}
      </div>
    </div>
  );
};

export const manageHostAction = () => ({
  id: 'ManageHost',
  type: 'modal',
  title: t('Manage Host'),
  width: 900,
  description: t('Add hosts to the aggregate or remove hosts from it. Hosts can be in multiple aggregates.'),
  getDefaultValues: (item) => ({ name: item.name, hosts: item.hosts || [] }),
  getFormItems: async () => {
    const hosts = await fetchComputeHosts().catch(() => []);
    return [
      { name: 'name', label: t('Name'), type: 'label' },
      { name: 'hosts', label: t('Hosts'), render: () => <HostSelectTable hosts={hosts} /> },
    ];
  },
  onSubmit: async (values, item) => {
    const newHosts = values.hosts || [];
    const oldHosts = item.hosts || [];
    const adds = newHosts.filter((it) => !oldHosts.includes(it));
    const dels = oldHosts.filter((it) => !newHosts.includes(it));
    // same order as legacy AggregateStore.manageHost (adds then removes, in parallel)
    await Promise.all([
      ...adds.map((host) => novaApi.aggregateActionV(item.id, { add_host: { host } })),
      ...dels.map((host) => novaApi.aggregateActionV(item.id, { remove_host: { host } })),
    ]);
  },
});

export const manageMetadataAction = () => ({
  id: 'ManageMetadata',
  type: 'modal',
  title: t('Manage Metadata'),
  width: 900,
  getDefaultValues: (item) => ({ name: item.name, metadata: { ...(item.metadata || {}) } }),
  getFormItems: async () => {
    const metadefs = await fetchMetadefs('OS::Nova::Aggregate');
    return [
      { name: 'name', label: t('Name'), type: 'label' },
      {
        name: 'metadata',
        label: t('Metadata'),
        rules: [
          {
            validator: (_, value) =>
              Object.values(value || {}).some((v) => v === undefined || v === '')
                ? Promise.reject(new Error(t('Please input value')))
                : Promise.resolve(),
          },
        ],
        render: () => <MetadataEditor metadefs={metadefs} />,
      },
    ];
  },
  onSubmit: (values, item) =>
    novaApi.setAggregateMetadataV(item.id, metadataWithRemovals(values.metadata || {}, item.metadata || {})),
});

export const deleteAggregateAction = () =>
  deleteAction({
    name: t('Host Aggregate'),
    title: t('Delete Host Aggregate'),
    allowed: (item) => Boolean(item) && (item.hosts || []).length === 0,
    onDelete: (it) => novaApi.deleteAggregateV(it.id),
  });

/* ------------------------------------------------------------------ */
/* Host aggregate tab                                                 */
/* ------------------------------------------------------------------ */
export function AggregateTab() {
  return (
    <ResourcePage
      embedded
      fetch={fetchAggregates}
      header={({ data }) => (
        <KpiCards
          items={[
            { title: t('Total Aggregates'), value: data.length },
            {
              title: t('Total Associated Hosts'),
              value: data.reduce((acc, a) => acc + (a.hosts?.length || 0), 0),
              color: '#10b981',
            },
          ]}
        />
      )}
      columns={({ refetch }) => [
        {
          title: t('Name'),
          dataIndex: 'name',
          key: 'name',
          sorter: (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
          render: (text, r) => (
            <div>
              <Space>
                <BlockOutlined style={{ color: '#0068ff' }} />
                <span style={{ fontWeight: 600 }}>{text}</span>
              </Space>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.id}</div>
            </div>
          ),
        },
        {
          title: t('Availability Zone'),
          dataIndex: 'availability_zone',
          key: 'availability_zone',
          render: (az) =>
            az ? (
              <Tag color="geekblue" style={{ borderRadius: 10 }}>
                {az}
              </Tag>
            ) : (
              '-'
            ),
        },
        {
          title: t('Hosts'),
          dataIndex: 'hosts',
          key: 'hosts',
          render: (hosts, record) => {
            if (!hosts || hosts.length === 0) return <span style={{ color: '#94a3b8' }}>-</span>;
            return (
              <Space direction="vertical" size={2}>
                {hosts.map((h) => (
                  <Tag
                    key={h}
                    closable
                    onClose={async (e) => {
                      e.preventDefault();
                      try {
                        await novaApi.aggregateActionV(record.id, { remove_host: { host: h } });
                        message.success(t('Host removed from aggregate'));
                        refetch();
                      } catch (err) {
                        message.error(getErrorMessage(err, t('Failed to remove host')));
                      }
                    }}
                    style={{ borderRadius: 6, fontSize: 11 }}
                  >
                    {h}
                  </Tag>
                ))}
              </Space>
            );
          },
        },
        {
          title: t('Hosts Count'),
          dataIndex: 'hosts_count',
          key: 'hosts_count',
          sorter: (a, b) => a.hosts_count - b.hosts_count,
          render: (v) => (
            <span>
              <b>{v}</b> {t('hosts')}
            </span>
          ),
        },
        {
          title: t('Metadata'),
          dataIndex: 'metadata',
          key: 'metadata',
          render: (value) => {
            const keys = Object.keys(value || {});
            if (!keys.length) return '-';
            return keys.map((key) => (
              <div key={key} style={{ fontSize: 12 }}>
                {key}={String(value[key])}
              </div>
            ));
          },
        },
        {
          title: t('Created At'),
          dataIndex: 'created_at',
          key: 'created_at',
          sorter: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
          render: (v) => <span style={{ color: '#64748b', fontSize: 12 }}>{sinceTime(v)}</span>,
        },
      ]}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'availability_zone', label: t('Availability Zone') },
      ]}
      primaryActions={[createAggregateAction()]}
      batchActions={[deleteAggregateAction()]}
      rowActions={{
        firstAction: editAggregateAction(),
        moreActions: [
          { action: manageHostAction() },
          { action: manageMetadataAction() },
          { action: deleteAggregateAction() },
        ],
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Availability zones tab                                             */
/* ------------------------------------------------------------------ */
export function AvailabilityZoneTab() {
  return (
    <ResourcePage
      embedded
      rowKey="zoneName"
      fetch={fetchAvailabilityZones}
      columns={() => [
        {
          title: t('Availability Zone Name'),
          dataIndex: 'zoneName',
          key: 'zoneName',
          sorter: (a, b) => String(a.zoneName).localeCompare(String(b.zoneName)),
          render: (v) => <span style={{ fontWeight: 600 }}>{v}</span>,
        },
        {
          title: t('Hosts'),
          dataIndex: 'hosts',
          key: 'hosts',
          render: (value) => {
            const keys = Object.keys(value || {});
            if (!keys.length) return '-';
            return keys.map((key) => <div key={key}>{key}</div>);
          },
        },
        { title: t('Available'), dataIndex: 'available', key: 'available', render: (v) => yesNo(v) },
      ]}
      filterParams={[{ name: 'zoneName', label: t('Availability Zone Name') }]}
      searchFields={['zoneName']}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Page (legacy TabList: Host Aggregate / Availability Zones)         */
/* ------------------------------------------------------------------ */
export default function AggregateList() {
  const [tab, setTab] = useState('hostAggregate');
  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb
        items={[{ title: t('Compute') }, { title: t('Host Aggregates') }]}
        style={{ marginBottom: 16, fontSize: 13 }}
      />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t('Host Aggregates')}
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
          {t(
            'Group physical compute hosts into logical aggregates and availability zones with specific metadata tags.'
          )}
        </p>
      </div>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        destroyOnHidden
        items={[
          { key: 'hostAggregate', label: t('Host Aggregate'), children: <AggregateTab /> },
          { key: 'availabilityZone', label: t('Availability Zones'), children: <AvailabilityZoneTab /> },
        ]}
      />
    </div>
  );
}
