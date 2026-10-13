import { monitorApi } from '@/api/monitor';
import { t } from '@/core/i18n';

/**
 * Prometheus helpers for the Monitor Center - port of legacy
 * components/PrometheusChart/utils/* and resources/prometheus/{metricDict,monitoring}.js.
 */

/* ------------------------------------------------------------------ */
/* Metric dictionary (legacy resources/prometheus/metricDict.js)       */
/* ------------------------------------------------------------------ */
const sum = (url) => `sum(${url})`;
export const METRICDICT = {
  monitorOverview: {
    alertInfo: {
      url: ['node_cpu_seconds_total', 'node_memory_MemAvailable_bytes /  node_memory_MemTotal_bytes'],
      baseParams: [{ mode: 'idle', node: '' }, {}],
      finalFormatFunc: [
        (url) => `1 - (avg by(instance) (irate(${url}[5m]))) > 0.8`,
        (url) => `1 - (${url}) > 0.8`,
      ],
    },
    physicalCPUUsage: { url: ['openstack_nova_vcpus_used', 'openstack_nova_vcpus_available'], finalFormatFunc: [sum, sum] },
    physicalMemoryUsage: {
      url: ['openstack_nova_memory_used_bytes', 'openstack_nova_memory_available_bytes'],
      finalFormatFunc: [sum, sum],
    },
    physicalStorageUsage: { url: ['ceph_cluster_total_used_bytes', 'ceph_cluster_total_bytes'] },
    computeNodeStatus: { url: ['openstack_nova_agent_state'], baseParams: [{ service: 'nova-compute' }] },
    topHostCPUUsage: {
      url: ['node_cpu_seconds_total'],
      baseParams: [{ mode: 'idle' }],
      finalFormatFunc: [(url) => `topk(5, 100 - (avg(irate(${url}[30m])) by (instance) * 100))`],
    },
    topHostDiskIOPS: {
      url: ['node_disk_reads_completed_total', 'node_disk_writes_completed_total'],
      finalFormatFunc: [
        (url) => `topk(5, avg(irate(${url}[10m])) by (instance))`,
        (url) => `topk(5, avg(irate(${url}[10m])) by (instance))`,
      ],
    },
    topHostMemoryUsage: {
      url: ['node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes'],
      finalFormatFunc: [(url) => `topk(5, (1 - ${url}) * 100)`],
    },
    topHostInterface: {
      url: ['node_network_receive_bytes_total', 'node_network_transmit_bytes_total'],
      finalFormatFunc: [
        (url) => `topk(5, avg(irate(${url}[5m])) by (instance))`,
        (url) => `topk(5, avg(irate(${url}[5m])) by (instance))`,
      ],
    },
    cephHealthStatus: { url: ['ceph_health_status'] },
    cephStorageUsage: { url: ['ceph_cluster_total_used_bytes', 'ceph_cluster_total_bytes'] },
    cephStorageAllocate: {
      url: ['os_cinder_volume_pools_free_capacity_gb', 'os_cinder_volume_pools_total_capacity_gb'],
      finalFormatFunc: [sum, sum],
    },
    cephStorageClusterIOPS: {
      url: ['ceph_osd_op_r', 'ceph_osd_op_w'],
      finalFormatFunc: [(url) => `sum(irate(${url}[5m]))`, (url) => `sum(irate(${url}[5m]))`],
    },
  },
  physicalNode: {
    cpuCores: { url: ['node_cpu_seconds_total'], finalFormatFunc: [(url) => `count(${url}) by (cpu)`] },
    totalMem: { url: ['node_memory_MemTotal_bytes'] },
    systemRunningTime: { url: ['node_boot_time_seconds'] },
    fileSystemFreeSpace: {
      url: ['node_filesystem_avail_bytes', 'node_filesystem_size_bytes'],
      baseParams: [{ fstype: ['ext4', 'xfs'] }, { fstype: ['ext4', 'xfs'] }],
    },
    cpuUsage: {
      url: ['node_cpu_seconds_total'],
      finalFormatFunc: [(url) => `avg by (mode)(irate(${url}[30m])) * 100`],
      baseParams: [{ mode: ['idle', 'system', 'user', 'iowait'] }],
    },
    memUsage: { url: ['node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes', 'node_memory_MemAvailable_bytes'] },
    diskIOPS: {
      url: ['node_disk_reads_completed_total', 'node_disk_writes_completed_total'],
      finalFormatFunc: [(url) => `irate(${url}[5m])`, (url) => `irate(${url}[5m])`],
    },
    diskUsage: {
      url: ['node_filesystem_free_bytes / node_filesystem_size_bytes'],
      finalFormatFunc: [(url) => `(1 - ${url}) * 100`],
      baseParams: [{ device: ['/dev/.*'] }],
    },
    systemLoad: { url: ['node_load1', 'node_load5', 'node_load15'] },
    networkTraffic: {
      url: ['node_network_receive_bytes_total', 'node_network_transmit_bytes_total'],
      finalFormatFunc: [(url) => `sum(irate(${url}[10m]))`, (url) => `sum(irate(${url}[10m]))`],
    },
    tcpConnections: { url: ['node_netstat_Tcp_CurrEstab'] },
    networkErrors: { url: ['node_network_receive_errs_total', 'node_network_transmit_errs_total'] },
    networkDroppedPackets: {
      url: ['node_network_receive_drop_total', 'node_network_transmit_drop_total'],
      finalFormatFunc: [(url) => `irate(${url}[5m])`, (url) => `irate(${url}[5m])`],
    },
  },
  storageCluster: {
    cephHealthStatus: { url: ['ceph_health_status'] },
    cephMonitorStatus: { url: ['ceph_mon_quorum_status'] },
    cephPGS: { url: ['ceph_pg_clean', 'ceph_pg_total-ceph_pg_clean'], finalFormatFunc: [sum, sum] },
    storageClusterUsage: { url: ['ceph_cluster_total_used_bytes', 'ceph_cluster_total_bytes'] },
    osdData: {
      url: [
        'ceph_osd_in == 1 and ceph_osd_up == 1',
        'ceph_osd_in == 1 and ceph_osd_up == 0',
        'ceph_osd_in == 0 and ceph_osd_up == 1',
        'ceph_osd_in == 0 and ceph_osd_up == 0',
      ],
      finalFormatFunc: [(u) => `count(${u})`, (u) => `count(${u})`, (u) => `count(${u})`, (u) => `count(${u})`],
    },
    avgPerOSD: { url: ['ceph_osd_numpg'], finalFormatFunc: [(url) => `avg(${url})`] },
    poolCapacityUsage: {
      url: ['ceph_cluster_total_used_bytes', 'ceph_cluster_total_bytes-ceph_cluster_total_used_bytes'],
    },
    clusterOSDLatency: {
      url: ['ceph_osd_apply_latency_ms', 'ceph_osd_commit_latency_ms'],
      finalFormatFunc: [(url) => `avg(${url})`, (url) => `avg(${url})`],
    },
    clusterIOPS: {
      url: ['ceph_osd_op_r', 'ceph_osd_op_w'],
      finalFormatFunc: [(url) => `sum(irate(${url}[5m]))`, (url) => `sum(irate(${url}[5m]))`],
    },
    clusterBandwidth: {
      url: ['ceph_osd_op_rw_in_bytes', 'ceph_osd_op_rw_out_bytes'],
      finalFormatFunc: [(url) => `sum(irate(${url}[5m]))`, (url) => `sum(irate(${url}[5m]))`],
    },
    tabs: { url: ['ceph_pool_metadata', 'ceph_osd_metadata'] },
    poolTab: {
      url: ['ceph_pg_total', 'ceph_pool_objects', 'ceph_pool_max_avail', '(ceph_pool_stored/ceph_pool_max_avail)*100'],
    },
    osdTab: {
      url: [
        'ceph_osd_weight',
        'ceph_osd_apply_latency_ms',
        'ceph_osd_commit_latency_ms',
        '(ceph_osd_stat_bytes_used/ceph_osd_stat_bytes)*100',
        'ceph_osd_up',
        'ceph_osd_stat_bytes',
      ],
    },
  },
  openstackService: {
    novaService: {
      url: ['openstack_nova_agent_state', 'openstack_nova_agent_state', 'node_process_total', 'node_process_total'],
      baseParams: [{}, { adminState: 'disabled' }, { name: 'libvirtd' }, { name: 'libvirtd' }],
      finalFormatFunc: [
        (url) => url,
        (url) => `sum_over_time(${url}[24h]) > 0`,
        (url) => url,
        (url) => `min_over_time(${url}[24h]) == 0`,
      ],
    },
    networkService: {
      url: ['openstack_neutron_agent_state', 'openstack_neutron_agent_state'],
      baseParams: [{}, { adminState: 'down' }],
      finalFormatFunc: [(url) => url, (url) => `sum_over_time(${url}[24h]) > 0`],
    },
    cinderService: {
      url: ['openstack_cinder_agent_state', 'openstack_cinder_agent_state'],
      baseParams: [{}, { service_state: 'down' }],
      finalFormatFunc: [(url) => url, (url) => `sum_over_time(${url}[24h]) > 0`],
    },
    otherService: { url: ['mysql_up', 'rabbitmq_identity_info', 'memcached_up'] },
    otherServiceMinOverTime: {
      url: ['mysql_up', 'rabbitmq_identity_info', 'memcached_up'],
      finalFormatFunc: [
        (url) => `min_over_time(${url}[24h]) == 0`,
        (url) => `min_over_time(${url}[24h]) == 0`,
        (url) => `min_over_time(${url}[24h]) == 0`,
      ],
    },
  },
  mysqlService: {
    runningTime: { url: ['mysql_global_status_uptime'] },
    connectedThreads: { url: ['mysql_global_status_threads_connected'] },
    runningThreads: { url: ['mysql_global_status_threads_running'] },
    slowQuery: { url: ['mysql_global_status_slow_queries'] },
    threadsActivityTrends_connected: { url: ['mysql_global_status_threads_connected'] },
    mysqlActions: {
      url: ['mysql_global_status_commands_total', 'mysql_global_status_commands_total', 'mysql_global_status_commands_total'],
      baseParams: [{ command: 'delete' }, { command: 'insert' }, { command: 'update' }],
    },
    slowQueryChart: { url: ['mysql_global_status_slow_queries'] },
  },
  memcacheService: {
    currentConnections: { url: ['memcached_current_connections'] },
    totalConnections: { url: ['memcached_connections_total'] },
    readWriteBytesTotal: {
      url: ['memcached_read_bytes_total', 'memcached_written_bytes_total'],
      finalFormatFunc: [(url) => `irate(${url}[20m])`, (url) => `irate(${url}[20m])`],
    },
    evictions: { url: ['memcached_slab_items_evicted_unfetched_total'], finalFormatFunc: [sum] },
    itemsInCache: { url: ['memcached_items_total'] },
  },
  rabbitMQService: {
    serviceStatus: { url: ['rabbitmq_identity_info'] },
    totalConnections: { url: ['rabbitmq_connections_opened_total'] },
    totalQueues: { url: ['rabbitmq_queues_created_total'] },
    totalExchanges: { url: ['erlang_mnesia_tablewise_size'] },
    totalConsumers: { url: ['rabbitmq_queue_consumers'] },
    publishedOut: { url: ['rabbitmq_channel_messages_published_total'], finalFormatFunc: [(url) => `sum(irate(${url}[20m]))`] },
    publishedIn: { url: ['rabbitmq_channel_messages_confirmed_total'], finalFormatFunc: [(url) => `sum(irate(${url}[20m]))`] },
    channel: { url: ['rabbitmq_channels'] },
  },
};

