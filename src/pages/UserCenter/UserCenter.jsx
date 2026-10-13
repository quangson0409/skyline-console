import React from 'react';
import { Avatar, Breadcrumb, Button, Card, Col, Descriptions, Row, Space } from 'antd';
import { KeyOutlined, LockOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { keystoneApi } from '@/api/keystone';
import { useResource } from '@/hooks/useResource';
import { t } from '@/core/i18n';
import { getProfile } from '@/pages/Identity/common';

/** legacy pages/user-center/containers/UserCenter: current user's profile */
export default function UserCenter() {
  const navigate = useNavigate();
  const { data: detail, loading } = useResource(
    async () => {
      const profile = await getProfile(true);
      const id = profile?.user?.id;
      if (!id) return profile?.user || {};
      try {
        return (await keystoneApi.getUser(id))?.user || profile.user;
      } catch {
        return profile.user;
      }
    },
    [],
    { initial: {} }
  );
  const d = detail || {};

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb items={[{ title: t('User Center') }]} style={{ marginBottom: 16, fontSize: 13 }} />
      <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>
        {t('User Center')}
      </h1>
      <Card variant="borderless" loading={loading} style={{ borderRadius: 8, marginBottom: 16 }}>
        <Row gutter={24} align="middle">
          <Col xs={24} md={4} style={{ textAlign: 'center', marginBottom: 16 }}>
            <Avatar size={96} icon={<UserOutlined />} style={{ background: '#0068ff' }} />
          </Col>
          <Col xs={24} md={20}>
            <Descriptions column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label={t('Username')}>{d.name || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('Email')}>{d.email || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('Phone')}>{d.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('Real Name')}>{d.real_name || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('User ID')}>{d.id || '-'}</Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>
      <Space wrap>
        <Button icon={<KeyOutlined />} onClick={() => navigate('/user/application-credentials')}>
          {t('Application Credentials')}
        </Button>
        <Button icon={<SafetyCertificateOutlined />} onClick={() => navigate('/user/totp')}>
          {t('Two-Factor Authentication')}
        </Button>
        <Button icon={<LockOutlined />} onClick={() => navigate('/user/change-password')}>
          {t('Update Password')}
        </Button>
      </Space>
    </div>
  );
}
