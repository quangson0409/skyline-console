import React, { useMemo, useState } from 'react';
import { Input, Table, Space, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';

/**
 * Helpers shared by the administrator extra modules
 * (Configuration, Instance-HA, Monitor Center, Recycle Bin).
 */

/** Legacy valueRender 'sinceTime' */
export const sinceTime = (value) => {
  if (!value) return '-';
  const str = String(value);
  const date = /^\d+$/.test(str)
    ? new Date(Number(str))
    : new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(str) ? str : `${str}Z`);
  if (Number.isNaN(date.getTime())) return str;
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 0) return t('in the future');
  if (diff < 60) return t('a few seconds ago');
  if (diff < 3600) return `${Math.floor(diff / 60)} ${t('minutes ago')}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ${t('hours ago')}`;
  return `${Math.floor(diff / 86400)} ${t('days ago')}`;
};

/** Pretty JSON block (legacy <pre>{JSON.stringify(x, null, 4)}</pre>) */
export const JsonBlock = ({ value, maxHeight = 480 }) => (
  <pre
    style={{
      margin: 0,
      padding: 12,
      maxHeight,
      overflow: 'auto',
      fontSize: 12,
      lineHeight: 1.5,
      background: 'rgba(148,163,184,0.12)',
      borderRadius: 8,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    }}
  >
    {typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 4)}
  </pre>
);

/**
 * Port of legacy FormItem "select-table" for ActionModal `render` fields.
 * value = { selectedRowKeys, selectedRows } (same shape as legacy).
 */
export function SelectTable({
  value,
  onChange,
  data = [],
  columns = [],
  rowKey = 'id',
  isMulti = true,
  loading = false,
  disabledFunc,
  searchFields = ['name', 'id'],
  pageSize = 8,
}) {
  const [keyword, setKeyword] = useState('');
  const selectedRowKeys = value?.selectedRowKeys || [];
  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return data;
    return data.filter((it) => searchFields.some((f) => String(it[f] ?? '').toLowerCase().includes(q)));
  }, [data, keyword, searchFields]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      <Input
        allowClear
        prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
        placeholder={t('Search')}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      <Table
        size="small"
        rowKey={rowKey}
        loading={loading}
        dataSource={filtered}
        columns={columns}
        pagination={{ pageSize, size: 'small', hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
        rowSelection={{
          type: isMulti ? 'checkbox' : 'radio',
          selectedRowKeys,
          getCheckboxProps: (record) => ({ disabled: disabledFunc ? disabledFunc(record) : false }),
          onChange: (keys, rows) => onChange?.({ selectedRowKeys: keys, selectedRows: rows }),
        }}
      />
      {isMulti ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('Selected')}: {selectedRowKeys.length}
        </Typography.Text>
      ) : null}
    </Space>
  );
}

/** Validator for select-table form fields (required) */
export const selectTableRequired = (label) => ({
  validator: (_, v) =>
    v?.selectedRowKeys?.length ? Promise.resolve() : Promise.reject(new Error(`${t('Please select')} ${label}`)),
});

/** JSON validator (legacy utils/validate jsonValidator) */
export const jsonRule = () => ({
  validator: (_, v) => {
    if (v === undefined || v === null || v === '') return Promise.resolve();
    try {
      JSON.parse(v);
      return Promise.resolve();
    } catch {
      return Promise.reject(new Error(t('Please enter JSON in the correct format!')));
    }
  },
});
