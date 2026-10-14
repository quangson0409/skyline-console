/**
 * Create Load Balancer - port of legacy LoadBalancerInstance/actions/StepCreate (StepAction,
 * /network/load-balancers/create) with its steps BaseStep, ListenerStep, PoolStep, MemberStep
 * and HealthMonitorStep. The payload (one POST /lbaas/loadbalancers with the full tree) is
 * identical to the legacy onSubmit.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Breadcrumb, Button, Card, Form, Input, InputNumber, Radio, Select, Space, Steps, Switch, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { octaviaApi } from '@/api/octavia';
import { neutronApi } from '@/api/neutron';
import { useAuthStore } from '@/store/authStore';
import { getErrorMessage } from '@/hooks/useResource';
import { IdNameCell } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import SelectTable, { col, yesNoCol } from '@/pages/Instances/Create/components/SelectTable';
import NetworkSelectTable from '@/pages/Instances/Create/components/NetworkSelectTable';
import { IpDistributor, ipDistributorRule } from '@/pages/Network/Port/helpers';
import {
  nameRule,
  urlPathRule,
  sslParseMethod,
  listenerProtocolOptions,
  poolProtocolOptions,
  healthProtocolOptions,
  algorithmOptions,
  algorithmTip,
  isUrlLessMonitor,
  getInsertHeadersValueFromForm,
  fetchFlavors,
  fetchProviders,
  fetchCertificateContainers,
  fetchCaSecrets,
  fetchMemberPorts,
} from './helpers';
import {
  CertificateSelect,
  InsertHeadersInput,
  MemberAllocator,
  memberAllocatorRule,
  selectRequiredRule,
  useLoader,
} from './components';

const PROVIDER_TIP = () =>
  t(
    'Octavia Amphora provider uses dedicated instances to run load balancers. Each load balancer is deployed as one or more instance, providing strong isolation and full feature support. This provider requires additional compute resources and management of amphora images. Octavia OVN provider implements load balancing directly in the OVN networking layer without using instances. It supports only Layer 4 protocols (TCP/UDP) and does not provide advanced L7 features. This provider offers lower resource overhead but a more limited feature set compared to the Amphora provider.'
  );

const STEP_FIELDS = [
  ['name', 'description', 'provider', 'flavor_id', 'vip_network_id', 'vip_address', 'admin_state_enabled'],
  [
    'listener_name',
    'listener_description',
    'listener_protocol',
    'listener_ssl_parsing_method',
    'listener_default_tls_container_ref',
    'listener_client_ca_tls_container_ref',
    'listener_sni_enabled',
    'listener_sni_container_refs',
    'listener_protocol_port',
    'listener_connection_limit',
    'listener_admin_state_up',
    'insert_headers',
  ],
  ['pool_name', 'pool_description', 'pool_lb_algorithm', 'pool_protocol', 'pool_admin_state_up'],
  ['extMembers'],
  [
    'enableHealthMonitor',
    'health_name',
    'health_delay',
    'health_max_retries',
    'health_timeout',
    'health_type',
    'monitor_admin_state_up',
    'health_url_path',
  ],
];

const DEFAULT_VALUES = {
  admin_state_enabled: true,
  provider: 'amphora',
  // ListenerStep
  listener_ssl_parsing_method: 'one-way',
  listener_sni_enabled: false,
  listener_connection_limit: -1,
  listener_admin_state_up: true,
  // PoolStep
  pool_admin_state_up: true,
  // MemberStep
  extMembers: [],
  // HealthMonitorStep
  enableHealthMonitor: true,
  health_delay: 5,
  health_timeout: 3,
  health_max_retries: 3,
  monitor_admin_state_up: true,
  health_url_path: '/',
};

/** legacy StepCreate.onSubmit */
export const buildCreatePayload = (values) => {
  const {
    name,
    description,
    vip_address,
    vip_network_id,
    admin_state_enabled,
    enableHealthMonitor,
    listener_protocol,
    listener_ssl_parsing_method,
    listener_sni_enabled,
    listener_default_tls_container_ref,
    listener_client_ca_tls_container_ref,
    listener_sni_container_refs,
    listener_admin_state_up,
    pool_admin_state_up,
    monitor_admin_state_up,
    insert_headers,
    flavor_id,
    provider,
    health_url_path,
    project_id,
    ...rest
  } = values;
  const data = {
    name,
    description,
    vip_network_id: vip_network_id.selectedRowKeys[0],
  };
  const { ip_address, subnet: vip_subnet_id } = vip_address[0];
  data.vip_subnet_id = vip_subnet_id;
  if (ip_address && ip_address.type === 'manual' && ip_address.ip) {
    data.vip_address = ip_address.ip;
  }
  data.admin_state_up = admin_state_enabled;
  if (provider) data.provider = provider;
  if (provider !== 'ovn' && flavor_id?.selectedRowKeys?.length) {
    data.flavor_id = flavor_id.selectedRowKeys[0];
  }

  const listenerData = { admin_state_up: listener_admin_state_up, protocol: listener_protocol };
  const insertHeaders = getInsertHeadersValueFromForm(insert_headers);
  if (provider !== 'ovn' && insertHeaders) listenerData.insert_headers = insertHeaders;

  if (listener_protocol === 'TERMINATED_HTTPS') {
    if (listener_default_tls_container_ref?.selectedRows?.length) {
      listenerData.default_tls_container_ref = listener_default_tls_container_ref.selectedRows[0].container_ref;
    }
    if (listener_ssl_parsing_method === 'two-way' && listener_client_ca_tls_container_ref?.selectedRows?.length) {
      listenerData.client_ca_tls_container_ref = listener_client_ca_tls_container_ref.selectedRows[0].secret_ref;
      listenerData.client_authentication = 'MANDATORY';
    }
    if (listener_sni_enabled && listener_sni_container_refs?.selectedRows?.length) {
      listenerData.sni_container_refs = listener_sni_container_refs.selectedRows.map((it) => it.container_ref);
    }
  }

  const poolData = { admin_state_up: pool_admin_state_up };
  const healthMonitorData = { admin_state_up: monitor_admin_state_up };

  Object.keys(rest).forEach((i) => {
    if (rest[i] === undefined) return;
    if (i.indexOf('listener') === 0) {
      listenerData[i.replace('listener_', '')] = rest[i];
    } else if (i.indexOf('pool') === 0) {
      poolData[i.replace('pool_', '')] = rest[i];
    } else if (i.indexOf('health') === 0) {
      healthMonitorData[i.replace('health_', '')] = rest[i];
    }
  });

  if (enableHealthMonitor) {
    const healthMonitorPayload = { ...healthMonitorData };
    // Only add url_path if provider is not OVN and type is not TCP or UDP-CONNECT
    if (provider !== 'ovn' && !isUrlLessMonitor(healthMonitorData.type)) {
      healthMonitorPayload.url_path = health_url_path === '' || health_url_path == null ? '/' : health_url_path;
    }
    poolData.healthmonitor = healthMonitorPayload;
  }

  const memberData = [];
  (rest.extMembers || []).forEach((member) => {
    const { ip, protocol_port, weight, name: server_name = null, subnet_id } = member.ip_address || {};
    memberData.push({ weight, protocol_port, address: ip, name: server_name, subnet_id });
  });
  poolData.members = memberData;
  listenerData.default_pool = poolData;
  data.listeners = [listenerData];
  return data;
};

