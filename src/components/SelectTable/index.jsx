import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Radio, Space, Table, Tag, Tooltip, theme } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import MagicInput from '@/components/MagicInput';
import { t } from '@/core/i18n';
import { formatTime } from '@/components/ResourcePage/helpers';

const getValue = (record, key) => {
  if (!record) return undefined;
  if (key in record) return record[key];
  return String(key)
    .split('.')
    .reduce((acc, k) => (acc === undefined || acc === null ? acc : acc[k]), record);
};

/** Client side filtering like legacy SelectTable (contains / options equality / filterFunc) */
export const filterRows = (rows, filters, filterParams = []) => {
  const entries = Object.entries(filters || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!entries.length) return rows;
  return rows.filter((row) =>
    entries.every(([name, value]) => {
      const param = filterParams.find((p) => p.name === name) || {};
      const itemValue = getValue(row, name);
      if (param.filterFunc) return param.filterFunc(itemValue, value, row);
      if (param.options && param.options.length) return String(itemValue) === String(value);
      return String(itemValue ?? '')
        .toLowerCase()
        .includes(String(value).toLowerCase());
    })
  );
};

/** Plain keyword search over some fields (used when no MagicInput filterParams are given) */
const searchRows = (rows, keyword, fields = []) => {
  const q = String(keyword || '').trim().toLowerCase();
  if (!q || !fields.length) return rows;
  return rows.filter((it) => fields.some((f) => String(getValue(it, f) ?? '').toLowerCase().includes(q)));
};

/**
 * Port of legacy components/FormItem/SelectTable (shared by every module).
 * value: { selectedRowKeys, selectedRows }; onChange receives the same shape.
 * Layout order like legacy: header, tabs, search line, tableHeader, table, "Selected" tags.
 */
export default function SelectTable({
  value,
  onChange,
  data = [],
  columns = [],
  rowKey = 'id',
  isMulti = false,
  isLoading = false,
  filterParams = [],
  header = null,
  tableHeader = null,
  tabs = null,
  tabValue,
  onTabChange,
  selectedLabel = '',
  disabledFunc,
  pageSize = 5,
  onRefresh,
  tagKey = 'name',
  secondTagKey = 'id',
  showSelected = true,
  id,
  searchFields,
  hideOnSinglePage = false,
  showTotal = true,
  selectedRender,
}) {
  const { token } = theme.useToken();
  const [filters, setFilters] = useState({});
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const selectedRowKeys = value?.selectedRowKeys || [];
  const selectedRows = useMemo(() => {
    const rows = value?.selectedRows || [];
    if (rows.length === selectedRowKeys.length) return rows;
    return selectedRowKeys.map((key) => rows.find((r) => r[rowKey] === key) || data.find((r) => r[rowKey] === key)).filter(Boolean);
  }, [value, selectedRowKeys, data, rowKey]);

  const list = useMemo(
    () => searchRows(filterRows(data, filters, filterParams), keyword, filterParams.length ? [] : searchFields || []),
    [data, filters, filterParams, keyword, searchFields]
  );

  useEffect(() => {
    setPage(1);
  }, [filters, tabValue, keyword]);

  const emit = (keys, rows) => {
    onChange?.({ selectedRowKeys: keys, selectedRows: rows });
  };

  const toggle = (record) => {
    if (disabledFunc && disabledFunc(record)) return;
    const key = record[rowKey];
    if (!isMulti) {
      emit([key], [record]);
      return;
    }
    if (selectedRowKeys.includes(key)) {
      emit(
        selectedRowKeys.filter((k) => k !== key),
        selectedRows.filter((r) => r[rowKey] !== key)
      );
    } else {
      emit([...selectedRowKeys, key], [...selectedRows, record]);
    }
  };

  const rowSelection = {
    type: isMulti ? 'checkbox' : 'radio',
    selectedRowKeys,
    preserveSelectedRowKeys: true,
    getCheckboxProps: (record) => ({ disabled: disabledFunc ? !!disabledFunc(record) : false }),
    onChange: (keys, rows) => {
      // keep rows selected on other pages / tabs
      const merged = keys.map(
        (k) => rows.find((r) => r && r[rowKey] === k) || selectedRows.find((r) => r[rowKey] === k) || data.find((r) => r[rowKey] === k)
      );
      emit(keys, merged.filter(Boolean));
    },
  };

  const renderTabs = () => {
    if (!tabs || !tabs.length) return null;
    return (
      <div style={{ marginBottom: 12, overflowX: 'auto' }}>
        <Radio.Group
          id={id ? `${id}-tabs` : undefined}
          value={tabValue}
          onChange={(e) => onTabChange?.(e.target.value)}
          buttonStyle="solid"
          optionType="button"
          options={tabs.map((it) => ({ label: it.label, value: it.value }))}
        />
      </div>
    );
  };

  return (
    <div className="instance-create-select-table" id={id}>
      {header ? <div style={{ marginBottom: 8, color: token.colorTextSecondary }}>{header}</div> : null}
      {renderTabs()}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        {filterParams.length ? (
          <MagicInput
            filterParams={filterParams}
            value={filters}
            onChange={setFilters}
            style={{
              background: token.colorBgContainer,
              borderColor: token.colorBorder,
              minWidth: 0,
              width: 'min(100%, 420px)',
            }}
          />
        ) : null}
        {!filterParams.length && searchFields && searchFields.length ? (
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
            placeholder={t('Search')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 'min(100%, 320px)' }}
          />
        ) : null}
        {onRefresh ? (
          <Tooltip title={t('Refresh')}>
            <Button icon={<ReloadOutlined />} onClick={onRefresh} />
          </Tooltip>
        ) : null}
      </div>
      {tableHeader ? <div style={{ marginBottom: 8 }}>{tableHeader}</div> : null}
      <div style={{ overflowX: 'auto' }}>
        <Table
          size="small"
          rowKey={rowKey}
          columns={columns}
          dataSource={list}
          loading={isLoading}
          rowSelection={rowSelection}
          pagination={{
            current: page,
            pageSize,
            onChange: setPage,
            size: 'small',
            showSizeChanger: false,
            showTotal: showTotal ? (total) => t('Total {total} items', { total }) : undefined,
            hideOnSinglePage,
          }}
          onRow={(record) => ({
            onClick: () => toggle(record),
            style: { cursor: disabledFunc && disabledFunc(record) ? 'not-allowed' : 'pointer' },
          })}
          style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius }}
        />
      </div>
      {showSelected && selectedRender ? (
        <div style={{ marginTop: 8, color: token.colorTextSecondary, fontSize: 12 }}>{selectedRender(selectedRows)}</div>
      ) : null}
      {showSelected && !selectedRender ? (
      <div style={{ marginTop: 8, color: token.colorText }}>
        <Space size={4} wrap>
          <span>
            {t('Selected')} {selectedLabel}:
          </span>
          {selectedRows.length ? (
            <Button
              size="small"
              type="link"
              style={{ padding: 0 }}
              onClick={(e) => {
                e.stopPropagation();
                emit([], []);
              }}
            >
              {t('Clear selected')}
            </Button>
          ) : null}
          {selectedRows.map((row) => (
            <Tag
              key={row[rowKey]}
              closable
              onClose={(e) => {
                e.preventDefault();
                emit(
                  selectedRowKeys.filter((k) => k !== row[rowKey]),
                  selectedRows.filter((r) => r[rowKey] !== row[rowKey])
                );
              }}
              color="processing"
            >
              {row[tagKey] || row[secondTagKey]}
            </Tag>
          ))}
        </Space>
      </div>
      ) : null}
    </div>
  );
}

