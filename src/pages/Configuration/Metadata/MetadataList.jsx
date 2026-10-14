import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Checkbox, Input, Table } from 'antd';
import apiClient from '@/api/client';
import { serviceBase } from '@/api/endpoints';
import { glanceApi } from '@/api/glance';
import ResourcePage, { boolColumn, textColumn, timeColumn } from '@/components/ResourcePage';
import { TextareaFromFile } from '@/pages/Compute/_shared';
import { t } from '@/core/i18n';
import { jsonRule } from '../shared';

/** Legacy pages/configuration/containers/Metadata (glance metadefs namespaces) */

const ns = () => `${serviceBase('glance')}/metadefs/namespaces`;

/** Namespace write calls (legacy client.glance.namespaces / namespaces.resourceTypes) */
export const metadefApi = {
  createNamespace: (body) => apiClient.post(ns(), body),
  updateNamespace: (namespace, body) => apiClient.put(`${ns()}/${encodeURIComponent(namespace)}`, body),
  deleteNamespace: (namespace) => apiClient.delete(`${ns()}/${encodeURIComponent(namespace)}`),
  addResourceType: (namespace, body) =>
    apiClient.post(`${ns()}/${encodeURIComponent(namespace)}/resource_types`, body),
  removeResourceType: (namespace, name) =>
    apiClient.delete(`${ns()}/${encodeURIComponent(namespace)}/resource_types/${encodeURIComponent(name)}`),
};

/** Legacy MetadataStore.mapper */
export const mapNamespace = (data = {}) => {
  const associations = (data.resource_type_associations || []).map((it) => ({ ...it, prefix: it.prefix || '' }));
  return {
    ...data,
    public: data.visibility === 'public',
    id: data.namespace,
    name: data.display_name,
    resource_type_associations: associations,
  };
};

export const fetchNamespaces = async () => {
  const all = [];
  let params = { limit: 1000 };
  for (let i = 0; i < 20; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await glanceApi.listNamespaces(params);
    const items = res?.namespaces || [];
    all.push(...items);
    const marker = res?.next ? new URLSearchParams(String(res.next).split('?')[1] || '').get('marker') : null;
    if (!marker || !items.length) break;
    params = { ...params, marker };
  }
  return all.map(mapNamespace);
};

const optionList = () => [
  { label: t('Public'), value: 'isPublic' },
  { label: t('Protected'), value: 'isProtected' },
];

const optionsField = () => ({
  name: 'options',
  label: t('Options'),
  render: () => <Checkbox.Group options={optionList()} />,
});

export const createMetadataAction = () => ({
  id: 'create',
  type: 'modal',
  policy: 'add_metadef_namespace',
  title: t('Import Metadata'),
  adminOnly: true,
  width: 760,
  getDefaultValues: () => ({ options: [] }),
  formItems: [
    {
      name: 'metadata',
      label: t('Metadata'),
      required: true,
      rules: [jsonRule()],
      render: () => <TextareaFromFile rows={10} accept=".json,application/json" placeholder={t('Please input metadata')} />,
    },
    optionsField(),
  ],
  onSubmit: ({ metadata, options = [] }) => {
    let body = {};
    try {
      body = JSON.parse(metadata) || {};
    } catch {
      body = {};
    }
    body.protected = options.includes('isProtected');
    body.visibility = options.includes('isPublic') ? 'public' : 'private';
    return metadefApi.createNamespace(body);
  },
});

export const editMetadataAction = () => ({
  id: 'edit',
  type: 'modal',
  policy: 'modify_metadef_namespace',
  title: t('Edit Metadata'),
  buttonText: t('Edit'),
  adminOnly: true,
  getDefaultValues: (item) => ({
    namespace: item.namespace,
    options: [item.visibility === 'public' && 'isPublic', item.protected && 'isProtected'].filter(Boolean),
  }),
  formItems: [{ name: 'namespace', label: t('Namespace'), type: 'label' }, optionsField()],
  onSubmit: ({ options = [] }, item) =>
    metadefApi.updateNamespace(item.namespace, {
      display_name: item.display_name,
      description: item.description,
      namespace: item.namespace,
      protected: options.includes('isProtected'),
      visibility: options.includes('isPublic') ? 'public' : 'private',
    }),
});

