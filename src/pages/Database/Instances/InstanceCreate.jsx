import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Form, Grid, Input, InputNumber, Select, notification } from 'antd';
import { troveApi } from '@/api/trove';
import { novaApi } from '@/api/nova';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import WizardShell, { listCrumb } from '@/components/Wizard/WizardShell';
import QuotaPanel from '@/components/Quota/QuotaPanel';
import FlavorSelectTable from '@/components/compute/FlavorSelectTable';
import NetworkSelectTable from '@/components/network/NetworkSelectTable';
import {
  formLayout,
  mobileFormLayout,
  FormDivider,
  selectTableRule,
  narrowWrapper,
  tableWrapper,
} from '@/components/form/fields';
import { passwordRule, confirmPasswordRule } from '@/components/form/rules';
import {
  fetchDatastores,
  datastoreOptions,
  versionOptions,
  databaseNameRule,
  databaseUserNameRule,
  fetchTroveQuota,
} from '../shared';

const LIST_URL = '/database/instances';

/** Fields validated by each step (legacy StepCreate steps) */
const STEP_FIELDS = [
  ['zone', 'instance_name', 'size', 'datastore_type', 'datastore_version', 'flavor', 'locality'],
  ['network'],
  ['initialDatabases', 'initialAdminUser', 'password', 'confirmPassword'],
  ['configurationGroup'],
];

const requiredRule = (label) => ({ required: true, message: t('Please enter/select {label}!', { label }) });

