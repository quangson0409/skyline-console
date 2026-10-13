import React from 'react';
import { Tag, Tooltip, Space, message, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import Status from '@/components/Status';
import { t } from '@/core/i18n';

const { Text } = Typography;

/** Pages whose path contains "-admin" are the administrator views (legacy convention) */
export const isAdminPathname = (pathname = '') => /-admin(\/|$)/.test(pathname);

export const useIsAdminPage = () => {
  const { pathname } = useLocation();
  return isAdminPathname(pathname);
};

export const formatTime = (value) => {
  if (!value) return '-';
  const str = String(value);
  // OpenStack timestamps may be naive (no Z): treat as UTC like legacy toLocalTime
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(str) ? str : `${str}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return str;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
};

export const formatSize = (bytes, digits = 2) => {
  if (bytes === undefined || bytes === null || bytes === '') return '-';
  const num = Number(bytes);
  if (Number.isNaN(num)) return String(bytes);
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let idx = 0;
  let val = num;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${idx === 0 ? val : val.toFixed(digits)} ${units[idx]}`;
};

export const yesNo = (value) => (value ? <Tag color="green">{t('Yes')}</Tag> : <Tag>{t('No')}</Tag>);

export const CopyText = ({ value, children, style }) => (
  <Space size={4} style={style}>
    <span>{children ?? value}</span>
    {value ? (
      <Tooltip title={t('Copy')}>
        <CopyOutlined
          style={{ cursor: 'pointer', color: '#94a3b8', fontSize: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard?.writeText(String(value));
            message.success(t('Copied'));
          }}
        />
      </Tooltip>
    ) : null}
  </Space>
);

/** Legacy "ID/Name" column: name (link to detail) + copyable id underneath */
export const nameColumn = ({ title, dataIndex = 'name', idIndex = 'id', linkTo, width } = {}) => ({
  title: title || t('ID/Name'),
  dataIndex,
  key: dataIndex,
  width,
  sorter: (a, b) => String(a[dataIndex] || '').localeCompare(String(b[dataIndex] || '')),
  render: (value, record) => {
    const id = record[idIndex];
    const display = value || (id ? String(id).substring(0, 8) : '-');
    const href = typeof linkTo === 'function' ? linkTo(record) : null;
    return (
      <div style={{ minWidth: 0 }}>
        {href ? (
          <Link to={href} style={{ fontWeight: 600 }}>
            {display}
          </Link>
        ) : (
          <span style={{ fontWeight: 600 }}>{display}</span>
        )}
        {id && id !== value ? (
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            <CopyText value={id} />
          </div>
        ) : null}
      </div>
    );
  },
});

export const statusColumn = ({ title, dataIndex = 'status', textMap } = {}) => ({
  title: title || t('Status'),
  dataIndex,
  key: dataIndex,
  render: (value) => {
    if (value === undefined || value === null || value === '') return '-';
    const text = textMap ? textMap[value] || textMap[String(value).toLowerCase()] : undefined;
    return <Status status={typeof value === 'boolean' ? value : String(value)} text={text} />;
  },
});

export const timeColumn = ({ title, dataIndex = 'created_at' } = {}) => ({
  title: title || t('Created At'),
  dataIndex,
  key: dataIndex,
  sorter: (a, b) => new Date(a[dataIndex] || 0) - new Date(b[dataIndex] || 0),
  render: (value) => <span style={{ color: '#64748b', fontSize: 12 }}>{formatTime(value)}</span>,
});

export const textColumn = (title, dataIndex, extra = {}) => ({
  title,
  dataIndex,
  key: Array.isArray(dataIndex) ? dataIndex.join('.') : dataIndex,
  render: (value) => (value === undefined || value === null || value === '' ? '-' : String(value)),
  ...extra,
});

export const boolColumn = (title, dataIndex) => ({
  title,
  dataIndex,
  key: dataIndex,
  render: (value) => yesNo(value),
});

export const tagsColumn = (title, dataIndex, color) => ({
  title,
  dataIndex,
  key: dataIndex,
  render: (value) => {
    const list = Array.isArray(value) ? value : value ? [value] : [];
    if (!list.length) return '-';
    return (
      <Space size={[4, 4]} wrap>
        {list.map((v) => (
          <Tag key={String(v)} color={color}>
            {String(v)}
          </Tag>
        ))}
      </Space>
    );
  },
});

export const projectColumn = (projectMap = {}, dataIndex = 'project_id') => ({
  title: t('Project'),
  dataIndex,
  key: dataIndex,
  render: (value, record) => {
    const pid = value || record.tenant_id;
    if (!pid) return '-';
    const name = projectMap[pid];
    return (
      <div>
        <span>{name || '-'}</span>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          <Text style={{ fontSize: 11, color: '#94a3b8' }}>{pid}</Text>
        </div>
      </div>
    );
  },
});

/** Standard batch/row delete action builder */
export const deleteAction = ({ name, onDelete, allowed, title }) => ({
  id: 'delete',
  type: 'confirm',
  title: title || `${t('Delete')} ${name}`,
  actionName: t('Delete'),
  isDanger: true,
  allowed,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await onDelete(it);
    }
  },
});

/** Normalizes key/value text ("a=1\nb=2") to object, used for metadata / extra specs forms */
export const parseKeyValues = (text = '') =>
  String(text)
    .split(/\n|,/)
    .map((l) => l.trim())
    .filter(Boolean)
    .reduce((acc, line) => {
      const idx = line.indexOf('=');
      if (idx > 0) acc[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      return acc;
    }, {});

export const stringifyKeyValues = (obj = {}) =>
  Object.entries(obj || {})
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n');
