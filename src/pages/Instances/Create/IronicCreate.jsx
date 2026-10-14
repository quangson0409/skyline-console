import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Form, Grid, InputNumber, Result, notification } from 'antd';
import { useNavigate } from 'react-router-dom';
import { novaApi } from '@/api/nova';
import { quotaApi } from '@/api/quota';
import { currentProjectId, hasEndpoint } from '@/api/endpoints';
import { useAuthStore } from '@/store/authStore';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import WizardShell, { listCrumb } from '@/components/Wizard/WizardShell';
import SelectTable from '@/components/SelectTable';
import FlavorSelectTable from '@/components/compute/FlavorSelectTable';
import { formLayout, mobileFormLayout, FormDivider, LabelValue, WrappedSelect, narrowWrapper, selectTableRule, tableWrapper } from '@/components/form/fields';
import { fetchAvailableZones, fetchImagesForCreate, getImageColumns } from './steps/BaseStep';
import NetworkStep from './steps/NetworkStep';
import SystemStep, { getSystemDefaults } from './steps/SystemStep';
import { IronicConfirmStep } from './steps/ConfirmStep';
import { buildIronicBody, getImageOS, getImageSystemTabs, getInstanceNames, tt } from './utils';
import { isQuotaExceeded, notifyError, useCurrentProjectName, usePresets } from './InstanceCreate';


