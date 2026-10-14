import React, { useEffect, useMemo, useState } from 'react';
import { Breadcrumb, Button, Card, Form, Input, InputNumber, Select, Space, Spin, Steps, Switch, message } from 'antd';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ironicApi } from '@/api/ironic';
import { placementApi } from '@/api/placement';
import { glanceApi } from '@/api/glance';
import { getErrorMessage } from '@/hooks/useResource';
import { t } from '@/core/i18n';
import { nameRule } from '../_shared/nameRules';
import { KeyValueList, keyValueRule, ipRule, objToKV, kvToObj, getDifFromKV, hasValue, isEqual, fetchNodeDetail } from './helpers';

const LIST_PATH = '/compute/baremetal-node-admin';
const NEED_KEYS = ['cpus', 'memory_mb', 'local_gb', 'cpu_arch'];
const isCustomTrait = (it) => String(it).indexOf('CUSTOM_') >= 0;

/* ---------- Step 1: NodeInfo (legacy actions/Create/NodeInfo) ---------- */

const getDefaultPropValues = (values = []) => {
  const items = NEED_KEYS.map((key) => {
    const item = values.find((it) => it.key === key);
    return { key, value: item ? item.value : '' };
  });
  values.forEach((it) => {
    if (NEED_KEYS.indexOf(it.key) < 0) items.push(it);
  });
  return items;
};

const customTraitRule = () => ({
  validator: (_, values) => {
    if (!values || !values.length) return Promise.resolve();
    const r = /^CUSTOM_[A-Z0-9_]{1,248}$/;
    const bad = values.find((v) => !v || !r.test(v));
    return bad ? Promise.reject(new Error(t('Please enter right format custom trait!'))) : Promise.resolve();
  },
});

const nodeInfoFields = (traitOptions) => [
  { name: 'name', label: t('Node Name'), rules: [nameRule()], node: <Input /> },
  {
    name: 'driver',
    label: t('Node Driver'),
    required: true,
    node: <Select options={[{ value: 'ipmi', label: 'IPMI' }]} />,
  },
  {
    name: 'properties',
    label: t('Properties'),
    rules: [keyValueRule(NEED_KEYS)],
    node: <KeyValueList addText={t('Add Property')} readonlyKeys={NEED_KEYS} minCount={NEED_KEYS.length} />,
  },
  {
    name: 'extra',
    label: t('Extra Infos'),
    rules: [keyValueRule()],
    node: <KeyValueList addText={t('Add Extra Info')} />,
  },
  {
    name: 'standard_trait',
    label: t('Standard Trait'),
    extra: t(
      'The trait of the scheduled node needs to correspond to the trait of the flavor used by the ironic instance; by injecting the necessary traits into the ironic instance, the computing service will only schedule the instance to the bare metal node with all the necessary traits (for example, the ironic instance which use the flavor that has HW_CPU_X86_VMX as a necessary trait, can be scheduled to the node which has the trait of HW_CPU_X86_VMX).'
    ),
    node: <Select mode="multiple" allowClear showSearch options={traitOptions} />,
  },
  {
    name: 'custom_trait',
    label: t('Custom Trait'),
    rules: [customTraitRule()],
    extra: (
      <div>
        <p style={{ margin: '4px 0' }}>
          {t(
            '1. The name of the trait should start with CUSTOM_, can only contain uppercase letters A ~ Z, numbers 0 ~ 9 or underscores, and the length should not exceed 255 characters (for example: CUSTOM_TRAIT1).'
          )}
        </p>
        <p style={{ margin: '4px 0' }}>
          {t(
            '2. The trait of the scheduled node needs to correspond to the trait of the flavor used by the ironic instance; by injecting the necessary traits into the ironic instance, the computing service will only schedule the instance to the bare metal node with all the necessary traits (for example, the ironic instance which use the flavor that has CUSTOM_TRAIT1 as a necessary trait, can be scheduled to the node which has the trait of CUSTOM_TRAIT1).'
          )}
        </p>
      </div>
    ),
    node: <Select mode="tags" tokenSeparators={[',', ' ']} open={false} />,
  },
  {
    name: 'resource_class',
    label: t('Resource Class'),
    extra: t(
      'The resource class of the scheduled node needs to correspond to the resource class name of the flavor used by the ironic instance (for example, the resource class name of the scheduling node is baremetal.with-GPU, and the custom resource class name of the flavor is CUSTOM_BAREMETAL_WITH_GPU=1).'
    ),
    node: <Input />,
  },
];

/* ---------- Step 2: DriveInfo ---------- */

