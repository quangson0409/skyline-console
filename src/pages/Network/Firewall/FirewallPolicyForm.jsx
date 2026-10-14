import React, { useEffect, useState } from 'react';
import { Form, Input, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { neutronApi } from '@/api/neutron';
import { checkPolicyRule, usePolicyStore } from '@/core/policy';
import { PolicyGuard } from '../common';
import { t } from '@/core/i18n';
import { CheckGroup, firewallTabPath } from './helpers';
import FormPageLayout, { useNeutronQuota } from './FormPageLayout';

/**
 * legacy Firewall/Policy/actions/Create.jsx (/network/firewall-policy/add)
 * and Edit.jsx (/network/firewall-policy/edit/:id).
 * Shared checkbox: legacy checkPolicyRule('update_firewall_policy:shared').
 */
function FirewallPolicyFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  usePolicyStore((st) => st.rules); // re-evaluate once /policies is loaded
  const canChangeShared = checkPolicyRule('update_firewall_policy:shared');
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const { quota, exceeded } = useNeutronQuota('firewall_policy', !isEdit);
  const listUrl = firewallTabPath(false, 'policies');

  useEffect(() => {
    if (!isEdit) return undefined;
    let alive = true;
    setLoading(true);
    neutronApi
      .getFirewallPolicy(id)
      .then((res) => {
        const item = res?.firewall_policy || {};
        if (!alive) return;
        form.setFieldsValue({
          name: item.name,
          description: item.description,
          options: { shared: !!item.shared, audited: !!item.audited },
        });
      })
      .catch((err) => message.error(err?.message || t('Operation failed')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, isEdit, form]);

  const onSubmit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const { name, description, options: { shared, audited } = {} } = values;
    setSubmitting(true);
    try {
      if (isEdit) {
        const body = { name, audited, description };
        if (canChangeShared) body.shared = shared;
        await neutronApi.updateFirewallPolicy(id, body);
      } else {
        await neutronApi.createFirewallPolicy({ name, shared, audited, description });
      }
      message.success(t('Operation completed successfully'));
      navigate(listUrl);
    } catch (err) {
      message.error(err?.response?.data?.NeutronError?.message || err?.message || t('Operation failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormPageLayout
      title={isEdit ? t('Edit') : t('Create Firewall Policy')}
      breadcrumb={[t('Network'), { title: t('Firewall Policies'), path: listUrl }]}
      loading={loading}
      submitting={submitting}
      disableSubmit={!isEdit && exceeded}
      quota={isEdit ? null : quota}
      quotaTitle={t('Firewall Policy')}
      onSubmit={onSubmit}
      onCancel={() => navigate(listUrl)}
    >
      <Form form={form} layout="vertical" initialValues={{ options: { shared: false, audited: false } }}>
        <Form.Item name="name" label={t('Name')} rules={[{ required: true, message: t('Please input name') }]}>
          <Input />
        </Form.Item>
        <Form.Item name="options" label={t('Options')}>
          <CheckGroup
            options={[
              { label: t('Shared'), value: 'shared', disabled: !canChangeShared },
              { label: t('Audited'), value: 'audited' },
            ]}
          />
        </Form.Item>
        <Form.Item name="description" label={t('Description')}>
          <Input.TextArea rows={4} />
        </Form.Item>
      </Form>
    </FormPageLayout>
  );
}

/** legacy Policy Create (create_firewall_policy) / Edit (update_firewall_policy) static policy */
export default function FirewallPolicyForm() {
  const { id } = useParams();
  return (
    <PolicyGuard policy={id ? 'update_firewall_policy' : 'create_firewall_policy'} name={t('Firewall Policy')}>
      <FirewallPolicyFormPage />
    </PolicyGuard>
  );
}
