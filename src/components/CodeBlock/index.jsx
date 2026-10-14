import React from 'react';
import { Button, Space, Typography, message } from 'antd';
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';

/* Read-only code / payload blocks shared by detail pages */

const saveText = (text, filename) => {
  const url = URL.createObjectURL(new Blob([text || ''], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Pretty JSON block (legacy <pre>{JSON.stringify(x, null, 4)}</pre>) */
export const JsonBlock = ({ value, maxHeight = 480 }) => (
  <pre
    style={{
      margin: 0,
      padding: 12,
      maxHeight,
      overflow: 'auto',
      fontSize: 12,
      lineHeight: 1.5,
      background: 'rgba(148,163,184,0.12)',
      borderRadius: 8,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    }}
  >
    {typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 4)}
  </pre>
);

/** <pre> payload viewer with copy & download (legacy contentCard with copyable) */
export function PayloadViewer({ value, filename, error }) {
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>;
  if (value === undefined || value === null || value === '') return <Typography.Text type="secondary">-</Typography.Text>;
  return (
    <div>
      <Space style={{ marginBottom: 8 }}>
        <Button
          size="small"
          icon={<CopyOutlined />}
          onClick={() => {
            navigator.clipboard?.writeText(String(value));
            message.success(t('Copied'));
          }}
        >
          {t('Copy')}
        </Button>
        {filename ? (
          <Button size="small" icon={<DownloadOutlined />} onClick={() => saveText(String(value), filename)}>
            {t('Download')}
          </Button>
        ) : null}
      </Space>
      <pre
        style={{
          margin: 0,
          padding: 12,
          maxHeight: 420,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontSize: 12,
          background: 'rgba(148,163,184,0.12)',
          borderRadius: 6,
        }}
      >
        {String(value)}
      </pre>
    </div>
  );
}
