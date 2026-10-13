import React, { useEffect, useState } from 'react';
import { Card, Col, Progress, Row, Segmented, Spin } from 'antd';
import { hasEndpoint } from '@/api/endpoints';
import { t } from '@/core/i18n';
import { MonitorPage, MonitorPanel, StatCard, ChartCard, BigNumber, DonutChart, BarChart, LineChart, useMetric, useMonitor } from './charts';
import {
  cephStatusColorMap,
  cephStatusMap,
  computePercentage,
  fetchMetric,
  getSuitableValue,
  handleResponse,
  resultOf,
} from './lib';

/** Legacy pages/monitor/containers/Overview (+ components AlertInfo, Tops) */

const STEP = 15;
const DAY = 86400 * 1000;

const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const pad = (n) => String(n).padStart(2, '0');

/** Counts how many times the series restarted (gap > STEP) = number of alerts in the day */
const countAlerts = (points) => points.reduce((pre, cur, idx) => (idx > 0 && cur.x - points[idx - 1].x > STEP ? pre + 1 : pre), 0);

function AlertInfo() {
  const ctx = useMonitor();
  const [loading, setLoading] = useState(true);
  const [cpuCount, setCpuCount] = useState(0);
  const [memCount, setMemCount] = useState(0);
  const [week, setWeek] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const today = startOfDay(Date.now());
      const days = Array.from({ length: 7 }, (_, i) => today - (6 - i) * DAY);
      const results = await Promise.all(
        days.map(async (day) => {
          const responses = await fetchMetric('monitorOverview.alertInfo', {
            requestType: 'range',
            range: [day, day + DAY - 1000],
            interval: STEP,
          });
          const cpu = countAlerts(handleResponse(responses[0], null, null, 'cpu'));
          const mem = countAlerts(handleResponse(responses[1], null, null, 'memory'));
          return { day, cpu, mem, total: cpu + mem };
        })
      );
      if (!alive) return;
      const last = results[results.length - 1] || {};
      setCpuCount(last.cpu || 0);
      setMemCount(last.mem || 0);
      setWeek(results.map((r) => ({ x: Math.floor(r.day / 1000), y: r.total, type: t('Alarm') })));
      setLoading(false);
    })().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ctx.refreshKey]);

  const fmtDay = (sec) => {
    const d = new Date(sec * 1000);
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  return (
    <Row gutter={[16, 16]}>
      <Col flex="1 1 360px">
        <Card size="small" variant="borderless" style={{ borderRadius: 8, height: '100%' }}>
          {loading ? (
            <Spin />
          ) : (
            <Row style={{ height: '100%', minHeight: 200 }} align="middle">
              {[
                [cpuCount, t('Today CPU usage > 80% alert')],
                [memCount, t('Today Memory usage > 80% alert')],
              ].map(([n, label]) => (
                <Col span={12} key={label} style={{ textAlign: 'center' }}>
                  <div style={{ color: '#e86804', fontSize: 36, fontWeight: 600 }}>{n}</div>
                  <div>{label}</div>
                </Col>
              ))}
            </Row>
          )}
        </Card>
      </Col>
      <Col flex="0 1 480px">
        <Card
          size="small"
          variant="borderless"
          style={{ borderRadius: 8 }}
          title={t('Last week alarm trend')}
          extra={<span style={{ fontSize: 12, color: '#94a3b8' }}>{t('time / 24h')}</span>}
          loading={loading}
        >
          <LineChart data={week} height={220} xFormatter={fmtDay} tooltipXFormatter={fmtDay} />
        </Card>
      </Col>
    </Row>
  );
}

const UsageNumber = ({ used, total, usedText, totalText }) => (
  <div style={{ height: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
    <div>
      <span style={{ fontSize: 28, fontWeight: 600 }}>{computePercentage(used, total)}</span>%
    </div>
    <div style={{ fontSize: 12 }}>{`${usedText ?? used} / ${totalText ?? total}`}</div>
  </div>
);

const UsageBar = ({ used, total, unit = 'disk' }) => {
  const pct = computePercentage(used, total);
  return (
    <div style={{ height: 100, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ textAlign: 'right', fontSize: 12, marginBottom: 8 }}>
        {`${t('Used')} ${getSuitableValue(used, unit)} / ${t('Total')} ${getSuitableValue(total, unit)}`}
      </div>
      <Progress percent={pct} status={pct > 80 ? 'exception' : 'normal'} showInfo={pct !== 100} />
    </div>
  );
};

const ProgressList = ({ data }) => (
  <div style={{ minHeight: 200 }}>
    {data.map((d) => (
      <div key={d.type} style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 12 }}>{d.type}</div>
        <Progress percent={d.y || 0} size="small" status={(d.y || 0) > 80 ? 'exception' : 'normal'} showInfo={d.y !== 100} />
      </div>
    ))}
  </div>
);

const topColumnFormat = (keys) => (responses) => {
  const data = [];
  responses.forEach((ret, idx) => {
    resultOf(ret).forEach((d) => data.push({ x: d?.metric?.instance, y: parseFloat(d?.value?.[1] || 0), type: keys[idx] }));
  });
  return data;
};

/** Legacy renderTopColumnExtra + renderTopColumnChart: bar chart with read/write tabs */
function TopColumnCard({ title, metricKey, modifyKeys, yFormatter }) {
  const [active, setActive] = useState(modifyKeys[0]);
  const { data, loading } = useMetric({ metricKey, format: topColumnFormat(modifyKeys) });
  const list = Array.isArray(data) ? data : [];
  return (
    <Card
      title={title}
      size="small"
      variant="borderless"
      style={{ borderRadius: 8, height: '100%' }}
      loading={loading}
      extra={<Segmented size="small" value={active} onChange={setActive} options={modifyKeys} />}
    >
      <BarChart data={list.filter((d) => d.type === active)} height={200} yFormatter={yFormatter} />
    </Card>
  );
}

