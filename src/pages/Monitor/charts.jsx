import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Breadcrumb, Button, Card, DatePicker, Empty, Modal, Radio, Select, Space, Spin, Tooltip, theme } from 'antd';
import { ExpandAltOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from '@/core/i18n';
import { useThemeStore, THEMES } from '@/store/themeStore';
import {
  devicesOf,
  fetchMetric,
  formatFullTime,
  formatTick,
  getIntervals,
  getRange,
  handleResponses,
} from './lib';

/**
 * Lightweight SVG charts + Monitor Center building blocks
 * (replaces legacy bizcharts based components/PrometheusChart; no extra dependency).
 */

/* Validated categorical palette (dataviz reference instance), fixed order - never cycled by rank */
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export const useSeriesColors = () => {
  const { currentTheme } = useThemeStore();
  return currentTheme === THEMES.DARK_OPS ? SERIES_DARK : SERIES_LIGHT;
};

const useWidth = () => {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
};

const niceMax = (v) => {
  if (!v || v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * exp;
};

const defaultFormat = (v) => {
  const n = Number(v);
  if (Math.abs(n) >= 1e6) return `${Number((n / 1e6).toFixed(2))}M`;
  if (Math.abs(n) >= 1e3) return `${Number((n / 1e3).toFixed(2))}K`;
  return `${Number(n.toFixed(2))}`;
};

const Legend = ({ items }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, marginTop: 6 }}>
    {items.map((it) => (
      <span key={it.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color }} />
        <span style={{ opacity: 0.85 }}>{it.name}</span>
      </span>
    ))}
  </div>
);

