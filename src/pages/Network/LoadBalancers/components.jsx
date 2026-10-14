/**
 * Form widgets used by the Octavia pages - ports of legacy components/FormItem/MemberAllocator,
 * the certificate select-tables of the listener forms and the insert-headers check-group.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Col, Input, InputNumber, Row, Select, Space, Table, Tooltip, Typography } from 'antd';
import { MinusCircleOutlined, PlusOutlined, QuestionCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { NoFormStyle } from '@/components/form/NoFormStyle';
import SelectTable from '@/components/SelectTable';
import { formatTime, IdNameCell } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { isIP } from '@/components/network/ip';
import {
  INSERT_HEADER_KEYS,
  insertHeaderTips,
  insertHeaderDesc,
  certificateMode,
  certificateStatus,
  listenerDetailPath,
} from './helpers';

const { Text } = Typography;

/* ---------------- Insert headers (legacy check-group) ---------------- */
export function InsertHeadersInput({ value, onChange, disabled }) {
  const current = value || {};
  const tips = insertHeaderTips();
  return (
    <div>
      <Space direction="vertical" size={4}>
        {INSERT_HEADER_KEYS.map((key) => (
          <Checkbox
            key={key}
            disabled={disabled}
            checked={!!current[key]}
            onChange={(e) => onChange?.({ ...current, [key]: e.target.checked })}
          >
            <span>{key}</span>{' '}
            <Tooltip title={tips[key]}>
              <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
            </Tooltip>
          </Checkbox>
        ))}
      </Space>
    </div>
  );
}

export const insertHeadersFormItem = (name = 'insert_headers', extra = {}) => ({
  name,
  label: t('Custom Headers'),
  tip: insertHeaderDesc(),
  render: () => <InsertHeadersInput />,
  ...extra,
});

/* ---------------- Certificates (legacy getCertificateColumns) ---------------- */
export const certificateColumns = ({ withDomain = true, isAdmin = false } = {}) =>
  [
    { title: t('ID/Name'), dataIndex: 'name', key: 'name', render: (v, r) => <IdNameCell id={r.id} name={v} /> },
    {
      title: t('Certificate Type'),
      dataIndex: 'mode',
      key: 'mode',
      render: (v) => certificateMode()[v] || v || '-',
    },
    { title: t('Expires At'), dataIndex: 'expiration', key: 'expiration', render: (v) => formatTime(v) },
    withDomain && { title: t('Domain Name'), dataIndex: 'domain', key: 'domain', render: (v) => v || '-' },
    {
      title: t('Listener'),
      dataIndex: 'listener',
      key: 'listener',
      render: (value) =>
        value?.length
          ? value.map((it) => (
              <div key={it.id} onClick={(e) => e.stopPropagation()}>
                <IdNameCell id={it.id} name={it.name} href={listenerDetailPath(it.lb, it.id, isAdmin)} bold={false} />
              </div>
            ))
          : '-',
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      render: (v) => certificateStatus()[v] || v || '-',
    },
    { title: t('Created At'), dataIndex: 'created', key: 'created', render: (v) => formatTime(v) },
  ].filter(Boolean);

export function CertificateSelect({ value, onChange, data, loading, isMulti = false, withDomain = true }) {
  return (
    <NoFormStyle status override>
    <SelectTable
      value={value}
      onChange={onChange}
      data={data || []}
      isLoading={loading}
      isMulti={isMulti}
      columns={certificateColumns({ withDomain })}
      filterParams={[{ label: t('Name'), name: 'name' }]}
    />
    </NoFormStyle>
  );
}

/** select-table value from refs (legacy Edit listener defaultValue) */
export const selectValueFromIds = (ids, rows) => {
  const keys = (ids || []).filter(Boolean);
  return { selectedRowKeys: keys, selectedRows: (rows || []).filter((it) => keys.includes(it.id)) };
};

