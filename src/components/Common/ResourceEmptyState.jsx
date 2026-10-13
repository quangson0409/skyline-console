import React from 'react';
import { Empty, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

export default function ResourceEmptyState({
  title = 'Không tìm thấy tài nguyên',
  description = 'Chưa có tài nguyên nào trong dự án này hoặc không khớp với bộ lọc tìm kiếm.',
  actionText = 'Tạo Tài Nguyên Mới',
  onAction,
}) {
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
