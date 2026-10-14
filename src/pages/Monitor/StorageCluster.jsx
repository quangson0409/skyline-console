import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Input, Progress, Row, Table, Tabs } from 'antd';
import { t } from '@/core/i18n';
import { MonitorPage, MonitorPanel, StatCard, ChartCard, BigNumber, DonutChart, useMonitor } from './charts';
import {
  METRICDICT,
  cephStatusColorMap,
  cephStatusMap,
  computePercentage,
  fetchMetric,
  fetchPrometheus,
  formatBytes,
  getSuitableValue,
  handleResponses,
  resultOf,
  reportPrometheusError,
} from './lib';

/** Legacy pages/monitor/containers/StorageCluster (+ RenderTabs pools / OSDs) */

const INT_KEYS = [
  'ceph_pool_objects',
  'ceph_pg_total',
  'ceph_pool_max_avail',
  'ceph_osd_weight',
  'ceph_osd_apply_latency_ms',
  'ceph_osd_commit_latency_ms',
  'ceph_osd_stat_bytes',
];

async function loadTabData() {
  const [pool, osd] = await fetchMetric('storageCluster.tabs', { requestType: 'current' });
  const rows = [
    ...resultOf(pool).map((r) => ({ tabType: 'pool', ...r.metric, value: parseFloat(r.value?.[1]) || 0 })),
    ...resultOf(osd).map((r) => ({ tabType: 'osd', ...r.metric, value: parseFloat(r.value?.[1]) || 0 })),
  ];
  const merge = (rets, primaryKey) =>
    rets.forEach((ret, index) => {
      resultOf(ret).forEach((item) => {
        const { metric = {}, value = [] } = item;
        const row = rows.find((p) => p[primaryKey] !== undefined && p[primaryKey] === metric[primaryKey]);
        if (!row) return;
        if (index === 3) row.usage = parseFloat(parseFloat(value[1]).toFixed(2));
        else if (INT_KEYS.includes(metric.__name__)) row[metric.__name__] = parseInt(value[1], 10);
        else if (metric.__name__) row[metric.__name__] = value[1];
      });
    });
  const poolRets = await Promise.all(METRICDICT.storageCluster.poolTab.url.map((u) => fetchPrometheus(u, 'current').catch(reportPrometheusError)));
  merge(poolRets, 'pool_id');
  const osdRets = await Promise.all(METRICDICT.storageCluster.osdTab.url.map((u) => fetchPrometheus(u, 'current').catch(reportPrometheusError)));
  merge(osdRets, 'ceph_daemon');
  return rows;
}

function PoolOsdTabs() {
  const ctx = useMonitor();
  const [tab, setTab] = useState('pool');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadTabData()
      .then((r) => alive && setRows(r))
      .catch((err) => { reportPrometheusError(err); if (alive) setRows([]); })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ctx.refreshKey]);

  const list = useMemo(() => {
    const key = tab === 'pool' ? 'name' : 'ceph_daemon';
    return rows
      .filter((r) => r.tabType === tab)
      .filter((r) => !keyword || String(r[key] || '').toLowerCase().includes(keyword.toLowerCase()));
  }, [rows, tab, keyword]);

  const poolColumns = [
    { title: t('Pool Name'), dataIndex: 'name', key: 'name' },
    { title: t('PG Count'), dataIndex: 'ceph_pg_total', key: 'ceph_pg_total' },
    { title: t('Object Count'), dataIndex: 'ceph_pool_objects', key: 'ceph_pool_objects' },
    { title: t('Max Avail'), dataIndex: 'ceph_pool_max_avail', key: 'ceph_pool_max_avail', render: (v) => formatBytes(v) },
    { title: t('Usage'), dataIndex: 'usage', key: 'usage', render: (v) => (v === undefined ? '-' : `${v}%`) },
  ];
  const osdColumns = [
    { title: t('Name'), dataIndex: 'ceph_daemon', key: 'ceph_daemon' },
    { title: t('Status'), dataIndex: 'ceph_osd_up', key: 'ceph_osd_up', render: (v) => (v === '1' ? t('Up') : t('Down')) },
    { title: t('Instance Addr'), dataIndex: 'cluster_addr', key: 'cluster_addr' },
    { title: t('Weight'), dataIndex: 'ceph_osd_weight', key: 'ceph_osd_weight' },
    { title: t('Apply Latency (ms)'), dataIndex: 'ceph_osd_apply_latency_ms', key: 'ceph_osd_apply_latency_ms' },
    { title: t('Commit Latency (ms)'), dataIndex: 'ceph_osd_commit_latency_ms', key: 'ceph_osd_commit_latency_ms' },
    { title: t('Total Capacity'), dataIndex: 'ceph_osd_stat_bytes', key: 'ceph_osd_stat_bytes', render: (v) => formatBytes(v) },
    { title: t('Usage'), dataIndex: 'usage', key: 'usage', render: (v) => (v === undefined ? '-' : `${parseFloat(v).toFixed(2)}%`) },
  ];

  return (
    <Card size="small" variant="borderless" style={{ borderRadius: 8 }}>
      <Tabs
        activeKey={tab}
        onChange={(k) => {
          setKeyword('');
          setTab(k);
        }}
        items={[
          { key: 'pool', label: t('Pools') },
          { key: 'osd', label: t('OSDs') },
        ]}
      />
      <Input.Search
        allowClear
        style={{ maxWidth: 320, marginBottom: 12 }}
        placeholder={tab === 'pool' ? t('Pool Name') : t('Name')}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      <Table
        size="small"
        loading={loading}
        rowKey={(r) => (tab === 'pool' ? r.pool_id : r.ceph_daemon || r.name)}
        columns={tab === 'pool' ? poolColumns : osdColumns}
        dataSource={list}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
      />
    </Card>
  );
}

