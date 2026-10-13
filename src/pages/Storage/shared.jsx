import React, { useMemo, useState } from 'react';
import { Table, Input, Upload, Button, Checkbox, Space, Tooltip, Row, Col, Card, message } from 'antd';
import { SearchOutlined, UploadOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';
import { formatSize } from '@/components/ResourcePage';

/**
 * SelectTable - port of legacy form item type 'select-table'.
 * Used as a Form.Item child: receives value (array of row keys) / onChange.
 */
export function SelectTable({
  value,
  onChange,
  data = [],
  columns = [],
  rowKey = 'id',
  multiple = false,
  disabledFunc,
  searchKeys = ['name', 'id'],
  pageSize = 5,
}) {
  const [q, setQ] = useState('');
  const keys = Array.isArray(value) ? value : value ? [value] : [];
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter((it) => searchKeys.some((k) => String(it[k] ?? '').toLowerCase().includes(s)));
  }, [data, q, searchKeys]);
  const selected = data.filter((it) => keys.includes(it[rowKey]));

  return (
    <div>
      <Input
        allowClear
        size="small"
        prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
        placeholder={t('Search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: 240, marginBottom: 8 }}
      />
      <Table
        size="small"
        rowKey={rowKey}
        columns={columns}
        dataSource={list}
        pagination={{ pageSize, size: 'small', hideOnSinglePage: true }}
        rowSelection={{
          type: multiple ? 'checkbox' : 'radio',
          selectedRowKeys: keys,
          onChange: (k) => onChange?.(k),
          getCheckboxProps: (r) => ({ disabled: disabledFunc ? Boolean(disabledFunc(r)) : false }),
        }}
        onRow={(r) => ({
          onClick: () => {
            if (disabledFunc && disabledFunc(r)) return;
            const k = r[rowKey];
            if (multiple) onChange?.(keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k]);
            else onChange?.([k]);
          },
        })}
        scroll={{ x: true }}
      />
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
        {t('Selected')}: {selected.length ? selected.map((it) => it.name || it[rowKey]).join(', ') : '-'}
      </div>
    </div>
  );
}

/** Builds a form field rendering a SelectTable */
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
  render: () => <SelectTable {...tableProps} />,
});

/** File picker for forms (legacy form item type 'upload'): value is a File */
export function FileInput({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Upload
        maxCount={1}
        showUploadList={false}
        beforeUpload={(file) => {
          onChange?.(file);
          return false;
        }}
      >
        <Button icon={<UploadOutlined />}>{t('Select File')}</Button>
      </Upload>
      {value ? (
        <span style={{ fontSize: 12, color: '#334155' }}>
          {value.name} ({formatSize(value.size)})
        </span>
      ) : null}
    </div>
  );
}

/** Legacy "volume" label: name(type | sizeGiB) */
export const volumeLabel = (v = {}) => `${v.name || v.id}(${v.volume_type || '-'} | ${v.size}GiB)`;

export const downloadBlob = (blob, fileName) => {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(href), 1000);
};

export const downloadText = (fileName, content) =>
  downloadBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), fileName);

export const copyToClipboard = async (text) => {
  if (text == null) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(String(text));
      return true;
    } catch {
      // fall through to execCommand
    }
  }
  const ta = document.createElement('textarea');
  ta.value = String(text);
  Object.assign(ta.style, { position: 'fixed', top: '-9999px', left: '-9999px', opacity: '0' });
  document.body.appendChild(ta);
  try {
    ta.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
};

/** Checkbox embedded in a confirm dialog, writing to a mutable state object */
export function ConfirmCheckbox({ state, field, label, tip }) {
  const [checked, setChecked] = useState(state[field]);
  return (
    <Space size={6}>
      <Checkbox
        checked={checked}
        onChange={(e) => {
          state[field] = e.target.checked;
          setChecked(e.target.checked);
        }}
      >
        {label}
      </Checkbox>
      {tip ? (
        <Tooltip title={tip}>
          <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
        </Tooltip>
      ) : null}
    </Space>
  );
}

/** Key/value object rendered as lines (legacy specs column) */
export const renderSpecs = (value) => {
  if (value && typeof value === 'object' && Object.keys(value).length) {
    return Object.entries(value).map(([k, v]) => (
      <div key={k} style={{ fontSize: 12 }}>
        {k}={String(v)}
      </div>
    ));
  }
  return '-';
};

/** Metric card row reused by volume / snapshot list headers (kept from the original pages) */
export function MetricCards({ items }) {
  const span = Math.max(6, Math.floor(24 / items.length));
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      {items.map((it) => (
        <Col xs={12} sm={span} key={it.label}>
          <Card size="small" style={{ borderRadius: 8, borderColor: '#e2e8f0' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{it.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: it.color || '#0f172a', marginTop: 4 }}>
              {it.value}
              {it.unit ? <span style={{ fontSize: 14, fontWeight: 500 }}> {it.unit}</span> : null}
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}

export const notifyError = (err, fallback) => {
  message.error(err?.message || fallback || t('Operation failed'));
};
