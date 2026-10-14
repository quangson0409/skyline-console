import React, { useEffect, useState } from 'react';
import { Alert, Breadcrumb, Button, Card, Col, Row, Space, Spin } from 'antd';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import QuotaPanel from '@/components/Quota/QuotaPanel';
import { quotaItem, quotaError } from '@/components/Quota/utils';
import { fetchNeutronQuotaItem, quotaExceeded } from './helpers';

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

/** Legacy FormAction right-top quota chart (shared QuotaPanel: used / new / available) */
function QuotaCard({ title, quota }) {
  if (!quota) return null;
  const lines = [quotaItem({ limit: quota.limit, used: quota.used, reserved: 0 }, { name: 'quota', title, add: 1 })];
  const error = quotaError(lines);
  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <QuotaPanel quotas={lines} />
      {error ? <Alert type="error" showIcon message={error} style={{ maxWidth: 280 }} /> : null}
    </Space>
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
