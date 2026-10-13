import React, { useState, useEffect } from 'react';
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
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

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
      message.error(err.message || t('Operation failed'));
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

      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        style={{ marginTop: description ? 8 : 16 }}
      >
        {formItems.map((field) => {
          if (!field) return null;

          if (field.type === 'alert') {
            return (
              <Alert
                key={field.name || 'alert'}
                message={field.message || field.label}
                type={field.alertType || 'info'}
                showIcon
                style={{ marginBottom: 16 }}
              />
            );
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