/** select-table of resource types with an editable prefix per row (legacy Manage.renderInput) */
function ResourceTypeSelect({ value, onChange, data = [] }) {
  const [keyword, setKeyword] = useState('');
  const selectedRowKeys = value?.selectedRowKeys || [];
  const prefixes = value?.prefixes || {};
  const emit = (patch) => onChange?.({ selectedRowKeys, prefixes, ...patch });
  const rows = useMemo(
    () => data.filter((it) => !keyword || it.name.toLowerCase().includes(keyword.toLowerCase())),
    [data, keyword]
  );
  return (
    <div>
      <Input.Search allowClear placeholder={t('Name')} style={{ marginBottom: 8 }} onSearch={setKeyword} onChange={(e) => setKeyword(e.target.value)} />
      <Table
        size="small"
        rowKey="name"
        dataSource={rows}
        pagination={{ pageSize: 8, size: 'small', hideOnSinglePage: true }}
        rowSelection={{ selectedRowKeys, onChange: (keys) => emit({ selectedRowKeys: keys }) }}
        columns={[
          { title: t('Name'), dataIndex: 'name', key: 'name' },
          {
            title: t('Prefix'),
            key: 'prefix',
            render: (_, r) => (
              <Input
                size="small"
                placeholder={t('Please input prefix')}
                value={prefixes[r.name] ?? ''}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => emit({ prefixes: { ...prefixes, [r.name]: e.target.value } })}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

export const manageResourceTypesAction = () => ({
  id: 'manage',
  type: 'modal',
  policy: [
    'list_metadef_resource_types',
    'add_metadef_resource_type_association',
    'remove_metadef_resource_type_association',
  ],
  title: t('Manage Resource Types'),
  adminOnly: true,
  width: 900,
  allowed: (item) => !item.protected,
  getDefaultValues: (item) => {
    const associations = item.resource_type_associations || [];
    return {
      namespace: item.namespace,
      associations: {
        selectedRowKeys: associations.map((it) => it.name),
        prefixes: Object.fromEntries(associations.map((it) => [it.name, it.prefix || ''])),
      },
    };
  },
  getFormItems: async () => {
    const res = await glanceApi.listResourceTypes();
    const types = (res?.resource_types || []).map((it) => ({ ...it, id: it.name }));
    return [
      { name: 'namespace', label: t('Namespace'), type: 'label' },
      { name: 'associations', label: t('Resource Types'), render: () => <ResourceTypeSelect data={types} /> },
    ];
  },
  onSubmit: async ({ associations = {} }, item) => {
    const { selectedRowKeys = [], prefixes = {} } = associations;
    const oldItems = item.resource_type_associations || [];
    const oldMap = Object.fromEntries(oldItems.map((it) => [it.name, it.prefix || '']));
    const newItems = selectedRowKeys.map((name) => ({ name, prefix: prefixes[name] || '' }));
    const newMap = Object.fromEntries(newItems.map((it) => [it.name, it.prefix]));
    const dels = oldItems.filter((it) => !(it.name in newMap) || newMap[it.name] !== (it.prefix || ''));
    const adds = newItems.filter((it) => !(it.name in oldMap) || oldMap[it.name] !== it.prefix);
    if (!dels.length && !adds.length) return undefined;
    await Promise.all(dels.map((it) => metadefApi.removeResourceType(item.namespace, it.name)));
    return Promise.all(adds.map((it) => metadefApi.addResourceType(item.namespace, { name: it.name, prefix: it.prefix })));
  },
});

export const deleteMetadataAction = () => ({
  id: 'delete',
  type: 'confirm',
  policy: 'delete_metadef_namespace',
  title: t('Delete Metadata'),
  buttonText: t('Delete'),
  actionName: t('Delete metadata'),
  isDanger: true,
  adminOnly: true,
  allowed: (item) => !item.protected,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await metadefApi.deleteNamespace(it.namespace);
    }
  },
});

export const metadataRowActions = () => ({
  firstAction: editMetadataAction(),
  moreActions: [{ action: manageResourceTypesAction() }, { action: deleteMetadataAction() }],
});

export default function MetadataList() {
  return (
    <ResourcePage
      title={t('Metadata Definitions')}
      breadcrumb={[t('Global Settings'), t('Metadata Definitions')]}
      description={t('Glance metadata definition namespaces and their associated resource types.')}
      fetch={fetchNamespaces}
      rowKey="namespace"
      searchFields={['display_name', 'namespace', 'description']}
      columns={() => [
        {
          title: t('Name'),
          dataIndex: 'display_name',
          key: 'display_name',
          sorter: (a, b) => String(a.display_name || '').localeCompare(String(b.display_name || '')),
          render: (v, r) =>
            v ? (
              <div>
                <Link to={`/configuration-admin/metadata/detail/${encodeURIComponent(r.namespace)}`} style={{ fontWeight: 600 }}>
                  {v}
                </Link>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.namespace}</div>
              </div>
            ) : (
              '-'
            ),
        },
        { ...textColumn(t('Description'), 'description'), width: 350 },
        {
          title: t('Resource Types'),
          dataIndex: 'resource_type_associations',
          key: 'resource_type_associations',
          render: (v) => (v && v.length ? v.map((it) => <div key={it.name}>{it.name}</div>) : '-'),
        },
        boolColumn(t('Public'), 'public'),
        boolColumn(t('Protected'), 'protected'),
        timeColumn(),
      ]}
      filterParams={[
        { name: 'display_name', label: t('Name') },
        { name: 'namespace', label: t('Namespace') },
        { name: 'description', label: t('Description') },
      ]}
      primaryActions={[createMetadataAction()]}
      batchActions={[deleteMetadataAction()]}
      rowActions={metadataRowActions}
    />
  );
}
