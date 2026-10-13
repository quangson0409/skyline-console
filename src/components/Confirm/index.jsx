import React from 'react';
import { Modal } from 'antd';
import { ExclamationCircleFilled, DeleteOutlined, QuestionCircleFilled } from '@ant-design/icons';
import { t } from '@/core/i18n';

/**
 * Standard confirmation modal matching Skyline Console
 */
export const confirm = ({
  title,
  content,
  onOk,
  onCancel,
  okText,
  cancelText,
  isDelete = false,
  okType,
  icon,
}) => {
  return Modal.confirm({
    title: title || t('Confirm'),
    content,
    icon: icon || (isDelete ? <ExclamationCircleFilled style={{ color: '#ef4444' }} /> : <QuestionCircleFilled style={{ color: '#0068ff' }} />),
    okText: okText || (isDelete ? t('Delete') : t('OK')),
    okType: okType || (isDelete ? 'danger' : 'primary'),
    cancelText: cancelText || t('Cancel'),
    autoFocusButton: isDelete ? 'cancel' : 'ok',
    onOk,
    onCancel,
  });
};

export default confirm;
