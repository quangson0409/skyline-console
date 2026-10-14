import React, { useEffect, useState } from 'react';
import { Button, Col, Form, Input, Row, Select, Space, Typography } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { neutronApi } from '@/api/neutron';
import { t } from '@/core/i18n';
import { isIP } from './ip';

const { Text } = Typography;

const safeList = async (promise, key) => {
  try {
    const res = await promise;
    return res?.[key] || [];
  } catch {
    return [];
  }
};

/** Legacy `ip-distributor` form item: value [{ subnet, ip_address: { type, ip } }] */
export function IpDistributor({ value, onChange, subnets = [], maxNumber = 10 }) {
  const list = Array.isArray(value) ? value : [];
  const update = (next) => onChange?.(next);
  if (!subnets.length) {
    return <Text type="secondary">{t('The selected network has no subnet')}</Text>;
  }
  return (
    <div>
      {list.map((entry, idx) => {
        const used = list.filter((e, i) => i !== idx && e?.subnet).map((e) => e.subnet);
        const subnet = subnets.find((s) => s.id === entry?.subnet);
        const ipType = entry?.ip_address?.type || 'auto';
        const setEntry = (patch) => update(list.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
        return (
          // eslint-disable-next-line react/no-array-index-key
          <Row key={idx} gutter={[12, 8]} style={{ marginBottom: 8 }} align="top">
            <Col span={9}>
              <Select
                placeholder={t('Please select')}
                value={entry?.subnet}
                style={{ width: '100%' }}
                options={subnets
                  .filter((s) => !used.includes(s.id))
                  .map((s) => ({ value: s.id, label: s.name || s.id }))}
                onChange={(sid) => setEntry({ subnet: sid, ip_address: { type: 'auto' } })}
              />
              {subnet ? (
                <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>{`${t('CIDR')}: ${subnet.cidr || '-'}`}</div>
              ) : null}
            </Col>
            {subnet ? (
              <Col span={13}>
                <Space.Compact style={{ width: '100%' }}>
                  <Select
                    value={ipType}
                    style={{ width: '50%' }}
                    options={[
                      { label: t('Automatically Assigned Address'), value: 'auto' },
                      { label: t('Manual input'), value: 'manual' },
                    ]}
                    onChange={(type) => setEntry({ ip_address: { type, ip: entry?.ip_address?.ip } })}
                  />
                  {ipType === 'manual' ? (
                    <Input
                      style={{ width: '50%' }}
                      value={entry?.ip_address?.ip}
                      placeholder={subnet.ip_version === 6 ? '2001:db8::10' : '192.168.0.10'}
                      onChange={(e) => setEntry({ ip_address: { type: 'manual', ip: e.target.value } })}
                    />
                  ) : null}
                </Space.Compact>
              </Col>
            ) : (
              <Col span={13} />
            )}
            <Col span={2}>
              <MinusCircleOutlined
                style={{ marginTop: 9, cursor: 'pointer' }}
                onClick={() => update(list.filter((_, i) => i !== idx))}
              />
            </Col>
          </Row>
        );
      })}
      {list.length < Math.min(maxNumber, subnets.length) ? (
        <Button type="dashed" block icon={<PlusOutlined />} onClick={() => update([...list, {}])}>
          {t('Add IP')}
        </Button>
      ) : null}
    </div>
  );
}

export const ipDistributorRule = () => ({
  validator: (_, value) => {
    const list = Array.isArray(value) ? value : [];
    for (const it of list) {
      if (!it || !it.subnet) return Promise.reject(new Error(t('Missing Subnet')));
      if (it.ip_address?.type === 'manual') {
        const ip = it.ip_address.ip;
        if (!ip) return Promise.reject(new Error(t('Missing IP Address')));
        if (!isIP(ip)) return Promise.reject(new Error(t('Invalid: Please input a valid IP')));
      }
    }
    return Promise.resolve();
  },
});

/** Subnet loader for the network chosen in the same form (legacy handleOwnedNetworkChange) */
export function NetworkIpDistributor({ value, onChange, form, networkField = 'network_id', networkId }) {
  const watched = Form.useWatch(networkField, form);
  const nid = networkId || watched;
  const [subnets, setSubnets] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!nid) {
      setSubnets([]);
      return undefined;
    }
    safeList(neutronApi.listSubnets({ network_id: nid }), 'subnets').then((list) => {
      if (alive) setSubnets(list);
    });
    return () => {
      alive = false;
    };
  }, [nid]);
  useEffect(() => {
    // Reset owned subnets after changing the network
    if (!networkId && watched !== undefined) onChange?.(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched]);
  if (!nid) return <Text type="secondary">{t('Please select a network first')}</Text>;
  return <IpDistributor value={value} onChange={onChange} subnets={subnets} />;
}
