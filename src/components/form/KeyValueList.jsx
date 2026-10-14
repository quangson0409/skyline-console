import React from 'react';
import { Button, Input, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';

/**
 * Legacy add-select + KeyValueInput: list of { key, value } rows.
 * value: [{ key, value }]   onChange(next)
 */
export default function KeyValueList({ value, onChange, addText, keyPlaceholder, valuePlaceholder, separator = '=' }) {
  const list = Array.isArray(value) ? value : [];
  const update = (idx, patch) => onChange?.(list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {list.map((it, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            placeholder={keyPlaceholder || t('Key')}
            value={it.key}
            onChange={(e) => update(idx, { key: e.target.value })}
            style={{ flex: '1 1 160px', maxWidth: 280 }}
          />
          {separator ? <span>{separator}</span> : null}
          <Input
            placeholder={valuePlaceholder || t('Value')}
            value={it.value}
            onChange={(e) => update(idx, { value: e.target.value })}
            style={{ flex: '1 1 160px', maxWidth: 280 }}
          />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(list.filter((_, i) => i !== idx))} />
        </div>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange?.([...list, { key: '', value: '' }])}>
        {addText || t('Add')}
      </Button>
    </Space>
  );
}

/** Legacy keyValueValidator: every row needs key and value */
export const keyValueRule = () => ({
  validator: (_, value) =>
    (value || []).some((it) => !it?.key || !it?.value)
      ? Promise.reject(new Error(t('Please input key and value')))
      : Promise.resolve(),
});
