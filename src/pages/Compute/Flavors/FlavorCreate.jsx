import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Divider,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Steps,
  message,
} from 'antd';
import { novaApi } from '@/api/nova';
import { hasEndpoint } from '@/api/endpoints';
import { getErrorMessage } from '@/hooks/useResource';
import { t } from '@/core/i18n';
import {
  categoryHasEphemeral,
  categoryHasIOPS,
  categoryListByArch,
  cpuPolicyList,
  cpuThreadPolicyList,
  fetchSkylineSettings,
  flavorArchitectures,
  flavorCategoryList,
  getAllArchitecture,
  getFamilyItemValue,
  getSettingOptions,
  isBareMetal,
  isComputeOptimized,
  isGpuCategory,
  isGpuVisual,
  KeyValueList,
  NumaNodesInput,
  pageTypeList,
  ProjectSelectTable,
  StringList,
} from './helpers';

const RESOURCE_NEED_KEYS = ['VCPU', 'MEMORY_MB', 'DISK_GB'];
const PAGE_SIZE_RE =
  /^[1-9]\d*(Kb\(it\)|Kib\(it\)|Mb\(it\)|Mib\(it\)|Gb\(it\)|Gib\(it\)|Tb\(it\)|Tib\(it\)|KB|KiB|MB|MiB|GB|GiB|TB|TiB)?$/;

const pageSizeValueRule = {
  validator: (_, value) =>
    PAGE_SIZE_RE.test(value || '') ? Promise.resolve() : Promise.reject(new Error(t('Please enter right format memory page value!'))),
};

const getPageSizeValue = (type, value) => (type === 'custom' ? value : type);

/** Legacy StepCreate.getProperties: properties of the category in the flavor_families setting */
const getProperties = (architecture, category, settings) => {
  const archItem = getFamilyItemValue(settings).find((it) => it?.architecture === architecture);
  const categoryItem = (archItem?.categories || []).find((it) => it?.name === category);
  const obj = {};
  (categoryItem?.properties || []).forEach((it) => {
    if (it?.key) obj[it.key] = it.value;
  });
  return obj;
};

/** Legacy StepCreate.getSubmitData - payload kept identical */
export const getSubmitData = (values, settings) => {
  const {
    architecture,
    category,
    name,
    vcpus,
    memoryGb,
    bandwidth,
    iops,
    ephemeral,
    gpuType,
    gpuNumber,
    numaNodesNum,
    memPageSizeValueMore,
    memPageSizeValue,
    memPageSizeMore,
    attachUsb,
    usbType,
    usbNumber,
    numaNodes = [],
    cpuPolicy,
    cpuThreadPolicy,
    memPageSize,
    accessType,
    accessControl = [],
    resourceProps = [],
    traitProps = [],
    disk,
  } = values;
  const body = { name, vcpus, ram: memoryGb * 1024, disk: disk || 0 };
  const isPublic = accessType === 'public';
  body['os-flavor-access:is_public'] = isPublic;
  if (categoryHasEphemeral(category)) {
    body['OS-FLV-EXT-DATA:ephemeral'] = ephemeral;
  }
  const extraSpecs = {
    ':architecture': architecture,
    ':category': category,
    ...getProperties(architecture, category, settings),
  };
  if (bandwidth) {
    extraSpecs['quota:vif_outbound_average'] = bandwidth * 1000 * 125;
    extraSpecs['quota:vif_inbound_average'] = bandwidth * 1000 * 125;
  }
  if (categoryHasIOPS(category) && iops) {
    extraSpecs['quota:disk_total_iops_sec'] = iops;
  }
  const isGPUType = isGpuCategory(category);
  const isGpuVisualType = isGpuVisual(category);
  const isGpuComputeType = isGPUType && !isGpuVisualType;
  if (attachUsb) {
    extraSpecs['pci_passthrough:alias'] = `${usbType}:${usbNumber}`;
  }
  if (isGpuComputeType) {
    extraSpecs['pci_passthrough:alias'] = attachUsb
      ? `${gpuType}:${gpuNumber},${usbType}:${usbNumber}`
      : `${gpuType}:${gpuNumber}`;
  } else if (isGpuVisualType) {
    extraSpecs['resources:VGPU'] = `${gpuType}:${gpuNumber}`;
  }
  if (isComputeOptimized(category)) {
    extraSpecs['hw:numa_nodes'] = numaNodes.length;
    numaNodes.forEach((item, index) => {
      extraSpecs[`hw:numa_cpus.${index}`] = item.cpu;
      extraSpecs[`hw:numa_mem.${index}`] = item.ram;
    });
    extraSpecs['hw:cpu_policy'] = cpuPolicy;
    extraSpecs['hw:cpu_thread_policy'] = cpuThreadPolicy;
    extraSpecs['hw:mem_page_size'] = getPageSizeValue(memPageSize, memPageSizeValue);
  } else if (architecture !== 'bare_metal') {
    extraSpecs['hw:numa_nodes'] = numaNodesNum;
    extraSpecs['hw:mem_page_size'] = getPageSizeValue(memPageSizeMore, memPageSizeValueMore);
  }
  if (isBareMetal(architecture)) {
    resourceProps.forEach((it) => {
      extraSpecs[`resources:${it.key}`] = it.value;
    });
    traitProps.forEach((it) => {
      extraSpecs[`trait:${it}`] = 'required';
    });
  }
  return { body, extraSpecs, accessControl: !isPublic && (accessControl || []) };
};

