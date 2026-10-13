import React, { useState } from 'react';
import { Col, Radio, Row } from 'antd';
import { t } from '@/core/i18n';
import { MonitorPage, MonitorPanel, StatCard, ChartCard, BigNumber } from './charts';
import { formatUsedTime, getMemcacheNodes, getMysqlNodes, getRabbitMQNodes, getSuitableValue, resultOf } from './lib';

/** Legacy pages/monitor/containers/OtherService (MySQL / Memcache / RabbitMQ) */

function Mysql() {
  return (
    <MonitorPanel fetchNodes={getMysqlNodes}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}>
          <StatCard
            title={t('Running Time')}
            metricKey="mysqlService.runningTime"
            render={(data) => <BigNumber>{formatUsedTime((data[0]?.y || 0) * 1000)}</BigNumber>}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <StatCard title={t('Connected Threads')} metricKey="mysqlService.connectedThreads" />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <StatCard title={t('Running Threads')} metricKey="mysqlService.runningThreads" />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <StatCard title={t('Slow Query')} metricKey="mysqlService.slowQuery" />
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard title={t('Threads Activity Trends')} metricKey="mysqlService.threadsActivityTrends_connected" />
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard title={t('MySQL Actions')} metricKey="mysqlService.mysqlActions" modifyKeys={[t('delete'), t('insert'), t('update')]} />
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard title={t('Slow Query')} metricKey="mysqlService.slowQueryChart" />
        </Col>
      </Row>
    </MonitorPanel>
  );
}

function Memcache() {
  return (
    <MonitorPanel fetchNodes={getMemcacheNodes}>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <ChartCard title={t('Current Connections')} metricKey="memcacheService.currentConnections" />
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard title={t('Total Connections')} metricKey="memcacheService.totalConnections" />
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard
            title={t('Read and write')}
            metricKey="memcacheService.readWriteBytesTotal"
            modifyKeys={[t('read'), t('write')]}
            yFormatter={(d) => getSuitableValue(d, 'traffic', 0)}
          />
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard title={t('Evictions')} metricKey="memcacheService.evictions" />
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard title={t('Items in Cache')} metricKey="memcacheService.itemsInCache" />
        </Col>
      </Row>
    </MonitorPanel>
  );
}

function RabbitMQ() {
  return (
    <MonitorPanel fetchNodes={getRabbitMQNodes}>
      <Row gutter={[16, 16]}>
        <Col flex="1 1 200px">
          <StatCard
            title={t('Server Status')}
            metricKey="rabbitMQService.serviceStatus"
            format={(responses) => {
              const tmp = { up: 0, down: 0 };
              resultOf(responses[0]).forEach((r) => {
                if (parseInt(r?.value?.[1], 10) === 1) tmp.up += 1;
                else tmp.down += 1;
              });
              return tmp;
            }}
            render={(data) => (
              <BigNumber>
                <Row style={{ width: '100%', textAlign: 'center' }}>
                  <Col span={12}>{`${data.up ?? 0} ${t('Up')}`}</Col>
                  <Col span={12}>{`${data.down ?? 0} ${t('Down')}`}</Col>
                </Row>
              </BigNumber>
            )}
          />
        </Col>
        <Col flex="1 1 200px">
          <StatCard title={t('Connected Threads')} metricKey="rabbitMQService.totalConnections" />
        </Col>
        <Col flex="1 1 200px">
          <StatCard title={t('Total Queues')} metricKey="rabbitMQService.totalQueues" />
        </Col>
        <Col flex="1 1 200px">
          <StatCard title={t('Total Exchanges')} metricKey="rabbitMQService.totalExchanges" />
        </Col>
        <Col flex="1 1 200px">
          <StatCard title={t('Total Consumers')} metricKey="rabbitMQService.totalConsumers" />
        </Col>
        <Col span={24} />
        <Col xs={24} xl={12}>
          <ChartCard title={t('Published Out')} metricKey="rabbitMQService.publishedOut" />
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard title={t('Published In')} metricKey="rabbitMQService.publishedIn" />
        </Col>
        <Col xs={24} xl={12}>
          <ChartCard title={t('Channel')} metricKey="rabbitMQService.channel" />
        </Col>
      </Row>
    </MonitorPanel>
  );
}

export default function OtherService() {
  const [type, setType] = useState('mysql');
  const Cmp = { mysql: Mysql, memcache: Memcache, rabbitmq: RabbitMQ }[type] || Mysql;
  return (
    <MonitorPage
      title={t('Other Services')}
      breadcrumb={[t('Monitor Center'), t('Other Services')]}
      description={t('MySQL, Memcache and RabbitMQ metrics.')}
    >
      <Radio.Group value={type} onChange={(e) => setType(e.target.value)} style={{ marginBottom: 16 }}>
        <Radio.Button value="mysql">MySQL</Radio.Button>
        <Radio.Button value="memcache">Memcache</Radio.Button>
        <Radio.Button value="rabbitmq">RabbitMQ</Radio.Button>
      </Radio.Group>
      <Cmp key={type} />
    </MonitorPage>
  );
}
