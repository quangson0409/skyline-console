import React from 'react';
import { Card, Progress, Row, Col, Space, Typography, Skeleton } from 'antd';
import { t } from '@/core/i18n';
import { useThemeStore, THEMES } from '@/store/themeStore';

const { Text } = Typography;

export default function QuotaChart({
  title,
  quotas = [],
  type = 'line', // 'line' | 'ring'
  loading = false,
  bordered = false,
  style = {},
}) {
  const { currentTheme } = useThemeStore();
  const isDark = currentTheme === THEMES.DARK_OPS;

  if (loading) {
    return (
      <Card style={{ marginBottom: 16, ...style }}>
        <Skeleton active />
      </Card>
    );
  }

  const getPercent = (used, limit) => {
    if (!limit || limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  };

  const getStrokeColor = (percent) => {
    if (percent >= 90) return '#ef4444';
    if (percent >= 70) return '#fa8c16';
    return '#0068ff';
  };

  return (
    <Card
      title={title || t('Quota')}
      bordered={bordered}
      style={{
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        borderRadius: 8,
        background: isDark ? '#141c2b' : '#ffffff',
        ...style,
      }}
    >
      {type === 'ring' ? (
        <Row gutter={[16, 16]} justify="space-around">
          {quotas.map((q, idx) => {
            const percent = getPercent(q.used, q.limit);
            const color = q.color || getStrokeColor(percent);

            return (
              <Col key={idx} xs={12} sm={8} md={6} style={{ textAlign: 'center' }}>
                <Progress
                  type="circle"
                  percent={percent}
                  strokeColor={color}
                  width={80}
                  format={(p) => <span style={{ fontWeight: 700, fontSize: 13 }}>{p}%</span>}
                />
                <div style={{ marginTop: 8, fontWeight: 600, fontSize: 13 }}>{q.name}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {q.used} / {q.limit === -1 ? t('Unlimited') : q.limit} {q.unit || ''}
                </div>
              </Col>
            );
          })}
        </Row>
      ) : (
        <div>
          {quotas.map((q, idx) => {
            const percent = getPercent(q.used, q.limit);
            const color = q.color || getStrokeColor(percent);

            return (
              <div key={idx} style={{ marginBottom: idx === quotas.length - 1 ? 0 : 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 13 }}>{q.name}</Text>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    <b>{q.used}</b> / {q.limit === -1 ? t('Unlimited') : q.limit} {q.unit || ''} ({percent}%)
                  </span>
                </div>
                <Progress percent={percent} strokeColor={color} size="small" />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
