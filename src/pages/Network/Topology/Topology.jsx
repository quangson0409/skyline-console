/**
 * Network topology - port of legacy pages/network/containers/Topology (antv G6) built with
 * plain SVG + absolutely positioned antd nodes (no extra dependency).
 *
 * Layout (same as legacy): cloud -> external network bar(s) -> router row -> one block per
 * internal network (subnet bars) with the instances attached below it. Every router and
 * instance gets its own column so connection lines never overlap.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Breadcrumb, Button, Card, Checkbox, Descriptions, Empty, Popover, Space, Spin, Tooltip, message } from 'antd';
import {
  ApartmentOutlined,
  CloudOutlined,
  DesktopOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { neutronApi } from '@/api/neutron';
import { novaApi } from '@/api/nova';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore, THEMES } from '@/store/themeStore';
import useActionRunner from '@/components/Action/useActionRunner';
import Status from '@/components/Status';
import { t } from '@/core/i18n';
import { createRouterAction, routerStatus } from '../Router/actions';
import { combosBackground, combosColors, subnetsColors } from './topologyColor';

const successColor = '#52c41a';
export const activeShadowColor = 'rgba(87,227,155,0.61)';
export const errorShadowColor = 'rgba(237,33,48,0.6)';
export const errorStrokeColor = '#DB3A3A';

/* ---------------- helpers ---------------- */
const isExternalNetwork = (n) => !!n?.['router:external'];

const ipToBigInt = (ip) => {
  const s = String(ip || '').trim();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) {
    return s.split('.').reduce((acc, p) => acc * 256n + BigInt(Number(p)), 0n);
  }
  if (!s.includes(':')) return null;
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const tl = tail !== undefined && tail ? tail.split(':') : [];
  const fill = tail !== undefined ? Array(8 - h.length - tl.length).fill('0') : [];
  const parts = [...h, ...fill, ...tl];
  if (parts.length !== 8) return null;
  try {
    return parts.reduce((acc, p) => acc * 65536n + BigInt(parseInt(p || '0', 16)), 0n);
  } catch {
    return null;
  }
};

const isIpInRange = (ip, start, end) => {
  const v = ipToBigInt(ip);
  const a = ipToBigInt(start);
  const b = ipToBigInt(end);
  if (v === null || a === null || b === null) return false;
  return v >= a && v <= b;
};

const inPools = (ip, pools) => (pools || []).some((p) => isIpInRange(ip, p.start, p.end));

/** nova server -> legacy skyline extension shape */
const normalizeServer = (s) => {
  if (Array.isArray(s.fixed_addresses)) return s;
  const fixed = [];
  const floating = [];
  Object.values(s.addresses || {}).forEach((list) =>
    (list || []).forEach((a) => {
      if (a['OS-EXT-IPS:type'] === 'floating') floating.push(a.addr);
      else fixed.push(a.addr);
    })
  );
  return {
    ...s,
    fixed_addresses: fixed,
    floating_addresses: floating,
    vm_state: s.vm_state || s['OS-EXT-STS:vm_state'] || String(s.status || '').toLowerCase(),
    image_name: s.image_name || s.image?.name || '',
  };
};

const fetchTopology = async (projectId) => {
  const safe = (p) => p.catch(() => ({}));
  const params = { project_id: projectId };
  const [netRes, subnetRes, routerRes, portRes] = await Promise.all([
    safe(neutronApi.listNetworks()),
    safe(neutronApi.listSubnets()),
    safe(neutronApi.listRouters(params)),
    safe(neutronApi.listPorts(params)),
  ]);
  let servers = [];
  try {
    servers = (await neutronApi.skylineExtension('servers'))?.servers;
    if (!Array.isArray(servers)) throw new Error('no servers');
  } catch {
    servers = (await safe(novaApi.listServers()))?.servers || [];
  }
  const networks = (netRes?.networks || []).filter(
    (n) => isExternalNetwork(n) || n.shared || n.project_id === projectId || n.tenant_id === projectId
  );
  return {
    networks,
    subnets: subnetRes?.subnets || [],
    routers: routerRes?.routers || [],
    ports: portRes?.ports || [],
    servers: (servers || []).map(normalizeServer),
  };
};

/* ---------------- layout ---------------- */
const PAD = 24;
const COL = 128;
const NODE_W = 96;
const NODE_H = 64;
const BAR_H = 22;
const BAR_GAP = 10;

