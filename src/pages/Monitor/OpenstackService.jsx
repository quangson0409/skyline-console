import React, { useCallback, useEffect, useState } from 'react';
import { Button, Col, Collapse, List, Row, Tooltip } from 'antd';
import { CheckCircleTwoTone, InfoCircleTwoTone, SyncOutlined } from '@ant-design/icons';
import { hasEndpoint } from '@/api/endpoints';
import { t } from '@/core/i18n';
import { MonitorPage } from './charts';
import { fetchMetric, resultOf } from './lib';

/** Legacy pages/monitor/containers/OpenstackService (+ stores/prometheus/openstack-service.js) */

const markDown24 = (tmp, serviceName, hostname, key = `${serviceName}24`, field = 'hostname') => {
  const item = tmp.find((it) => it.serviceName === serviceName && it[field] === hostname);
  if (item) item[key] = 'down';
};

export async function getNovaService() {
  const tmp = [];
  const [currentState, last24State, libvirtdState, libvirtd24State] = await fetchMetric('openstackService.novaService');
  resultOf(currentState).forEach(({ metric = {} }) => {
    tmp.push({
      hostname: metric.hostname || '',
      serviceName: metric.service || '',
      state: metric.adminState === 'enabled' ? 'up' : 'down',
    });
  });
  resultOf(last24State).forEach(({ metric = {} }) => markDown24(tmp, metric.service || '', metric.hostname || ''));
  resultOf(libvirtdState).forEach(({ metric = {}, value = [] }) => {
    // node_process_total{name="libvirtd"} is a process count (legacy compared it with 'enabled' and always showed down)
    tmp.push({ serviceName: 'nova_libvirt', hostname: metric.hostname, state: Number(value[1]) > 0 ? 'up' : 'down' });
  });
  resultOf(libvirtd24State).forEach(({ metric = {} }) => markDown24(tmp, 'nova_libvirt', metric.hostname || ''));
  return tmp;
}

export async function getNetworkService() {
  const tmp = [];
  const [currentState, last24State] = await fetchMetric('openstackService.networkService');
  resultOf(currentState).forEach(({ metric = {} }) => {
    tmp.push({ serviceName: metric.service || '', hostname: metric.hostname || '', state: metric.adminState || '' });
  });
  resultOf(last24State).forEach(({ metric = {} }) => markDown24(tmp, metric.service || '', metric.hostname || ''));
  return tmp;
}

export async function getCinderService() {
  const tmp = [];
  const [currentState, last24State] = await fetchMetric('openstackService.cinderService');
  resultOf(currentState).forEach(({ metric = {} }) => {
    tmp.push({
      serviceName: metric.service || '',
      hostname: metric.hostname || '',
      state: metric.adminState === 'enabled' ? 'up' : 'down',
    });
  });
  resultOf(last24State).forEach(({ metric = {} }) => markDown24(tmp, metric.service || '', metric.hostname || ''));
  return tmp;
}

export async function getOtherService() {
  const serviceNameMap = {
    mysql_up: t('Database Service'),
    rabbitmq_identity_info: t('Message Queue Service'),
    memcached_up: t('Cache Service'),
  };
  const indexToServiceName = [t('Database Service'), t('Message Queue Service'), t('Cache Service')];
  const tmp = [];
  const results = await fetchMetric('openstackService.otherService');
  results.forEach((result) => {
    resultOf(result).forEach(({ metric = {}, value = [] }) => {
      tmp.push({
        serviceName: serviceNameMap[metric.__name__] || metric.__name__,
        hostname: metric.instance,
        state: value[1] === '1' ? 'up' : 'down',
      });
    });
  });
  const mins = await fetchMetric('openstackService.otherServiceMinOverTime');
  mins.forEach((result, index) => {
    resultOf(result).forEach(({ metric = {} }) => {
      const name = indexToServiceName[index];
      markDown24(tmp, name, metric.instance || '');
    });
  });
  return tmp;
}

const StatusIcon = ({ state }) =>
  state === 'up' ? (
    <CheckCircleTwoTone style={{ fontSize: 22, marginLeft: 16 }} twoToneColor="#52C41A" />
  ) : (
    <InfoCircleTwoTone style={{ fontSize: 22, marginLeft: 16 }} twoToneColor="#ef4444" />
  );

function Services({ serviceMap }) {
  return (
    <Collapse
      defaultActiveKey={serviceMap.map((item) => item.key)}
      ghost
      items={serviceMap.map((item) => ({
        key: item.key,
        label: <span style={{ fontSize: 16, fontWeight: 600 }}>{item.title}</span>,
        children: (
          <List
            bordered
            style={{ borderRadius: 8 }}
            dataSource={item.data}
            loading={item.isLoading}
            renderItem={(it) => (
              <List.Item>
                <Row style={{ width: '100%' }} align="middle" gutter={[8, 8]}>
                  <Col xs={24} md={6} style={{ fontWeight: 600 }}>
                    {it.engine_id ? (
                      <Tooltip title={it.engine_id}>
                        <span>{it.serviceName}</span>
                      </Tooltip>
                    ) : (
                      it.serviceName
                    )}
                  </Col>
                  <Col xs={24} md={6}>
                    <div>{it.hostname || it.host}</div>
                    {it.instance ? <div style={{ fontSize: 12, color: '#94a3b8' }}>{it.instance}</div> : null}
                  </Col>
                  <Col xs={12} md={6}>
                    <span>{t('Current Status')}</span>
                    <StatusIcon state={it.state} />
                  </Col>
                  <Col xs={12} md={6}>
                    <span>{t('Last 24H Status')}</span>
                    <StatusIcon state={it[`${it.serviceName}24`] || 'up'} />
                  </Col>
                </Row>
              </List.Item>
            )}
          />
        ),
      }))}
    />
  );
}

export default function OpenstackService() {
  const enableCinder = hasEndpoint('cinder');
  const empty = { isLoading: true, data: [] };
  const [state, setState] = useState({ nova: empty, network: empty, cinder: empty, other: empty });

  const load = useCallback(() => {
    const run = (key, fn) => {
      setState((s) => ({ ...s, [key]: { isLoading: true, data: [] } }));
      fn()
        .then((data) => setState((s) => ({ ...s, [key]: { isLoading: false, data } })))
        .catch(() => setState((s) => ({ ...s, [key]: { isLoading: false, data: [] } })));
    };
    run('nova', getNovaService);
    run('network', getNetworkService);
    run('cinder', getCinderService);
    run('other', getOtherService);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const serviceMap = [
    { key: 'nova_service', title: t('Nova Service'), ...state.nova },
    { key: 'network_service', title: t('Neutron Service'), ...state.network },
    enableCinder && { key: 'cinder_service', title: t('Cinder Service'), ...state.cinder },
    { key: 'other_service', title: t('Other Service'), ...state.other },
  ].filter(Boolean);

  return (
    <MonitorPage
      title={t('OpenStack Services')}
      breadcrumb={[t('Monitor Center'), t('OpenStack Services')]}
      description={t('Current and last 24 hours status of OpenStack services and their dependencies.')}
      extra={
        <Tooltip title={t('Refresh')}>
          <Button icon={<SyncOutlined />} onClick={load} />
        </Tooltip>
      }
    >
      <Services serviceMap={serviceMap} />
    </MonitorPage>
  );
}
