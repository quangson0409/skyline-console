import React from 'react';
import { Button, Input, Space, Upload, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';

/** Reads a local file as text */
export const readFileText = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsText(file);
  });

/**
 * Port of legacy FormItem "textarea-from-file": a textarea that can be filled from a local file.
 * Controlled by antd Form.Item (value / onChange).
 *   buttonPosition: 'top' (button above the textarea) | 'bottom'
 *   buttonText / buttonProps: load button label and props (size, type, style...)
 *   textareaStyle / textareaProps: extra props of the textarea (e.g. monospace font)
 */
export default function TextareaFromFile({
  value,
  onChange,
  rows = 6,
  placeholder,
  accept,
  buttonPosition = 'top',
  buttonText,
  buttonProps = {},
  textareaStyle,
  textareaProps = {},
  readErrorMessage,
  id,
}) {
  const textarea = (
    <Input.TextArea
      id={id}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      style={textareaStyle}
      {...textareaProps}
    />
  );
  const button = (
    <Upload
      accept={accept}
      showUploadList={false}
      beforeUpload={(file) => {
        readFileText(file)
          .then((text) => onChange?.(text))
          .catch(() => {
            if (readErrorMessage) message.error(readErrorMessage);
          });
        return false;
      }}
    >
      <Button icon={<UploadOutlined />} {...buttonProps}>
        {buttonText || t('Load from local files')}
      </Button>
    </Upload>
  );
  if (buttonPosition === 'bottom') {
    return (
      <div>
        {textarea}
        {button}
      </div>
    );
  }
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {button}
      {textarea}
    </Space>
  );
}
