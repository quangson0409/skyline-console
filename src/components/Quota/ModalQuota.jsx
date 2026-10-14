import React from 'react';
import { Alert, Skeleton, theme } from 'antd';
import { DashboardOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';
import { QuotaLine } from './QuotaPanel';
import { quotaError } from './utils';

/**
 * Port of legacy ModalAction showQuota / quotaInfo + QuotaChart (modal right extra):
 * used / new / available per quota line, rendered above the action form.
 * The same QuotaLine as the create wizards' QuotaPanel.
 */
export default function ModalQuota({ quotas = [], loading = false, showError = true, id = 'action-modal-quota' }) {
  const { token } = theme.useToken();
  const lines = (quotas || []).filter(Boolean);
  const error = showError ? quotaError(lines) : '';
  return (
    <div
      id={id}
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        padding: '10px 14px 0',
        marginBottom: 16,
        background: token.colorFillQuaternary,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8, color: token.colorText }}>
        <DashboardOutlined style={{ marginRight: 6, color: token.colorPrimary }} />
        {t('Quota')}
      </div>
      {loading && !lines.length ? (
        <Skeleton active paragraph={{ rows: 2 }} style={{ paddingBottom: 12 }} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', columnGap: 20 }}>
          {lines.map((q) => (
            <QuotaLine key={q.name || q.title} quota={q} token={token} />
          ))}
        </div>
      )}
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} className="quota-exceeded" /> : null}
    </div>
  );
}
