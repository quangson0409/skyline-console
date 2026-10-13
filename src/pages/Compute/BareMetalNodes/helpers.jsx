import React from 'react';
import { Button, Input, Space } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { ironicApi } from '@/api/ironic';
import { t } from '@/core/i18n';

/** Port of legacy resources/ironic/ironic.js */
export const powerState = () => ({
  'power on': t('Power On'),
  'power off': t('Power Off'),
  rebooting: t('Rebooting'),
  'soft rebooting': t('Soft Rebooting'),
  'soft power off': t('Soft Power Off'),
});

export const provisioningState = () => ({
  enroll: t('Enroll'),
  manageable: t('Manageable'),
  active: t('Active'),
  available: t('Available'),
  'wait call-back': t('Deploy Wait'),
  deleting: t('Deleting'),
  deleted: t('Deleted'),
  cleaning: t('Cleaning'),
  'adopt failed': t('Adopt Failed'),
  'clean failed': t('Clean Failed'),
  'clean wait': t('Clean Wait'),
  'deploy failed': t('Deploy Failed'),
  deploying: t('Deploying'),
  error: t('Error'),
  rebuild: t('Rebuilt'),
  verifying: t('Verifying'),
});

export const canChangeStatus = (item) =>
  ['available', 'active', 'manageable', 'enroll'].indexOf(item?.provision_state) >= 0;

const isPlainEmpty = (v) => {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
};

/** legacy hasValue: !!value || isNumber(value) || !isEmpty(value) */
export const hasValue = (value) => !!value || typeof value === 'number' || !isPlainEmpty(value);

export const isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** lodash.get / has replacement supporting "a.b" paths */
export const getPath = (obj, path) =>
  String(path)
    .split('.')
    .reduce((acc, k) => (acc === undefined || acc === null ? undefined : acc[k]), obj);

export const hasPath = (obj, path) => {
  const keys = String(path).split('.');
  let cur = obj;
  for (const k of keys) {
    if (cur === null || cur === undefined || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, k)) {
      return false;
    }
    cur = cur[k];
  }
  return true;
};

export const yesNoOptions = () => [
  { label: t('Yes'), value: true },
  { label: t('No'), value: false },
];

export const yesNoText = (v) => (v ? t('Yes') : t('No'));

/* ---------- key/value list ("add-select" + KeyValueInput) ---------- */

/** legacy updateObjToAddSelectArray -> [{ key, value }] */
export const objToKV = (obj) =>
  obj && typeof obj === 'object' && !Array.isArray(obj)
    ? Object.keys(obj).map((key) => ({ key, value: obj[key] }))
    : [];

/** legacy updateAddSelectValueToObj (drops empty strings) */
export const kvToObj = (arr = []) => {
  const obj = {};
  (arr || []).forEach(({ key, value } = {}) => {
    if ((typeof value === 'string' && value) || typeof value !== 'string') {
      obj[key] = value;
    }
  });
  return obj;
};

/** legacy getDifFromAddSelectValue on [{ key, value }] arrays */
export const getDifFromKV = (newValues = [], oldValues = [], name) => {
  const adds = [];
  const replaces = [];
  const dels = [];
  (newValues || []).forEach(({ key, value }) => {
    const oldItem = (oldValues || []).find((it) => it.key === key);
    const obj = { path: `/${name}/${key}`, value };
    if (!oldItem) {
      obj.op = 'add';
      adds.push(obj);
    } else if (oldItem.value !== value) {
      obj.op = 'replace';
      replaces.push(obj);
    }
  });
  (oldValues || []).forEach(({ key }) => {
    if (!(newValues || []).find((it) => it.key === key)) {
      dels.push({ op: 'remove', path: `/${name}/${key}` });
    }
  });
  return { adds, replaces, dels };
};

/** legacy checkKeyValues: every row needs a key and a value (except readonly keys) */
export const keyValueRule = (needKeys = []) => ({
  validator: (_, values) => {
    if (!values || !values.length) return Promise.resolve();
    const bad = values.find(({ key, value } = {}) => {
      if (needKeys.indexOf(key) >= 0) return false;
      return !key || value === undefined || value === null;
    });
    return bad ? Promise.reject(new Error(t('Please enter complete key value!'))) : Promise.resolve();
  },
});

