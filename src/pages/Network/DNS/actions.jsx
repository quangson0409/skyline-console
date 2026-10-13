import React from 'react';
import { designateApi } from '@/api/designate';
import { t } from '@/core/i18n';
import {
  ZONE_TYPE_ENUM,
  zoneTypes,
  toOptions,
  validateZoneName,
  zoneNameMessage,
  validateEmail,
  validateMasters,
  validateRecordName,
  dnsRRTypeOptions,
  RecordTypeHint,
  isIPv4,
  isIPv6,
} from './common';

const runAll = async (target, fn) => {
  const list = Array.isArray(target) ? target : [target];
  for (const it of list) {
    // eslint-disable-next-line no-await-in-loop
    await fn(it);
  }
};

// ------------------------------------------------------------------ Zones
const isPrimary = (values) => (values?.type || ZONE_TYPE_ENUM.primary) === ZONE_TYPE_ENUM.primary;

const zoneFormItems = ({ isEdit = false } = {}) => [
  {
    name: 'name',
    label: t('Name'),
    type: 'input',
    required: true,
    disabled: isEdit,
    extra: zoneNameMessage(),
    rules: [{ validator: validateZoneName }],
  },
  { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  {
    name: 'type',
    label: t('Type'),
    type: 'select',
    disabled: isEdit,
    options: toOptions(zoneTypes()),
    tip: t('Primary is controlled by Designate, Secondary zones are slaved from another DNS Server.'),
  },
  {
    name: 'email',
    label: t('Email'),
    type: 'input',
    required: true,
    visible: isPrimary,
    rules: [{ validator: validateEmail }],
    tip: t('Email for the zone. Used in SOA records for the zone.'),
  },
  {
    name: 'ttl',
    label: t('TTL'),
    type: 'number',
    min: 0,
    required: true,
    visible: isPrimary,
    tip: t('TTL (Time to Live) for the zone.'),
  },
  {
    name: 'masters',
    label: t('Masters'),
    type: 'tags',
    required: true,
    placeholder: t('Please input IP address'),
    tip: t('Mandatory for secondary zones. The servers to slave from to get DNS information.'),
    visible: (values) => !isPrimary(values),
    rules: [{ validator: validateMasters }],
  },
];

export const createZoneAction = () => ({
  id: 'create_zone',
  type: 'modal',
  title: t('Create Zone'),
  width: 560,
  getDefaultValues: () => ({ ttl: 3600, type: ZONE_TYPE_ENUM.primary }),
  getFormItems: () => zoneFormItems(),
  onSubmit: (values) => {
    const { masters = [], type, email, ttl, ...rest } = values;
    const body = { ...rest, type, masters: masters || [] };
    if (type === ZONE_TYPE_ENUM.primary) {
      body.email = email;
      body.ttl = ttl;
    }
    return designateApi.createZone(body);
  },
});

export const editZoneAction = () => ({
  id: 'update-dns-zone',
  type: 'modal',
  title: t('Edit'),
  buttonText: t('Edit'),
  width: 560,
  getDefaultValues: (item) => ({
    name: item.name,
    description: item.description,
    type: item.type,
    email: item.email,
    ttl: item.ttl,
    masters: item.masters || [],
  }),
  getFormItems: () => zoneFormItems({ isEdit: true }),
  onSubmit: (values, item) => {
    const { masters = [], email, ttl, description } = values;
    const body = { description, masters: masters || [] };
    if (item.type === ZONE_TYPE_ENUM.primary) {
      body.email = email;
      body.ttl = ttl;
    }
    return designateApi.updateZone(item.id, body);
  },
});

export const deleteZoneAction = () => ({
  id: 'delete',
  type: 'confirm',
  title: t('Delete Zone'),
  actionName: t('Delete Zone'),
  buttonText: t('Delete'),
  isDanger: true,
  confirmText: (items) =>
    t('Are you sure to {action}? (Zone: {name})', {
      action: t('Delete Zone'),
      name: items.map((it) => it.name || it.id).join(', '),
    }),
  onSubmit: (target) => runAll(target, (it) => designateApi.deleteZone(it.id)),
});

// ------------------------------------------------------------------ Record sets
const recordsRule = ({ getFieldValue }) => ({
  validator: (_rule, value) => {
    const type = getFieldValue('type');
    const list = Array.isArray(value) ? value : [];
    for (const v of list) {
      if (type === 'A' && !isIPv4(v)) return Promise.reject(new Error(t('Please enter a valid IPv4 value.')));
      if (type === 'AAAA' && !isIPv6(v)) return Promise.reject(new Error(t('Please enter a valid IPv6 value.')));
    }
    return Promise.resolve();
  },
});

const recordSetFormItems = ({ isEdit = false } = {}) => [
  {
    name: 'type',
    label: t('Type'),
    type: 'select',
    required: true,
    disabled: isEdit,
    options: dnsRRTypeOptions(),
  },
  {
    name: 'name',
    label: t('Name'),
    type: 'input',
    required: true,
    disabled: isEdit,
    extra: <RecordTypeHint kind="nameExtra" />,
    rules: [{ validator: validateRecordName }],
  },
  { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
  { name: 'ttl', label: t('TTL'), type: 'number', min: 0, required: true },
  {
    name: 'records',
    label: t('Records'),
    type: 'tags',
    required: true,
    placeholder: t('Please input at least one record'),
    extra: <RecordTypeHint kind="recordsExtra" />,
    rules: [recordsRule],
  },
];

/** zone: the zone the record set is created in (row item on the zone list, detail on the zone page) */
export const createRecordSetAction = (zone) => ({
  id: 'create-record-set',
  type: 'modal',
  title: t('Create Record Set'),
  width: 640,
  getDefaultValues: () => ({ ttl: 3600, type: 'A', records: [] }),
  getFormItems: () => recordSetFormItems(),
  onSubmit: (values, item) => {
    const zoneId = zone?.id || item?.id;
    const { records = [], ...rest } = values;
    return designateApi.createRecordset(zoneId, { records, ...rest });
  },
});

export const editRecordSetAction = () => ({
  id: 'update-record-set',
  type: 'modal',
  title: t('Update Record Set'),
  buttonText: t('Update'),
  width: 640,
  getDefaultValues: (item) => ({
    type: item.type,
    name: item.name,
    description: item.description,
    ttl: item.ttl,
    records: item.records || [],
  }),
  getFormItems: () => recordSetFormItems({ isEdit: true }),
  onSubmit: (values, item) => {
    const { records = [], ...rest } = values;
    return designateApi.updateRecordset(item.zone_id, item.id, { records, ...rest });
  },
});

export const deleteRecordSetAction = () => ({
  id: 'delete',
  type: 'confirm',
  title: t('Delete Record Set'),
  actionName: t('Delete Record Set'),
  buttonText: t('Delete'),
  isDanger: true,
  confirmText: (items) =>
    items
      .map((it) =>
        t('Are you sure to {action}? (Record Set: {name} - {id})', {
          action: t('Delete Record Set'),
          name: it.name,
          id: it.id,
        })
      )
      .join(' '),
  onSubmit: (target) => runAll(target, (it) => designateApi.deleteRecordset(it.zone_id, it.id)),
});

// ------------------------------------------------------------------ Reverse DNS
export const setReverseAction = () => ({
  id: 'set-reverse',
  type: 'modal',
  title: t('Set Domain Name PTR'),
  buttonText: t('Set'),
  width: 520,
  getDefaultValues: (item) => ({
    ptrdname: item.ptrdname || undefined,
    description: item.description || undefined,
    ttl: item.ttl ?? undefined,
  }),
  formItems: [
    {
      name: 'ptrdname',
      label: t('Domain Name'),
      type: 'input',
      required: true,
      placeholder: t('smtp.example.com'),
      tip: t('Domain name ending in "."'),
    },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3, tip: t('Details about the PTR record.') },
    { name: 'ttl', label: t('TTL'), type: 'number', min: 0, placeholder: '3600', tip: t('Time To Live in seconds.') },
  ],
  onSubmit: (values, item) => {
    const body = { ...values };
    Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);
    return designateApi.setReverse(item.id, body);
  },
});

export const unsetReverseAction = () => ({
  id: 'unset',
  type: 'confirm',
  title: t('Unset'),
  actionName: t('Unset'),
  buttonText: t('Unset'),
  allowed: (item) => item.ptrdname !== null && item.ptrdname !== undefined && item.status === 'ACTIVE',
  confirmText: (items) =>
    t('Are you sure to {action}? (Zone: {name})', {
      action: t('Unset'),
      name: items.map((it) => it.address || it.id).join(', '),
    }),
  onSubmit: (target) => runAll(target, (it) => designateApi.unsetReverse(it.id)),
});
