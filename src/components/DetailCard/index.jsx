import React from 'react';
import { Card, Descriptions, Typography, Tooltip, Space, Skeleton } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import Status from '@/components/Status';
import { t } from '@/core/i18n';
import { useThemeStore, THEMES } from '@/store/themeStore';

const { Text } = Typography;

export default function DetailCard({
  title,
  items = [],
  loading = false,
  column = { xs: 1, sm: 2, md: 3 },
  bordered = false,
  extra,
  style = {},
}) {
  const { currentTheme } = useThemeStore();
  const isDark = currentTheme === THEMES.DARK_OPS;

  if (loading) {
    return (
      <Card style={{ marginBottom: 16, ...style }}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    );
  }

  const renderValue = (item) => {
    const { value, copyable, isStatus, unit, render } = item;

    if (render) {
      return render(value);
    }

    if (isStatus) {
      return <Status status={value} />;
    }

    if (value === undefined || value === null || value === '') {
      return <Text type="secondary">-</Text>;
    }

    return (
      <Space>
        <span>
          {value} {unit ? <span style={{ color: '#64748b', fontSize: 12 }}>{unit}</span> : null}
        </span>
        {copyable && (
          <Tooltip title={t('Copy')}>
            <CopyOutlined
              style={{ color: '#0068ff', cursor: 'pointer', fontSize: 12 }}
              onClick={() => {
                navigator.clipboard.writeText(String(value));
              }}
            />
          </Tooltip>
        )}
      </Space>
    );
  };

  return (
    <Card
      title={title}
      extra={extra}
      bordered={bordered}
      style={{
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        borderRadius: 8,
        marginBottom: 16,
        background: isDark ? '#141c2b' : '#ffffff',
        ...style,
      }}
    >
      <Descriptions column={column} size="small">
        {items.map((item, idx) => (
          <Descriptions.Item key={idx} label={item.label}>
            {renderValue(item)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </Card>
  );
}
