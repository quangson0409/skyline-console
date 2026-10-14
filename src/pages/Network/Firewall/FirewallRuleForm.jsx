import React, { useEffect, useState } from 'react';
import { Form, Input, Radio, Select, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { neutronApi } from '@/api/neutron';
import { checkPolicyRule, usePolicyStore } from '@/core/policy';
import { PolicyGuard } from '../common';
import { t } from '@/core/i18n';
import { isIPv4, isIPv6, isCidr } from '@/components/network/ip';
import { CheckGroup, firewallTabPath, protocolInfos, actionInfos, fetchRuleDetail } from './helpers';
import FormPageLayout, { useNeutronQuota } from './FormPageLayout';

const isValidPort = (p) => /^\d+$/.test(p) && Number(p) >= 1 && Number(p) <= 65535;
/** legacy utils/validate validatePortRange ("80" or "80:160") */
const validatePortRange = (str) => {
  const parts = String(str).split(':');
  return parts.length <= 2 && parts.every(isValidPort);
};

const portRangeRule = () => ({
  validator: (_, value) =>
    !value || validatePortRange(value)
      ? Promise.resolve()
      : Promise.reject(new Error(t('Input source port or port range (example: 80 or 80:160)'))),
});

/**
 * legacy Firewall/Rule/actions/Create.jsx (/network/firewall-rule/create)
 * and Edit.jsx (/network/firewall-rule/edit/:id).
 */
function FirewallRuleFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  usePolicyStore((st) => st.rules); // re-evaluate once /policies is loaded
  const [form] = Form.useForm();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const { quota, exceeded } = useNeutronQuota('firewall_rule', !isEdit);
  const protocol = Form.useWatch('protocol', form);
  const listUrl = firewallTabPath(false, 'rules');

  // legacy canChangeShared: policy rule update_firewall_rule:shared (admin_only) and,
  // when editing, the rule must not belong to a shared policy
  const canChangeShared =
    checkPolicyRule('update_firewall_rule:shared') && (!isEdit || ((detail && detail.policies) || []).every((it) => !it.shared));

  useEffect(() => {
    if (!isEdit) return undefined;
    let alive = true;
    setLoading(true);
    fetchRuleDetail(id)
      .then((data) => {
        if (!alive || !data) return;
        setDetail(data);
        form.setFieldsValue({
          ...data,
          options: { enabled: data.enabled, shared: data.shared },
        });
      })
      .catch((err) => message.error(err?.message || t('Operation failed')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, isEdit, form]);

  const checkIp = (type) => (_, value) => {
    const name = type === 'source' ? t('Source IP') : t('Destination IP');
    if (!value) return Promise.resolve();
    const ip = String(value).trim();
    if (ip.length === 0) return Promise.resolve();
    const ipVersion = form.getFieldValue('ip_version') || 4;
    if (ipVersion === 4 && !(isCidr(ip, 4) || isIPv4(ip))) {
      return Promise.reject(new Error(t('{ name } Format Error (e.g. 192.168.1.1 or 192.168.1.1/24)', { name })));
    }
    if (ipVersion !== 4 && !(isCidr(ip, 6) || isIPv6(ip))) {
      return Promise.reject(
        new Error(t('{ name } Format Error (e.g. FE80:0:0:0:0:0:0:1 or FE80:0:0:0:0:0:0:1/10)', { name }))
      );
    }
    return Promise.resolve();
  };

  const onSubmit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const {
      options: { enabled, shared } = {},
      protocol: proto,
      destination_ip_address,
      source_ip_address,
      source_port,
      destination_port,
      ...rest
    } = values;
    const portHidden = ['any', 'icmp'].includes(proto);
    const body = {
      ...rest,
      enabled,
      protocol: proto === 'any' ? null : proto,
      destination_ip_address: destination_ip_address || null,
      source_ip_address: source_ip_address || null,
      source_port: (!portHidden && source_port) || null,
      destination_port: (!portHidden && destination_port) || null,
    };
    if (canChangeShared) body.shared = shared;
    setSubmitting(true);
    try {
      if (isEdit) await neutronApi.updateFirewallRule(id, body);
      else await neutronApi.createFirewallRule(body);
      message.success(t('Operation completed successfully'));
      navigate(listUrl);
    } catch (err) {
      message.error(err?.response?.data?.NeutronError?.message || err?.message || t('Operation failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const toOpts = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));
  const portHidden = ['any', 'icmp'].includes(protocol);

  return (
    <FormPageLayout
      title={isEdit ? t('Edit Rule') : t('Create Rule')}
      breadcrumb={[t('Network'), { title: t('Firewall Rules'), path: listUrl }]}
      loading={loading}
      submitting={submitting}
      disableSubmit={!isEdit && exceeded}
      quota={isEdit ? null : quota}
      quotaTitle={t('Firewall Rule')}
      onSubmit={onSubmit}
      onCancel={() => navigate(listUrl)}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ protocol: 'tcp', action: 'allow', ip_version: 4, options: { enabled: true, shared: false } }}
      >
        <Form.Item name="name" label={t('Name')} rules={[{ required: true, message: t('Please input name') }]}>
          <Input />
        </Form.Item>
        <Form.Item name="protocol" label={t('Protocol')} rules={[{ required: true }]}>
          <Radio.Group options={toOpts(protocolInfos())} optionType="button" />
        </Form.Item>
        <Form.Item name="action" label={t('Rule Action')} rules={[{ required: true }]}>
          <Select options={toOpts(actionInfos())} style={{ maxWidth: 320 }} />
        </Form.Item>
        <Form.Item name="ip_version" label={t('IP Version')}>
          <Radio.Group
            options={[
              { value: 4, label: t('IPv4') },
              { value: 6, label: t('IPv6') },
            ]}
            onChange={() => form.validateFields(['source_ip_address', 'destination_ip_address']).catch(() => {})}
          />
        </Form.Item>
        <Form.Item
          name="source_ip_address"
          label={t('Source IP Address/Subnet')}
          rules={[{ validator: checkIp('source') }]}
        >
          <Input />
        </Form.Item>
        {!portHidden ? (
          <Form.Item
            name="source_port"
            label={t('Source Port/Port Range')}
            rules={[portRangeRule()]}
            extra={t('Input source port or port range (example: 80 or 80:160)')}
          >
            <Input placeholder={t('Please input {label}', { label: t('Source Port/Port Range') })} />
          </Form.Item>
        ) : null}
        <Form.Item
          name="destination_ip_address"
          label={t('Destination IP Address/Subnet')}
          rules={[{ validator: checkIp('destination') }]}
        >
          <Input />
        </Form.Item>
        {!portHidden ? (
          <Form.Item
            name="destination_port"
            label={t('Destination Port/Port Range')}
            extra={t('Input destination port or port range (example: 80 or 80:160)')}
          >
            <Input />
          </Form.Item>
        ) : null}
        <Form.Item name="options" label={t('Options')}>
          <CheckGroup
            options={[
              { label: t('Enabled'), value: 'enabled' },
              { label: t('Shared'), value: 'shared', disabled: !canChangeShared },
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

/** legacy Rule Create (create_firewall_rule) / Edit (update_firewall_rule) static policy */
export default function FirewallRuleForm() {
  const { id } = useParams();
  return (
    <PolicyGuard policy={id ? 'update_firewall_rule' : 'create_firewall_rule'} name={t('Firewall Rule')}>
      <FirewallRuleFormPage />
    </PolicyGuard>
  );
}
