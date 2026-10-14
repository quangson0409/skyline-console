import React from 'react';
import { Upload, Button } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';
import { formatSize } from '@/components/ResourcePage/helpers';

/** File picker for forms (legacy form item type 'upload'): value is a File */
export default function FileInput({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Upload
        maxCount={1}
        showUploadList={false}
        beforeUpload={(file) => {
          onChange?.(file);
          return false;
        }}
      >
        <Button icon={<UploadOutlined />}>{t('Select File')}</Button>
      </Upload>
      {value ? (
        <span style={{ fontSize: 12, color: '#334155' }}>
          {value.name} ({formatSize(value.size)})
        </span>
      ) : null}
    </div>
  );
}