const getPath = (obj, path) => path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);

/* ------------------------------------------------------------------ */
/* Query building & fetching                                           */
/* ------------------------------------------------------------------ */
export function addParams(query, params) {
  const parts = Object.keys(params).map((key) =>
    Array.isArray(params[key]) ? `${key}=~"${params[key].join('|')}"` : `${key}="${params[key]}"`
  );
  return `${query}{${parts.join(',')}}`;
}

export function getRequestUrl(url, params = {}, finalFormatFunc = (d) => d, baseParams = {}) {
  const total = { ...params, ...baseParams };
  return finalFormatFunc(Object.keys(total).length === 0 ? url : addParams(url, total));
}

const toSeconds = (v) => Math.floor(Number(v) / 1000);

/** range = [startMs, endMs]; requestType 'current' | 'range' */
export function fetchPrometheus(query, requestType = 'range', range = [], interval = 10) {
  if (requestType === 'current') return monitorApi.query(query);
  return monitorApi.queryRange(query, toSeconds(range[0]), toSeconds(range[1]), interval);
}

/** Legacy createFetchPrometheusClient: one request per url of the metric, in order */
export function fetchMetric(metricKey, { requestType = 'current', params = {}, range, interval } = {}) {
  const q = getPath(METRICDICT, metricKey);
  if (!q) return Promise.resolve([]);
  return Promise.all(
    q.url.map((u, idx) => {
      const finalFormatFunc = (q.finalFormatFunc || [])[idx] || ((d) => d);
      const baseParams = (q.baseParams || [])[idx] || {};
      return fetchPrometheus(getRequestUrl(u, params, finalFormatFunc, baseParams), requestType, range, interval).catch(
        () => ({})
      );
    })
  );
}

