import React, { useMemo, useState } from 'react';
import { Button, Input, InputNumber, Select, Space, Switch, Tooltip, Typography, Empty } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { glanceApi } from '@/api/glance';
import { t } from '@/core/i18n';
import BaseKeyValueList from '@/components/form/KeyValueList';

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
export const KeyValueList = (props) => (
  <BaseKeyValueList separator={null} addText={t('Add Custom Metadata')} {...props} />
);

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
export const MetadataTransfer = ({
  value = {},
  onChange,
  metadata = [],
  placeholder,
  initialValue,
  emptyContent,
  showNoneText = true,
}) => {
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
    const initial =
      typeof initialValue === 'function'
        ? initialValue(def)
        : def.default !== undefined
          ? String(def.default)
          : def.enum?.length
            ? String(def.enum[0])
            : undefined;
    onChange?.({ ...current, [key]: initial });
    setPicking(undefined);
  };

  const keys = Object.keys(current);

  if (emptyContent && !metadata.length) return emptyContent;

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Select
        showSearch
        value={picking}
        placeholder={placeholder || t('Available Metadata')}
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
      ) : showNoneText ? (
        <Text type="secondary">{t('Existing Metadata')}: -</Text>
      ) : null}
    </Space>
  );
};

/**
 * Flavor "metadata-transfer" (former Compute/Flavors MetadataPicker): same editor fed with
 * namespaces [{ title, properties }]; booleans start at "false", nothing shown without definitions.
 */
export function MetadataPicker({ metadata = [], ...rest }) {
  const flat = useMemo(
    () =>
      metadata.flatMap((ns) =>
        Object.entries(ns.properties || {}).map(([key, schema]) => ({ ...(schema || {}), key, group: ns.title }))
      ),
    [metadata]
  );
  return (
    <MetadataTransfer
      metadata={flat}
      placeholder={t('Please select')}
      initialValue={(def) =>
        def.default !== undefined ? String(def.default) : def.type === 'boolean' ? 'false' : undefined
      }
      emptyContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No Data')} />}
      showNoneText={false}
      {...rest}
    />
  );
}
