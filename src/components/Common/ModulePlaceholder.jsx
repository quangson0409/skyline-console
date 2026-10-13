import React from 'react';
import { Card, Tag, Typography, Button, Space, Breadcrumb } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { CloudSyncOutlined, ArrowLeftOutlined, ThunderboltOutlined, SettingOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

export default function ModulePlaceholder({ title, service, description }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={() => navigate('/base/overview')}>Skyline</a> },
          { title: service || 'OpenStack Service' },
          { title: title || location.pathname },
        ]}
      />

      <Card
        variant="borderless"
        style={{
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          borderRadius: 8,
          padding: '20px 8px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(0, 104, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: '#0068ff',
            fontSize: 26,
          }}
        >
          <CloudSyncOutlined />
        </div>

        <Title level={4} style={{ marginBottom: 8, fontWeight: 700 }}>
          {title || `Phân Hệ: ${location.pathname}`}
        </Title>

        <Paragraph style={{ color: '#64748b', maxWidth: 560, margin: '0 auto 16px' }}>
          {description ||
            `Module này đang được liên kết trong hệ thống điều hướng Skyline Console. Đường dẫn API endpoint của dịch vụ OpenStack: ${location.pathname}`}
        </Paragraph>

        <Space style={{ marginBottom: 24 }}>
          <Tag color="blue">OpenStack {service || 'Core Service'}</Tag>
          <Tag color="processing">Route: {location.pathname}</Tag>
          <Tag color="success">Menu Status: Mapped & Active</Tag>
        </Space>

        <div>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            style={{ borderRadius: 6 }}
          >
            Quay lại trang trước
          </Button>
        </div>
      </Card>
    </div>
  );
}
