import React, { useState } from 'react';
import { Button, Card, Skeleton, Tooltip, theme } from 'antd';
import { DashboardOutlined, UpOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';

const fmt = (n) => (typeof n === 'number' ? parseFloat(n.toFixed(2)) : n);

function QuotaLine({ quota, token }) {
  const { title, used = 0, add = 0, limit = 0, reserved = 0 } = quota;
  const unlimited = limit === -1;
  const usedAll = used + (reserved || 0);
  const total = unlimited ? Math.max(usedAll + add, 1) : Math.max(limit, 1);
  const usedPct = Math.min(100, (usedAll / total) * 100);
  const addPct = Math.max(0, Math.min(100 - usedPct, (add / total) * 100));
  const over = !unlimited && usedAll + add > limit;
  const left = unlimited ? -1 : limit - usedAll;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, color: token.colorText }}>{title}</span>
        <span style={{ color: token.colorTextSecondary }}>
          {fmt(usedAll)} / {unlimited ? t('Unlimit') : fmt(limit)}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          background: token.colorFillSecondary,
        }}
      >
        <div style={{ width: `${usedPct}%`, background: token.colorPrimary }} />
        <div style={{ width: `${addPct}%`, background: over ? token.colorError : token.colorSuccess }} />
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 12, marginTop: 4, color: token.colorTextSecondary, flexWrap: 'wrap' }}>
        <span>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: token.colorPrimary, marginRight: 4 }} />
          {t('Used')}: {fmt(usedAll)}
        </span>
        <span>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 2,
              background: over ? token.colorError : token.colorSuccess,
              marginRight: 4,
            }}
          />
          {t('New')}: {fmt(add)}
        </span>
        <span>
          {t('Available')}: {unlimited ? t('Unlimit') : fmt(left)}
        </span>
      </div>
    </div>
  );
}

/** Port of legacy StepForm.renderRightTopExtra (InfoButton + QuotaChart, collapsible) */
export default function QuotaPanel({ quotas = [], loading = false }) {
  const { token } = theme.useToken();
  const [collapsed, setCollapsed] = useState(false);
  if (collapsed) {
    return (
      <Tooltip title={t('Quota')} placement="left">
        <Button
          shape="circle"
          size="large"
          icon={<DashboardOutlined />}
          onClick={() => setCollapsed(false)}
          style={{ boxShadow: token.boxShadowSecondary }}
          id="instance-create-quota-toggle"
        />
      </Tooltip>
    );
  }
  return (
    <Card
      size="small"
      title={
        <span>
          <DashboardOutlined style={{ marginRight: 6, color: token.colorPrimary }} />
          {t('Quota')}
        </span>
      }
      extra={<Button type="text" size="small" icon={<UpOutlined />} onClick={() => setCollapsed(true)} />}
      style={{ width: 280, boxShadow: token.boxShadowSecondary }}
      id="instance-create-quota"
    >
      {loading || !quotas.length ? <Skeleton active paragraph={{ rows: 4 }} /> : quotas.map((q) => <QuotaLine key={q.name} quota={q} token={token} />)}
    </Card>
  );
}
