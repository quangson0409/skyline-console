import React, { useEffect, useState } from 'react';
import { Form, Input, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { neutronApi } from '@/api/neutron';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import {
  fetchPolicies,
  fetchRouterPorts,
  fetchInstancePorts,
  policyTableColumns,
  SelectTable,
  TabSelectTable,
  CheckGroup,
} from './helpers';
import { portTabs } from './actions';
import FormPageLayout, { useNeutronQuota } from './FormPageLayout';
import { nameRule as sharedNameRule } from '@/components/form/rules';
import { PolicyGuard } from '../common';

/** legacy utils/validate nameRegex ("input-name" form item) */
export const nameRule = () => sharedNameRule();

/** legacy Firewall/actions/Create.jsx (/network/firewall/create) */
function FirewallCreatePage() {
  const navigate = useNavigate();
  const projectId = useAuthStore((s) => s.currentProject?.id);
  const [form] = Form.useForm();
  const [policies, setPolicies] = useState([]);
  const [instancePorts, setInstancePorts] = useState([]);
  const [routerPorts, setRouterPorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { quota, exceeded } = useNeutronQuota('firewall_group');
  const listUrl = '/network/firewall';

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchPolicies({ isAdmin: false, projectId }).catch(() => []),
      fetchInstancePorts(projectId),
      fetchRouterPorts(),
    ]).then(([pols, inst, router]) => {
      if (!alive) return;
      setPolicies(pols.filter((it) => (it.firewalls || []).length < 2).map((it) => ({ ...it, key: it.id })));
      setInstancePorts(inst);
      setRouterPorts(router);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const onSubmit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const {
      ingressPolicy = {},
      egressPolicy = {},
      options: { admin_state_up = true, shared = false } = {},
      ports = {},
      ...rest
    } = values;
    const ingress = ingressPolicy?.selectedRowKeys && ingressPolicy.selectedRowKeys[0];
    const egress = egressPolicy?.selectedRowKeys && egressPolicy.selectedRowKeys[0];
    const body = { admin_state_up, shared, ...rest };
    if (ingress) body.ingress_firewall_policy_id = ingress;
    if (egress) body.egress_firewall_policy_id = egress;
    if (ports?.selectedRowKeys) body.ports = ports.selectedRowKeys;
    setSubmitting(true);
    try {
      await neutronApi.createFirewall(body);
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
      title={t('Create Firewall')}
      breadcrumb={[t('Network'), { title: t('Firewalls'), path: listUrl }]}
      loading={loading}
      submitting={submitting}
      disableSubmit={exceeded}
      quota={quota}
      quotaTitle={t('Firewall')}
      onSubmit={onSubmit}
      onCancel={() => navigate(listUrl)}
    >
      <Form form={form} layout="vertical" initialValues={{ options: { admin_state_up: true } }}>
        <Form.Item name="name" label={t('Name')} rules={[{ required: true, message: t('Please input name') }, nameRule()]}>
          <Input />
        </Form.Item>
        <Form.Item name="ingressPolicy" label={t('Ingress Policy')}>
          <SelectTable data={policies} columns={policyTableColumns()} isMulti={false} loading={loading} />
        </Form.Item>
        <Form.Item name="egressPolicy" label={t('Egress Policy')}>
          <SelectTable data={policies} columns={policyTableColumns()} isMulti={false} loading={loading} />
        </Form.Item>
        <Form.Item name="ports" label={t('Ports')}>
          <TabSelectTable tabs={portTabs(instancePorts, routerPorts)} />
        </Form.Item>
        <Form.Item name="options" label={t('Options')}>
          <CheckGroup options={[{ label: t('Admin State'), value: 'admin_state_up' }]} />
        </Form.Item>
        <Form.Item name="description" label={t('Description')}>
          <Input.TextArea rows={4} />
        </Form.Item>
      </Form>
    </FormPageLayout>
  );
}

/** legacy Firewall/actions/Create static policy create_firewall_group */
export default function FirewallCreate() {
  return (
    <PolicyGuard policy="create_firewall_group" name={t('Firewall')}>
      <FirewallCreatePage />
    </PolicyGuard>
  );
}