function StorageClusterContent() {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12} xl={6}>
        <StatCard
          title={t('Storage Cluster Status')}
          metricKey="storageCluster.cephHealthStatus"
          height={120}
          render={(data) => {
            const v = data[0]?.y ?? 0;
            return (
              <BigNumber height={120} color={cephStatusColorMap[v]}>
                <span style={{ fontSize: 28 }}>{cephStatusMap()[v] ?? '-'}</span>
              </BigNumber>
            );
          }}
        />
      </Col>
      <Col xs={24} md={12} xl={9}>
        <StatCard
          title={t('Monitors')}
          metricKey="storageCluster.cephMonitorStatus"
          height={120}
          format={(responses) => {
            const status = [
              { type: 'down', value: 0 },
              { type: 'up', value: 0 },
            ];
            handleResponses(responses).forEach((i) => {
              if (status[i.y]) status[i.y].value += 1;
            });
            return status;
          }}
          render={(data) => <DonutChart data={data} height={120} colorMap={{ up: '#1baf7a', down: '#e34948' }} />}
        />
      </Col>
      <Col xs={24} md={12} xl={9}>
        <StatCard
          title={t('PGs')}
          metricKey="storageCluster.cephPGS"
          height={120}
          format={(responses) => {
            const data = handleResponses(responses);
            return [
              { type: 'clean', value: data[0]?.y || 0 },
              { type: 'others', value: data[1]?.y || 0 },
            ];
          }}
          render={(data) => <DonutChart data={data} height={120} />}
        />
      </Col>
      <Col xs={24} md={12} xl={9}>
        <StatCard
          title={t('OSDs')}
          metricKey="storageCluster.osdData"
          format={(responses) => {
            const v = (r) => r?.data?.result?.[0]?.value?.[1] ?? 0;
            const [inUp, inDown, outUp, outDown] = responses;
            return { inUp: v(inUp), inDown: v(inDown), outUp: v(outUp), outDown: v(outDown) };
          }}
          render={(data) => (
            <Row style={{ textAlign: 'center', paddingTop: 8 }} gutter={[0, 8]}>
              <Col span={8} />
              <Col span={8} style={{ opacity: 0.8 }}>{t('Up')}</Col>
              <Col span={8} style={{ opacity: 0.8 }}>{t('Down')}</Col>
              <Col span={8} style={{ opacity: 0.8 }}>{t('In Cluster')}</Col>
              <Col span={8} style={{ fontSize: 18 }}>{data.inUp ?? 0}</Col>
              <Col span={8} style={{ fontSize: 18 }}>{data.inDown ?? 0}</Col>
              <Col span={8} style={{ opacity: 0.8 }}>{t('Out Cluster')}</Col>
              <Col span={8} style={{ fontSize: 18 }}>{data.outUp ?? 0}</Col>
              <Col span={8} style={{ fontSize: 18 }}>{data.outDown ?? 0}</Col>
            </Row>
          )}
        />
      </Col>
      <Col xs={24} md={12} xl={5}>
        <StatCard title={t('Average PGs per OSD')} metricKey="storageCluster.avgPerOSD" />
      </Col>
      <Col xs={24} xl={10}>
        <StatCard
          title={t('Storage Cluster Usage')}
          metricKey="storageCluster.storageClusterUsage"
          render={(data) => {
            const used = data[0]?.y || 0;
            const total = data[1]?.y || 0;
            const pct = computePercentage(used, total);
            return (
              <div style={{ height: 100, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ textAlign: 'right', fontSize: 12, marginBottom: 8 }}>
                  {`${t('Used')} ${getSuitableValue(used, 'disk')} / ${t('Total')} ${getSuitableValue(total, 'disk')}`}
                </div>
                <Progress percent={pct} status={pct > 80 ? 'exception' : 'normal'} showInfo={pct !== 100} />
              </div>
            );
          }}
        />
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard
          title={t('Storage Pool Capacity Usage')}
          metricKey="storageCluster.poolCapacityUsage"
          modifyKeys={[t('used'), t('available')]}
          yFormatter={(d) => getSuitableValue(d, 'disk', 0)}
        />
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard title={t('Storage Cluster OSD Latency')} metricKey="storageCluster.clusterOSDLatency" modifyKeys={['apply', 'commit']} />
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard title={t('Storage Cluster IOPS')} metricKey="storageCluster.clusterIOPS" modifyKeys={[t('read'), t('write')]} />
      </Col>
      <Col xs={24} xl={12}>
        <ChartCard
          title={t('Storage Cluster Bandwidth')}
          metricKey="storageCluster.clusterBandwidth"
          modifyKeys={[t('in'), t('out')]}
          yFormatter={(d) => getSuitableValue(d, 'bandwidth', 0)}
        />
      </Col>
      <Col span={24}>
        <PoolOsdTabs />
      </Col>
    </Row>
  );
}

export default function StorageCluster() {
  return (
    <MonitorPage
      title={t('Storage Clusters')}
      breadcrumb={[t('Monitor Center'), t('Storage Clusters')]}
      description={t('Ceph cluster health, capacity, latency and throughput.')}
    >
      <MonitorPanel renderNodeSelect={false}>
        <StorageClusterContent />
      </MonitorPanel>
    </MonitorPage>
  );
}