/** Multi-series time line chart. data = [{ x: unixSeconds, y, type }] */
export function LineChart({ data = [], height = 260, yFormatter = defaultFormat, spanMs = 3600000, xFormatter, tooltipXFormatter }) {
  const { token } = theme.useToken();
  const colors = useSeriesColors();
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);

  const { series, xs, maxY } = useMemo(() => {
    const groups = new Map();
    data.forEach((d) => {
      const key = d.type ?? '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    });
    const list = [...groups.entries()].map(([name, points]) => ({ name, points: points.sort((a, b) => a.x - b.x) }));
    const allX = [...new Set(data.map((d) => d.x))].sort((a, b) => a - b);
    return { series: list, xs: allX, maxY: niceMax(Math.max(0, ...data.map((d) => d.y || 0))) };
  }, [data]);

  if (!data.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  const pad = { l: 56, r: 12, t: 10, b: 26 };
  const w = Math.max(width, 120);
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const minX = xs[0];
  const maxX = xs[xs.length - 1] === minX ? minX + 1 : xs[xs.length - 1];
  const sx = (x) => pad.l + ((x - minX) / (maxX - minX)) * innerW;
  const sy = (y) => pad.t + innerH - (y / maxY) * innerH;
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const tickCount = Math.max(2, Math.min(6, Math.floor(innerW / 110)));
  const ticksX =
    xFormatter && xs.length <= 10
      ? xs
      : Array.from({ length: tickCount }, (_, i) => minX + ((maxX - minX) * i) / (tickCount - 1));
  const colorOf = (i) => colors[i % colors.length];

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const x = minX + ((px - pad.l) / innerW) * (maxX - minX);
    let nearest = xs[0];
    xs.forEach((v) => {
      if (Math.abs(v - x) < Math.abs(nearest - x)) nearest = v;
    });
    setHover(nearest);
  };

  const hoverRows =
    hover !== null
      ? series
          .map((s, i) => ({ name: s.name, color: colorOf(i), point: s.points.find((p) => p.x === hover) }))
          .filter((r) => r.point)
      : [];

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width={w} height={height} role="img" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={sy(v)} y2={sy(v)} stroke={token.colorBorderSecondary} strokeWidth={1} />
            <text x={pad.l - 6} y={sy(v) + 4} fontSize={10} textAnchor="end" fill={token.colorTextTertiary}>
              {yFormatter(v)}
            </text>
          </g>
        ))}
        {ticksX.map((v, i) => (
          <text
            key={v}
            x={sx(v)}
            y={height - 8}
            fontSize={10}
            textAnchor={i === ticksX.length - 1 && ticksX.length > 1 ? 'end' : i === 0 ? 'start' : 'middle'}
            fill={token.colorTextTertiary}
          >
            {xFormatter ? xFormatter(v) : formatTick(v, spanMs)}
          </text>
        ))}
        {series.map((s, i) => (
          <path
            key={s.name}
            d={s.points.map((p, j) => `${j ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={colorOf(i)}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}
        {hover !== null ? (
          <g>
            <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={pad.t + innerH} stroke={token.colorTextQuaternary} strokeDasharray="3 3" />
            {hoverRows.map((r) => (
              <circle key={r.name} cx={sx(hover)} cy={sy(r.point.y)} r={4} fill={r.color} stroke={token.colorBgContainer} strokeWidth={2} />
            ))}
          </g>
        ) : null}
      </svg>
      {hover !== null && hoverRows.length ? (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: sx(hover) > w / 2 ? Math.max(0, sx(hover) - 200) : sx(hover) + 12,
            minWidth: 160,
            padding: '6px 10px',
            borderRadius: 6,
            background: token.colorBgElevated,
            boxShadow: token.boxShadowSecondary,
            fontSize: 12,
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <div style={{ color: token.colorTextSecondary, marginBottom: 4 }}>{tooltipXFormatter ? tooltipXFormatter(hover) : formatFullTime(hover)}</div>
          {hoverRows.map((r) => (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 6, color: token.colorText }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color }} />
              <span style={{ flex: 1 }}>{r.name || '-'}</span>
              <b>{yFormatter(r.point.y)}</b>
            </div>
          ))}
        </div>
      ) : null}
      {series.length > 1 ? <Legend items={series.map((s, i) => ({ name: s.name || '-', color: colorOf(i) }))} /> : null}
    </div>
  );
}

/** Vertical bar chart. data = [{ x: label, y }] */
export function BarChart({ data = [], height = 200, yFormatter = defaultFormat }) {
  const { token } = theme.useToken();
  const colors = useSeriesColors();
  const [ref, width] = useWidth();
  if (!data.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }
  const pad = { l: 56, r: 8, t: 10, b: 30 };
  const w = Math.max(width, 120);
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxY = niceMax(Math.max(0, ...data.map((d) => d.y || 0)));
  const band = innerW / data.length;
  const barW = Math.min(28, band * 0.6);
  const sy = (y) => pad.t + innerH - (y / maxY) * innerH;
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={w} height={height} role="img">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={w - pad.r} y1={sy(f * maxY)} y2={sy(f * maxY)} stroke={token.colorBorderSecondary} />
            <text x={pad.l - 6} y={sy(f * maxY) + 4} fontSize={10} textAnchor="end" fill={token.colorTextTertiary}>
              {yFormatter(f * maxY)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + band * i + (band - barW) / 2;
          const h = Math.max(1, sy(0) - sy(d.y || 0));
          return (
            <g key={`${d.x}-${i}`}>
              <Tooltip title={`${d.x}: ${yFormatter(d.y)}`}>
                <path
                  d={`M${x},${sy(0)} L${x},${sy(0) - h + 4} Q${x},${sy(0) - h} ${x + 4},${sy(0) - h} L${x + barW - 4},${sy(0) - h} Q${x + barW},${sy(0) - h} ${x + barW},${sy(0) - h + 4} L${x + barW},${sy(0)} Z`}
                  fill={colors[0]}
                />
              </Tooltip>
              <text x={x + barW / 2} y={height - 12} fontSize={10} textAnchor="middle" fill={token.colorTextTertiary}>
                {String(d.x).length > 16 ? `${String(d.x).slice(0, 15)}…` : d.x}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Donut with legend on the right (legacy CircleWithRightLegend). data = [{ type, value }] */
export function DonutChart({ data = [], height = 160, colorMap = {} }) {
  const { token } = theme.useToken();
  const colors = useSeriesColors();
  const total = data.reduce((a, b) => a + (Number(b.value) || 0), 0);
  const size = height;
  const r = size / 2 - 8;
  const inner = r * 0.72;
  const cx = size / 2;
  const cy = size / 2;
  let acc = 0;
  const arcs = data.map((d, i) => {
    const v = Number(d.value) || 0;
    const start = total ? (acc / total) * Math.PI * 2 : 0;
    acc += v;
    const end = total ? (acc / total) * Math.PI * 2 : 0;
    return { ...d, start, end, color: colorMap[d.type] || colors[i % colors.length] };
  });
  const arcPath = (s, e) => {
    if (e - s >= Math.PI * 2 - 1e-6) e = s + Math.PI * 2 - 1e-4;
    const p = (ang, rad) => [cx + rad * Math.sin(ang), cy - rad * Math.cos(ang)];
    const [x1, y1] = p(s, r);
    const [x2, y2] = p(e, r);
    const [x3, y3] = p(e, inner);
    const [x4, y4] = p(s, inner);
    const large = e - s > Math.PI ? 1 : 0;
    return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${inner},${inner} 0 ${large} 0 ${x4},${y4} Z`;
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg width={size} height={size} role="img">
        {total === 0 ? <circle cx={cx} cy={cy} r={(r + inner) / 2} fill="none" stroke={token.colorBorderSecondary} strokeWidth={r - inner} /> : null}
        {arcs
          .filter((a) => a.end > a.start)
          .map((a) => (
            <Tooltip key={a.type} title={`${a.type}: ${a.value}`}>
              <path d={arcPath(a.start, a.end)} fill={a.color} stroke={token.colorBgContainer} strokeWidth={2} />
            </Tooltip>
          ))}
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={Math.max(16, size / 6)} fontWeight={600} fill={token.colorText}>
          {Number(total.toFixed(2))}
        </text>
      </svg>
      <div style={{ fontSize: 13 }}>
        {arcs.map((a) => (
          <div key={a.type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: a.color }} />
            <span style={{ minWidth: 60 }}>{a.type}</span>
            <b>{a.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Monitor context, page layout & toolbar                              */
/* ------------------------------------------------------------------ */
export const MonitorContext = createContext({ range: getRange(0), interval: 10, node: undefined, refreshKey: 0 });

export const useMonitor = () => useContext(MonitorContext);

/**
 * Port of legacy PrometheusChart/component/BaseContent: refresh button, time range
 * (last hour/day/7 days/2 weeks/custom), interval select and node select.
 */
/** Legacy BaseContent time range controls: presets, custom range and interval */
export function RangeControls({ groupIndex, onGroupChange, range, onRangeChange, interval, onIntervalChange }) {
  const { t } = useTranslation();
  const intervals = getIntervals(range);
  return (
    <>
      <Radio.Group
        value={groupIndex}
        onChange={(e) => {
          onGroupChange(e.target.value);
          onRangeChange(getRange(e.target.value));
        }}
      >
        <Radio.Button value={0}>{t('Last Hour')}</Radio.Button>
        <Radio.Button value={1}>{t('Last Day')}</Radio.Button>
        <Radio.Button value={2}>{t('Last 7 Days')}</Radio.Button>
        <Radio.Button value={3}>{t('Last 2 Weeks')}</Radio.Button>
      </Radio.Group>
      <DatePicker.RangePicker
        showTime
        allowClear={false}
        value={[dayjs(range[0]), dayjs(range[1])]}
        disabledDate={(d) => d && d.isAfter(dayjs().endOf('day'))}
        onChange={(dates) => {
          if (!dates || !dates[0] || !dates[1]) return;
          onGroupChange(4);
          onRangeChange([dates[0].valueOf(), dates[1].valueOf()]);
        }}
      />
      <span>
        {t('Time Interval: ')}
        <Select
          value={interval}
          style={{ width: 110, marginLeft: 6 }}
          onChange={onIntervalChange}
          options={intervals.map((d) => ({ value: d.value, label: d.text }))}
        />
      </span>
    </>
  );
}

/**
 * Legacy ChartCard full screen modal: the chart gets its own range / interval selectors
 * (initialised from the page) so it can be explored without touching the page.
 */
function ChartModalContent({ ctx, chartProps }) {
  const { t } = useTranslation();
  const [groupIndex, setGroupIndex] = useState(ctx.groupIndex ?? 4);
  const [range, setRange] = useState(ctx.range);
  const [interval, setIntervalValue] = useState(ctx.interval);
  const [refreshKey, setRefreshKey] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setIntervalValue(getIntervals(range)[0].value);
  }, [range]);
  const value = useMemo(
    () => ({ ...ctx, range, interval, groupIndex, refreshKey: `${ctx.refreshKey}-${refreshKey}` }),
    [ctx, range, interval, groupIndex, refreshKey]
  );
  return (
    <MonitorContext.Provider value={value}>
      <Space wrap size={[12, 8]} style={{ marginBottom: 12 }} className="monitor-modal-range">
        <Tooltip title={t('Refresh')}>
          <Button
            icon={<SyncOutlined />}
            onClick={() => {
              if (groupIndex !== 4) setRange(getRange(groupIndex));
              setRefreshKey((k) => k + 1);
            }}
          />
        </Tooltip>
        <RangeControls
          groupIndex={groupIndex}
          onGroupChange={setGroupIndex}
          range={range}
          onRangeChange={setRange}
          interval={interval}
          onIntervalChange={setIntervalValue}
        />
      </Space>
      <ChartCard {...chartProps} height={420} isModal />
    </MonitorContext.Provider>
  );
}

export function MonitorPanel({ renderTimeRangeSelect = true, renderNodeSelect = true, fetchNodes, nodeKey = 'instance', children }) {
  const { t } = useTranslation();
  const [groupIndex, setGroupIndex] = useState(0);
  const [range, setRange] = useState(() => getRange(0));
  const intervals = getIntervals(range);
  const [interval, setIntervalValue] = useState(intervals[0].value);
  const [nodes, setNodes] = useState([]);
  const [node, setNode] = useState(undefined);
  const [loadingNodes, setLoadingNodes] = useState(Boolean(renderNodeSelect && fetchNodes));
  const [refreshKey, setRefreshKey] = useState(0);

  const loadNodes = async () => {
    if (!renderNodeSelect || !fetchNodes) return;
    setLoadingNodes(true);
    const list = await fetchNodes().catch(() => ['']);
    setNodes(list);
    setNode((prev) => (prev !== undefined && list.includes(prev) ? prev : list[0]));
    setLoadingNodes(false);
  };

  useEffect(() => {
    loadNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIntervalValue(getIntervals(range)[0].value);
  }, [range]);

  const refresh = async () => {
    if (groupIndex !== 4) setRange(getRange(groupIndex));
    await loadNodes();
    setRefreshKey((k) => k + 1);
  };

  const ctx = useMemo(
    () => ({ range, interval, node, nodeKey, refreshKey, groupIndex }),
    [range, interval, node, nodeKey, refreshKey, groupIndex]
  );

  return (
    <MonitorContext.Provider value={ctx}>
      <Card variant="borderless" style={{ borderRadius: 8, marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
        <Space wrap size={[12, 8]}>
          <Tooltip title={t('Refresh')}>
            <Button icon={<SyncOutlined />} onClick={refresh} />
          </Tooltip>
          {renderTimeRangeSelect ? (
            <>
              <RangeControls
                groupIndex={groupIndex}
                onGroupChange={setGroupIndex}
                range={range}
                onRangeChange={setRange}
                interval={interval}
                onIntervalChange={setIntervalValue}
              />
            </>
          ) : null}
          {renderNodeSelect && fetchNodes ? (
            loadingNodes ? (
              <Spin size="small" />
            ) : nodes.length && !(nodes.length === 1 && nodes[0] === '') ? (
              <span>
                {t('Node')}:
                <Select
                  value={node}
                  style={{ minWidth: 180, marginLeft: 6 }}
                  onChange={setNode}
                  options={nodes.map((n) => ({ value: n, label: n }))}
                />
              </span>
            ) : null
          ) : null}
        </Space>
      </Card>
      {renderNodeSelect && fetchNodes && loadingNodes ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : (
        children
      )}
    </MonitorContext.Provider>
  );
}

export function MonitorPage({ title, description, breadcrumb, children, extra }) {
  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb items={(breadcrumb || [title]).map((c) => ({ title: c }))} style={{ marginBottom: 16, fontSize: 13 }} />
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            {title}
          </h1>
          {description ? <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>{description}</p> : null}
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

/** Builds the params of a query with the selected node (legacy Charts: hostname / instance) */
const nodeParams = (ctx, params = {}) => {
  const p = { ...params };
  if (ctx.node) p[ctx.nodeKey || 'instance'] = ctx.node;
  return p;
};

/** Generic data hook for a metric card */
export function useMetric({ metricKey, requestType = 'current', params, format, deps = [] }) {
  const ctx = useMonitor();
  const [state, setState] = useState({ loading: true, data: undefined });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fetchMetric(metricKey, { requestType, params: nodeParams(ctx, params), range: ctx.range, interval: ctx.interval })
      .then((responses) => {
        let data;
        try {
          data = format ? format(responses) : handleResponses(responses);
        } catch {
          data = undefined;
        }
        if (alive) setState({ loading: false, data });
      })
      .catch(() => alive && setState({ loading: false, data: undefined }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricKey, requestType, ctx.range, ctx.interval, ctx.node, ctx.refreshKey, ...deps]);
  return state;
}

export const BigNumber = ({ children, color, height = 100 }) => (
  <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 600, color }}>
    {children}
  </div>
);

/** Legacy BaseCard ("top card"): current value(s) rendered by `render(data)` */
export function StatCard({ title, metricKey, requestType = 'current', params, format, render, height = 100, extra }) {
  const { data, loading } = useMetric({ metricKey, requestType, params, format });
  const safe = data ?? [];
  return (
    <Card
      title={title}
      size="small"
      variant="borderless"
      style={{ borderRadius: 8, height: '100%' }}
      extra={typeof extra === 'function' ? extra(safe) : extra}
      styles={{ body: { minHeight: height + 24 } }}
      loading={loading}
    >
      {render ? render(safe) : <BigNumber height={height}>{Array.isArray(safe) ? safe[0]?.y ?? 0 : 0}</BigNumber>}
    </Card>
  );
}

/** Legacy ChartCard: range query rendered as a line chart, with device select and full screen view */
export function ChartCard({
  title,
  metricKey,
  typeKey,
  deviceKey,
  modifyKeys,
  yFormatter,
  height = 260,
  params,
  isModal = false,
}) {
  const { t } = useTranslation();
  const ctx = useMonitor();
  const { data, loading } = useMetric({
    metricKey,
    requestType: 'range',
    params,
    format: (responses) => handleResponses(responses, typeKey, deviceKey, modifyKeys),
  });
  const list = Array.isArray(data) ? data : [];
  const devices = deviceKey ? devicesOf(list) : [];
  const [device, setDevice] = useState(undefined);
  const current = devices.includes(device) ? device : devices[0];
  const shown = devices.length ? list.filter((d) => d.device === current) : list;
  const spanMs = ctx.range[1] - ctx.range[0];

  const openModal = () =>
    Modal.info({
      icon: null,
      width: 1200,
      okText: t('OK'),
      content: (
        <ChartModalContent
          ctx={ctx}
          chartProps={{ title, metricKey, typeKey, deviceKey, modifyKeys, yFormatter, params }}
        />
      ),
    });

  return (
    <Card
      title={title}
      size="small"
      variant="borderless"
      style={{ borderRadius: 8, height: '100%' }}
      loading={loading}
      extra={
        <Space size={4}>
          {devices.length ? (
            <Select size="small" value={current} style={{ width: 150 }} onChange={setDevice} options={devices.map((d) => ({ value: d, label: d }))} />
          ) : null}
          {!isModal ? (
            <Tooltip title={t('Full Screen')}>
              <Button type="text" size="small" icon={<ExpandAltOutlined />} onClick={openModal} />
            </Tooltip>
          ) : null}
        </Space>
      }
    >
      <LineChart data={shown} height={height} yFormatter={yFormatter} spanMs={spanMs} />
    </Card>
  );
}