const buildLayout = (data, showInstances, containerWidth) => {
  const { networks = [], subnets = [], routers = [], ports = [], servers = [] } = data || {};
  const subnetMap = Object.fromEntries(subnets.map((s) => [s.id, s]));
  const extNetworks = networks.filter(isExternalNetwork);
  const bars = []; // { id, kind: 'ext'|'subnet', label, y, color, textColor }
  const barById = {};
  const addBar = (bar) => {
    bars.push(bar);
    barById[bar.id] = bar;
  };

  // external network bars
  let y = 80;
  const extColor = subnetsColors[0][0];
  const extList = extNetworks.length ? extNetworks : [{ id: 'extNet', name: 'extNetwork' }];
  routers.forEach((r) => {
    const nid = r?.external_gateway_info?.network_id;
    if (nid && !extList.some((n) => n.id === nid)) extList.push({ id: nid, name: nid });
  });
  extList.forEach((n) => {
    addBar({ id: `ext-${n.id}`, kind: 'ext', networkId: n.id, label: n.name || n.id, y, color: extColor, network: n });
    y += BAR_H + BAR_GAP;
  });
  const extBottom = y - BAR_GAP;
  const extSubnetToBar = {};
  extList.forEach((n) =>
    (n.subnets || []).forEach((sid) => {
      extSubnetToBar[sid] = `ext-${n.id}`;
    })
  );
  const defaultExtBar = `ext-${extList[0].id}`;

  // router connections
  const routerNodes = routers.map((r) => {
    const targets = [];
    const nid = r?.external_gateway_info?.network_id;
    if (r?.external_gateway_info) targets.push(nid ? `ext-${nid}` : defaultExtBar);
    const routerSubnets = [];
    ports
      .filter((p) => p.device_id === r.id)
      .forEach((p) => {
        const sid = p.fixed_ips?.[0]?.subnet_id;
        if (sid && !routerSubnets.includes(sid)) routerSubnets.push(sid);
      });
    return { kind: 'router', id: r.id, data: { ...r, subnets: routerSubnets }, subnetTargets: routerSubnets, targets };
  });

  // instance connections
  const internalNetworks = networks.filter((n) => !isExternalNetwork(n));
  const instanceNodes = showInstances
    ? servers.map((s) => {
        const targets = [];
        const add = (id) => id && !targets.includes(id) && targets.push(id);
        const serverPorts = ports.filter((p) => p.device_id === s.id && p.fixed_ips?.[0]);
        serverPorts.forEach((p) => (p.fixed_ips || []).forEach((ip) => add(extSubnetToBar[ip.subnet_id] || ip.subnet_id)));
        const fixedNetworks = serverPorts.map((p) => p.network_id);
        // legacy: match the instance addresses with the allocation pools
        (s.fixed_addresses || []).forEach((addr) => {
          let target = null;
          extList.forEach((n) =>
            (n.subnets || []).forEach((sid) => {
              if (inPools(addr, subnetMap[sid]?.allocation_pools)) target = `ext-${n.id}`;
            })
          );
          internalNetworks.forEach((n) => {
            if (fixedNetworks.length && !fixedNetworks.includes(n.id)) return;
            (n.subnets || []).forEach((sid) => {
              if (inPools(addr, subnetMap[sid]?.allocation_pools)) target = sid;
            });
          });
          add(target);
        });
        return { kind: 'ins', id: s.id, data: s, targets };
      })
    : [];

  // router row
  const routerRowY = extBottom + 56;
  let col = 0;
  const nodes = [];
  routerNodes.forEach((n) => {
    nodes.push({ ...n, col: col++, y: routerRowY });
  });
  // instances connected only to external networks are placed in the router row (legacy: first row)
  const placed = new Set();
  instanceNodes.forEach((n) => {
    const hasInternal = n.targets.some((tg) => !String(tg).startsWith('ext-'));
    if (!hasInternal && n.targets.length) {
      nodes.push({ ...n, col: col++, y: routerRowY });
      placed.add(n.id);
    }
  });

  // network blocks
  let cur = routerRowY + NODE_H + 56;
  const combos = [];
  internalNetworks.forEach((network) => {
    const networkSubnets = (network.subnets || []).map((sid) => subnetMap[sid]).filter(Boolean);
    if (!networkSubnets.length) return;
    const top = cur;
    let by = top + 28;
    networkSubnets.forEach((subnet, index) => {
      const colors = subnetsColors[0];
      const color = colors[index % colors.length];
      addBar({
        id: subnet.id,
        kind: 'subnet',
        label: `${subnet.name || subnet.id}${subnet.cidr ? ` (${subnet.cidr})` : ''}`,
        y: by,
        color,
        textColor: index % colors.length === 0 ? '#0f172a' : '#ffffff',
        subnet,
        network,
      });
      by += BAR_H + BAR_GAP;
    });
    const bottom = by - BAR_GAP + 10;
    combos.push({ id: network.id, network, top, bottom });
    cur = bottom + 44;
    // instances whose first internal connection is in this network
    const subnetIds = networkSubnets.map((s) => s.id);
    const rowItems = instanceNodes.filter(
      (n) => !placed.has(n.id) && subnetIds.includes(n.targets.find((tg) => !String(tg).startsWith('ext-')))
    );
    if (rowItems.length) {
      rowItems.forEach((n) => {
        nodes.push({ ...n, col: col++, y: cur });
        placed.add(n.id);
      });
      cur += NODE_H + 48;
    }
  });
  // remaining instances (no resolvable connection) in a final row
  const rest = instanceNodes.filter((n) => !placed.has(n.id));
  if (rest.length) {
    rest.forEach((n) => nodes.push({ ...n, col: col++, y: cur }));
    cur += NODE_H + 40;
  }

  // router targets limited to the subnet bars that are drawn
  nodes.forEach((n) => {
    if (n.kind === 'router') {
      n.targets = [...n.targets, ...n.subnetTargets.filter((sid) => barById[sid] && barById[sid].kind === 'subnet')];
    }
    n.targets = n.targets.filter((tg) => barById[tg]);
  });

  const width = Math.max(containerWidth || 0, PAD * 2 + Math.max(col, 1) * COL);
  nodes.forEach((n) => {
    n.x = PAD + n.col * COL + COL / 2;
  });

  // edges: one vertical line per connection, spread across the node width
  const edges = [];
  nodes.forEach((n) => {
    const up = n.targets.filter((tg) => barById[tg].y < n.y);
    const down = n.targets.filter((tg) => barById[tg].y >= n.y);
    const spread = (list, isUp) =>
      list.forEach((tg, i) => {
        const bar = barById[tg];
        const offset = list.length > 1 ? (i - (list.length - 1) / 2) * Math.min(14, (NODE_W - 20) / list.length) : 0;
        edges.push({
          id: `${n.id}-${tg}`,
          nodeId: n.id,
          x: n.x + offset,
          y1: isUp ? n.y : n.y + NODE_H,
          y2: isUp ? bar.y + BAR_H : bar.y,
          color: bar.color,
        });
      });
    spread(up, true);
    spread(down, false);
  });

  return { bars, combos, nodes, edges, width, height: Math.max(cur, routerRowY + NODE_H + 40) };
};