/** Port of legacy pages/database/containers/Instances/actions/StepCreate */
export default function InstanceCreate() {
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const layout = screens.md ? formLayout : mobileFormLayout;
  const { currentProject, hasAdminOnlyRole, hasAdminRole } = useAuthStore();
  const projectName = currentProject?.name || '-';
  const [form] = Form.useForm();
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [datastores, setDatastores] = useState([]);
  const [zones, setZones] = useState([]);
  const [configurations, setConfigurations] = useState([]);
  const [quota, setQuota] = useState(null);
  const [quotaLoading, setQuotaLoading] = useState(false);

  const datastoreType = Form.useWatch('datastore_type', form);
  const size = Form.useWatch('size', form) || 0;

  // legacy showQuota = rootStore.hasAdminOnlyRole
  const showQuota = hasAdminOnlyRole;

  useEffect(() => {
    fetchDatastores().then(setDatastores).catch(() => setDatastores([]));
    novaApi
      .listAvailabilityZones()
      .then((res) =>
        setZones(
          (res?.availabilityZoneInfo || [])
            .filter((it) => it.zoneState?.available)
            .map((it) => ({ value: it.zoneName, label: it.zoneName }))
        )
      )
      .catch(() => setZones([]));
    troveApi
      .listConfigurations()
      .then((res) => setConfigurations((res?.configurations || []).map((it) => ({ label: it.name, value: it.id }))))
      .catch(() => setConfigurations([]));
    if (showQuota) {
      setQuotaLoading(true);
      fetchTroveQuota(currentProject?.id)
        .then(setQuota)
        .catch(() => setQuota(null))
        .finally(() => setQuotaLoading(false));
    }
  }, [showQuota, currentProject?.id]);

  // legacy getQuotaMessage / checkQuota
  const errorMsg = useMemo(() => {
    if (!showQuota || !quota) return '';
    const msg = (input, left, name) => {
      if (left === undefined || left === -1) return '';
      if (left <= 0) return t('Quota: Insufficient { name } quota to create resources.', { name });
      if (input > left) {
        return t('Insufficient {name} quota to create resources (left { quota }, input { input }).', { name, quota: left, input });
      }
      return '';
    };
    return (
      msg(1, quota.instances?.left, t('Database Instance')) || msg(size, quota.volumes?.left, t('Database Disk (GiB)'))
    );
  }, [showQuota, quota, size]);

  const quotaInfo = useMemo(() => {
    if (!quota) return [];
    const { instances = {}, volumes = {} } = quota;
    const left = instances.left ?? 0;
    const volumeLeft = volumes.left ?? 0;
    return [
      { ...instances, add: left ? 1 : 0, name: 'instance', title: t('Database Instance') },
      {
        ...volumes,
        add: volumeLeft === -1 || size <= volumeLeft ? size : 0,
        name: 'volumeSize',
        title: t('Database Disk (GiB)'),
        type: 'line',
      },
    ];
  }, [quota, size]);

  const steps = [
    { title: t('Details *') },
    { title: t('Networking *') },
    { title: t('Initialize Databases') },
    { title: t('Advanced') },
  ];

  const next = async () => {
    try {
      await form.validateFields(STEP_FIELDS[current]);
      setCurrent((c) => Math.min(c + 1, steps.length - 1));
    } catch {
      // validation errors are shown inline
    }
  };

  const onOk = async () => {
    let values;
    try {
      await form.validateFields(STEP_FIELDS[current]);
      values = form.getFieldsValue(true);
    } catch {
      return;
    }
    const selectedRowKeys = values.network?.selectedRowKeys || [];
    const network = [{ 'net-id': selectedRowKeys[0] }];
    const body = {
      instance: {
        datastore: { type: values.datastore_type, version: values.datastore_version },
        name: values.instance_name,
        flavorRef: values.flavor?.selectedRowKeys?.[0],
        volume: { size: values.size },
        availability_zone: values.zone,
        nics: network,
        locality: values.locality,
        configuration: values.configurationGroup,
        databases: [{ character_set: 'utf8', collate: 'utf8_general_ci', name: values.initialDatabases }],
        users: [
          {
            databases: [{ name: values.initialDatabases }],
            name: values.initialAdminUser,
            password: values.password,
          },
        ],
      },
    };
    setSubmitting(true);
    try {
      await troveApi.createInstance(body);
      notification.success({ message: t('Create Database Instance'), description: values.instance_name });
      navigate(LIST_URL);
    } catch (err) {
      notification.error({
        message: t('Unable to create database instance.'),
        description: err?.response?.data?.badRequest?.message || err?.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const projectItem = (
    <>
      <Form.Item label={t('Project')}>
        <span style={{ fontWeight: 600 }}>{projectName}</span>
      </Form.Item>
      <FormDivider />
    </>
  );

  const show = (idx) => ({ display: current === idx ? 'block' : 'none' });

  return (
    <WizardShell
      title={t('Create Database Instance')}
      breadcrumb={[{ title: t('Databases') }, listCrumb(LIST_URL, t('Database Instances')), { title: t('Create Database Instance') }]}
      steps={steps}
      current={current}
      footerLeft={errorMsg ? <Badge status="error" text={errorMsg} style={{ maxWidth: 600 }} /> : null}
      quota={showQuota ? <QuotaPanel quotas={quotaInfo} loading={quotaLoading} /> : null}
      onCancel={() => navigate(LIST_URL)}
      onPrev={() => setCurrent((c) => Math.max(c - 1, 0))}
      onNext={next}
      onOk={onOk}
      disableNext={!!errorMsg}
      disableSubmit={!!errorMsg}
      submitting={submitting}
    >
      <Form form={form} {...layout} scrollToFirstError>
        {/* Step 1: Details */}
        <div style={show(0)}>
          {projectItem}
          <Form.Item name="zone" label={t('Availability Zone')} rules={[requiredRule(t('Availability Zone'))]} wrapperCol={narrowWrapper}>
            <Select options={zones} placeholder={t('Please select')} showSearch />
          </Form.Item>
          <Form.Item
            name="instance_name"
            label={t('Database Instance Name')}
            rules={[requiredRule(t('Database Instance Name'))]}
            wrapperCol={narrowWrapper}
          >
            <Input />
          </Form.Item>
          <Form.Item name="size" label={t('Database Disk (GiB)')} rules={[requiredRule(t('Database Disk (GiB)'))]} wrapperCol={narrowWrapper}>
            <InputNumber min={1} precision={0} placeholder={t('Size')} style={{ width: '100%' }} />
          </Form.Item>
          <FormDivider />
          <Form.Item name="datastore_type" label={t('Datastore Type')} rules={[requiredRule(t('Datastore Type'))]} wrapperCol={narrowWrapper}>
            <Select
              options={datastoreOptions(datastores)}
              placeholder={t('Please select')}
              onChange={() => form.setFieldsValue({ datastore_version: undefined })}
            />
          </Form.Item>
          <Form.Item
            name="datastore_version"
            label={t('Datastore Version')}
            rules={[requiredRule(t('Datastore Version'))]}
            wrapperCol={narrowWrapper}
          >
            <Select options={versionOptions(datastores, datastoreType)} placeholder={t('Please select')} />
          </Form.Item>
          <FormDivider />
          <Form.Item name="flavor" label={t('Database Flavor')} required rules={[selectTableRule(t('Database Flavor'))]} wrapperCol={tableWrapper}>
            <FlavorSelectTable />
          </Form.Item>
          <Form.Item
            name="locality"
            label={t('Location Policy')}
            wrapperCol={narrowWrapper}
            tooltip={t(
              'Specify whether future replicated instances will be created on the same hypervisor (affinity) or on different hypervisors (anti-affinity). This value is ignored if the instance to be launched is a replica.'
            )}
          >
            <Select
              allowClear
              placeholder={t('Please select')}
              options={[
                { label: t('Affinity'), value: 'affinity' },
                { label: t('Anti-Affinity'), value: 'anti-affinity' },
              ]}
            />
          </Form.Item>
        </div>

        {/* Step 2: Networking */}
        <div style={show(1)}>
          {projectItem}
          <Form.Item name="network" label={t('Network')} required rules={[selectTableRule(t('Network'))]} wrapperCol={tableWrapper}>
            <NetworkSelectTable hasAdminRole={hasAdminRole} />
          </Form.Item>
        </div>

        {/* Step 3: Initialize Databases */}
        <div style={show(2)}>
          {projectItem}
          <Form.Item
            name="initialDatabases"
            label={t('Initial Databases')}
            rules={[requiredRule(t('Initial Databases')), databaseNameRule()]}
            wrapperCol={narrowWrapper}
          >
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item
            name="initialAdminUser"
            label={t('Initial Admin User')}
            rules={[requiredRule(t('Initial Admin User')), databaseUserNameRule()]}
            wrapperCol={narrowWrapper}
          >
            <Input maxLength={16} />
          </Form.Item>
          <Form.Item name="password" label={t('Password')} rules={[requiredRule(t('Password')), passwordRule()]} wrapperCol={narrowWrapper}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t('Confirm Password')}
            dependencies={['password']}
            rules={[requiredRule(t('Confirm Password')), confirmPasswordRule()]}
            wrapperCol={narrowWrapper}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </div>

        {/* Step 4: Advanced */}
        <div style={show(3)}>
          {projectItem}
          <Form.Item name="configurationGroup" label={t('Configuration Group')} wrapperCol={narrowWrapper}>
            <Select allowClear options={configurations} placeholder={t('Please select')} />
          </Form.Item>
        </div>
      </Form>
    </WizardShell>
  );
}
