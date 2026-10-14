import React, { isValidElement } from 'react';
import { Button, Checkbox, Dropdown, Space, Tooltip, message } from 'antd';
import { DownloadOutlined, SettingOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';

/**
 * Legacy Tables/Base Download + CustomColumns:
 * - CSV export of the visible columns (current page or all rows);
 * - per-table visible-column selection persisted in localStorage.
 */

const columnKey = (col) =>
  String(col.key ?? (Array.isArray(col.dataIndex) ? col.dataIndex.join('.') : col.dataIndex) ?? '');

const getPath = (obj, path) => {
  if (path === undefined || path === null) return undefined;
  const parts = Array.isArray(path) ? path : String(path).split('.');
  return parts.reduce((acc, k) => (acc === undefined || acc === null ? undefined : acc[k]), obj);
};

const toText = (value) => {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join('\n');
  if (isValidElement(value)) return '';
  if (typeof value === 'object') {
    if ('name' in value && value.name) return String(value.name);
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
};

/** text of a cell: column.exportRender > plain render output > raw value */
const cellText = (col, record, index) => {
  const raw = getPath(record, col.dataIndex);
  if (typeof col.exportRender === 'function') return toText(col.exportRender(raw, record, index));
  if (typeof col.render === 'function') {
    try {
      const out = col.render(raw, record, index);
      if (typeof out === 'string' || typeof out === 'number') return String(out);
    } catch {
      // fall back to the raw value
    }
  }
  return toText(raw);
};

const titleText = (col) => {
  if (typeof col.title === 'string') return col.title;
  if (typeof col.exportTitle === 'string') return col.exportTitle;
  return columnKey(col);
};

const csvEscape = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const exportCsv = (columns, rows, filename) => {
  const base = columns.filter((c) => c.key !== 'action' && c.dataIndex !== 'action' && (c.dataIndex !== undefined || c.exportRender));
  // ID/Name columns export as two columns: ID, then Name (legacy download had both)
  const cols = base.flatMap((c) =>
    c.exportIdIndex
      ? [
          { title: 'ID', dataIndex: c.exportIdIndex },
          { title: t('Name'), dataIndex: c.dataIndex },
        ]
      : [c]
  );
  const lines = [cols.map((c) => csvEscape(titleText(c))).join(',')];
  rows.forEach((r, i) => lines.push(cols.map((c) => csvEscape(cellText(c, r, i))).join(',')));
  // BOM so Excel reads UTF-8 (Vietnamese) correctly
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const storageKey = (tableKey) => `skyline_hidden_columns:${tableKey}`;

/** stored choice, or the columns flagged `defaultHidden` (legacy columns hidden by default) */
export const loadHiddenColumns = (tableKey, columns = []) => {
  try {
    const raw = localStorage.getItem(storageKey(tableKey));
    if (raw !== null) return JSON.parse(raw) || [];
  } catch {
    // ignore
  }
  return columns.filter((c) => c && c.defaultHidden).map((c) => columnKey(c));
};

const saveHiddenColumns = (tableKey, keys) => {
  try {
    localStorage.setItem(storageKey(tableKey), JSON.stringify(keys));
  } catch {
    // ignore
  }
};

/** first column (ID/Name) and the action column are never hideable, like legacy */
export const isHideable = (col, index) =>
  col.hideable !== false && index !== 0 && col.key !== 'action' && col.dataIndex !== 'action';

export function TableTools({
  columns,
  hidden,
  onHiddenChange,
  tableKey,
  currentRows,
  allRows,
  resourceName,
  fetchAllRows, // server-side lists: async (onProgress) => { items, total, truncated } (legacy page-by-page download)
}) {
  const hideable = columns.map((c, i) => ({ col: c, i })).filter(({ col, i }) => isHideable(col, i));

  const download = (rows) => {
    if (!rows.length) {
      message.info(t('No data'));
      return;
    }
    const visible = columns.filter((c) => !hidden.includes(columnKey(c)));
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    exportCsv(visible, rows, `${(resourceName || 'data').replace(/[\\/:*?"<>|\s]+/g, '-')}-${stamp}.csv`);
  };

  // legacy Tables/Base/Download getDownloadDataForAll: fetch every page (100 per page, max 10000)
  const downloadAll = async () => {
    if (!fetchAllRows) {
      download(allRows);
      return;
    }
    const key = 'table-download-all';
    message.loading({ key, content: t('Downloading...'), duration: 0 });
    try {
      const { items, total, truncated, max } = await fetchAllRows(({ loaded, total: count }) => {
        message.loading({
          key,
          duration: 0,
          content: count ? `${t('Downloading...')} ${Math.min(loaded, count)}/${count}` : `${t('Downloading...')} ${loaded}`,
        });
      });
      message.destroy(key);
      if (truncated) {
        message.warning(
          t(
            'The total amount of data is { total }, and the interface can support downloading { totalMax } pieces of data. If you need to download all the data, please contact the administrator.',
            { total: total ?? `${items.length}+`, totalMax: max ?? items.length }
          )
        );
      }
      download(items);
    } catch (err) {
      message.destroy(key);
      message.error(err?.message || t('Download failed'));
    }
  };

  const columnMenu = {
    items: hideable.map(({ col }) => {
      const key = columnKey(col);
      return {
        key,
        label: (
          <Checkbox
            checked={!hidden.includes(key)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const next = e.target.checked ? hidden.filter((k) => k !== key) : [...hidden, key];
              saveHiddenColumns(tableKey, next);
              onHiddenChange(next);
            }}
          >
            {typeof col.title === 'string' ? col.title : key}
          </Checkbox>
        ),
      };
    }),
  };

  return (
    <Space size={8}>
      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            { key: 'page', label: t('Download Current Page'), onClick: () => download(currentRows) },
            { key: 'all', label: t('Download All Data'), onClick: downloadAll },
          ],
        }}
      >
        <Tooltip title={t('Download')}>
          <Button icon={<DownloadOutlined />} style={{ borderRadius: 6 }} />
        </Tooltip>
      </Dropdown>
      {hideable.length > 0 && (
        <Dropdown trigger={['click']} menu={columnMenu}>
          <Tooltip title={t('Custom Columns')}>
            <Button icon={<SettingOutlined />} style={{ borderRadius: 6 }} />
          </Tooltip>
        </Dropdown>
      )}
    </Space>
  );
}

export { columnKey };
