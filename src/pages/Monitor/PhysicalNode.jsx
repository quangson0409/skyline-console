import React from 'react';
import { Col, Progress, Row } from 'antd';
import { t } from '@/core/i18n';
import { MonitorPage, MonitorPanel, StatCard, ChartCard, BigNumber } from './charts';
import { computePercentage, formatBytes, formatUsedTime, getPhysicalNodes, getSuitableValue, resultOf } from './lib';

/** Legacy pages/monitor/containers/PhysicalNode */

const fsFormat = ([avail, size] = []) => {
  const sizes = resultOf(size);
  return resultOf(avail).map((item, index) => {
    const availValue = parseFloat(item?.value?.[1] || 0);
    const total = parseFloat(sizes[index]?.value?.[1] || 0);
    return {
      mountpoint: `${item?.metric?.device || ''}${item?.metric?.mountpoint || ''}`,
      avail: availValue,
      total,
      used: total - availValue,
    };
  });
};

export function PhysicalNodeContent() {
  const traffic = (d) => getSuitableValue(d, 'traffic', 0);
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12} xl={5}>
        <StatCard
          title={t('CPU Cores')}
          metricKey="physicalNode.cpuCores"
          render={(data) => <BigNumber>{data.length || 0}</BigNumber>}
        />
      </Col>
      <Col xs={24} md={12} xl={5}>
        <StatCard
          title={t('Total RAM')}
          metricKey="physicalNode.totalMem"
          render={(data) => <BigNumber>{getSuitableValue(data[0]?.y || 0, 'memory')}</BigNumber>}
        />
      </Col>
      <Col xs={24} md={12} xl={5}>
        <StatCard
          title={t('System Running Time')}
          metricKey="physicalNode.systemRunningTime"
          render={(data) => {
            const now = Math.floor(Date.now() / 1000);
            const boot = parseInt(data[0]?.y ?? now, 10);
            return <BigNumber>{formatUsedTime((now - boot) * 1000)}</BigNumber>;
          }}
        />
      </Col>
      <Col xs={24} md={12} xl={9}>
        <StatCard
          title={t('File System Used Space')}
          metricKey="physicalNode.fileSystemFreeSpace"
          format={fsFormat}
          render={(data) => (
            <div style={{ height: 100, overflow: 'auto' }}>
              {data.map((item, index) => {
                const pct = computePercentage(item.used, item.total);
                return (
                  <div key={`${item.mountpoint}-${index}`} style={{ marginTop: index > 0 ? 12 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span>{item.mountpoint}</span>
                      <span>{`${formatBytes(parseInt(item.used, 10))} / ${formatBytes(parseInt(item.total, 10))}`}</span>
                    </div>
                    <Progress percent={pct} size="small" status={pct > 80 ? 'exception' : 'normal'} />
                  </div>
                );
              })}
              {!data.length ? <BigNumber>-</BigNumber> : null}
            </div>
          )}
        />
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard title={t('CPU Usage (%)')} metricKey="physicalNode.cpuUsage" typeKey="mode" />
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard
          title={t('Memory Usage')}
          metricKey="physicalNode.memUsage"
          modifyKeys={[t('Used'), t('Free')]}
          yFormatter={(d) => getSuitableValue(d, 'memory', 0)}
        />
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard title={t('DISK IOPS')} metricKey="physicalNode.diskIOPS" modifyKeys={[t('read'), t('write')]} deviceKey="device" />
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard title={t('DISK Usage (%)')} metricKey="physicalNode.diskUsage" typeKey="hostname" deviceKey="device" />
      </Col>
      <Col span={24}>
        <ChartCard title={t('System Load')} metricKey="physicalNode.systemLoad" typeKey="__name__" />
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard
          title={t('Network Traffic')}
          metricKey="physicalNode.networkTraffic"
          modifyKeys={[t('receive'), t('transmit')]}
          deviceKey="device"
          yFormatter={traffic}
        />
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard title={t('TCP Connections')} metricKey="physicalNode.tcpConnections" />
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard title={t('Network Errors')} metricKey="physicalNode.networkErrors" typeKey="__name__" deviceKey="device" />
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard
          title={t('Network Dropped Packets')}
          metricKey="physicalNode.networkDroppedPackets"
          modifyKeys={[t('receive'), t('transmit')]}
          deviceKey="device"
        />
      </Col>
    </Row>
  );
}

export default function PhysicalNode() {
  return (
    <MonitorPage
      title={t('Physical Nodes')}
      breadcrumb={[t('Monitor Center'), t('Physical Nodes')]}
      description={t('Resource usage of the physical nodes collected by Prometheus node exporter.')}
    >
      <MonitorPanel fetchNodes={getPhysicalNodes}>
        <PhysicalNodeContent />
      </MonitorPanel>
    </MonitorPage>
  );
}