/** required rule for select-table values */
export const selectRequiredRule = (label) => ({
  validator: (_, value) =>
    value?.selectedRowKeys?.length
      ? Promise.resolve()
      : Promise.reject(new Error(`${t('Please select')} ${label || ''}`.trim())),
});

/* ---------------- Member allocator ---------------- */
const emptyMember = () => ({
  ip_address: { ip: undefined, protocol_port: undefined, weight: 1, subnet_id: undefined },
  canEdit: true,
});

/** legacy MemberAllocator validator (applied to the whole list) */
export const memberAllocatorRule = (existingMembers = []) => ({
  validator: (_, value) => {
    const list = Array.isArray(value) ? value : [];
    for (const it of list) {
      const ipa = it?.ip_address || {};
      if (!ipa.ip) return Promise.reject(new Error(t('Missing IP Address')));
      if (!isIP(ipa.ip)) return Promise.reject(new Error(t('Invalid IP Address')));
      if (!ipa.protocol_port) return Promise.reject(new Error(t('Missing Port')));
      if (!ipa.weight) return Promise.reject(new Error(t('Missing Weight')));
      if (existingMembers.some((m) => m.address === ipa.ip && m.protocol_port === ipa.protocol_port)) {
        return Promise.reject(new Error(t('Invalid IP Address and Port')));
      }
    }
    return Promise.resolve();
  },
});

function PortIpSelect({ port, selected, onSelect }) {
  const options = (port.fixed_ips || []).map((i) => ({ label: i.ip_address, value: i.ip_address, subnet_id: i.subnet_id }));
  if (!options.length) return '-';
  return (
    <Select
      size="small"
      style={{ minWidth: 180 }}
      options={options}
      value={selected?.ip || options[0].value}
      onClick={(e) => e.stopPropagation()}
      onChange={(ip, opt) => onSelect({ ip, subnet_id: opt.subnet_id })}
    />
  );
}

