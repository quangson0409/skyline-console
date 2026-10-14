import React, { useEffect, useMemo, useState } from 'react';
import { Button, Space, Tabs, Tag, theme } from 'antd';
import { neutronApi } from '@/api/neutron';
import { currentProjectId } from '@/api/endpoints';
import { t } from '@/core/i18n';
import SelectTable, { col, mapCol, yesNoCol, timeCol } from '@/components/SelectTable';

export const networkStatus = () => ({
  ACTIVE: t('Active'),
  BUILD: t('Build'),
  DOWN: t('Down'),
  ERROR: t('Error'),
});

const yesNoOptions = () => [
  { key: 'true', label: t('Yes') },
  { key: 'false', label: t('No') },
];

const boolFilter = (v, value) => String(!!v) === String(value);

const TAB_PARAMS = {
  project: () => ({ project_id: currentProjectId() }),
  shared: () => ({ shared: true }),
  external: () => ({ 'router:external': true }),
  all: () => ({}),
};

/**
 * Port of legacy components/FormItem/NetworkSelectTable (TabSelectTable of networks):
 * Current Project / Shared / External (showExternal) / All (admin) networks, selection shared
 * between the tabs.
 */
export default function NetworkSelectTable({ value, onChange, isMulti = false, showExternal = false, hasAdminRole = false, disabledFunc, header }) {
  const { token } = theme.useToken();
  const projectId = currentProjectId();
  const tabs = useMemo(() => {
    const list = [
      { title: t('Current Project Networks'), key: 'project' },
      { title: t('Shared Networks'), key: 'shared' },
    ];
    if (showExternal) list.push({ title: t('External Networks'), key: 'external' });
    if (hasAdminRole) list.push({ title: t('All Networks'), key: 'all' });
    return list;
  }, [showExternal, hasAdminRole]);
  const [tabKey, setTabKey] = useState('project');
  const [dataMap, setDataMap] = useState({});
  const [loading, setLoading] = useState(false);

  const load = async (key = tabKey) => {
    setLoading(true);
    try {
      const res = await neutronApi.listNetworks(TAB_PARAMS[key]());
      const rows = (res?.networks || [])
        .map((it) => ({ ...it, name: it.name || it.id }))
        // legacy networkSortProps: status descend
        .sort((a, b) => String(b.status || '').localeCompare(String(a.status || '')));
      setDataMap((prev) => ({ ...prev, [key]: rows }));
    } catch {
      setDataMap((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!dataMap[tabKey]) load(tabKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey]);

  const getColumns = (key) => {
    const columns = [
      col(t('ID/Name'), 'name', {
        render: (name, r) => (
          <div>
            <div>{name}</div>
            {name !== r.id ? <div style={{ fontSize: 12, color: token.colorTextTertiary }}>{r.id}</div> : null}
          </div>
        ),
      }),
      col(t('Is Current Project'), 'tenant_id', { render: (v) => (v === projectId ? t('Yes') : t('No')) }),
      yesNoCol(t('External'), 'router:external'),
      yesNoCol(t('Shared Network'), 'shared'),
      mapCol(t('Status'), 'status', networkStatus()),
      col(t('Subnet Count'), 'subnets', { render: (v) => (v || []).length }),
      timeCol(t('Created At'), 'created_at'),
    ];
    if (key === 'shared') return columns.filter((it) => it.dataIndex !== 'shared');
    return columns;
  };

  const getFilters = (key) => {
    const filters = [{ label: t('Network Name'), name: 'name' }];
    if (key !== 'shared') filters.push({ label: t('Shared Network'), name: 'shared', options: yesNoOptions(), filterFunc: boolFilter });
    if (showExternal && key !== 'external') {
      filters.push({ label: t('External Network'), name: 'router:external', options: yesNoOptions(), filterFunc: boolFilter });
    }
    if (key !== 'project') {
      filters.push({
        label: t('Project Range'),
        name: 'tenant_id',
        options: [
          { label: t('Current Project'), key: projectId },
          { label: t('All'), key: 'all' },
        ],
        filterFunc: (v, val) => val === 'all' || v === val,
      });
    }
    return filters;
  };

  const selectedRowKeys = value?.selectedRowKeys || [];
  const selectedRows = value?.selectedRows || [];

  return (
    <div>
      {header ? <div style={{ marginBottom: 8, color: token.colorTextSecondary }}>{header}</div> : null}
      <Tabs
        activeKey={tabKey}
        onChange={setTabKey}
        items={tabs.map((tab) => ({
          key: tab.key,
          label: tab.title,
          children:
            tab.key === tabKey ? (
              <SelectTable
                id={`network-select-${tab.key}`}
                value={value}
                onChange={onChange}
                data={dataMap[tab.key] || []}
                columns={getColumns(tab.key)}
                filterParams={getFilters(tab.key)}
                isLoading={loading && !dataMap[tab.key]}
                isMulti={isMulti}
                disabledFunc={disabledFunc}
                showSelected={false}
                onRefresh={() => load(tab.key)}
              />
            ) : null,
        }))}
      />
      <div style={{ marginTop: 8 }}>
        <Space size={4} wrap>
          <span>{t('Selected')}:</span>
          {selectedRows.length ? (
            <Button size="small" type="link" style={{ padding: 0 }} onClick={() => onChange?.({ selectedRowKeys: [], selectedRows: [] })}>
              {t('Clear selected')}
            </Button>
          ) : null}
          {selectedRows.map((row) => (
            <Tag
              key={row.id}
              closable
              color="processing"
              onClose={(e) => {
                e.preventDefault();
                onChange?.({
                  selectedRowKeys: selectedRowKeys.filter((k) => k !== row.id),
                  selectedRows: selectedRows.filter((r) => r.id !== row.id),
                });
              }}
            >
              {row.name || row.id}
            </Tag>
          ))}
        </Space>
      </div>
    </div>
  );
}