/** Safe accessor for `data.result` of a prometheus response */
export const resultOf = (res) => (Array.isArray(res?.data?.result) ? res.data.result : []);

/* ------------------------------------------------------------------ */
/* Data handling (legacy utils/dataHandler.js)                         */
/* ------------------------------------------------------------------ */
const baseFix = (value = []) => ({ x: Number(value[0]), y: parseFloat(parseFloat(value[1]).toFixed(2)) || 0 });

export function handleResponse(response, typeKey, deviceKey, modifyType) {
  const ret = [];
  resultOf(response).forEach((result) => {
    const values = Array.isArray(result.values) ? result.values : Array.isArray(result.value) ? [result.value] : [];
    values.forEach((value) => {
      const item = baseFix(value);
      if (typeKey) item.type = getPath(result.metric || {}, typeKey);
      if (deviceKey) item.device = getPath(result.metric || {}, deviceKey);
      if (modifyType) item.type = modifyType;
      ret.push(item);
    });
  });
  return ret;
}

export function handleResponses(responses = [], typeKey, deviceKey, modifyKeys = []) {
  return responses.flatMap((r, idx) => handleResponse(r, typeKey, deviceKey, modifyKeys[idx]));
}

/** distinct devices of handled data (legacy DataSet partition by device) */
export const devicesOf = (data) =>
  Array.isArray(data) ? [...new Set(data.map((d) => d.device).filter((d) => d !== undefined && d !== null && d !== ''))] : [];

