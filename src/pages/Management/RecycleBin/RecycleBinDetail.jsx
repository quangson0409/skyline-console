import React, { Suspense, lazy } from 'react';
import { Breadcrumb, Button, Card, Space, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useActionRunner from '@/components/Action/useActionRunner';
import { useIsAdminPage } from '@/components/ResourcePage';
import { useTranslation } from '@/core/i18n';
import { recoverAction, forceDeleteAction } from './RecycleBinList';

const InstanceDetail = lazy(() => import('@/pages/Instances/InstanceDetail'));

/**
 * Legacy recycle bin detail route reused the instance detail page
 * (management/recycle-bin[-admin]/detail/:id). A recycle bin bar (back, recover, delete)
 * is shown above the shared instance detail.
 */
export default function RecycleBinDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const isAdmin = useIsAdminPage();
  const listUrl = isAdmin ? '/management/recycle-bin-admin' : '/management/recycle-bin';
  const { handleAction, actionModal } = useActionRunner({ onRefresh: () => navigate(listUrl) });
  const item = { id, name: id };

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb
        style={{ marginBottom: 12, fontSize: 13 }}
        items={[{ title: t('Maintenance') }, { title: <Link to={listUrl}>{t('Recycle Bin')}</Link> }, { title: t('Instance Detail') }]}
      />
      <Card variant="borderless" style={{ borderRadius: 8, marginBottom: 16 }} styles={{ body: { padding: '12px 20px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(listUrl)} />
            <h1 className="page-title" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              {t('Recycle Bin')}: {t('Instance Detail')}
            </h1>
          </Space>
          <Space>
            <Button type="primary" onClick={() => handleAction(recoverAction(), item)}>
              {t('Recover')}
            </Button>
            <Button danger onClick={() => handleAction(forceDeleteAction(), item)}>
              {t('Delete')}
            </Button>
          </Space>
        </div>
      </Card>
      <Suspense fallback={<Spin />}>
        <InstanceDetail />
      </Suspense>
      {actionModal}
    </div>
  );
}
