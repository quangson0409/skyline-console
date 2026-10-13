import React, { useEffect } from 'react';
import { Checkbox, Col, InputNumber, Row, Select, theme } from 'antd';
import { t } from '@/core/i18n';

/**
 * Port of legacy components/FormItem/InstanceVolume: volume type select, size (GiB) input and
 * "Delete with the instance" checkbox. value = { type, size, deleteType, typeOption, deleteTypeLabel }.
 */
export const buildVolumeValue = (next, options = []) => ({
  ...next,
  deleteTypeLabel: next.deleteType === 1 ? t('Delete with the instance') : t('Do not delete with the instance'),
  typeOption: options.find((it) => it.value === next.type),
});

export default function InstanceVolume({ value = {}, onChange, options = [], minSize = 0, showDelete = true, status }) {
  const { token } = theme.useToken();
  const { type, size, deleteType } = value || {};

  // legacy componentDidMount -> onChange (fills typeOption / deleteTypeLabel)
  useEffect(() => {
    onChange?.(buildVolumeValue({ type, size, deleteType }, options));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const emit = (patch) => onChange?.(buildVolumeValue({ type, size, deleteType, ...patch }, options));
  const label = { marginRight: 8, color: token.colorTextSecondary, whiteSpace: 'nowrap' };

  return (
    <Row gutter={[24, 8]} align="middle">
      <Col xs={24} md={9} style={{ display: 'flex', alignItems: 'center' }}>
        <span style={label}>{t('Type')}</span>
        <Select
          value={type}
          options={options.map(({ label: l, value: v }) => ({ label: l, value: v }))}
          onChange={(v) => emit({ type: v })}
          placeholder={t('Please select type')}
          status={status === 'error' && !type ? 'error' : undefined}
          style={{ flex: 1, minWidth: 140 }}
        />
      </Col>
      <Col xs={24} md={15} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={label}>{t('Size')}</span>
        <InputNumber
          value={size}
          min={minSize}
          precision={0}
          onChange={(v) => emit({ size: v })}
          style={{ width: 120 }}
        />
        <span style={{ color: token.colorTextSecondary }}>GiB</span>
        {showDelete ? (
          <Checkbox checked={deleteType === 1} onChange={() => emit({ deleteType: 1 - (deleteType || 0) })} style={{ marginLeft: 8 }}>
            {t('Delete with the instance')}
          </Checkbox>
        ) : null}
      </Col>
    </Row>
  );
}