/* ---------------- node cards (legacy NodeCard / InstanceCard) ---------------- */
const RouterCardContent = ({ router, subnets }) => {
  const subnetsNoHa = subnets.filter((it) => String(it.name || '').indexOf('HA subnet tenant') === -1);
  const conn = subnetsNoHa.filter((it) => (router.subnets || []).includes(it.id));
  const ext = router.external_gateway_info?.external_fixed_ips || [];
  return (
    <Descriptions column={1} size="small" style={{ width: 400 }}>
      <Descriptions.Item label={t('Name')}>
        {router.name ? <Link to={`/network/router/detail/${router.id}`}>{router.name}</Link> : '-'}
      </Descriptions.Item>
      <Descriptions.Item label={t('UUID')}>{router.id}</Descriptions.Item>
      <Descriptions.Item label={t('Status')}>{routerStatus()[router.status] || router.status || '-'}</Descriptions.Item>
      <Descriptions.Item label={t('External IP')}>
        {ext.length ? ext.map((it) => <div key={it.ip_address}>{it.ip_address}</div>) : '-'}
      </Descriptions.Item>
      <Descriptions.Item label={t('Subnet')}>
        {conn.length
          ? conn.map((it) => (
              <div key={it.id}>
                {it.name} ({it.cidr})
              </div>
            ))
          : '-'}
      </Descriptions.Item>
    </Descriptions>
  );
};

