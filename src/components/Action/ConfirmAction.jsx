import React from 'react';
import { Modal } from 'antd';
import { ExclamationCircleFilled, QuestionCircleFilled } from '@ant-design/icons';
import { t } from '@/core/i18n';

/**
 * Executes a ConfirmAction according to OpenStack Skyline legacy specifications.
 * Supports:
 * - action.title / action.buttonText
 * - action.actionName
 * - action.isDanger
 * - action.confirmText or default template
 * - action.onSubmit(item)
 */
export function executeConfirmAction({
  action,
  item,
  items = [],
  onSuccess,
  onError,
}) {
  const isMultiple = items && items.length > 0;
  const targetItems = isMultiple ? items : item ? [item] : [];
  const targetNames = targetItems.map((it) => it.name || it.id).join(', ');

  const title =
    (typeof action.title === 'function' ? action.title() : action.title) ||
    (typeof action.buttonText === 'function' ? action.buttonText() : action.buttonText) ||
    t('Confirm Operation');

  const actionName =
    (typeof action.actionName === 'function' ? action.actionName() : action.actionName) ||
    (typeof action.buttonText === 'function' ? action.buttonText() : action.buttonText) ||
    t('operate');

  let content = action.confirmText;
  if (!content) {
    if (isMultiple) {
      content = t('Are you sure to {action} {count} items: {names}?', {
        action: actionName,
        count: targetItems.length,
        names: targetNames,
      });
    } else {
      content = t('Are you sure to {action} "{name}"?', {
        action: actionName,
        name: targetNames || t('item'),
      });
    }
  }

  const isDanger = Boolean(action.isDanger || action.danger);

  return Modal.confirm({
    title,
    content,
    icon: isDanger ? (
      <ExclamationCircleFilled style={{ color: '#ef4444' }} />
    ) : (
      <QuestionCircleFilled style={{ color: '#0068ff' }} />
    ),
    okText: isDanger ? t('Delete') : t('Confirm'),
    okType: isDanger ? 'danger' : 'primary',
    cancelText: t('Cancel'),
    autoFocusButton: isDanger ? 'cancel' : 'ok',
    onOk: async () => {
      try {
        if (typeof action.onSubmit === 'function') {
          const result = await action.onSubmit(isMultiple ? items : item);
          if (onSuccess) onSuccess(result);
          return result;
        }
      } catch (err) {
        if (onError) onError(err);
        throw err;
      }
    },
  });
}

export default executeConfirmAction;
