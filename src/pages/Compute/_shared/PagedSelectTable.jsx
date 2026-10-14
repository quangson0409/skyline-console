import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, Space, Table, Tooltip, theme } from 'antd';
import { LeftOutlined, ReloadOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';

/**
 * Select table paged on the backend (legacy FormItem select-table with `backendPageStore`):
 * marker paging with Previous / Next, a backend name search, single or multi selection.
 *
 *   fetchPage({ limit, marker, filters }) -> { items, hasNext?, marker? } | array
 *   value: array of selected keys (same shape as KeysSelectTable / selectTableField)
 *   onRowsChange(rows): selected row objects (kept across pages)
 */
export default function PagedSelectTable({
  value,
  onChange,
  fetchPage,
  columns = [],
  rowKey = 'id',
  multiple = false,
  disabledFunc,
  pageSize = 10,
  searchKey = 'name',
  searchPlaceholder,
  onRowsChange,
  deps = [],
}) {
  const { token } = theme.useToken();
  const keys = Array.isArray(value) ? value : value ? [value] : [];
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const markers = useRef([undefined]);
  const rowsRef = useRef({});
  const reqRef = useRef(0);

  const load = useCallback(
    async (targetPage) => {
      const id = ++reqRef.current;
      setLoading(true);
      try {
        const filters = search ? { [searchKey]: search } : {};
        const res = await fetchPage({ limit: pageSize, marker: markers.current[targetPage - 1], filters });
        if (id !== reqRef.current) return;
        const list = Array.isArray(res) ? res : res?.items || [];
        const next =
          !Array.isArray(res) && typeof res?.hasNext === 'boolean' ? res.hasNext && list.length > 0 : list.length >= pageSize;
        const last = list[list.length - 1];
        markers.current[targetPage] = !Array.isArray(res) && res?.marker ? res.marker : last?.[rowKey];
        list.forEach((it) => {
          rowsRef.current[it[rowKey]] = it;
        });
        setItems(list);
        setHasNext(next);
        setPage(targetPage);
      } catch {
        if (id === reqRef.current) {
          setItems([]);
          setHasNext(false);
        }
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchPage, pageSize, search, searchKey, rowKey, ...deps]
  );

  useEffect(() => {
    markers.current = [undefined];
    load(1);
  }, [load]);

  const emit = (nextKeys) => {
    onChange?.(nextKeys);
    onRowsChange?.(nextKeys.map((k) => rowsRef.current[k]).filter(Boolean));
  };

  const toggle = (record) => {
    if (disabledFunc && disabledFunc(record)) return;
    const key = record[rowKey];
    if (!multiple) {
      emit([key]);
      return;
    }
    emit(keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]);
  };

  const selectedNames = keys.map((k) => rowsRef.current[k]?.name || k);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <Input.Search
          allowClear
          prefix={<SearchOutlined style={{ color: token.colorTextQuaternary }} />}
          placeholder={searchPlaceholder || t('Name')}
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            if (!e.target.value) setSearch('');
          }}
          onSearch={(v) => setSearch(String(v || '').trim())}
          style={{ width: 'min(100%, 320px)' }}
        />
        <Tooltip title={t('Refresh')}>
          <Button icon={<ReloadOutlined />} onClick={() => load(page)} />
        </Tooltip>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <Table
          size="small"
          rowKey={rowKey}
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          rowSelection={{
            type: multiple ? 'checkbox' : 'radio',
            selectedRowKeys: keys,
            preserveSelectedRowKeys: true,
            getCheckboxProps: (record) => ({ disabled: disabledFunc ? !!disabledFunc(record) : false }),
            onChange: (nextKeys) => emit(nextKeys),
          }}
          onRow={(record) => ({
            onClick: () => toggle(record),
            style: { cursor: disabledFunc && disabledFunc(record) ? 'not-allowed' : 'pointer' },
          })}
          style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>
          {t('Selected')}: {selectedNames.length ? selectedNames.join(', ') : '-'}
        </span>
        <Space size={4}>
          <Button size="small" icon={<LeftOutlined />} disabled={page <= 1 || loading} onClick={() => load(page - 1)} />
          <span style={{ fontSize: 12, minWidth: 24, textAlign: 'center' }}>{page}</span>
          <Button size="small" icon={<RightOutlined />} disabled={!hasNext || loading} onClick={() => load(page + 1)} />
        </Space>
      </div>
    </div>
  );
}

/** ActionModal form field rendering a PagedSelectTable (value = key array) */
export const pagedSelectTableField = ({ name, label, required, tip, rules = [], visible, ...tableProps }) => ({
  name,
  label,
  tip,
  visible,
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
  render: () => <PagedSelectTable {...tableProps} />,
});
