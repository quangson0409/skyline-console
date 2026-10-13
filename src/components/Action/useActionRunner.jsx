import React, { useState, useCallback } from 'react';
import { message } from 'antd';
import { t } from '@/core/i18n';
import ActionModal from './ActionModal';
import executeConfirmAction from './ConfirmAction';

/**
 * useActionRunner - Universal controller for OpenStack Skyline actions
 * Supports:
 * - 'custom' action (e.g. Console, external URL, custom dialog)
 * - 'confirm' action (e.g. Start, Stop, Reboot, Delete, Migrate)
 * - 'modal' action (e.g. AttachVolume, Resize, ChangePassword, CreateSnapshot)
 */
export function useActionRunner({ onRefresh } = {}) {
  const [modalConfig, setModalConfig] = useState({
    open: false,
    title: '',
    item: null,
    formItems: [],
    initialValues: {},
    action: null,
  });

  const closeModal = useCallback(() => {
    setModalConfig((prev) => ({ ...prev, open: false }));
  }, []);

  const handleAction = useCallback(
    async (action, target) => {
      if (!action) return;

      const isMultiple = Array.isArray(target);
      const item = isMultiple ? null : target;
      const items = isMultiple ? target : item ? [item] : [];

      // 1. Custom action
      if (action.type === 'custom' || typeof action.onExecute === 'function') {
        try {
          await (action.onExecute ? action.onExecute(item || items) : action.onClick?.(item || items));
        } catch (err) {
          message.error(err.message || t('Action execution failed'));
        }
        return;
      }

      // 2. Confirmation action
      if (action.type === 'confirm' || (!action.type && !action.getFormItems && !action.formItems)) {
        executeConfirmAction({
          action,
          item,
          items,
          onSuccess: async () => {
            message.success(t('Operation completed successfully'));
            if (onRefresh) onRefresh();
          },
          onError: (err) => {
            const msg = err.response?.data?.badRequest?.message || err.message || t('Operation failed');
            message.error(msg);
          },
        });
        return;
      }

      // 3. Modal action
      if (action.type === 'modal' || action.getFormItems || action.formItems) {
        try {
          let formItems = [];
          if (typeof action.getFormItems === 'function') {
            formItems = await action.getFormItems(item);
          } else if (Array.isArray(action.formItems)) {
            formItems = action.formItems;
          }

          const initialValues =
            typeof action.getDefaultValues === 'function'
              ? action.getDefaultValues(item)
              : action.defaultValue || {};

          setModalConfig({
            open: true,
            title: action.title || action.buttonText || t('Action'),
            description: action.description || '',
            item,
            formItems,
            initialValues,
            action,
          });
        } catch (err) {
          message.error(err.message || t('Failed to load action form'));
        }
      }
    },
    [onRefresh]
  );

  const actionModal = (
    <ActionModal
      open={modalConfig.open}
      title={modalConfig.title}
      description={modalConfig.description}
      item={modalConfig.item}
      formItems={modalConfig.formItems}
      initialValues={modalConfig.initialValues}
      onSubmit={async (values, item) => {
        if (modalConfig.action && typeof modalConfig.action.onSubmit === 'function') {
          return modalConfig.action.onSubmit(values, item);
        }
      }}
      onCancel={closeModal}
      onSuccess={() => {
        closeModal();
        if (onRefresh) onRefresh();
      }}
    />
  );

  return {
    handleAction,
    actionModal,
  };
}

export default useActionRunner;