/** Port of legacy CreateIronic/BaseStep */
function IronicBaseStep({ form, updateContext, presets, hasAdminRole, projectName }) {
  const projectMap = useProjectMap();
  const projectId = currentProjectId();
  const [zones, setZones] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const systemTabs = getImageSystemTabs();
  const [imageTab, setImageTab] = useState(presets.os_distro || systemTabs[0].value);

  const loadImages = async () => {
    setLoading(true);
    try {
      const list = await fetchImagesForCreate({ presetImage: presets.image, projectMap, ironic: true });
      setImages(list);
      if (presets.image && !form.getFieldValue('image')?.selectedRowKeys?.length) {
        const v = { selectedRowKeys: [presets.image], selectedRows: list.filter((it) => it.id === presets.image) };
        form.setFieldValue('image', v);
        updateContext({ image: v });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableZones().then((list) => {
      setZones(list);
      if (list.length && form.getFieldValue('availableZone') === undefined) {
        form.setFieldValue('availableZone', list[0]);
        updateContext({ availableZone: list[0] });
      }
    });
    loadImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = useMemo(() => (imageTab ? images.filter((it) => getImageOS(it) === imageTab) : images), [images, imageTab]);

  return (
    <>
      <Form.Item name="project" label={t('Project')}>
        <LabelValue content={projectName} />
      </Form.Item>
      <Form.Item
        name="availableZone"
        label={t('Availability Zone')}
        required
        wrapperCol={narrowWrapper}
        rules={[{ validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error(t('Please select {label}!', { label: t('Availability Zone') })))) }]}
        tooltip={t(
          'Availability zone refers to a physical area where power and network are independent of each other in the same area. In the same region, the availability zone and the availability zone can communicate with each other in the intranet, and the available zones can achieve fault isolation.'
        )}
      >
        <WrappedSelect options={zones} placeholder={t('Please select')} />
      </Form.Item>
      <FormDivider />
      <Form.Item name="flavor" label={t('Flavor')} required rules={[selectTableRule(t('Flavor'))]} wrapperCol={tableWrapper}>
        <FlavorSelectTable isIronic />
      </Form.Item>
      <Form.Item name="image" label={t('Operating System')} required rules={[selectTableRule(t('Operating System'))]} wrapperCol={tableWrapper}>
        <SelectTable
          id="ironic-create-image"
          data={data}
          columns={getImageColumns({ hasAdminRole, projectId })}
          isLoading={loading}
          filterParams={[{ label: t('Name'), name: 'name' }]}
          tabs={systemTabs}
          tabValue={imageTab}
          onTabChange={setImageTab}
          selectedLabel={t('Image')}
          onRefresh={loadImages}
        />
      </Form.Item>
    </>
  );
}

/**
 * Port of legacy pages/compute/containers/Instance/actions/CreateIronic.
 */
export default function IronicCreate() {
  const navigate = useNavigate();
  const presets = usePresets();
  const projectName = useCurrentProjectName();
  const hasAdminRole = useAuthStore((s) => !!s.hasAdminRole);
  const endpointOk = hasEndpoint('ironic');
  const screens = Grid.useBreakpoint();
  const layout = screens.sm === false ? mobileFormLayout : formLayout;

  const [baseForm] = Form.useForm();
  const [networkForm] = Form.useForm();
  const [systemForm] = Form.useForm();
  const [confirmForm] = Form.useForm();
  const forms = [baseForm, networkForm, systemForm, confirmForm];
  const [current, setCurrent] = useState(0);
  const [data, setData] = useState({ count: 1 });
  const dataRef = useRef(data);
  const [quota, setQuota] = useState(Infinity);
  const [submitting, setSubmitting] = useState(false);

  const updateContext = useCallback((patch) => {
    setData((prev) => {
      const next = { ...prev, ...patch };
      dataRef.current = next;
      return next;
    });
  }, []);

  // legacy getQuota: instances limit - used
  useEffect(() => {
    quotaApi
      .getNovaQuota(currentProjectId())
      .then((res) => {
        const { limit = 10, in_use: used = 0 } = res?.quota_set?.instances || {};
        setQuota(limit === -1 ? Infinity : limit - used);
      })
      .catch(() => {});
  }, []);

  const count = data.count || 1;
  const quotaError = Number.isFinite(quota) && count > quota;
  const quotaMsg = quotaError
    ? tt(
        'Quota: Insufficient quota to create resources, please adjust resource quantity or quota(left { quota }, input { input }).',
        { quota, input: count }
      )
    : '';

  const steps = [{ title: t('Base Config') }, { title: t('Network Config') }, { title: t('System Config') }, { title: t('Confirm Config') }];
  const listUrl = presets.listUrl;
  const collect = (index) => forms[index].getFieldsValue(true);

  const next = async () => {
    try {
      await forms[current].validateFields();
    } catch (e) {
      const first = e?.errorFields?.[0]?.name;
      if (first) forms[current].scrollToField(first, { behavior: 'smooth', block: 'center' });
      return;
    }
    updateContext(collect(current));
    setCurrent((c) => c + 1);
    window.scrollTo({ top: 0 });
  };
  const prev = () => {
    updateContext(collect(current));
    setCurrent((c) => c - 1);
    window.scrollTo({ top: 0 });
  };
  const goStep = (index) => setCurrent(index);

  const onOk = async () => {
    const values = { ...dataRef.current, ...collect(0), ...collect(1), ...collect(2), count };
    if (quotaError) {
      notifyError(null, t('Unable to create instance: insufficient quota to create resources.'));
      return;
    }
    const { body, error } = buildIronicBody(values);
    if (error) {
      notifyError(null, t('Unable to create instance: batch creation is not supported when specifying IP.'));
      return;
    }
    setSubmitting(true);
    try {
      await novaApi.createServerV(body);
      notification.success({
        message: t(
          'The creation instruction was issued successfully, instance: {name}. \n You can wait for a few seconds to follow the changes of the list data or manually refresh the data to get the final display result.',
          { action: t('Create ironic instance').toLowerCase(), name: getInstanceNames(values.name, count) }
        ),
      });
      navigate(listUrl);
    } catch (err) {
      if (isQuotaExceeded(err)) notification.error({ message: t('Quota exceeded') });
      else notifyError(err, t('The creation instruction has been issued, please refresh to see the actual situation in the list.'));
    } finally {
      setSubmitting(false);
    }
  };

  const systemDefaults = useMemo(
    () => (current === 2 ? getSystemDefaults({ context: data, presets, ironic: true }) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current]
  );

  if (!endpointOk) {
    return (
      <Result
        status="404"
        title={t('Create Ironic Instance')}
        subTitle={t('The {service} service is not deployed in the current region.', { service: 'ironic' })}
        extra={<Button onClick={() => navigate(listUrl)}>{t('Back')}</Button>}
      />
    );
  }

  const stepProps = { context: data, updateContext, presets, hasAdminRole, projectName, goStep, ironic: true };
  const footerLeft = (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span>{t('Count')}</span>
        <InputNumber
          className="instance-count"
          min={1}
          max={100}
          precision={0}
          value={count}
          onChange={(v) => updateContext({ count: v || 1 })}
          style={{ width: 96 }}
        />
      </span>
      {quotaError ? <Badge status="error" text={quotaMsg} style={{ marginTop: 6 }} /> : null}
    </div>
  );

  const renderStep = () => {
    const onValuesChange = (changed) => updateContext(changed);
    switch (current) {
      case 0:
        return (
          <Form key="base" form={baseForm} {...layout} initialValues={{ project: projectName }} onValuesChange={onValuesChange}>
            <IronicBaseStep form={baseForm} {...stepProps} />
          </Form>
        );
      case 1:
        return (
          <Form key="network" form={networkForm} {...layout} initialValues={{ networks: [] }} onValuesChange={onValuesChange}>
            <NetworkStep form={networkForm} {...stepProps} />
          </Form>
        );
      case 2:
        return (
          <Form key="system" form={systemForm} {...layout} initialValues={systemDefaults} onValuesChange={onValuesChange}>
            <SystemStep form={systemForm} {...stepProps} />
          </Form>
        );
      default:
        return (
          <Form key="confirm" form={confirmForm} {...layout}>
            <IronicConfirmStep {...stepProps} />
          </Form>
        );
    }
  };

  return (
    <WizardShell
      title={t('Create Ironic Instance')}
      breadcrumb={[{ title: t('Compute') }, listCrumb('/compute/instance', t('Instances')), { title: t('Create Ironic Instance') }]}
      steps={steps}
      current={current}
      footerLeft={footerLeft}
      onCancel={() => navigate(listUrl)}
      onPrev={prev}
      onNext={next}
      onOk={onOk}
      submitting={submitting}
    >
      {renderStep()}
    </WizardShell>
  );
}
