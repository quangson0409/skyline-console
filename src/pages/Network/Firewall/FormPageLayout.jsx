import React, { useEffect, useState } from 'react';
import { Breadcrumb, Button, Card, Col, Progress, Row, Space, Spin, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import { fetchNeutronQuotaItem, quotaExceeded } from './helpers';

const { Text } = Typography;

/** Neutron quota of one resource for the current project (legacy fetchNeutronQuota/getQuotaInfo) */
export function useNeutronQuota(key, enabled = true) {
  const projectId = useAuthStore((s) => s.currentProject?.id);
  const [quota, setQuota] = useState(null);
  useEffect(() => {
    let alive = true;
    if (enabled && projectId) {
      fetchNeutronQuotaItem(projectId, key).then((q) => alive && setQuota(q));
    }
    return () => {
      alive = false;
    };
  }, [key, enabled, projectId]);
  return { quota, exceeded: enabled && quotaExceeded(quota, 1) };
}

function QuotaCard({ title, quota }) {
  if (!quota) return null;
  const unlimited = quota.limit === -1;
  const percent = unlimited || !quota.limit ? 0 : Math.min(100, Math.round(((quota.used + 1) / quota.limit) * 100));
  return (
    <Card variant="borderless" title={t('Project Quota')} style={{ borderRadius: 8 }}>
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{title}</div>
      <Progress percent={percent} status={quotaExceeded(quota, 1) ? 'exception' : 'normal'} showInfo={false} />
      <Text type="secondary" style={{ fontSize: 12 }}>
        {t('Used')}: {quota.used} / {t('Add')}: 1 / {t('Quota')}: {unlimited ? t('Unlimited') : quota.limit}
      </Text>
    </Card>
  );
}

/** Full page form shell used by the legacy FormAction pages (Create Firewall, Rule, Policy) */
export default function FormPageLayout({
  title,
  breadcrumb = [],
  loading = false,
  submitting = false,
  disableSubmit = false,
  quota,
  quotaTitle,
  onSubmit,
  onCancel,
  children,
}) {
  const crumbs = breadcrumb.map((c) =>
    typeof c === 'object' && c.path ? { title: <Link to={c.path}>{c.title}</Link> } : { title: c }
  );
  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb items={[...crumbs, { title }]} style={{ marginBottom: 16, fontSize: 13 }} />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {title}
        </h1>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={quota ? 18 : 24}>
          <Card variant="borderless" style={{ borderRadius: 8 }}>
            <Spin spinning={loading}>{children}</Spin>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Space>
                <Button onClick={onCancel}>{t('Cancel')}</Button>
                <Button type="primary" loading={submitting} disabled={disableSubmit || loading} onClick={onSubmit}>
                  {t('Confirm')}
                </Button>
              </Space>
            </div>
          </Card>
        </Col>
        {quota ? (
          <Col xs={24} xl={6}>
            <QuotaCard title={quotaTitle} quota={quota} />
          </Col>
        ) : null}
      </Row>
    </div>
  );
}