const InstanceCardContent = ({ server }) => {
  const list = (v) => ((v || []).length ? v.map((it) => <div key={it}>{it}</div>) : '-');
  return (
    <Descriptions column={1} size="small" style={{ width: 400 }}>
      <Descriptions.Item label={t('Name')}>
        {server.name ? <Link to={`/compute/instance/detail/${server.id}`}>{server.name}</Link> : '-'}
      </Descriptions.Item>
      <Descriptions.Item label={t('UUID')}>{server.id}</Descriptions.Item>
      <Descriptions.Item label={t('Status')}>{server.status ? <Status status={String(server.status)} /> : '-'}</Descriptions.Item>
      <Descriptions.Item label={t('Image')}>
        {server.image_os_distro || server.image_name ? (
          <span>
            {server.image_os_distro ? <b style={{ marginRight: 6 }}>{server.image_os_distro}</b> : null}
            {server.image_name}
          </span>
        ) : (
          '-'
        )}
      </Descriptions.Item>
      <Descriptions.Item label={t('Instance IP')}>{list(server.fixed_addresses)}</Descriptions.Item>
      <Descriptions.Item label={t('Floating IP')}>{list(server.floating_addresses)}</Descriptions.Item>
    </Descriptions>
  );
};

const markerId = (color) => `topo-arrow-${String(color).replace(/[^a-zA-Z0-9]/g, '')}`;

