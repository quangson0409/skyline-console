import React from 'react';
import { Card, Col, Row } from 'antd';

/**
 * Summary card rows shown above list pages.
 * MetricCards: { label, value, unit, color } (Storage / Share list headers)
 * KpiCards:    { title, value, suffix, color } (Compute list headers)
 * Both styles are kept as they were in their original modules.
 */

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

/** KPI summary cards kept from the first version of the Compute pages */
export const KpiCards = ({ items = [] }) => {
  const span = Math.max(6, Math.floor(24 / Math.max(items.length, 1)));
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      {items.map((it) => (
        <Col xs={24} sm={12} lg={span} key={it.title}>
          <Card size="small" variant="borderless" style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 700 }}>{it.title}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: it.color || '#0068ff' }}>
              {it.value}
              {it.suffix ? <span style={{ fontSize: 13, color: '#94a3b8' }}> {it.suffix}</span> : null}
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
};