export function MemberAllocator({ value, onChange, ports = [], loading = false, lbSubnetId, maxNumber = 10, isAdmin = false }) {
  const list = Array.isArray(value) ? value : [];
  const [q, setQ] = useState('');
  const [sameSubnet, setSameSubnet] = useState(false);
  const [ipChoice, setIpChoice] = useState({});

  const update = (next) => onChange?.(next);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (ports || []).filter((p) => {
      if (sameSubnet && !(p.fixed_ips || []).some((i) => i.subnet_id === lbSubnetId)) return false;
      if (!s) return true;
      return [p.id, p.name, p.server_name, p.instance_name, ...(p.fixed_ips || []).map((i) => i.ip_address)].some(
        (v) => v && String(v).toLowerCase().includes(s)
      );
    });
  }, [ports, q, sameSubnet, lbSubnetId]);

  const chosen = (p) => {
    if (ipChoice[p.id]) return ipChoice[p.id];
    const first = (p.fixed_ips || [])[0];
    return first ? { ip: first.ip_address, subnet_id: first.subnet_id } : null;
  };

  const addFromPort = (p) => {
    const c = chosen(p);
    if (!c) return;
    update([
      ...list,
      {
        ip_address: {
          ip: c.ip,
          protocol_port: undefined,
          weight: 1,
          name: p.server_name || p.instance_name,
          subnet_id: c.subnet_id,
        },
        canEdit: false,
      },
    ]);
  };

  const setEntry = (idx, patch) =>
    update(list.map((e, i) => (i === idx ? { ...e, ip_address: { ...(e.ip_address || {}), ...patch } } : e)));

  return (
    <NoFormStyle status override>
    <div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('Select An Existing Port')}</div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          placeholder={t('Search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 240 }}
        />
        <Checkbox checked={sameSubnet} onChange={(e) => setSameSubnet(e.target.checked)}>
          {t('Same subnet with LB')}
        </Checkbox>
      </Space>
      <div style={{ overflowX: 'auto' }}>
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 5, size: 'small', hideOnSinglePage: true }}
          columns={[
            {
              title: t('ID/Name'),
              dataIndex: 'name',
              key: 'name',
              render: (v, r) => (
                <IdNameCell id={r.id} name={v} href={`/network/port${isAdmin ? '-admin' : ''}/detail/${r.id}`} />
              ),
            },
            { title: t('Binding Instance'), dataIndex: 'server_name', key: 'server_name', render: (v) => v || '-' },
            {
              title: t('Instance Name'),
              dataIndex: 'instance_name',
              key: 'instance_name',
              render: (v, r) => (v ? <IdNameCell id={r.device_id} name={v} bold={false} /> : '-'),
            },
            {
              title: t('IP'),
              dataIndex: 'fixed_ips',
              key: 'fixed_ips',
              render: (_, r) => (
                <PortIpSelect port={r} selected={ipChoice[r.id]} onSelect={(c) => setIpChoice((prev) => ({ ...prev, [r.id]: c }))} />
              ),
            },
            {
              title: t('Action'),
              key: 'operation',
              render: (_, r) => (
                <Button size="small" disabled={!chosen(r) || list.length >= maxNumber} onClick={() => addFromPort(r)}>
                  {t('Add Member')}
                </Button>
              ),
            },
          ]}
        />
      </div>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {t(
          'If you choose a port which subnet is different from the subnet of LB, please ensure connectivity between the two.'
        )}
      </Text>

      <div style={{ fontWeight: 600, margin: '16px 0 6px' }}>{t('Selected Members')}</div>
      {list.length === 0 ? (
        <Text type="secondary">{t('Not yet selected')}</Text>
      ) : (
        <div>
          <Row gutter={12} style={{ marginBottom: 4, color: '#64748b', fontSize: 12 }}>
            <Col span={11}>{t('IP Address')}</Col>
            <Col span={6}>{t('Port')}</Col>
            <Col span={5}>{t('Weight')}</Col>
          </Row>
          {list.map((entry, idx) => {
            const ipa = entry?.ip_address || {};
            return (
              // eslint-disable-next-line react/no-array-index-key
              <Row key={idx} gutter={12} style={{ marginBottom: 8 }} align="middle">
                <Col span={11}>
                  <Input
                    value={ipa.ip}
                    disabled={!entry.canEdit}
                    placeholder="192.168.0.10"
                    onChange={(e) => setEntry(idx, { ip: e.target.value })}
                  />
                </Col>
                <Col span={6}>
                  <InputNumber
                    min={1}
                    max={65535}
                    style={{ width: '100%' }}
                    value={ipa.protocol_port}
                    onChange={(v) => setEntry(idx, { protocol_port: v ?? undefined })}
                  />
                </Col>
                <Col span={5}>
                  <InputNumber
                    min={1}
                    max={256}
                    style={{ width: '100%' }}
                    value={ipa.weight}
                    onChange={(v) => setEntry(idx, { weight: v ?? undefined })}
                  />
                </Col>
                <Col span={2}>
                  <MinusCircleOutlined
                    style={{ cursor: 'pointer' }}
                    onClick={() => update(list.filter((_, i) => i !== idx))}
                  />
                </Col>
              </Row>
            );
          })}
        </div>
      )}
      {list.length < maxNumber ? (
        <div style={{ marginTop: 12 }}>
          <Button type="dashed" block icon={<PlusOutlined />} onClick={() => update([...list, emptyMember()])}>
            {t('Add External Members')}
          </Button>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('The IP of external members can be any, including the public network IP.')}
          </Text>
        </div>
      ) : null}
    </div>
    </NoFormStyle>
  );
}

/** Loads data once for a form widget (ports / certificates) */
export function useLoader(loader, deps = []) {
  const [state, setState] = useState({ data: [], loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve(loader())
      .then((data) => alive && setState({ data: data || [], loading: false }))
      .catch(() => alive && setState({ data: [], loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