/* ---------------- page ---------------- */
export default function Topology() {
  const navigate = useNavigate();
  const projectId = useAuthStore((s) => s.currentProject?.id);
  const { currentTheme } = useThemeStore();
  const isDark = currentTheme === THEMES.DARK_OPS;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchTopology(projectId));
    } catch (e) {
      message.error(e?.message || t('Operation failed'));
      setData({});
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { handleAction, actionModal } = useActionRunner({ onRefresh: load });

  const layout = useMemo(() => buildLayout(data || {}, showAll, containerWidth), [data, showAll, containerWidth]);
  const nodeById = useMemo(() => Object.fromEntries(layout.nodes.map((n) => [n.id, n])), [layout]);

  const nodeOk = (n) => (n.kind === 'router' ? n.data.status === 'ACTIVE' : n.data.vm_state === 'active');
  const textColor = isDark ? '#e2e8f0' : '#0f172a';
  const nodeBg = isDark ? '#1e293b' : '#ffffff';
  const markerColors = [...new Set([...subnetsColors[0], successColor, errorStrokeColor, '#C8DEFF'])];
  const barX = PAD / 2;
  const barW = layout.width - PAD;
  const isEmpty = !loading && !(data?.networks || []).length && !(data?.routers || []).length;

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb items={[{ title: t('Network') }, { title: t('Network Topology') }]} style={{ marginBottom: 16, fontSize: 13 }} />
      <div style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {t('Network Topology')}
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
          {t('External networks, routers, internal networks and instances of the current project.')}
        </p>
      </div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAction(createRouterAction(), undefined)}>
          {t('Create Router')}
        </Button>
        <Button icon={<PlusOutlined />} onClick={() => navigate('/network/networks')}>
          {t('Create Network')}
        </Button>
        <Button icon={<PlusOutlined />} onClick={() => navigate('/compute/instance')}>
          {t('Create Instance')}
        </Button>
        <Tooltip title={t('Refresh')}>
          <Button shape="circle" icon={<ReloadOutlined />} onClick={load} loading={loading} />
        </Tooltip>
        <Checkbox checked={showAll} onChange={() => setShowAll((v) => !v)}>
          {t('Show Instances')}
        </Checkbox>
      </Space>
      <Spin spinning={loading}>
        <Card variant="borderless" style={{ borderRadius: 8 }} styles={{ body: { padding: 16 } }}>
          <div ref={containerRef} style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
            {isEmpty ? (
              <Empty description={t('No Data')} />
            ) : (
              <div style={{ position: 'relative', width: layout.width, height: layout.height }}>
                <svg width={layout.width} height={layout.height} style={{ position: 'absolute', left: 0, top: 0 }}>
                  <defs>
                    {markerColors.map((c) => (
                      <marker
                        key={c}
                        id={markerId(c)}
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 0 L 10 5 L 0 10" fill="none" stroke={c} strokeWidth="2" />
                      </marker>
                    ))}
                  </defs>
                  {/* cloud -> first external bar */}
                  <line
                    x1={layout.width / 2}
                    y1={56}
                    x2={layout.width / 2}
                    y2={80}
                    stroke={subnetsColors[0][0]}
                    strokeWidth={1.5}
                    markerStart={`url(#${markerId(subnetsColors[0][0])})`}
                  />
                  {layout.combos.map((c) => (
                    <g key={c.id}>
                      <rect
                        x={barX - 4}
                        y={c.top}
                        width={barW + 8}
                        height={c.bottom - c.top}
                        rx={4}
                        fill={combosBackground[0]}
                        stroke={combosColors[0]}
                      />
                      <text x={barX + 6} y={c.top + 17} fontSize={12} fontWeight={600} fill={textColor}>
                        {c.network.name || c.network.id}
                      </text>
                    </g>
                  ))}
                  {layout.bars.map((b) => (
                    <g key={b.id}>
                      <rect
                        x={barX}
                        y={b.y}
                        width={barW}
                        height={BAR_H}
                        rx={4}
                        fill={b.kind === 'ext' ? nodeBg : b.color}
                        stroke={b.color}
                        strokeWidth={b.kind === 'ext' ? 1.5 : 1}
                      />
                      <text x={barX + 8} y={b.y + 15} fontSize={12} fill={b.kind === 'ext' ? textColor : b.textColor}>
                        {b.label}
                      </text>
                    </g>
                  ))}
                  {layout.edges.map((e) => {
                    const active = hovered === e.nodeId;
                    const node = nodeById[e.nodeId];
                    const color = active && node ? (nodeOk(node) ? successColor : errorStrokeColor) : e.color || '#C8DEFF';
                    return (
                      <g key={e.id}>
                      <line
                        x1={e.x}
                        y1={e.y1}
                        x2={e.x}
                        y2={e.y2}
                        stroke={color}
                        strokeWidth={active ? 3 : 2}
                        markerStart={`url(#${markerId(color)})`}
                        markerEnd={`url(#${markerId(color)})`}
                      />
                      <circle cx={e.x} cy={e.y2} r={active ? 4 : 3} fill={color} stroke="#ffffff" strokeWidth={1} />
                      </g>
                    );
                  })}
                </svg>
                {/* cloud */}
                <div
                  style={{
                    position: 'absolute',
                    left: layout.width / 2 - 24,
                    top: 8,
                    width: 48,
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 40,
                    color: '#4C95FF',
                  }}
                >
                  <CloudOutlined />
                </div>
                {layout.nodes.map((n) => {
                  const ok = nodeOk(n);
                  const isRouter = n.kind === 'router';
                  return (
                    <Popover
                      key={`${n.kind}-${n.id}`}
                      placement="rightTop"
                      title={`${isRouter ? t('Router') : t('Instance')}: ${n.data.name || n.id}`}
                      content={
                        isRouter ? (
                          <RouterCardContent router={n.data} subnets={data?.subnets || []} />
                        ) : (
                          <InstanceCardContent server={n.data} />
                        )
                      }
                    >
                      <div
                        onMouseEnter={() => setHovered(n.id)}
                        onMouseLeave={() => setHovered((h) => (h === n.id ? null : h))}
                        style={{
                          position: 'absolute',
                          left: n.x - NODE_W / 2,
                          top: n.y,
                          width: NODE_W,
                          height: NODE_H,
                          background: nodeBg,
                          border: `${hovered === n.id ? 3 : 1.5}px solid ${ok ? successColor : errorStrokeColor}`,
                          boxShadow: `0 0 ${ok ? 5 : 4}px ${ok ? activeShadowColor : errorShadowColor}`,
                          borderRadius: 4,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: '4px 6px',
                          color: textColor,
                        }}
                      >
                        <span style={{ fontSize: 22, color: isRouter ? '#0068FF' : '#46B1A5', lineHeight: 1 }}>
                          {isRouter ? <ApartmentOutlined /> : <DesktopOutlined />}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            marginTop: 4,
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {n.data.name || String(n.id).slice(0, 8)}
                        </span>
                      </div>
                    </Popover>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </Spin>
      {actionModal}
    </div>
  );
}