const driverInfoFields = ({ kernelImages, ramdiskImages, more }) => [
  {
    name: 'driver_info_deploy_kernel',
    label: t('Kernel Image'),
    required: true,
    node: <Select showSearch optionFilterProp="label" options={kernelImages} />,
  },
  {
    name: 'driver_info_deploy_ramdisk',
    label: t('Ramdisk Image'),
    required: true,
    node: <Select showSearch optionFilterProp="label" options={ramdiskImages} />,
  },
  { name: 'driver_info_ipmi_address', label: t('IPMI Address'), required: true, rules: [ipRule()], node: <Input /> },
  {
    name: 'driver_info_ipmi_port',
    label: t('IPMI Port'),
    node: <InputNumber min={0} max={65535} precision={0} style={{ width: '100%' }} />,
  },
  { name: 'driver_info_ipmi_username', label: t('IPMI Username'), required: true, node: <Input /> },
  { name: 'driver_info_ipmi_password', label: t('IPMI Password'), required: true, node: <Input /> },
  {
    name: 'driver_info_ipmi_bridge',
    label: t('IPMI Bridge'),
    hidden: !more,
    node: <Select options={[{ value: 'no', label: t('No') }]} />,
  },
  {
    name: 'driver_info_ipmi_priv_level',
    label: t('IPMI Privilege Level'),
    hidden: !more,
    node: (
      <Select
        options={[
          { value: 'ADMINISTRATOR', label: t('ADMINISTRATOR') },
          { value: 'USER', label: t('USER') },
        ]}
      />
    ),
  },
  {
    name: 'driver_info_ipmi_protocol_version',
    label: t('IPMI Protocol Version'),
    hidden: !more,
    node: (
      <Select
        options={[
          { value: '1.5', label: '1.5' },
          { value: '2.0', label: '2.0' },
        ]}
      />
    ),
  },
];

/* ---------- Step 3: DriveInterface ---------- */

const driverInterfaceFields = () => [
  {
    name: 'boot_interface',
    label: t('Boot Interface'),
    node: (
      <Select
        options={[
          { value: 'pxe', label: t('PXE') },
          { value: 'ipxe', label: t('iPXE') },
          { value: 'fake', label: t('FAKE') },
        ]}
      />
    ),
  },
  {
    name: 'console_interface',
    label: t('Console Interface'),
    node: <Select options={[{ value: 'no-console', label: t('No Console') }]} />,
  },
  {
    name: 'network_interface',
    label: t('Network Interface'),
    extra: t('Which Network Interface provider to use when plumbing the network connections for this Node'),
    node: (
      <Select
        options={[
          { value: 'flat', label: t('Flat') },
          { value: 'noop', label: t('Noop') },
        ]}
      />
    ),
  },
  {
    name: 'raid_interface',
    label: t('RAID Interface'),
    extra: t('Interface used for configuring RAID on this node'),
    node: (
      <Select
        options={[
          { value: 'no-raid', label: t('No RAID') },
          { value: 'agent', label: t('Agent') },
        ]}
      />
    ),
  },
  {
    name: 'storage_interface',
    label: t('Storage Interface'),
    extra: t('Interface used for attaching and detaching volumes on this node'),
    node: <Select options={[{ value: 'noop', label: t('Noop') }]} />,
  },
  {
    name: 'vendor_interface',
    label: t('Vendor Interface'),
    extra: t('Interface for vendor-specific functionality on this node'),
    node: <Select options={[{ value: 'ipmitool', label: t('IPMITool') }]} />,
  },
];

/* ---------- defaults / payload (legacy actions/Create/index.jsx) ---------- */

const buildDefaults = (extra = {}) => {
  const traits = Array.isArray(extra.traits) ? [...extra.traits].sort() : [];
  return {
    // NodeInfo
    name: extra.name || undefined,
    driver: extra.driver || 'ipmi',
    properties: getDefaultPropValues(extra.properties || []),
    extra: extra.extra || [],
    resource_class: extra.resource_class,
    standard_trait: traits.filter((it) => !isCustomTrait(it)),
    custom_trait: traits.filter((it) => isCustomTrait(it)),
    // DriveInfo
    driver_info_deploy_kernel: extra.driver_info_deploy_kernel,
    driver_info_deploy_ramdisk: extra.driver_info_deploy_ramdisk,
    driver_info_ipmi_address: extra.driver_info_ipmi_address,
    driver_info_ipmi_port: extra.driver_info_ipmi_port,
    driver_info_ipmi_username: extra.driver_info_ipmi_username,
    driver_info_ipmi_password: extra.driver_info_ipmi_password ?? '',
    driver_info_ipmi_bridge: extra.driver_info_ipmi_bridge ?? 'no',
    driver_info_ipmi_priv_level: extra.driver_info_ipmi_priv_level ?? 'ADMINISTRATOR',
    driver_info_ipmi_protocol_version: extra.driver_info_ipmi_protocol_version ?? '2.0',
    // DriveInterface
    boot_interface: extra.boot_interface ?? 'pxe',
    console_interface: extra.console_interface ?? 'no-console',
    network_interface: extra.network_interface ?? 'noop',
    raid_interface: extra.raid_interface ?? 'no-raid',
    storage_interface: extra.storage_interface ?? 'noop',
    vendor_interface: extra.vendor_interface ?? 'ipmitool',
  };
};

