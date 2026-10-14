import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Input, InputNumber, Select, Space, Table, Tooltip, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { glanceApi } from '@/api/glance';
import { t } from '@/core/i18n';

/**
 * Port of legacy MetadataStore.fetchList({ manage: true, resource_types }) :
 * loads glance metadata definitions for a resource type (e.g. 'OS::Nova::Aggregate',
 * 'OS::Nova::Flavor', 'OS::Glance::Image') and expands namespace objects.
 */
export const fetchMetadefs = async (resourceType) => {
  let namespaces = [];
  try {
    const res = await glanceApi.listNamespaces({ resource_types: resourceType, limit: 1000 });
    namespaces = res?.namespaces || [];
  } catch {
    return [];
  }
  const details = await Promise.all(
    namespaces.map((ns) => glanceApi.getNamespace(ns.namespace, { resource_type: resourceType }).catch(() => ({})))
  );
  const result = [];
  namespaces.forEach((ns, idx) => {
    const detail = details[idx] || {};
    const base = { ...ns, id: ns.namespace, name: ns.display_name || ns.namespace };
    if (!detail.objects) {
      result.push({ ...base, detail });
    } else {
      detail.objects.forEach((ob) => {
        result.push({ ...base, detail: ob, isObject: true, objName: ob.name, objDescription: ob.description });
      });
    }
  });
  return result;
};

/** { key: { ...propertyDef, namespaceTitle } } for every property defined in the metadefs */
export const metadefProperties = (metadefs = []) => {
  const map = {};
  metadefs.forEach((m) => {
    const props = m?.detail?.properties || {};
    Object.keys(props).forEach((key) => {
      if (!map[key]) {
        map[key] = {
          ...props[key],
          key,
          group: m.isObject ? `${m.name} - ${m.objName}` : m.name,
        };
      }
    });
  });
  return map;
};

/** Legacy ManageMetadata.onSubmit: removed keys are sent as null (nova set_metadata semantics) */
export const metadataWithRemovals = (metadata = {}, oldMetadata = {}) => {
  const next = { ...metadata };
  Object.keys(oldMetadata || {}).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(next, key)) next[key] = null;
  });
  return next;
};

/** Legacy EnumSelect: value "<operator> a,b" */
const EnumOperatorSelect = ({ value, onChange, items = {}, operators = [] }) => {
  const ops = operators.length ? operators : ['<in>'];
  const str = String(value || '');
  const found = ops.find((op) => str.startsWith(`${op} `));
  const operator = found || ops[0];
  const selected = found ? str.slice(found.length + 1).split(',').filter(Boolean) : [];
  const emit = (op, vals) => onChange(`${op} ${vals.join(',')}`);
  return (
    <Space.Compact style={{ width: '100%' }}>
      {ops.length > 1 ? (
        <Select
          style={{ width: 100 }}
          value={operator}
          options={ops.map((o) => ({ value: o, label: o }))}
          onChange={(op) => emit(op, selected)}
        />
      ) : null}
      <Select
        mode="multiple"
        style={{ width: '100%' }}
        value={selected}
        options={(items.enum || []).map((e) => ({ value: e, label: e }))}
        onChange={(vals) => emit(operator, vals)}
        placeholder={t('Please select')}
      />
    </Space.Compact>
  );
};

/** legacy MetadataTransfer.renderInput */
const PropertyInput = ({ def = {}, value, onChange }) => {
  const { type, enum: enums = [], minimum, maximum, items = {}, operators = [] } = def;
  if (type === 'boolean') {
    return (
      <Select
        style={{ width: '100%' }}
        value={value === undefined ? undefined : String(value)}
        options={[
          { value: 'true', label: t('Yes') },
          { value: 'false', label: t('No') },
        ]}
        onChange={onChange}
        placeholder={t('Please select')}
      />
    );
  }
  if (enums.length > 0) {
    return (
      <Select
        style={{ width: '100%' }}
        value={value}
        options={enums.map((it) => ({ value: it, label: it }))}
        onChange={onChange}
        placeholder={t('Please select')}
      />
    );
  }
  if (items.enum) {
    return <EnumOperatorSelect value={value} onChange={onChange} items={items} operators={operators} />;
  }
  if (type === 'integer' || type === 'number') {
    return (
      <InputNumber
        style={{ width: '100%' }}
        value={value === undefined || value === '' ? undefined : Number(value)}
        min={minimum}
        max={maximum}
        precision={type === 'integer' ? 0 : undefined}
        onChange={(v) => onChange(v === null || v === undefined ? '' : String(v))}
        placeholder={t('Please input')}
      />
    );
  }
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={t('Please input')} />;
};

/**
 * MetadataEditor - port of legacy "add-select(KeyValueInput)" (custom metadata)
 * + "metadata-transfer" (metadata definitions) form items, as one controlled field.
 *   value: { [key]: string }   onChange(next)   metadefs: result of fetchMetadefs()
 */