/* ---------------- step widgets ---------------- */
function AlgorithmField({ value, onChange, options }) {
  const tip = value ? algorithmTip()[value] : null;
  return (
    <div>
      <Select value={value} onChange={onChange} options={options} placeholder={t('Please select')} />
      {tip ? <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>{tip}</div> : null}
    </div>
  );
}

function VipAddress({ value, onChange, networkId }) {
  const [subnets, setSubnets] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!networkId) {
      setSubnets([]);
      return undefined;
    }
    neutronApi
      .listSubnets({ network_id: networkId })
      .then((res) => alive && setSubnets(res?.subnets || []))
      .catch(() => alive && setSubnets([]));
    return () => {
      alive = false;
    };
  }, [networkId]);
  return <IpDistributor value={value} onChange={onChange} subnets={subnets} maxNumber={1} />;
}

const vipRequiredRule = () => ({
  validator: (_, value) =>
    Array.isArray(value) && value.length && value[0]?.subnet
      ? Promise.resolve()
      : Promise.reject(new Error(t('Missing Subnet'))),
});

export default function LoadBalancerCreate() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { currentProject, hasAdminRole } = useAuthStore();
  const projectId = currentProject?.id;
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const providers = useLoader(fetchProviders, []);
  const flavors = useLoader(fetchFlavors, []);
  const [needCerts, setNeedCerts] = useState(false);
  // barbican certificates are only needed for TERMINATED_HTTPS listeners
  const containers = useLoader(() => (needCerts ? fetchCertificateContainers() : []), [needCerts]);
  const caSecrets = useLoader(() => (needCerts ? fetchCaSecrets() : []), [needCerts]);
  const ports = useLoader(() => fetchMemberPorts(projectId), [projectId]);

  const provider = Form.useWatch('provider', form);
  const networkValue = Form.useWatch('vip_network_id', form);
  const vipAddress = Form.useWatch('vip_address', form);
  const listenerProtocol = Form.useWatch('listener_protocol', form) || '';
  const sslMethod = Form.useWatch('listener_ssl_parsing_method', form);
  const sniEnabled = Form.useWatch('listener_sni_enabled', form);
  const enableHealthMonitor = Form.useWatch('enableHealthMonitor', form);
  const healthDelay = Form.useWatch('health_delay', form);
  const healthType = Form.useWatch('health_type', form);
  const isOVN = provider === 'ovn';
  const isHttps = !isOVN && listenerProtocol === 'TERMINATED_HTTPS';
  const networkId = networkValue?.selectedRowKeys?.[0];

  useEffect(() => {
    if (isHttps && !needCerts) setNeedCerts(true);
  }, [isHttps, needCerts]);

  const providerOptions = useMemo(
    () =>
      providers.data.length
        ? providers.data.map((p) => ({ label: p.label, value: p.value }))
        : [
            { label: 'Amphora', value: 'amphora' },
            { label: 'OVN', value: 'ovn' },
          ],
    [providers.data]
  );

  // legacy getProviders: default amphora, else the first provider
  useEffect(() => {
    if (!providers.data.length) return;
    const cur = form.getFieldValue('provider');
    if (!providers.data.some((p) => p.value === cur)) {
      const def = providers.data.find((p) => p.value === 'amphora') || providers.data[0];
      form.setFieldsValue({ provider: def?.value || 'amphora' });
    }
  }, [providers.data, form]);

  const onValuesChange = (changed) => {
    if ('vip_network_id' in changed) {
      // Reset owned subnets after change owned network
      form.setFieldsValue({ vip_address: changed.vip_network_id?.selectedRowKeys?.length ? [{}] : undefined });
    }
    if ('listener_protocol' in changed) {
      form.setFieldsValue({ pool_protocol: undefined, health_type: undefined });
    }
    if ('pool_protocol' in changed) {
      form.setFieldsValue({ health_type: undefined });
    }
    if ('provider' in changed) {
      const ovn = changed.provider === 'ovn';
      const patch = { pool_protocol: undefined, health_type: undefined };
      const proto = form.getFieldValue('listener_protocol');
      if (ovn && proto && !['TCP', 'UDP'].includes(proto)) patch.listener_protocol = undefined;
      const algo = form.getFieldValue('pool_lb_algorithm');
      if (ovn) patch.pool_lb_algorithm = 'SOURCE_IP_PORT';
      else if (algo === 'SOURCE_IP_PORT') patch.pool_lb_algorithm = undefined;
      form.setFieldsValue(patch);
    }
  };

  const steps = [
    { title: t('Base Config') },
    { title: t('Listener Details') },
    { title: t('Pool Details') },
    { title: t('Member Details') },
    { title: t('Health Monitor Details') },
  ];

  const next = async () => {
    try {
      await form.validateFields(STEP_FIELDS[current]);
      setCurrent((c) => Math.min(c + 1, steps.length - 1));
    } catch {
      // validation errors are shown inline
    }
  };

  const submit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch (err) {
      // jump to the first step with an error
      const names = (err?.errorFields || []).map((f) => f.name[0]);
      const idx = STEP_FIELDS.findIndex((list) => list.some((n) => names.includes(n)));
      if (idx >= 0) setCurrent(idx);
      return;
    }
    setSubmitting(true);
    try {
      await octaviaApi.createLoadBalancer(buildCreatePayload({ ...values, project_id: projectId }));
      message.success(t('Operation completed successfully'));
      navigate('/network/load-balancers');
    } catch (err) {
      message.error(getErrorMessage(err, t('Operation failed')));
    } finally {
      setSubmitting(false);
    }
  };

  const show = (idx) => ({ display: current === idx ? 'block' : 'none' });

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { title: t('Network') },
          { title: <Link to="/network/load-balancers">{t('Load Balancers')}</Link> },
          { title: t('Create Load Balancer') },
        ]}
        style={{ marginBottom: 16, fontSize: 13 }}
      />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t('Create Load Balancer')}
        </h1>
      </div>
      <Card variant="borderless" style={{ borderRadius: 8 }}>
        <Steps current={current} items={steps} style={{ marginBottom: 24 }} onChange={(idx) => idx < current && setCurrent(idx)} />
        <Form
          form={form}
          layout="vertical"
          initialValues={DEFAULT_VALUES}
          onValuesChange={onValuesChange}
          style={{ maxWidth: 1100 }}
        >
          {/* ---------------- Base Config ---------------- */}
          <div style={show(0)}>
            <Form.Item
              name="name"
              label={t('Load Balancer Name')}
              rules={[{ required: true, message: t('Please input name') }, nameRule(true)]}
            >
              <Input placeholder={t('Please input name')} />
            </Form.Item>
            <Form.Item name="description" label={t('Description')}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="provider" label={t('Provider')} tooltip={PROVIDER_TIP()} rules={[{ required: true }]}>
              <Select options={providerOptions} loading={providers.loading} />
            </Form.Item>
            {!isOVN ? (
              <Form.Item
                name="flavor_id"
                label={t('Flavors')}
                tooltip={t('Select Flavor for Octavia Amphora instance(s).')}
              >
                <SelectTable
                  data={flavors.data}
                  isLoading={flavors.loading}
                  columns={[
                    col(t('ID/Name'), 'name', { render: (v, r) => <IdNameCell id={r.id} name={v} /> }),
                    col(t('Description'), 'description', { render: (v) => v || '-' }),
                    yesNoCol(t('Enabled'), 'enabled'),
                  ]}
                  filterParams={[
                    { name: 'id', label: t('ID') },
                    { name: 'name', label: t('Name') },
                  ]}
                />
              </Form.Item>
            ) : null}
            <Form.Item name="vip_network_id" label={t('Network')} required rules={[selectRequiredRule(t('Network'))]}>
              <NetworkSelectTable hasAdminRole={hasAdminRole} />
            </Form.Item>
            {networkId ? (
              <Form.Item
                name="vip_address"
                label={t('Subnet')}
                required
                rules={[vipRequiredRule(), ipDistributorRule()]}
              >
                <VipAddress networkId={networkId} />
              </Form.Item>
            ) : null}
            <Form.Item
              name="admin_state_enabled"
              label={t('Admin State Up')}
              tooltip={t('Defines the admin state of the port.')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </div>

          {/* ---------------- Listener Details ---------------- */}
          <div style={show(1)}>
            <Form.Item
              name="listener_name"
              label={t('Listener Name')}
              rules={[{ required: true, message: t('Please input name') }, nameRule()]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="listener_description" label={t('Listener Description')}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item
              name="listener_protocol"
              label={t('Listener Protocol')}
              rules={[{ required: true, message: t('Please select') }]}
            >
              <Select options={listenerProtocolOptions(isOVN)} placeholder={t('Please select')} />
            </Form.Item>
            {isHttps ? (
              <>
                <Form.Item
                  name="listener_ssl_parsing_method"
                  label={t('SSL Parsing Method')}
                  rules={[{ required: true }]}
                >
                  <Select options={sslParseMethod()} />
                </Form.Item>
                <Form.Item
                  name="listener_default_tls_container_ref"
                  label={t('Server Certificate')}
                  required
                  rules={[selectRequiredRule(t('Server Certificate'))]}
                >
                  <CertificateSelect data={containers.data} loading={containers.loading} />
                </Form.Item>
                {sslMethod === 'two-way' ? (
                  <Form.Item
                    name="listener_client_ca_tls_container_ref"
                    label={t('CA Certificate')}
                    required
                    rules={[selectRequiredRule(t('CA Certificate'))]}
                  >
                    <CertificateSelect data={caSecrets.data} loading={caSecrets.loading} withDomain={false} />
                  </Form.Item>
                ) : null}
                <Form.Item name="listener_sni_enabled" label={t('SNI Enabled')} valuePropName="checked">
                  <Switch />
                </Form.Item>
                {sniEnabled ? (
                  <Form.Item
                    name="listener_sni_container_refs"
                    label={t('SNI Certificate')}
                    required
                    rules={[selectRequiredRule(t('SNI Certificate'))]}
                  >
                    <CertificateSelect
                      data={containers.data.filter((it) => !!it.domain)}
                      loading={containers.loading}
                      isMulti
                    />
                  </Form.Item>
                ) : null}
              </>
            ) : null}
            <Form.Item
              name="listener_protocol_port"
              label={t('Listener Protocol Port')}
              rules={[{ required: true, message: t('Please input') }]}
            >
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="listener_connection_limit"
              label={t('Listener Connection Limit')}
              extra={t('-1 means no connection limit')}
              rules={[{ required: true, message: t('Please input') }]}
            >
              <InputNumber min={-1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="listener_admin_state_up"
              label={t('Admin State Up')}
              tooltip={t('Defines the admin state of the listener.')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            {!isOVN ? (
              <Form.Item
                name="insert_headers"
                label={t('Custom Headers')}
                extra={t('The optional headers to insert into the request before it is sent to the backend member.')}
              >
                <InsertHeadersInput />
              </Form.Item>
            ) : null}
          </div>

          {/* ---------------- Pool Details ---------------- */}
          <div style={show(2)}>
            <Form.Item
              name="pool_name"
              label={t('Pool Name')}
              rules={[{ required: true, message: t('Please input name') }, nameRule()]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="pool_description" label={t('Pool Description')}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item
              name="pool_lb_algorithm"
              label={t('Pool Algorithm')}
              rules={[{ required: true, message: t('Please select') }]}
            >
              <AlgorithmField options={algorithmOptions(isOVN)} />
            </Form.Item>
            <Form.Item name="pool_protocol" label={t('Pool Protocol')} rules={[{ required: true, message: t('Please select') }]}>
              <Select options={poolProtocolOptions(listenerProtocol, isOVN)} placeholder={t('Please select')} />
            </Form.Item>
            <Form.Item
              name="pool_admin_state_up"
              label={t('Admin State Up')}
              tooltip={t('Defines the admin state of the pool.')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </div>

          {/* ---------------- Member Details ---------------- */}
          <div style={show(3)}>
            <Form.Item name="extMembers" rules={[memberAllocatorRule([])]}>
              <MemberAllocator ports={ports.data} loading={ports.loading} lbSubnetId={vipAddress?.[0]?.subnet || ''} />
            </Form.Item>
          </div>

          {/* ---------------- Health Monitor Details ---------------- */}
          <div style={show(4)}>
            <Form.Item name="enableHealthMonitor" label={t('Enable Health Monitor')}>
              <Radio.Group
                options={[
                  { label: t('Yes'), value: true },
                  { label: t('No'), value: false },
                ]}
              />
            </Form.Item>
            {enableHealthMonitor ? (
              <>
                <Form.Item
                  name="health_name"
                  label={t('Health Monitor Name')}
                  rules={[{ required: true, message: t('Please input name') }, nameRule()]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  name="health_delay"
                  label={t('Health Monitor Delay')}
                  extra={t('Maximum interval time for each health check response')}
                  rules={[{ required: true, message: t('Please input') }]}
                >
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name="health_max_retries"
                  label={t('Health Monitor Max Retries')}
                  extra={t(
                    'That is, after how many consecutive failures of the health check, the health check status of the back-end cloud server is changed from normal to abnormal'
                  )}
                  rules={[{ required: true, message: t('Please input') }]}
                >
                  <InputNumber min={1} max={10} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name="health_timeout"
                  label={t('Health Monitor Timeout')}
                  extra={t(
                    'The timeout period of waiting for the return of the health check request, the check timeout will be judged as a check failure'
                  )}
                  rules={[{ required: true, message: t('Please input') }]}
                >
                  <InputNumber min={healthDelay || 0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  name="health_type"
                  label={t('Health Monitor Type')}
                  rules={[{ required: true, message: t('Please select') }]}
                >
                  <Select
                    options={healthProtocolOptions(listenerProtocol, isOVN)}
                    placeholder={t('Please select')}
                  />
                </Form.Item>
                <Form.Item
                  name="monitor_admin_state_up"
                  label={t('Admin State Up')}
                  tooltip={t('Defines the admin state of the health monitor.')}
                  valuePropName="checked"
                >
                  <Switch />
                </Form.Item>
                {!isOVN ? (
                  <Form.Item
                    name="health_url_path"
                    label={t('Monitoring URL')}
                    rules={[urlPathRule()]}
                    extra={t(
                      'Defaults to "/" if left blank. Recommended: use a dedicated status page like "/status.html". This option is not applicable for TCP and UDP health monitor types.'
                    )}
                  >
                    <Input
                      placeholder={t('e.g., /status.html or /healthcheck.html')}
                      disabled={isUrlLessMonitor(healthType)}
                    />
                  </Form.Item>
                ) : null}
              </>
            ) : null}
          </div>
        </Form>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Space>
            <Button onClick={() => navigate('/network/load-balancers')}>{t('Cancel')}</Button>
            {current > 0 ? <Button onClick={() => setCurrent((c) => c - 1)}>{t('Previous')}</Button> : null}
            {current < steps.length - 1 ? (
              <Button type="primary" onClick={next}>
                {t('Next')}
              </Button>
            ) : (
              <Button type="primary" loading={submitting} onClick={submit}>
                {t('Confirm')}
              </Button>
            )}
          </Space>
        </div>
      </Card>
    </div>
  );
}
