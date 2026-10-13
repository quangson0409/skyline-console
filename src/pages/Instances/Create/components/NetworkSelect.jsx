import React, { useEffect } from 'react';
import { Col, Input, Row, Select, Tooltip, theme } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';
import { ipTypeOptions, isIPv4, isIpv6, isIpInRangeAll } from '../utils';

/** Legacy NetworkSelect.checkNetwork */
export const checkNetworkItem = ({ network, subnet, ip, ipType }, subnets = []) => {
  const item = subnets.find((it) => it.id === subnet);
  const { allocation_pools: pools } = item || {};
  if (!network) return t('Please select a network!');
  if (ipType === 1 && !isIPv4(ip) && !isIpv6(ip)) return t('Please input a valid IP!');
  if (pools && ipType === 1) {
    const okPool = pools.find((pool) => isIpInRangeAll(ip, pool.start, pool.end));
    if (!okPool) return t('The IP is not within the allocated pool!');
  }
  return '';
};

/** Option objects as legacy (networkOption: {label,value}, subnetOption: {label,name,value}) */
export const buildNetworkValue = (state, { networks = [], subnets = [] }) => {
  const { network, subnet, ip, ipType } = state;
  const net = networks.find((it) => it.id === network);
  const sub = subnets.find((it) => it.id === subnet);
  const errorMsg = checkNetworkItem(state, subnets);
  return {
    network,
    subnet,
    ip,
    ipType,
    networkOption: net ? { label: net.name, value: net.id } : undefined,
    subnetOption: sub ? { label: sub.name, name: sub.name, value: sub.id } : undefined,
    ipTypeOption: ipTypeOptions().find((it) => it.value === ipType),
    validateStatus: errorMsg ? 'error' : 'success',
    errorMsg: errorMsg || undefined,
  };
};

/**
 * Port of legacy components/FormItem/NetworkSelect: network / ip type / subnet / fixed ip of one
 * virtual interface.
 */
export default function NetworkSelect({ value = {}, onChange, networks = [], subnets = [], optionsByIndex = false, index = 0 }) {
  const { token } = theme.useToken();
  const network = value.network || null;
  const subnet = value.subnet || null;
  const ipType = value.ipType || 0;
  const ip = value.ip;

  const emit = (patch) => onChange?.(buildNetworkValue({ network, subnet, ip, ipType, ...patch }, { networks, subnets }));

  // legacy componentDidMount -> checkNetwork
  useEffect(() => {
    if (value.validateStatus === undefined) emit({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subnets]);

  const networkOptions = (optionsByIndex && index < networks.length ? [networks[index]] : networks).map((it) => ({
    label: it.name || it.id,
    value: it.id,
  }));
  const subnetOptions = network
    ? subnets
        .filter((it) => it.network_id === network)
        .map((it) => ({
          label: (
            <span>
              <span>{it.name}</span>
              <span style={{ marginLeft: 8, color: token.colorTextTertiary }}>{it.cidr}</span>
            </span>
          ),
          value: it.id,
        }))
    : [];

  const renderIp = () => {
    if (!network) return null;
    if (ipType === 0) {
      const pools = subnets.filter((s) => s.network_id === network).flatMap((s) => s.allocation_pools || []);
      return (
        <Col xs={24} md={12} style={{ lineHeight: '32px', color: token.colorTextSecondary }}>
          <span>{t('Allocation Pools')}: </span>
          {pools.map((pool, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <span key={`pool-${i}`} style={{ marginRight: 10, color: token.colorText }}>
              {pool.start}--{pool.end}
            </span>
          ))}
        </Col>
      );
    }
    if (!subnet) return null;
    const item = subnets.find((it) => it.id === subnet);
    if (!item) return null;
    const tips = (
      <div>
        <div>{t('Allocation Pools')}:</div>
        {(item.allocation_pools || []).map((pool, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={`pool-${i}`}>
            {pool.start}--{pool.end}
          </div>
        ))}
        <div>{t('Please make sure this IP address be available to avoid creating instance failure.')}</div>
      </div>
    );
    return (
      <Col xs={24} md={6} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Input
          value={ip}
          onChange={(e) => emit({ ip: e.currentTarget.value })}
          status={value.errorMsg ? 'error' : undefined}
          placeholder="0.0.0.0"
        />
        <Tooltip title={tips}>
          <QuestionCircleOutlined style={{ color: token.colorTextTertiary }} />
        </Tooltip>
      </Col>
    );
  };

  return (
    <div>
      <Row gutter={[16, 8]}>
        <Col xs={24} md={6}>
          <Select
            options={networkOptions}
            value={network}
            onChange={(v) => {
              const subs = subnets.filter((it) => it.network_id === v);
              emit({ network: v, subnet: subs.length ? subs[0].id : null, ipType: 0, ip: undefined });
            }}
            placeholder={t('please select network')}
            style={{ width: '100%' }}
            status={!network && value.errorMsg ? 'error' : undefined}
          />
        </Col>
        {network ? (
          <Col xs={24} md={6}>
            <Select value={ipType} options={ipTypeOptions()} onChange={(v) => emit({ ipType: v })} style={{ width: '100%' }} />
          </Col>
        ) : null}
        {network && ipType ? (
          <Col xs={24} md={6}>
            <Select
              options={subnetOptions}
              value={subnet}
              placeholder={t('please select subnet')}
              onChange={(v) => emit({ subnet: v, ip: undefined })}
              style={{ width: '100%' }}
            />
          </Col>
        ) : null}
        {renderIp()}
      </Row>
      {value.errorMsg ? <div style={{ color: token.colorError, marginTop: 4 }}>{value.errorMsg}</div> : null}
    </div>
  );
}