function OverviewContent() {
  const enableCinder = hasEndpoint('cinder');
  const pair = (data) => [data[0]?.y || 0, data[1]?.y || 0];
  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <AlertInfo />
      </Col>
      <Col xs={24} xl={12}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <StatCard
              title={t('Physical CPU Usage')}
              metricKey="monitorOverview.physicalCPUUsage"
              render={(data) => {
                const [used, total] = pair(data);
                return <UsageNumber used={used} total={total} />;
              }}
            />
          </Col>
          <Col xs={24} md={12}>
            <StatCard
              title={t('Total RAM')}
              metricKey="monitorOverview.physicalMemoryUsage"
              render={(data) => {
                const [used, total] = pair(data);
                return (
                  <UsageNumber
                    used={used}
                    total={total}
                    usedText={getSuitableValue(used, 'memory')}
                    totalText={getSuitableValue(total, 'memory')}
                  />
                );
              }}
            />
          </Col>
          <Col span={24}>
            <StatCard
              title={t('Physical Storage Usage')}
              metricKey="monitorOverview.physicalStorageUsage"
              render={(data) => {
                const [used, total] = pair(data);
                return <UsageBar used={used} total={total} />;
              }}
            />
          </Col>
        </Row>
      </Col>
      <Col xs={24} xl={12}>
        <StatCard
          title={t('Compute Node status')}
          metricKey="monitorOverview.computeNodeStatus"
          height={300}
          format={(responses) => {
            const status = [
              { type: 'up', value: 0 },
              { type: 'down', value: 0 },
            ];
            resultOf(responses[0]).forEach((r) => {
              const idx = r?.metric?.adminState === 'enabled' ? 0 : 1;
              status[idx].value += parseInt(r?.value?.[1] || 0, 10) || 0;
            });
            return status;
          }}
          render={(data) => (
            <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DonutChart data={data} height={240} colorMap={{ up: '#1baf7a', down: '#e34948' }} />
            </div>
          )}
        />
      </Col>
      <Col xs={24} xl={12}>
        <StatCard
          title={t('Host CPU Usage')}
          metricKey="monitorOverview.topHostCPUUsage"
          height={200}
          format={(responses) => responses.flatMap((r) => handleResponse(r, 'instance'))}
          render={(data) => <ProgressList data={data} />}
        />
      </Col>
      <Col xs={24} xl={12}>
        <TopColumnCard title={t('Host Disk Average IOPS')} metricKey="monitorOverview.topHostDiskIOPS" modifyKeys={[t('read'), t('write')]} />
      </Col>
      <Col xs={24} xl={12}>
        <StatCard
          title={t('Host Memory Usage')}
          metricKey="monitorOverview.topHostMemoryUsage"
          height={200}
          format={(responses) => responses.flatMap((r) => handleResponse(r, 'instance'))}
          render={(data) => <ProgressList data={data} />}
        />
      </Col>
      <Col xs={24} xl={12}>
        <TopColumnCard
          title={t('Host Average Network IO')}
          metricKey="monitorOverview.topHostInterface"
          modifyKeys={[t('receive'), t('transmit')]}
          yFormatter={(d) => getSuitableValue(d, 'traffic', 0)}
        />
      </Col>
      <Col xs={24} xl={12}>
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <StatCard
              title={t('Storage Cluster Status')}
              metricKey="monitorOverview.cephHealthStatus"
              height={65}
              render={(data) => {
                const v = data[0]?.y ?? 0;
                return (
                  <BigNumber height={65} color={cephStatusColorMap[v]}>
                    <span style={{ fontSize: 28 }}>{cephStatusMap()[v] ?? '-'}</span>
                  </BigNumber>
                );
              }}
            />
          </Col>
          <Col xs={24} md={enableCinder ? 12 : 24}>
            <StatCard
              title={t('Storage Cluster Usage')}
              metricKey="monitorOverview.cephStorageUsage"
              render={(data) => {
                const [used, total] = pair(data);
                return (
                  <UsageNumber used={used} total={total} usedText={getSuitableValue(used, 'disk')} totalText={getSuitableValue(total, 'disk')} />
                );
              }}
            />
          </Col>
          {enableCinder ? (
            <Col xs={24} md={12}>
              <StatCard
                title={t('Disk allocation (GiB)')}
                metricKey="monitorOverview.cephStorageAllocate"
                render={(data) => {
                  const total = parseFloat((data[1]?.y || 0).toFixed(2));
                  const used = parseFloat((total - (data[0]?.y || 0)).toFixed(2));
                  return <UsageNumber used={used} total={total} usedText={`${used} GiB`} totalText={`${total} GiB`} />;
                }}
              />
            </Col>
          ) : null}
        </Row>
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard title={t('Storage Cluster IOPS')} metricKey="monitorOverview.cephStorageClusterIOPS" modifyKeys={[t('read'), t('write')]} height={300} />
      </Col>
    </Row>
  );
}

export default function MonitorOverview() {
  return (
    <MonitorPage
      title={t('Monitor Overview')}
      breadcrumb={[t('Monitor Center'), t('Monitor Overview')]}
      description={t('Cloud-wide alarms, capacity and top hosts from Prometheus.')}
    >
      <MonitorPanel renderTimeRangeSelect={false} renderNodeSelect={false}>
        <OverviewContent />
      </MonitorPanel>
    </MonitorPage>
  );
}