export default function MetadataEditor({ value, onChange, metadefs = [], customTitle, systemTitle }) {
  const defs = useMemo(() => metadefProperties(metadefs), [metadefs]);
  const toRows = (obj) => {
    const systems = [];
    const customs = [];
    Object.entries(obj || {}).forEach(([key, v]) => {
      if (v === null) return;
      const row = { key, value: v === undefined ? '' : String(v) };
      if (defs[key]) systems.push(row);
      else customs.push(row);
    });
    return { systems, customs };
  };
  const [rows, setRows] = useState(() => toRows(value));
  const [picker, setPicker] = useState();

  const lastEmitted = useRef(null);

  // re-split when definitions arrive, or when the value is changed from outside (form reset)
  useEffect(() => {
    if (lastEmitted.current !== null && JSON.stringify(value || {}) === lastEmitted.current) return;
    setRows(toRows(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs, JSON.stringify(value || {})]);

  const emit = (next) => {
    setRows(next);
    const obj = {};
    [...next.systems, ...next.customs].forEach((r) => {
      if (r.key && r.value !== undefined && r.value !== null) obj[r.key] = r.value;
    });
    lastEmitted.current = JSON.stringify(obj);
    onChange?.(obj);
  };

  const used = new Set([...rows.systems, ...rows.customs].map((r) => r.key));
  const groups = {};
  Object.values(defs).forEach((d) => {
    if (used.has(d.key)) return;
    groups[d.group] = groups[d.group] || [];
    groups[d.group].push({ value: d.key, label: `${d.title || d.key} (${d.key})` });
  });
  const pickerOptions = Object.entries(groups).map(([label, options]) => ({ label, options }));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Card size="small" title={systemTitle || t('Metadata')}>
        <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
          <Select
            showSearch
            style={{ width: '100%' }}
            value={picker}
            onChange={setPicker}
            options={pickerOptions}
            placeholder={t('Please select')}
            notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
            filterOption={(input, opt) => String(opt?.label || '').toLowerCase().includes(input.toLowerCase())}
          />
          <Button
            icon={<PlusOutlined />}
            disabled={!picker}
            onClick={() => {
              const def = defs[picker] || {};
              const initial = def.default !== undefined ? String(def.default) : '';
              emit({ ...rows, systems: [...rows.systems, { key: picker, value: initial }] });
              setPicker(undefined);
            }}
          >
            {t('Add')}
          </Button>
        </Space.Compact>
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={rows.systems}
          locale={{ emptyText: t('No Data') }}
          columns={[
            {
              title: t('Name'),
              dataIndex: 'key',
              width: '45%',
              render: (key) => {
                const d = defs[key] || {};
                return (
                  <Tooltip
                    title={
                      <div>
                        <div>{d.group}</div>
                        <div>{d.description}</div>
                      </div>
                    }
                  >
                    <div>
                      <div>{d.title || key}</div>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {key}
                      </Typography.Text>
                    </div>
                  </Tooltip>
                );
              },
            },
            {
              title: t('Value'),
              dataIndex: 'value',
              render: (v, r) => (
                <PropertyInput
                  def={defs[r.key]}
                  value={v === '' ? undefined : v}
                  onChange={(nv) =>
                    emit({
                      ...rows,
                      systems: rows.systems.map((it) => (it.key === r.key ? { ...it, value: nv } : it)),
                    })
                  }
                />
              ),
            },
            {
              title: '',
              key: 'op',
              width: 40,
              render: (_, r) => (
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => emit({ ...rows, systems: rows.systems.filter((it) => it.key !== r.key) })}
                />
              ),
            },
          ]}
        />
      </Card>
      <Card size="small" title={customTitle || t('Custom Metadata')}>
        <Space direction="vertical" style={{ width: '100%' }}>
          {rows.customs.map((r, idx) => (
            // eslint-disable-next-line react/no-array-index-key
            <Space.Compact key={idx} style={{ width: '100%' }}>
              <Input
                placeholder={t('Key')}
                value={r.key}
                status={!r.key ? 'error' : undefined}
                onChange={(e) =>
                  emit({
                    ...rows,
                    customs: rows.customs.map((it, i) => (i === idx ? { ...it, key: e.target.value } : it)),
                  })
                }
              />
              <Input
                placeholder={t('Value')}
                value={r.value}
                onChange={(e) =>
                  emit({
                    ...rows,
                    customs: rows.customs.map((it, i) => (i === idx ? { ...it, value: e.target.value } : it)),
                  })
                }
              />
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() => emit({ ...rows, customs: rows.customs.filter((_, i) => i !== idx) })}
              />
            </Space.Compact>
          ))}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => emit({ ...rows, customs: [...rows.customs, { key: '', value: '' }] })}
          >
            {t('Add Custom Metadata')}
          </Button>
        </Space>
      </Card>
    </Space>
  );
}