/* ------------------------------------------------------------------ */
/* Units (legacy resources/prometheus/monitoring.js)                   */
/* ------------------------------------------------------------------ */
const UnitTypes = {
  memory: { conditions: [1024 ** 4, 1024 ** 3, 1024 ** 2, 1024, 0], units: ['TiB', 'GiB', 'MiB', 'KiB', 'Bytes'] },
  disk: { conditions: [1024 ** 4, 1024 ** 3, 1024 ** 2, 1024, 0], units: ['TiB', 'GiB', 'MiB', 'KiB', 'Bytes'] },
  traffic: { conditions: [1024 ** 4, 1024 ** 3, 1024 ** 2, 1024, 0], units: ['TiB/s', 'GiB/s', 'MiB/s', 'KiB/s', 'B/s'] },
  bandwidth: { conditions: [1024 ** 2 / 8, 1024 / 8, 0], units: ['Mibps', 'Kibps', 'bps'] },
};
const UNIT_DIVISOR = {
  KiB: 1024, 'KiB/s': 1024, MiB: 1024 ** 2, 'MiB/s': 1024 ** 2, GiB: 1024 ** 3, 'GiB/s': 1024 ** 3, TiB: 1024 ** 4, 'TiB/s': 1024 ** 4,
};

export const getSuitableValue = (value, unitType = 'default', defaultValue = 0) => {
  const num = Number(value);
  if (value === null || value === undefined || value === '' || Number.isNaN(num)) return defaultValue;
  const cfg = UnitTypes[unitType];
  if (!cfg) return `${Number(num.toFixed(2))}`;
  let unit = cfg.units[cfg.units.length - 1];
  cfg.conditions.some((c, i) => {
    if (num >= c) {
      unit = cfg.units[i];
      return true;
    }
    return false;
  });
  let v = num;
  if (UNIT_DIVISOR[unit]) v = num / UNIT_DIVISOR[unit];
  else if (unit === 'bps') v = num * 8;
  else if (unit === 'Kibps') v = (num * 8) / 1024;
  else if (unit === 'Mibps') v = (num * 8) / 1024 / 1024;
  return `${v === 0 ? 0 : Number(v.toFixed(2))}${unit}`;
};

