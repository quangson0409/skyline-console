import React, { useState } from 'react';
import { Badge, Form, Grid, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import WizardShell, { listCrumb } from '@/pages/Instances/Create/components/WizardShell';
import { formLayout, mobileFormLayout } from '@/pages/Instances/Create/components/fields';
import { getErrorMessage } from '@/hooks/useResource';
import { t } from '@/core/i18n';

/**
 * Legacy StepAction (components/StepForm) on top of WizardShell.
 * One antd Form holds every step (inactive steps stay mounted but hidden) so values survive
 * navigation; "Next" validates only the fields of the current step.
 *   steps: [{ title, fields: [names] | (values) => [names], content: node }]
 */
export default function StepWizard({
  title,
  breadcrumb,
  listPath,
  listTitle,
  form,
  initialValues,
  steps,
  onValuesChange,
  onSubmit,
  quota,
  errorMsg,
  loading,
}) {
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const fieldsOf = (idx) => {
    const f = steps[idx]?.fields;
    return typeof f === 'function' ? f(form.getFieldsValue(true)) : f || [];
  };

  const next = async () => {
    try {
      await form.validateFields(fieldsOf(current));
      setCurrent((c) => Math.min(c + 1, steps.length - 1));
    } catch {
      // validation errors are shown inline
    }
  };

  const onOk = async () => {
    for (let i = 0; i < steps.length; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await form.validateFields(fieldsOf(i));
      } catch {
        setCurrent(i);
        return;
      }
    }
    setSubmitting(true);
    try {
      await onSubmit(form.getFieldsValue(true));
      message.success(t('Operation completed successfully'));
      navigate(listPath);
    } catch (err) {
      message.error(getErrorMessage(err, t('Operation failed')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WizardShell
      title={title}
      breadcrumb={breadcrumb || [listCrumb(listPath, listTitle), { title }]}
      steps={steps}
      current={current}
      loading={loading}
      submitting={submitting}
      quota={quota}
      footerLeft={errorMsg ? <Badge status="error" text={errorMsg} style={{ maxWidth: 600 }} /> : null}
      onCancel={() => navigate(listPath)}
      onPrev={() => setCurrent((c) => Math.max(c - 1, 0))}
      onNext={next}
      onOk={onOk}
      disableNext={!!errorMsg}
      disableSubmit={!!errorMsg}
    >
      <Form
        form={form}
        {...(screens.md ? formLayout : mobileFormLayout)}
        initialValues={initialValues}
        onValuesChange={onValuesChange}
        scrollToFirstError
      >
        {steps.map((step, idx) => (
          <div key={step.title} style={{ display: idx === current ? 'block' : 'none' }}>
            {step.content}
          </div>
        ))}
      </Form>
    </WizardShell>
  );
}

/** Legacy select-table required rule */
export const selectRequired = (label) => ({
  validator: (_, value) =>
    value?.selectedRowKeys?.length
      ? Promise.resolve()
      : Promise.reject(new Error(`${t('Please select')} ${label}`)),
});

/** { selectedRowKeys, selectedRows } for a row (or empty) */
export const selection = (row, key = 'id') => (row ? { selectedRowKeys: [row[key]], selectedRows: [row] } : { selectedRowKeys: [], selectedRows: [] });

export const firstKey = (value) => value?.selectedRowKeys?.[0];
