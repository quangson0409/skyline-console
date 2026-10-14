import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Radio,
  Checkbox,
  Switch,
  Slider,
  Alert,
  Spin,
  Space,
  Button,
  message,
} from 'antd';
import { useTranslation } from '@/core/i18n';
import { getErrorMessage } from '@/hooks/useResource';
import ModalQuota from '@/components/Quota/ModalQuota';
import { quotaError } from '@/components/Quota/utils';

/**
 * ActionModal - Generic UI Adapter for OpenStack ModalActions (Ant Design 5)
 * Pure presentation adapter: Renders form according to legacy action schemas
 * WITHOUT altering any submit payload, field names, or validation rules.
 */
export default function ActionModal({
  open = false,
  title,
  description,
  item = {},
  formItems = [],
  initialValues = {},
  onSubmit,
  onCancel,
  onSuccess,
  width = 680,
  okText,
  cancelText,
  confirmLoading = false,
  quota,
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  /*
   * Legacy ModalAction showQuota / quotaInfo / disableSubmit:
   * `quota(item, values, cache)` returns [{ name, title, used, add, limit, reserved }] (see
   * components/Quota/utils quotaItem / withQuota). The chart is shown above the form, recomputed on
   * every form change, and OK is blocked while a line does not fit.
   */
  const [quotaState, setQuotaState] = useState({ loading: false, items: [] });
  const quotaCache = useRef({});
  const quotaSeq = useRef(0);
  const quotaTimer = useRef(null);
  const watchedValues = Form.useWatch((values) => values, { form, preserve: true });

  const computeQuota = useCallback(
    async (values) => {
      if (typeof quota !== 'function') return [];
      const seq = ++quotaSeq.current;
      setQuotaState((prev) => ({ ...prev, loading: true }));
      let items = [];
      try {
        items = (await quota(item, { ...(initialValues || {}), ...(values || {}) }, quotaCache.current)) || [];
      } catch {
        items = [];
      }
      if (seq === quotaSeq.current) setQuotaState({ loading: false, items: items.filter(Boolean) });
      return items;
    },
    [quota, item, initialValues]
  );

  useEffect(() => {
    if (!open || typeof quota !== 'function') {
      setQuotaState({ loading: false, items: [] });
      return;
    }
    quotaCache.current = {};
    setQuotaState({ loading: true, items: [] });
    computeQuota(initialValues || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quota]);

  useEffect(() => {
    if (!open || typeof quota !== 'function' || !watchedValues) return undefined;
    clearTimeout(quotaTimer.current);
    quotaTimer.current = setTimeout(() => computeQuota(form.getFieldsValue(true)), 250);
    return () => clearTimeout(quotaTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues]);

  const quotaMessage = typeof quota === 'function' ? quotaError(quotaState.items) : '';

  useEffect(() => {
    if (open) {
      form.resetFields();
      if (initialValues) {
        form.setFieldsValue(initialValues);
      }
    }
  }, [open, initialValues, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (typeof quota === 'function') {
        const fresh = await computeQuota(form.getFieldsValue(true));
        const msg = quotaError(fresh);
        if (msg) {
          message.error(msg);
          return;
        }
      }
      setSubmitting(true);
      if (onSubmit) {
        const result = await onSubmit(values, item);
        message.success(t('Operation completed successfully'));
        if (onSuccess) onSuccess(result);
        if (onCancel) onCancel();
      }
    } catch (err) {
      if (err.errorFields) {
        // Validation failed in form
        return;
      }
      message.error(getErrorMessage(err, t('Operation failed')));
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field) => {
    const { type, name, label, options, placeholder, min, max, step, disabled, tip, rows, mode } = field;

    if (typeof field.render === 'function') {
      return field.render({ form, item, field });
    }

    switch (type) {
      case 'label':
      case 'text-display':
        return (
          <div style={{ padding: '6px 0', fontWeight: 600, color: '#0f172a' }}>
            {initialValues[name] || item[name] || '-'}
          </div>
        );

      case 'textarea':
        return (
          <Input.TextArea
            rows={rows || 4}
            placeholder={placeholder}
            disabled={disabled}
            variant="outlined"
          />
        );

      case 'number':
      case 'input-number':
        return (
          <InputNumber
            min={min ?? 0}
            max={max}
            step={step || 1}
            style={{ width: '100%' }}
            placeholder={placeholder}
            disabled={disabled}
          />
        );

      case 'select':
        return (
          <Select
            placeholder={placeholder || t('Please select')}
            options={options}
            disabled={disabled}
            mode={mode}
            allowClear
            showSearch
            filterOption={(input, opt) =>
              (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        );

      case 'tags':
        return <Select mode="tags" placeholder={placeholder} options={options} disabled={disabled} tokenSeparators={[',']} />;

      case 'radio':
        return <Radio.Group options={options} disabled={disabled} />;

      case 'checkbox':
        return <Checkbox disabled={disabled}>{label}</Checkbox>;

      case 'switch':
        return <Switch disabled={disabled} />;

      case 'slider':
        return <Slider min={min ?? 0} max={max ?? 100} step={step ?? 1} disabled={disabled} />;

      case 'password':
        return <Input.Password placeholder={placeholder} disabled={disabled} />;

      case 'input':
      default:
        return <Input placeholder={placeholder} disabled={disabled} />;
    }
  };

  const renderFormItem = (field) => {
    const rules = [];
    if (field.required) {
      rules.push({ required: true, message: `${t('Please enter/select')} ${field.label}!` });
    }
    if (field.rules) {
      rules.push(...field.rules);
    }

    return (
      <Form.Item
        key={field.name}
        name={field.name}
        label={field.type === 'checkbox' ? undefined : field.label}
        rules={rules}
        dependencies={field.dependencies}
        extra={field.tip || field.extra}
        valuePropName={field.type === 'switch' ? 'checked' : field.type === 'checkbox' ? 'checked' : 'value'}
      >
        {renderField(field)}
      </Form.Item>
    );
  };

  return (
    <Modal
      title={title || t('Action')}
      open={open}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText={okText || t('Confirm')}
      cancelText={cancelText || t('Cancel')}
      confirmLoading={submitting || confirmLoading}
      okButtonProps={quotaMessage ? { disabled: true, title: quotaMessage } : undefined}
      destroyOnHidden
      width={width}
      maskClosable={false}
    >
      {description && (
        <Alert
          message={
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{t('Vendor action description (OpenStack)')}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#334155' }}>{description}</div>
            </div>
          }
          type="info"
          showIcon
          style={{
            marginTop: 12,
            marginBottom: 16,
            borderRadius: 8,
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
          }}
        />
      )}

      {typeof quota === 'function' && (quotaState.loading || quotaState.items.length) ? (
        <div style={{ marginTop: description ? 0 : 12 }}>
          <ModalQuota quotas={quotaState.items} loading={quotaState.loading} />
        </div>
      ) : null}

      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        style={{ marginTop: description ? 8 : 16 }}
      >
        {formItems.map((field) => {
          if (!field) return null;

          if (field.type === 'alert') {
            const alertNode = (
              <Alert
                key={field.name || 'alert'}
                message={field.message || field.label}
                type={field.alertType || 'info'}
                showIcon
                style={{ marginBottom: 16 }}
              />
            );
            if (field.hidden === true) return null;
            if (typeof field.visible === 'function') {
              return (
                <Form.Item key={`${field.name || 'alert'}-cond`} noStyle shouldUpdate>
                  {({ getFieldsValue }) => (field.visible({ ...initialValues, ...getFieldsValue(true) }) ? alertNode : null)}
                </Form.Item>
              );
            }
            return alertNode;
          }

          if (field.hidden === true) {
            return null;
          }

          // Conditional field: visible(values) re-evaluated on every form change
          if (typeof field.visible === 'function') {
            const { visible, ...rest } = field;
            return (
              <Form.Item key={`${field.name}-cond`} noStyle shouldUpdate>
                {({ getFieldsValue }) =>
                  visible({ ...initialValues, ...getFieldsValue(true) }) ? renderFormItem(rest) : null
                }
              </Form.Item>
            );
          }

          return renderFormItem(field);
        })}
      </Form>
    </Modal>
  );
}