/** legacy getDetail: properties/extra -> arrays, driver_info -> driver_info_<key> */
const toOriginData = (detail) => {
  const data = { ...detail };
  data.properties = objToKV(detail.properties);
  data.extra = objToKV(detail.extra);
  const driverInfo = detail.driver_info && typeof detail.driver_info === 'object' ? detail.driver_info : {};
  Object.keys(driverInfo).forEach((key) => {
    data[`driver_info_${key}`] = driverInfo[key];
  });
  return data;
};

const updateValues = (values) => {
  const { custom_trait = [], standard_trait = [], ...rest } = values;
  return { traits: [...(custom_trait || []), ...(standard_trait || [])], ...rest };
};

const submitCreate = async (values) => {
  const body = {};
  const driverInfo = {};
  Object.keys(values).forEach((key) => {
    const prefix = 'driver_info_';
    if (key.indexOf(prefix) === 0) {
      driverInfo[key.substring(prefix.length)] = values[key];
    } else if (key === 'properties' || key === 'extra') {
      const obj = kvToObj(values[key]);
      if (Object.keys(obj).length) body[key] = obj;
    } else {
      const isEmptyName = key === 'name' && values[key] === '';
      body[key] = isEmptyName ? null : values[key];
    }
  });
  body.driver_info = driverInfo;
  // IronicStore.create: create node, then PUT traits when any
  const { traits = [], ...rest } = body;
  const result = await ironicApi.createNode(rest);
  if (!traits.length) return result;
  return ironicApi.updateTraits(result?.uuid, traits);
};

const getKeyPath = (key) => {
  const prefix = 'driver_info_';
  if (key.indexOf(prefix) === 0) return `/driver_info/${key.substring(prefix.length)}`;
  return `/${key}`;
};

const submitEdit = async (id, values, originData) => {
  const adds = [];
  const replaces = [];
  const dels = [];
  const { properties, extra, traits, ...rest } = values;
  const { properties: oldProps = [], extra: oldExtra = [], traits: oldTraits } = originData;
  Object.keys(rest).forEach((key) => {
    const value = values[key];
    const obj = { value, path: getKeyPath(key) };
    if (!Object.prototype.hasOwnProperty.call(originData, key) && hasValue(value)) {
      obj.op = 'add';
      adds.push(obj);
    } else {
      const oldValue = originData[key];
      if (!isEqual(oldValue, value) && (oldValue || value)) {
        if (key === 'name' && value === '') {
          obj.op = 'remove';
          dels.push(obj);
        } else {
          obj.op = 'replace';
          replaces.push(obj);
        }
      }
    }
  });
  const p = getDifFromKV(properties, oldProps, 'properties');
  const e = getDifFromKV(extra, oldExtra, 'extra');
  adds.push(...p.adds.filter((it) => hasValue(it.value)), ...e.adds.filter((it) => hasValue(it.value)));
  replaces.push(...p.replaces.filter((it) => hasValue(it.value)), ...e.replaces.filter((it) => hasValue(it.value)));
  dels.push(...p.dels, ...e.dels);
  const body = [...adds, ...replaces, ...dels];
  if (!isEqual(traits, oldTraits)) {
    await ironicApi.updateTraits(id, traits);
  }
  if (!body.length) return undefined;
  return ironicApi.updateNode(id, body);
};

/* ---------- page ---------- */

const renderFields = (fields) =>
  fields.map((f) => (
    <Form.Item
      key={f.name}
      name={f.name}
      label={f.label}
      hidden={f.hidden}
      extra={f.extra}
      rules={[
        ...(f.required ? [{ required: true, message: `${t('Please enter/select')} ${f.label}!` }] : []),
        ...(f.rules || []),
      ]}
    >
      {f.node}
    </Form.Item>
  ));