export const computePercentage = (used, total, digits = 2) => {
  if (!Number(used) || !Number(total)) return 0;
  return parseFloat(((parseFloat(used) / parseFloat(total)) * 100).toFixed(digits));
};

export const formatUsedTime = (ms) => {
  const s = 1000;
  const m = 60 * s;
  const h = 60 * m;
  const d = 24 * h;
  const w = 7 * d;
  if (ms < s) return `${ms} ms`;
  if (ms <= m) return `${(ms / s).toFixed(2)} s`;
  if (ms <= h) return `${(ms / m).toFixed(2)} min`;
  if (ms <= d) return `${(ms / h).toFixed(2)} h`;
  if (ms <= w) return `${(ms / d).toFixed(2)} d`;
  return `${(ms / w).toFixed(2)} w`;
};

export const formatBytes = (size) => {
  const n = Number(size);
  if (Number.isNaN(n)) return size || '-';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${i === 0 ? v : v.toFixed(2)} ${units[i]}`;
};

export const cephStatusMap = () => ({ 0: t('Healthy'), 1: t('Warning'), 2: t('Error') });
export const cephStatusColorMap = { 0: '#16a34a', 1: '#d97706', 2: '#dc2626' };

/* ------------------------------------------------------------------ */
/* Time range & intervals (legacy useRangeSelect / getInterval)        */
/* ------------------------------------------------------------------ */
const HOUR = 3600 * 1000;
export const getRange = (type) => {
  const now = Date.now();
  const span = { 0: HOUR, 1: 24 * HOUR, 2: 7 * 24 * HOUR, 3: 14 * 24 * HOUR }[type] || HOUR;
  return [now - span, now];
};

export const getIntervals = (range) => {
  const [start, end] = range || getRange(0);
  const minutes = (end - start) / 60000;
  const dict = [
    [
      { text: t('10s'), value: 10 },
      { text: t('1min'), value: 60 },
      { text: t('5min'), value: 300 },
    ],
    [
      { text: t('1min'), value: 60 },
      { text: t('5min'), value: 300 },
      { text: t('1H'), value: 3600 },
    ],
    [
      { text: t('1H'), value: 3600 },
      { text: t('1D'), value: 86400 },
    ],
    [{ text: t('1D'), value: 86400 }],
  ];
  const idx = (minutes > 44640 && 3) || (minutes > 1440 && 2) || (minutes > 60 && 1) || 0;
  return dict[idx];
};

const pad = (n) => String(n).padStart(2, '0');
/** x axis label for a unix-seconds timestamp, depending on the range span (legacy getXScale) */
export const formatTick = (sec, spanMs) => {
  const d = new Date(Number(sec) * 1000);
  if (spanMs > 24 * HOUR) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const formatFullTime = (sec) => {
  const d = new Date(Number(sec) * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
    d.getSeconds()
  )}`;
};

/* ------------------------------------------------------------------ */
/* Node lists (legacy utils/fetchNodes.js)                             */
/* ------------------------------------------------------------------ */
const nodesFrom = async (metricPath) => {
  const url = getPath(METRICDICT, metricPath)?.url?.[0];
  const res = await fetchPrometheus(url, 'current').catch(() => ({}));
  const list = resultOf(res)
    .map((r) => r?.metric?.instance)
    .filter((v) => v !== undefined);
  const uniq = [...new Set(list)];
  return uniq.length ? uniq : [''];
};

export const getPhysicalNodes = () => nodesFrom('physicalNode.systemLoad');
export const getMemcacheNodes = () => nodesFrom('memcacheService.currentConnections');
export const getRabbitMQNodes = () => nodesFrom('rabbitMQService.serviceStatus');
export const getMysqlNodes = () => nodesFrom('mysqlService.runningTime');
