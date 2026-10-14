import React, { useState } from 'react';
import { Checkbox, Space, Tooltip, message } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';

/* Shared building blocks moved to src/components (re-exported for existing imports) */
export { KeysSelectTable as SelectTable, selectTableField } from '@/components/SelectTable';
export { default as FileInput } from '@/components/form/FileInput';
export { MetricCards } from '@/components/MetricCards';

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

export const notifyError = (err, fallback) => {
  message.error(err?.message || fallback || t('Operation failed'));
};