const macRegex = /^[A-F0-9]{2}(:[A-F0-9]{2}){5}$/;
export const macRule = () => ({
  validator: (_, value) => {
    if (!value) return Promise.resolve();
    if (macRegex.test(String(value).toUpperCase())) return Promise.resolve();
    return Promise.reject(new Error(`${t('Invalid: ')}${t('Invalid MAC Address. Please use ":" as separator.')}`));
  },
});

const ipv4Regex = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
export const ipRule = () => ({
  validator: (_, value) => {
    if (!value || ipv4Regex.test(String(value).trim()) || String(value).includes(':')) return Promise.resolve();
    return Promise.reject(new Error(t('Please enter a valid IP address')));
  },
});

/** Controlled key/value editor (legacy add-select with KeyValueInput). value: [{ key, value }] */
export const KeyValueList = ({ value, onChange, readonlyKeys = [], addText, minCount = 0 }) => {
  const list = Array.isArray(value) ? value : [];
  const update = (idx, patch) => onChange?.(list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const remove = (idx) => onChange?.(list.filter((_, i) => i !== idx));
  return (
    <div>
      {list.map((it, idx) => {
        const readonly = readonlyKeys.indexOf(it.key) >= 0;
        return (
          // eslint-disable-next-line react/no-array-index-key
          <Space key={idx} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
            <Input
              placeholder={t('Key')}
              value={it.key}
              disabled={readonly}
              onChange={(e) => update(idx, { key: e.target.value })}
              style={{ width: 200 }}
            />
            <Input
              placeholder={t('Value')}
              value={it.value ?? ''}
              onChange={(e) => update(idx, { value: e.target.value })}
              style={{ width: 240 }}
            />
            {!readonly && idx >= minCount ? (
              <MinusCircleOutlined style={{ color: '#94a3b8' }} onClick={() => remove(idx)} />
            ) : null}
          </Space>
        );
      })}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange?.([...list, { key: '', value: '' }])}>
        {addText || t('Add')}
      </Button>
    </div>
  );
};

/* ---------- data fetching (port of stores/ironic/*) ---------- */

/** IronicStore list + listDidFetch (portCount) */
export const fetchNodes = async () => {
  const res = await ironicApi.listNodes();
  const nodes = (res?.nodes || []).map((it) => ({ ...it, uuid: it.uuid || it.id, id: it.uuid || it.id }));
  if (!nodes.length) return nodes;
  const portRes = await ironicApi.listPorts().catch(() => ({}));
  const ports = portRes?.ports || [];
  return nodes.map((it) => ({
    ...it,
    portCount: ports.filter((p) => p.node_uuid === it.uuid).length,
  }));
};

/** IronicStore detailDidFetch: boot device, states, validate, ports */
export const fetchNodeDetail = async (id, { onlyDetail = false } = {}) => {
  const res = await ironicApi.getNode(id);
  const node = res?.node || res || {};
  const item = { ...node, uuid: node.uuid || id, id: node.uuid || id };
  if (onlyDetail) return item;
  const [bootDevice, states, validate, ports] = await Promise.all([
    ironicApi.getBootDevice(id).catch(() => null),
    ironicApi.getStates(id).catch(() => null),
    ironicApi.validateNode(id).catch(() => null),
    ironicApi.listNodePorts(id).catch(() => null),
  ]);
  return {
    ...item,
    bootDevice,
    states,
    validate,
    portsNew: Array.isArray(ports?.ports) ? ports.ports : [],
  };
};

export const fetchNodePortGroups = async (nodeId) => {
  if (!nodeId) return [];
  const res = await ironicApi.listNodePortGroups(nodeId).catch(() => ({}));
  return (res?.portgroups || []).map((it) => ({ ...it, uuid: it.uuid || it.id }));
};

export const fetchNodePorts = async (nodeId) => {
  if (!nodeId) return [];
  const res = await ironicApi.listNodePorts(nodeId);
  return (res?.ports || []).map((it) => ({ ...it, uuid: it.uuid || it.id }));
};
