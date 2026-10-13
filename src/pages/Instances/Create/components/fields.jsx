import React from 'react';
import { Divider, Radio, Select, theme } from 'antd';
import { t } from '@/core/i18n';

const ANY = '__null__';

/** Legacy FormItem/Radio (button style) with isWrappedValue: value = { value, label } */
export function WrappedRadio({ value, onChange, options = [], wrapped = true, optionType = 'button', id }) {
  const current = wrapped ? value?.value : value;
  return (
    <Radio.Group
      id={id}
      value={current}
      optionType={optionType}
      buttonStyle="solid"
      onChange={(e) => {
        const v = e.target.value;
        onChange?.(wrapped ? options.find((it) => it.value === v) : v);
      }}
    >
      {options.map((it) => (
        <Radio key={String(it.value)} value={it.value} disabled={!!it.disabled}>
          {it.label}
        </Radio>
      ))}
    </Radio.Group>
  );
}

/** Legacy FormItem/Select with isWrappedValue (supports a `null` option value) */
export function WrappedSelect({ value, onChange, options = [], placeholder, style, id }) {
  const toInner = (v) => (v === null ? ANY : v);
  const current = value === undefined ? undefined : toInner(value?.value);
  return (
    <Select
      id={id}
      value={current}
      placeholder={placeholder}
      style={{ width: '100%', maxWidth: 480, ...style }}
      options={options.map((it) => ({ label: it.label, value: toInner(it.value) }))}
      onChange={(v) => onChange?.(options.find((it) => toInner(it.value) === v))}
    />
  );
}

/** Read-only form value (legacy type: 'label') */
export function LabelValue({ value, content }) {
  const { token } = theme.useToken();
  return <span style={{ color: token.colorText, lineHeight: '32px' }}>{content ?? value ?? '-'}</span>;
}

export const FormDivider = () => <Divider style={{ margin: '8px 0 24px' }} />;

/** select-table required rule (legacy Form: required select-table) */
export const selectTableRule = (label, required = true) => ({
  validator(_, value) {
    if (!required) return Promise.resolve();
    if (value?.selectedRowKeys?.length) return Promise.resolve();
    return Promise.reject(new Error(t('Please select {label}!', { label })));
  },
});

/** Fixed width label column (legacy labels never truncate), wrapper takes the rest */
export const formLayout = {
  labelCol: { flex: '0 0 190px' },
  wrapperCol: { flex: '1 1 0', style: { minWidth: 0 } },
  labelWrap: true,
  colon: false,
};

/** Vertical form on phones */
export const mobileFormLayout = { layout: 'vertical', colon: false };

export const narrowWrapper = { flex: '1 1 0', style: { minWidth: 0, maxWidth: 520 } };
export const tableWrapper = { flex: '1 1 0', style: { minWidth: 0, maxWidth: 1180 } };
export const textWrapper = { flex: '1 1 0', style: { minWidth: 0, maxWidth: 760 } };