/** Column helpers mirroring legacy column config (valueMap / unit / yesNo / sinceTime) */
export const col = (title, dataIndex, extra = {}) => ({ title, dataIndex, key: dataIndex, ...extra });

export const mapCol = (title, dataIndex, map) =>
  col(title, dataIndex, { render: (v) => (v === undefined || v === null || v === '' ? '-' : map[v] || v) });

export const unitCol = (title, dataIndex, unit) =>
  col(title, dataIndex, { render: (v) => (v === undefined || v === null || v === '' ? '-' : `${v} ${unit}`) });

export const yesNoCol = (title, dataIndex) => col(title, dataIndex, { render: (v) => (v ? t('Yes') : t('No')) });

export const timeCol = (title, dataIndex) => col(title, dataIndex, { render: (v) => formatTime(v) });

/* ------------------------------------------------------------------ */
/* Validators / value helpers ({ selectedRowKeys, selectedRows })      */
/* ------------------------------------------------------------------ */

/** Legacy select-table required rule: "Please select <label>" */
export const selectRequired = (label) => ({
  validator: (_, value) =>
    value?.selectedRowKeys?.length ? Promise.resolve() : Promise.reject(new Error(`${t('Please select')} ${label}`)),
});

/** Same rule, name used by the administrator extra modules */
export const selectTableRequired = selectRequired;

/** { selectedRowKeys, selectedRows } for a row (or empty) */
export const selection = (row, key = 'id') =>
  row ? { selectedRowKeys: [row[key]], selectedRows: [row] } : { selectedRowKeys: [], selectedRows: [] };

export const firstKey = (value) => value?.selectedRowKeys?.[0];

/* ------------------------------------------------------------------ */
/* Presets kept for the former per-module select tables                */
/* ------------------------------------------------------------------ */

/**
 * Select table with a keyword search box (former Configuration/shared SelectTable):
 * multi-select by default, 8 rows per page, `loading` / `searchFields` props.
 */
export function SearchSelectTable({ isMulti = true, loading = false, searchFields = ['name', 'id'], pageSize = 8, ...rest }) {
  return (
    <SelectTable
      isMulti={isMulti}
      isLoading={loading}
      searchFields={searchFields}
      pageSize={pageSize}
      hideOnSinglePage
      showTotal={false}
      showSelected={isMulti}
      selectedRender={(rows) => `${t('Selected')}: ${rows.length}`}
      {...rest}
    />
  );
}

/**
 * Select table whose value is the plain array of selected row keys
 * (former Storage/shared SelectTable, legacy select-table with the key list as value).
 */
export function KeysSelectTable({ value, onChange, data = [], rowKey = 'id', multiple = false, searchKeys = ['name', 'id'], pageSize = 5, ...rest }) {
  const keys = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <SelectTable
      value={{ selectedRowKeys: keys }}
      onChange={(v) => onChange?.(v?.selectedRowKeys || [])}
      data={data}
      rowKey={rowKey}
      isMulti={multiple}
      searchFields={searchKeys}
      pageSize={pageSize}
      hideOnSinglePage
      showTotal={false}
      selectedRender={(rows) => `${t('Selected')}: ${rows.length ? rows.map((it) => it.name || it[rowKey]).join(', ') : '-'}`}
      {...rest}
    />
  );
}

/** Builds an ActionModal form field rendering a KeysSelectTable */
export const selectTableField = ({ name, label, required, tip, rules = [], ...tableProps }) => ({
  name,
  label,
  tip,
  required: false,
  rules: [
    ...(required
      ? [
          {
            validator: (_, v) =>
              Array.isArray(v) && v.length ? Promise.resolve() : Promise.reject(new Error(`${t('Please select')} ${label}`)),
          },
        ]
      : []),
    ...rules,
  ],
  render: () => <KeysSelectTable {...tableProps} />,
});
