import React, { useMemo, useState } from 'react';
import { Button, Input, InputNumber, Select, Space, Switch, Tooltip, Typography, Empty } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { glanceApi } from '@/api/glance';
import { t } from '@/core/i18n';

const { Text } = Typography;

/**
 * Loads glance metadata definitions for a resource type (legacy MetadataStore.fetchList with manage=true)
 * and flattens namespace properties + object properties into [{ key, namespace, title, type, enum, ... }].
 */
let metaCache = null;
let metaCacheAt = 0;
export const loadMetadefProperties = async (resourceType = 'OS::Glance::Image') => {
  if (metaCache && Date.now() - metaCacheAt < 60000) return metaCache;
  const res = await glanceApi.listNamespaces({ resource_types: resourceType }).catch(() => ({}));
  const namespaces = res?.namespaces || [];
  const details = await Promise.all(
    namespaces.map((ns) => glanceApi.getNamespace(ns.namespace, { resource_type: resourceType }).catch(() => null))
  );
  const props = [];
  namespaces.forEach((ns, idx) => {
    const detail = details[idx] || {};
    const group = ns.display_name || ns.namespace;
    const push = (properties, groupName) =>
      Object.entries(properties || {}).forEach(([key, def]) => {
        props.push({ key, group: groupName, ...(def || {}) });
      });
    push(detail.properties, group);
    (detail.objects || []).forEach((ob) => push(ob.properties, `${group} / ${ob.name}`));
  });
  metaCache = props;
  metaCacheAt = Date.now();
  return props;
};

/** Custom metadata: list of { key, value } rows (legacy add-select + KeyValueInput) */
export const KeyValueList = ({ value = [], onChange }) => {
  const rows = Array.isArray(value) ? value : [];
  const update = (idx, patch) => onChange?.(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {rows.map((row, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <Space key={idx} style={{ width: '100%' }} align="start">
          <Input
            placeholder={t('Key')}
            value={row.key}
            onChange={(e) => update(idx, { key: e.target.value })}
            style={{ width: 220 }}
          />
          <Input
            placeholder={t('Value')}
            value={row.value}
            onChange={(e) => update(idx, { value: e.target.value })}
            style={{ width: 280 }}
          />
          <Button icon={<DeleteOutlined />} onClick={() => onChange?.(rows.filter((_, i) => i !== idx))} />
        </Space>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange?.([...rows, { key: '', value: '' }])}>
        {t('Add Custom Metadata')}
      </Button>
    </Space>
  );
};

const ValueInput = ({ def = {}, value, onChange }) => {
  if (Array.isArray(def.enum) && def.enum.length) {
    return (
      <Select
        value={value}
        onChange={onChange}
        style={{ width: '100%' }}
        options={def.enum.map((v) => ({ value: String(v), label: String(v) }))}
      />
    );
  }
  if (def.type === 'boolean') {
    return (
      <Switch
        checked={value === true || value === 'true' || value === 'True'}
        onChange={(checked) => onChange(checked ? 'true' : 'false')}
      />
    );
  }
  if (def.type === 'integer' || def.type === 'number') {
    return (
      <InputNumber
        value={value === undefined || value === '' ? undefined : Number(value)}
        min={def.minimum}
        max={def.maximum}
        onChange={(v) => onChange(v === null || v === undefined ? undefined : String(v))}
        style={{ width: '100%' }}
      />
    );
  }
  return <Input value={value} onChange={(e) => onChange(e.target.value)} />;
};

/**
 * System metadata (legacy metadata-transfer): value is { [key]: value } restricted to metadefs keys.
 * Left: select from available definitions; right: chosen keys with typed value inputs.
 */
export const MetadataTransfer = ({ value = {}, onChange, metadata = [] }) => {
  const current = value && typeof value === 'object' ? value : {};
  const [picking, setPicking] = useState();
  const defMap = useMemo(() => Object.fromEntries(metadata.map((m) => [m.key, m])), [metadata]);
  const groups = useMemo(() => {
    const g = {};
    metadata.forEach((m) => {
      if (current[m.key] !== undefined) return;
      (g[m.group] = g[m.group] || []).push({ value: m.key, label: `${m.title || m.key} (${m.key})` });
    });
    return Object.entries(g).map(([label, options]) => ({ label, options }));
  }, [metadata, current]);

  const add = (key) => {
    if (!key) return;
    const def = defMap[key] || {};
    const initial = def.default !== undefined ? String(def.default) : def.enum?.length ? String(def.enum[0]) : undefined;
    onChange?.({ ...current, [key]: initial });
    setPicking(undefined);
  };

  const keys = Object.keys(current);

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Select
        showSearch
        value={picking}
        placeholder={t('Available Metadata')}
        options={groups}
        onChange={add}
        optionFilterProp="label"
        style={{ width: '100%' }}
        notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      />
      {keys.length ? (
        keys.map((key) => {
          const def = defMap[key] || {};
          return (
            <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 240, flexShrink: 0 }}>
                <Tooltip title={def.description}>
                  <Text strong>{def.title || key}</Text>
                </Tooltip>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{key}</div>
              </div>
              <div style={{ flex: 1 }}>
                <ValueInput def={def} value={current[key]} onChange={(v) => onChange?.({ ...current, [key]: v })} />
              </div>
              <Button
                icon={<DeleteOutlined />}
                onClick={() => {
                  const next = { ...current };
                  delete next[key];
                  onChange?.(next);
                }}
              />
            </div>
          );
        })
      ) : (
        <Text type="secondary">{t('Existing Metadata')}: -</Text>
      )}
    </Space>
  );
};
