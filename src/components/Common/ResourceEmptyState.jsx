import React from 'react';
import { Empty, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useTranslation } from '@/core/i18n';

export default function ResourceEmptyState({
  title,
  description,
  actionText,
  onAction,
}) {
  const { t } = useTranslation();
  title = title ?? t('No resources found');
  description = description ?? t('There are no resources in this project yet, or none match the search filter.');
  actionText = actionText ?? t('Create New Resource');
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
              {title}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', maxWidth: 440, margin: '0 auto 16px' }}>
              {description}
            </div>
          </div>
        }
      >
        {onAction && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={onAction}
            style={{ backgroundColor: '#0068ff', borderRadius: 20, fontWeight: 600 }}
          >
            {actionText}
          </Button>
        )}
      </Empty>
    </div>
  );
}