/** Legacy FlavorStore.create */
const createFlavor = async ({ body, extraSpecs, accessControl }) => {
  const result = await novaApi.createFlavorV(body);
  const id = result?.flavor?.id;
  if (accessControl && accessControl.length > 0) {
    await Promise.all(accessControl.map((tenant) => novaApi.flavorActionV(id, { addTenantAccess: { tenant } })));
  }
  return novaApi.createFlavorExtraSpecsV(id, extraSpecs);
};

const titleDivider = (text) => (
  <Divider orientation="left" style={{ fontSize: 14, fontWeight: 600 }}>
    {text}
  </Divider>
);

export default function FlavorCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || undefined;
  const [form] = Form.useForm();
  const [current, setCurrent] = useState(0);
  const [settings, setSettings] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const enableCinder = hasEndpoint('cinder');

  useEffect(() => {
    fetchSkylineSettings().then(setSettings);
  }, []);

  const architecture = Form.useWatch('architecture', form);
  const category = Form.useWatch('category', form);
  const attachUsb = Form.useWatch('attachUsb', form);
  const more = Form.useWatch('more', form);
  const memPageSizeMore = Form.useWatch('memPageSizeMore', form);
  const memPageSize = Form.useWatch('memPageSize', form);
  const accessType = Form.useWatch('accessType', form);

  const archNames = flavorArchitectures();
  const archOptions = getAllArchitecture(settings, false).map((it) => ({ label: archNames[it] || it, value: it }));
  const families = getFamilyItemValue(settings);

  const categoryOptions = useMemo(() => {
    if (!architecture) return [];
    const catNames = flavorCategoryList();
    if (families.length) {
      const familyItem = families.find((it) => it?.architecture === architecture);
      return (familyItem?.categories || []).map((it) => ({ value: it.name, label: catNames[it.name] || it.name }));
    }
    const fallback = categoryListByArch[architecture];
    return fallback ? Object.entries(fallback()).map(([value, label]) => ({ value, label })) : [];
  }, [architecture, families]);

  const gpuTypes = getSettingOptions(settings, 'gpu_models');
  const usbTypes = getSettingOptions(settings, 'usb_models');
  const vgpuTypes = [{ value: 'vgpu', label: 'vgpu' }];

  const bareMetal = architecture === 'bare_metal';
  const hasIOPS = categoryHasIOPS(category);
  const hasEphemeral = categoryHasEphemeral(category);
  const isGPUType = isGpuCategory(category);
  const isGpuVisualType = isGpuVisual(category);
  const isGpuComputeType = isGPUType && !isGpuVisualType;
  const typeIsComputeOptimized = isComputeOptimized(category);
  const instanceType = flavorCategoryList()[category] || category;
  const showNumaInput = !typeIsComputeOptimized && !bareMetal;
  const showMemPageMore = Boolean(more) && showNumaInput;
  const showPageSizeInputMore = showMemPageMore && memPageSizeMore === 'custom';
  const showPageSizeInput = typeIsComputeOptimized && memPageSize === 'custom';

  const fill = (key) => t(key).replace(/\{ instanceType \}/g, instanceType || '');
  const NUMATip = fill(
    'It is recommended that { instanceType } instance simultaneously set NUMA affinity policy for PCIE device to force or priority matching. This configuration can further improve PCIE computing performance.'
  );
  const cpuBindTip = fill(
    'It is recommended to set CPU binding strategy as binding on { instanceType } instance. This configuration further improves the performance of the instance CPU.'
  );
  const cpuThreadBindTip = fill(
    'It is recommended to set the CPU thread binding policy as thread binding in { instanceType } instance, which can further improve the CPU performance of instance.'
  );
  const largePageTip = fill(
    'It is recommended that the { instanceType } instance simultaneously set large page memory to large. { instanceType } instances also require faster memory addressing capabilities.'
  );
  const largePageValueTip = t(
    'The unit suffix must be one of the following: Kb(it), Kib(it), Mb(it), Mib(it), Gb(it), Gib(it), Tb(it), Tib(it), KB, KiB, MB, MiB, GB, GiB, TB, TiB. If the unit suffix is not provided, it is assumed to be KB.'
  );
  const pageSizePlaceholder = t('Please enter a memory page size, such as: 1024, 1024 MiB');

  const numaRule = ({ getFieldValue }) => ({
    validator(_, value) {
      if (!isComputeOptimized(getFieldValue('category'))) return Promise.resolve();
      if (!value || value.length === 0) return Promise.reject(new Error(t('Please set NUMA')));
      const vcpus = getFieldValue('vcpus');
      const memoryGb = getFieldValue('memoryGb');
      if (!vcpus || !memoryGb) return Promise.reject(new Error(t('Please set CPU and RAM first.')));
      const ram = memoryGb * 1024;
      let totalCpu = 0;
      let totalRam = 0;
      value.forEach((it) => {
        totalCpu += it?.cpu || 0;
        totalRam += it?.ram || 0;
      });
      let error = t('Invalid: ');
      let hasError = false;
      if (totalCpu !== vcpus) {
        error += t('CPU value is { cpu }, NUMA CPU value is { totalCpu }, need to be equal.')
          .replace('{ cpu }', vcpus)
          .replace('{ totalCpu }', totalCpu);
        hasError = true;
      }
      if (totalRam !== ram) {
        error += t('RAM value is { ram }, NUMA RAM value is { totalRam }, need to be equal.')
          .replace('{ ram }', ram)
          .replace('{ totalRam }', totalRam);
        hasError = true;
      }
      return hasError ? Promise.reject(new Error(error)) : Promise.resolve();
    },
  });

  const resourcePropsRule = {
    validator: (_, values = []) => {
      const bad = values.find((it, index) => {
        if (!it?.value) return true;
        if (index >= RESOURCE_NEED_KEYS.length && !/^CUSTOM_[A-Z0-9_]{1,248}$/.test(it.key || '')) return true;
        return false;
      });
      return bad ? Promise.reject(new Error(t('Please enter right format key value!'))) : Promise.resolve();
    },
  };

  const traitPropsRule = {
    validator: (_, values = []) =>
      (values || []).some((it) => !it) ? Promise.reject(new Error(t('Please enter right format trait!'))) : Promise.resolve(),
  };

  const required = (label) => ({ required: true, message: `${t('Please enter/select')} ${label}!` });

  const listUrl = (arch) => `/compute/flavor-admin${arch || tab ? `?tab=${arch || tab}` : ''}`;

  const onNext = async () => {
    try {
      await form.validateFields();
      setCurrent(1);
    } catch {
      // validation errors shown inline
    }
  };

  const onSubmit = async () => {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const values = form.getFieldsValue(true);
    setSubmitting(true);
    try {
      await createFlavor(getSubmitData(values, settings));
      message.success(t('Operation completed successfully'));
      navigate(listUrl(values.architecture));
    } catch (err) {
      message.error(getErrorMessage(err, t('Operation failed')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { title: t('Compute') },
          { title: <Link to={listUrl()}>{t('Flavors')}</Link> },
          { title: t('Create Flavor') },
        ]}
        style={{ marginBottom: 16, fontSize: 13 }}
      />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t('Create Flavor')}
        </h1>
      </div>
      <Card variant="borderless" style={{ borderRadius: 8 }}>
        <Steps
          current={current}
          items={[{ title: t('Params Setting') }, { title: t('Access Type Setting') }]}
          style={{ maxWidth: 640, margin: '0 auto 24px' }}
        />
        <Form
          form={form}
          labelCol={{ xs: { span: 24 }, md: { span: 6 } }}
          wrapperCol={{ xs: { span: 24 }, md: { span: 16 } }}
          initialValues={{
            vcpus: 1,
            memoryGb: 1,
            numaNodesNum: 1,
            ephemeral: 0,
            ephemeralTmp: 0,
            disk: 0,
            architecture: tab,
            attachUsb: false,
            resourceProps: RESOURCE_NEED_KEYS.map((key) => ({ key, value: '0' })),
            traitProps: [],
            memPageSizeMore: 'any',
            memPageSize: 'large',
            numaNodes: [{ cpu: 1, ram: 1024 }],
            accessType: 'public',
            accessControl: [],
          }}
          onValuesChange={(changed) => {
            if ('architecture' in changed) form.setFieldValue('category', undefined);
          }}
        >
          {current === 0 ? (
            <>
              {titleDivider(t('Basic Parameters'))}
              <Form.Item name="architecture" label={t('Architecture')} rules={[required(t('Architecture'))]}>
                <Radio.Group options={archOptions} optionType="button" />
              </Form.Item>
              <Form.Item
                name="category"
                label={t('Type')}
                rules={[required(t('Type'))]}
                extra={architecture && !categoryOptions.length ? t('No Data') : null}
              >
                <Radio.Group options={categoryOptions} />
              </Form.Item>
              <Form.Item name="name" label={t('Flavor Name')} rules={[required(t('Flavor Name'))]}>
                <Input placeholder={t('Please input name')} />
              </Form.Item>
              <Form.Item
                name="vcpus"
                label={t('vCPU (Cores)')}
                rules={[required(t('vCPU (Cores)'))]}
                extra={t(
                  'The number of vCPU cores should not exceed the maximum number of CPU cores of the physical node. Otherwise it will cause fail to schedule to any physical node when creating instance.'
                )}
              >
                <InputNumber min={1} precision={0} style={{ width: 200 }} />
              </Form.Item>
              <Form.Item name="memoryGb" label={t('RAM Size (GiB)')} rules={[required(t('RAM Size (GiB)'))]}>
                <InputNumber min={1} precision={0} style={{ width: 200 }} />
              </Form.Item>
              {!bareMetal ? (
                <Form.Item name="bandwidth" label={t('Internal Network Bandwidth (Gbps)')}>
                  <InputNumber min={1} precision={0} style={{ width: 200 }} />
                </Form.Item>
              ) : null}
              {hasEphemeral ? (
                <Form.Item name="ephemeral" label={t('Ephemeral Disk (GiB)')} rules={[required(t('Ephemeral Disk (GiB)'))]}>
                  <InputNumber min={0} precision={0} style={{ width: 200 }} />
                </Form.Item>
              ) : null}
              {!bareMetal && !hasEphemeral ? (
                <Form.Item name="ephemeralTmp" label={t('Ephemeral Disk (GiB)')}>
                  <InputNumber min={0} precision={0} disabled style={{ width: 200 }} />
                </Form.Item>
              ) : null}
              {!enableCinder ? (
                <Form.Item name="disk" label={t('Root Disk (GiB)')}>
                  <InputNumber min={0} precision={0} style={{ width: 200 }} />
                </Form.Item>
              ) : null}
              {!bareMetal && hasIOPS ? (
                <Form.Item name="iops" label={t('Storage IOPS')}>
                  <InputNumber min={1} precision={0} style={{ width: 200 }} />
                </Form.Item>
              ) : null}
              {showNumaInput ? (
                <>
                  <Form.Item name="numaNodesNum" label={t('NUMA Nodes')} rules={[required(t('NUMA Nodes'))]}>
                    <InputNumber min={1} precision={0} style={{ width: 200 }} />
                  </Form.Item>
                  <Form.Item name="more" label={t('Advanced Options')} valuePropName="checked">
                    <Checkbox />
                  </Form.Item>
                </>
              ) : null}
              {showMemPageMore ? (
                <Form.Item name="memPageSizeMore" label={t('Memory Page')} rules={[required(t('Memory Page'))]} tooltip={largePageTip}>
                  <Select options={pageTypeList()} style={{ maxWidth: 360 }} />
                </Form.Item>
              ) : null}
              {showPageSizeInputMore ? (
                <Form.Item
                  name="memPageSizeValueMore"
                  label={t('Memory Page Size')}
                  rules={[required(t('Memory Page Size')), pageSizeValueRule]}
                  extra={largePageValueTip}
                >
                  <Input placeholder={pageSizePlaceholder} style={{ maxWidth: 360 }} />
                </Form.Item>
              ) : null}

              {isGPUType ? titleDivider(t('GPU Parameters')) : null}
              {isGpuComputeType ? (
                <Form.Item
                  name="gpuType"
                  label={t('GPU Model')}
                  rules={[required(t('GPU Model'))]}
                  tooltip={t(
                    'GPU pass-through will load GPU devices directly to the instance for use. vGPU is a GPU virtualization solution. GPU resources will be segmented and distributed to multiple instances for shared use.'
                  )}
                >
                  <Select options={gpuTypes} style={{ maxWidth: 360 }} placeholder={t('Please select')} />
                </Form.Item>
              ) : null}
              {isGpuVisualType ? (
                <Form.Item name="gpuType" label={t('GPU Model')} initialValue="vgpu">
                  <Select options={vgpuTypes} style={{ maxWidth: 360 }} />
                </Form.Item>
              ) : null}
              {isGPUType ? (
                <Form.Item name="gpuNumber" label={t('Number of GPU')} rules={[required(t('Number of GPU'))]}>
                  <InputNumber min={1} precision={0} style={{ width: 200 }} />
                </Form.Item>
              ) : null}

              {typeIsComputeOptimized ? (
                <>
                  {titleDivider(t('Optimized Parameters'))}
                  <Form.Item
                    name="numaNodes"
                    label={t('NUMA Nodes')}
                    tooltip={NUMATip}
                    dependencies={['vcpus', 'memoryGb']}
                    rules={[numaRule]}
                    required
                  >
                    <NumaNodesInput />
                  </Form.Item>
                  <Form.Item name="cpuPolicy" label={t('CPU Policy')} rules={[required(t('CPU Policy'))]} tooltip={cpuBindTip}>
                    <Radio.Group options={Object.entries(cpuPolicyList()).map(([value, label]) => ({ value, label }))} />
                  </Form.Item>
                  <Form.Item
                    name="cpuThreadPolicy"
                    label={t('CPU Thread Policy')}
                    rules={[required(t('CPU Thread Policy'))]}
                    tooltip={cpuThreadBindTip}
                  >
                    <Select options={cpuThreadPolicyList()} style={{ maxWidth: 360 }} placeholder={t('Please select')} />
                  </Form.Item>
                  <Form.Item name="memPageSize" label={t('Memory Page')} rules={[required(t('Memory Page'))]} tooltip={largePageTip}>
                    <Select options={pageTypeList()} style={{ maxWidth: 360 }} />
                  </Form.Item>
                  {showPageSizeInput ? (
                    <Form.Item
                      name="memPageSizeValue"
                      label={t('Memory Page Size')}
                      rules={[required(t('Memory Page Size')), pageSizeValueRule]}
                      extra={largePageValueTip}
                    >
                      <Input placeholder={pageSizePlaceholder} style={{ maxWidth: 360 }} />
                    </Form.Item>
                  ) : null}
                </>
              ) : null}

              {usbTypes.length ? (
                <>
                  {titleDivider(t('USB Parameters'))}
                  <Form.Item name="attachUsb" label={t('Attach USB')}>
                    <Radio.Group
                      options={[
                        { label: t('Yes'), value: true },
                        { label: t('No'), value: false },
                      ]}
                    />
                  </Form.Item>
                  {attachUsb ? (
                    <>
                      <Form.Item name="usbType" label={t('USB Controller')} rules={[required(t('USB Controller'))]}>
                        <Select options={usbTypes} style={{ maxWidth: 360 }} placeholder={t('Please select')} />
                      </Form.Item>
                      <Form.Item
                        name="usbNumber"
                        label={t('Number of USB Controllers')}
                        rules={[required(t('Number of USB Controllers'))]}
                      >
                        <InputNumber min={1} precision={0} style={{ width: 200 }} />
                      </Form.Item>
                    </>
                  ) : null}
                </>
              ) : null}

              {bareMetal ? (
                <>
                  {titleDivider(t('Bare Metal Parameters'))}
                  <Form.Item
                    name="resourceProps"
                    label={t('Resource Class Properties')}
                    required
                    rules={[resourcePropsRule]}
                    extra={
                      <div>
                        <p>
                          {t(
                            '1. The name of the custom resource class property should start with CUSTOM_, can only contain uppercase letters A ~ Z, numbers 0 ~ 9 or underscores, and the length should not exceed 255 characters (for example: CUSTOM_BAREMETAL_SMALL).'
                          )}
                        </p>
                        <p>
                          {t(
                            '2. You can customize the resource class name of the flavor, but it needs to correspond to the resource class of the scheduled node (for example, the resource class name of the scheduling node is baremetal.with-GPU, and the custom resource class name of the flavor is CUSTOM_BAREMETAL_WITH_GPU=1).'
                          )}
                        </p>
                      </div>
                    }
                  >
                    <KeyValueList addText={t('Add Property')} readonlyKeys={RESOURCE_NEED_KEYS} minCount={RESOURCE_NEED_KEYS.length} />
                  </Form.Item>
                  <Form.Item
                    name="traitProps"
                    label={t('Trait Properties')}
                    required
                    rules={[traitPropsRule]}
                    extra={t(
                      'The trait name of the flavor needs to correspond to the trait of the scheduling node; by injecting the necessary traits into the ironic instance, the computing service will only schedule the instance to the bare metal node with all necessary traits (for example: the trait of the scheduling node has HW_CPU_X86_VMX trait, and the flavor adds HW_CPU_X86_VMX, it can be scheduled to this node for necessary traits).'
                    )}
                  >
                    <StringList addText={t('Add Property')} />
                  </Form.Item>
                </>
              ) : null}
            </>
          ) : (
            <>
              <Form.Item name="accessType" label={t('Access Type')}>
                <Radio.Group
                  options={[
                    { label: t('Public'), value: 'public' },
                    { label: t('Access Control'), value: 'accessControl' },
                  ]}
                />
              </Form.Item>
              {accessType !== 'public' ? (
                <Form.Item
                  name="accessControl"
                  label={t('Access Control')}
                  required
                  rules={[
                    {
                      validator: (_, v) =>
                        Array.isArray(v) && v.length
                          ? Promise.resolve()
                          : Promise.reject(new Error(`${t('Please select')} ${t('Access Control')}`)),
                    },
                  ]}
                >
                  <ProjectSelectTable />
                </Form.Item>
              ) : null}
            </>
          )}
        </Form>
        {!families.length && settings !== null ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('Flavor families are not configured in the Skyline settings; default architectures and categories are used.')}
          />
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Space>
            <Button onClick={() => navigate(listUrl())}>{t('Cancel')}</Button>
            {current > 0 ? <Button onClick={() => setCurrent(current - 1)}>{t('Previous')}</Button> : null}
            {current === 0 ? (
              <Button type="primary" onClick={onNext}>
                {t('Next')}
              </Button>
            ) : (
              <Button type="primary" loading={submitting} onClick={onSubmit}>
                {t('Confirm')}
              </Button>
            )}
          </Space>
        </div>
      </Card>
    </div>
  );
}