export default function NodeCreate() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isEdit = pathname.indexOf('edit') >= 0;
  const [form] = Form.useForm();
  const [current, setCurrent] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [originData, setOriginData] = useState(null);
  const [traits, setTraits] = useState([]);
  const [images, setImages] = useState([]);

  useEffect(() => {
    placementApi
      .listTraits()
      .then((res) => setTraits(Array.isArray(res?.traits) ? [...res.traits].sort() : []))
      .catch(() => setTraits([]));
    glanceApi
      .listImages({ limit: 1000 })
      .then((res) => setImages(Array.isArray(res?.images) ? res.images : []))
      .catch(() => setImages([]));
  }, []);

  useEffect(() => {
    if (!isEdit) {
      form.setFieldsValue(buildDefaults());
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchNodeDetail(id, { onlyDetail: true })
      .then((detail) => {
        if (cancelled) return;
        const data = toOriginData(detail || {});
        setOriginData(data);
        form.setFieldsValue(buildDefaults(data));
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, form]);

  const traitOptions = useMemo(
    () => traits.filter((it) => !isCustomTrait(it)).map((it) => ({ value: it, label: it })),
    [traits]
  );
  const kernelImages = useMemo(
    () => images.filter((it) => it.disk_format === 'aki').map((it) => ({ value: it.id, label: it.name || it.id })),
    [images]
  );
  const ramdiskImages = useMemo(
    () => images.filter((it) => it.disk_format === 'ari').map((it) => ({ value: it.id, label: it.name || it.id })),
    [images]
  );

  const steps = [
    { title: t('Node Info'), fields: nodeInfoFields(traitOptions) },
    { title: t('Driver Info'), fields: driverInfoFields({ kernelImages, ramdiskImages, more }), more: true },
    { title: t('Driver Interface'), fields: driverInterfaceFields() },
  ];

  const title = isEdit ? t('Edit Bare Metal Node') : t('Create Node');

  const next = async () => {
    try {
      await form.validateFields(steps[current].fields.map((f) => f.name));
      setCurrent((c) => c + 1);
    } catch {
      // validation errors are shown inline
    }
  };

  const onSubmit = async () => {
    try {
      await form.validateFields(steps[current].fields.map((f) => f.name));
    } catch {
      return;
    }
    const values = updateValues(form.getFieldsValue(true));
    setSubmitting(true);
    try {
      if (isEdit) {
        await submitEdit(id, values, originData || {});
      } else {
        await submitCreate(values);
      }
      message.success(t('Operation completed successfully'));
      navigate(LIST_PATH);
    } catch (err) {
      message.error(getErrorMessage(err, t('Operation failed')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb
        style={{ marginBottom: 16, fontSize: 13 }}
        items={[
          { title: t('Compute') },
          { title: <Link to={LIST_PATH}>{t('Bare Metal Nodes')}</Link> },
          { title },
        ]}
      />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {title}
        </h1>
      </div>
      <Card variant="borderless" style={{ borderRadius: 8 }}>
        <Steps current={current} items={steps.map((s) => ({ title: s.title }))} style={{ marginBottom: 24 }} />
        <Spin spinning={loading}>
          <Form form={form} layout="vertical" style={{ maxWidth: 760 }}>
            {steps.map((s, idx) => (
              <div key={s.title} style={{ display: idx === current ? 'block' : 'none' }}>
                {s.more ? (
                  <>
                    {renderFields(s.fields.filter((f) => !f.name.match(/ipmi_(bridge|priv_level|protocol_version)$/)))}
                    <Form.Item label={t('Advanced Options')}>
                      <Switch checked={more} onChange={setMore} />
                    </Form.Item>
                    {renderFields(s.fields.filter((f) => f.name.match(/ipmi_(bridge|priv_level|protocol_version)$/)))}
                  </>
                ) : (
                  renderFields(s.fields)
                )}
              </div>
            ))}
          </Form>
        </Spin>
        <Space style={{ marginTop: 8 }}>
          <Button onClick={() => navigate(LIST_PATH)}>{t('Cancel')}</Button>
          {current > 0 ? <Button onClick={() => setCurrent((c) => c - 1)}>{t('Previous')}</Button> : null}
          {current < steps.length - 1 ? (
            <Button type="primary" onClick={next}>
              {t('Next')}
            </Button>
          ) : (
            <Button type="primary" loading={submitting} disabled={loading} onClick={onSubmit}>
              {t('Confirm')}
            </Button>
          )}
        </Space>
      </Card>
    </div>
  );
}
