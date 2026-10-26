/**
 * Network Topology — v4 Vertical Top-to-Bottom Enterprise Light Edition
 *
 * Key capabilities (following senior-frontend best practices):
 *   1. Vertical Top-to-Bottom Hierarchy (v4 Sangfor HCI style):
 *      [Tier 1: External WAN Banner]
 *                 ↓
 *      [Tier 2: Virtual Routers (3D Isometric Cylindrical Appliance Cards)]
 *                 ↓
 *      [Tier 3: VPC Zones -> vSwitch Subnet Faceplates (with RJ45 Port Bay)]
 *                 ↓
 *      [Tier 4: Compute VM Cards (with vertical/orthogonal patch cables & IP pills)]
 *
 *   2. Full Interactive Drag-and-Drop:
 *      - Every item (WAN, vRouter, VPC, vSwitch Subnet, VM Card) can be dragged freely.
 *      - All SVG cables, rounded orthogonal elbows, and IP pills follow dragged items in real time.
 *      - Empty canvas drag-to-pan + Zoom controls + "Reset Layout" button.
 *
 *   3. Accurate 3-State OpenStack Status Semantics:
 *      - ACTIVE / RUNNING -> Emerald (#10B981)
 *      - SHUTOFF / STOPPED / PAUSED / SUSPENDED -> Slate Neutral (#64748B, never mislabeled as Error)
 *      - ERROR / FAULT -> Crimson Red (#EF4444)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Breadcrumb,
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Input,
  Modal,
  Pagination,
  Popover,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  ApiOutlined,
  CompressOutlined,
  DesktopOutlined,
  DownOutlined,
  DragOutlined,
  ExpandOutlined,
  GlobalOutlined,
  LinkOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ReloadOutlined,
  RetweetOutlined,
  SearchOutlined,
  WarningFilled,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { neutronApi } from '@/api/neutron';
import { novaApi } from '@/api/nova';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore, THEMES } from '@/store/themeStore';
import useActionRunner from '@/components/Action/useActionRunner';
import Status from '@/components/Status';
import { t } from '@/core/i18n';
import {
  createRouterAction,
  connectSubnetAction,
  disconnectSubnetAction,
  setGatewayAction,
  routerStatus,
} from '../Router/actions';
import { checkActionPolicy, usePolicyStore } from '@/core/policy';
import { createNetworkAction } from '@/pages/Networks/NetworkParts/actions';

export const activeShadowColor = 'rgba(0, 104, 255, 0.18)';
export const errorShadowColor = 'rgba(239, 68, 68, 0.24)';
export const errorStrokeColor = '#EF4444';

/* ---------------- IP & Status Classification Helpers ---------------- */
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

const shortIp = (ip) => {
  if (!ip) return '';
  const s = String(ip).trim();
  const parts = s.split('.');
  if (parts.length === 4) return `.${parts[2]}.${parts[3]}`;
  return s.length > 12 ? `…${s.slice(-10)}` : s;
};

/**
 * Classifies an instance into 'active' | 'shutoff' | 'error'
 * Ensures SHUTOFF / STOPPED / PAUSED / SUSPENDED are never misclassified as ERROR.
 */
const classifyServerState = (s) => {
  const rawStatus = String(s?.status || '').toUpperCase();
  const rawVmState = String(s?.vm_state || s?.['OS-EXT-STS:vm_state'] || '').toLowerCase();

  if (
    rawStatus === 'ERROR' ||
    rawStatus === 'FAULT' ||
    rawVmState === 'error' ||
    rawVmState === 'crashed'
  ) {
    return 'error';
  }
  if (
    rawStatus === 'ACTIVE' ||
    rawStatus === 'RUNNING' ||
    rawStatus === 'BUILD' ||
    rawStatus === 'REBUILD' ||
    rawStatus === 'MIGRATING' ||
    rawStatus === 'RESIZE' ||
    rawVmState === 'active' ||
    rawVmState === 'building'
  ) {
    return 'active';
  }
  // SHUTOFF, STOPPED, PAUSED, SUSPENDED, SHELVED, SOFT_DELETED, etc.
  return 'shutoff';
};

const classifyRouterState = (r) => {
  const st = String(r?.status || '').toUpperCase();
  if (st === 'ERROR') return 'error';
  if (st === 'ACTIVE' || st === 'BUILD') return 'active';
  return 'shutoff';
};

/** nova server -> legacy skyline extension shape */
const normalizeServer = (s) => {
  if (Array.isArray(s.fixed_addresses)) {
    return {
      ...s,
      vm_state: s.vm_state || s['OS-EXT-STS:vm_state'] || String(s.status || '').toLowerCase(),
      image_name: s.image_name || s.image?.name || '',
    };
  }
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

  // Router interface and gateway ports often have empty or system project_id, so query by device_id to ensure completeness
  const routers = routerRes?.routers || [];
  let allPorts = portRes?.ports || [];
  const existingPortIds = new Set(allPorts.map((p) => p.id));
  try {
    const routerPortsList = await Promise.all(
      routers.map((r) => safe(neutronApi.listPorts({ device_id: r.id })))
    );
    routerPortsList.forEach((res) => {
      (res?.ports || []).forEach((p) => {
        if (!existingPortIds.has(p.id)) {
          existingPortIds.add(p.id);
          allPorts.push(p);
        }
      });
    });
  } catch {
    // fallback to portRes
  }

  return {
    networks,
    subnets: subnetRes?.subnets || [],
    routers,
    ports: allPorts,
    servers: (servers || []).map(normalizeServer),
  };
};

/* ---------------- Relational Model Builder ---------------- */
const DEFAULT_VMS_PER_SUBNET = 6;
const VM_COLS_PER_ROW = 2;

function buildVerticalTopologyModel(
  data,
  { showInstances, searchQuery, focusRouterId, alertsOnly, sdnLinks = [] }
) {
  const { networks = [], subnets = [], routers = [], ports = [], servers = [] } = data || {};
  const q = String(searchQuery || '').trim().toLowerCase();
  const matchesQuery = (arr) =>
    Boolean(q && arr.some((item) => item && String(item).toLowerCase().includes(q)));

  const subnetMap = Object.fromEntries(subnets.map((s) => [s.id, s]));
  const extNetworksRaw = networks.filter(isExternalNetwork);
  const extNetworks = extNetworksRaw.length
    ? extNetworksRaw.map((n) => ({
        ...n,
        subnetObjs: (n.subnets || []).map((sid) => subnetMap[sid]).filter(Boolean),
      }))
    : [
        {
          id: 'ext-default',
          name: t('External Network'),
          'router:external': true,
          subnetObjs: [],
        },
      ];

  routers.forEach((r) => {
    const nid = r?.external_gateway_info?.network_id;
    if (nid && !extNetworks.some((en) => en.id === nid)) {
      extNetworks.push({
        id: nid,
        name: r.external_gateway_info?.network_name || nid.slice(0, 12),
        'router:external': true,
        subnetObjs: [],
      });
    }
  });

  // Map router -> connected subnet IDs and gateway IPs (including interactive SDN links)
  const routerGatewayIpBySubnet = {};
  const routerNodes = routers.map((r) => {
    const sdnWanLink = sdnLinks.find((l) => l.kind === 'wan-router' && l.routerId === r.id);
    const extNetId =
      sdnWanLink?.wanId ||
      r?.external_gateway_info?.network_id ||
      (r?.external_gateway_info ? extNetworks[0]?.id : null);
    const extFixedIps = (r?.external_gateway_info?.external_fixed_ips || [])
      .map((ip) => ip.ip_address)
      .filter(Boolean);
    const routerPorts = ports.filter((p) => p.device_id === r.id);
    const connectedSubnetIds = [];
    routerPorts.forEach((p) => {
      (p.fixed_ips || []).forEach((fip) => {
        if (fip.subnet_id && !connectedSubnetIds.includes(fip.subnet_id)) {
          connectedSubnetIds.push(fip.subnet_id);
          if (fip.ip_address) {
            routerGatewayIpBySubnet[`${r.id}:${fip.subnet_id}`] = fip.ip_address;
          }
        }
      });
    });

    sdnLinks
      .filter((l) => l.kind === 'router-subnet' && l.routerId === r.id)
      .forEach((l) => {
        if (l.subnetId && !connectedSubnetIds.includes(l.subnetId)) {
          connectedSubnetIds.push(l.subnetId);
        }
      });

    const stateCategory = classifyRouterState(r);
    return {
      id: r.id,
      name: r.name || r.id.slice(0, 10),
      status: r.status || 'ACTIVE',
      stateCategory,
      healthy: stateCategory === 'active',
      isError: stateCategory === 'error',
      extNetId,
      extFixedIps,
      snatEnabled: r?.external_gateway_info?.enable_snat !== false,
      connectedSubnetIds,
      raw: { ...r, subnets: connectedSubnetIds },
    };
  });

  // Map servers -> attached subnets and IP addresses
  const internalNetworks = networks.filter((n) => !isExternalNetwork(n));
  const extSubnetIds = new Set();
  extNetworks.forEach((en) => (en.subnets || []).forEach((sid) => extSubnetIds.add(sid)));

  const serverItems = showInstances
    ? servers.map((s) => {
        const subnetIps = {};
        const addSubIp = (sid, ipAddr) => {
          if (!sid) return;
          if (!subnetIps[sid]) subnetIps[sid] = [];
          if (ipAddr && !subnetIps[sid].includes(ipAddr)) subnetIps[sid].push(ipAddr);
        };

        const sPorts = ports.filter((p) => p.device_id === s.id && p.fixed_ips?.length);
        sPorts.forEach((p) => {
          (p.fixed_ips || []).forEach((fip) => {
            if (!extSubnetIds.has(fip.subnet_id)) {
              addSubIp(fip.subnet_id, fip.ip_address);
            }
          });
        });

        const fixedNetIds = sPorts.map((p) => p.network_id);
        (s.fixed_addresses || []).forEach((addr) => {
          internalNetworks.forEach((n) => {
            if (fixedNetIds.length && !fixedNetIds.includes(n.id)) return;
            (n.subnets || []).forEach((sid) => {
              if (inPools(addr, subnetMap[sid]?.allocation_pools)) {
                addSubIp(sid, addr);
              }
            });
          });
        });

        // Merge SDN connections drawn on topology canvas
        const vmSdnLinks = sdnLinks.filter((l) => l.kind === 'vm-subnet' && l.vmId === s.id);
        vmSdnLinks.forEach((l) => {
          addSubIp(l.subnetId, l.ipAddress || 'DHCP (SDN)');
        });

        const attachedSubnetIds = Object.keys(subnetIps);
        const stateCategory = classifyServerState(s);
        const displayStatus = String(
          s.status || s.vm_state || (stateCategory === 'shutoff' ? 'SHUTOFF' : 'ACTIVE')
        ).toUpperCase();

        const realNicCount = Math.max(
          attachedSubnetIds.length,
          sPorts.length,
          (s.fixed_addresses || []).length
        );

        return {
          id: s.id,
          name: s.name || s.id.slice(0, 10),
          status: displayStatus,
          stateCategory, // 'active' | 'shutoff' | 'error'
          healthy: stateCategory === 'active',
          isShutoff: stateCategory === 'shutoff',
          isError: stateCategory === 'error',
          fixedAddresses: s.fixed_addresses || [],
          floatingAddresses: s.floating_addresses || [],
          subnetIps,
          attachedSubnetIds,
          hasNic: realNicCount > 0,
          nicCount: realNicCount,
          hasSdnOverlayLink: vmSdnLinks.length > 0,
          raw: s,
        };
      })
    : [];

  // Build VPC containers -> Subnets -> VMs
  const vpcGroups = [];
  const placedServerIds = new Set();

  internalNetworks.forEach((net, netIdx) => {
    const netSubnets = (net.subnets || [])
      .map((sid) => subnetMap[sid])
      .filter(Boolean);

    const subnetCards = netSubnets.map((sub, subIdx) => {
      const connectedRouters = routerNodes.filter((r) => r.connectedSubnetIds.includes(sub.id));
      const attachedVms = serverItems
        .filter((vm) => vm.attachedSubnetIds.includes(sub.id))
        .map((vm) => {
          placedServerIds.add(vm.id);
          const ipInSub = vm.subnetIps[sub.id]?.[0] || vm.fixedAddresses[0] || '';
          const isMatched = matchesQuery([
            vm.name,
            vm.id,
            ...vm.fixedAddresses,
            ...vm.floatingAddresses,
          ]);
          return {
            ...vm,
            ipInSubnet: ipInSub,
            isSearchMatch: isMatched,
          };
        })
        // Sort order: Search match -> Error -> Active (with FIP first) -> Shutoff
        .sort((a, b) => {
          if (a.isSearchMatch !== b.isSearchMatch) return a.isSearchMatch ? -1 : 1;
          const rank = (v) => (v.isError ? 0 : v.healthy ? 1 : 2);
          if (rank(a) !== rank(b)) return rank(a) - rank(b);
          if ((a.floatingAddresses.length > 0) !== (b.floatingAddresses.length > 0)) {
            return a.floatingAddresses.length > 0 ? -1 : 1;
          }
          return String(a.name).localeCompare(String(b.name));
        });

      const errorVmCount = attachedVms.filter((v) => v.isError).length;
      const shutoffVmCount = attachedVms.filter((v) => v.isShutoff).length;
      const activeVmCount = attachedVms.filter((v) => v.healthy).length;
      const subnetMatch = matchesQuery([sub.name, sub.id, sub.cidr, sub.gateway_ip, net.name]);

      return {
        id: sub.id,
        code: `vSW-0${subIdx + 1}`,
        name: sub.name || sub.id.slice(0, 10),
        cidr: sub.cidr || '',
        gatewayIp:
          connectedRouters.map((r) => routerGatewayIpBySubnet[`${r.id}:${sub.id}`]).find(Boolean) ||
          sub.gateway_ip ||
          '-',
        dhcpEnabled: sub.enable_dhcp !== false,
        networkId: net.id,
        networkName: net.name || net.id.slice(0, 10),
        accentIndex: (netIdx + subIdx) % 2, // 0 = Skyline Blue (#0068FF), 1 = Sky Blue (#0284C7)
        connectedRouterIds: connectedRouters.map((r) => r.id),
        vms: attachedVms,
        activeVmCount,
        shutoffVmCount,
        errorVmCount,
        isSearchMatch: subnetMatch || attachedVms.some((v) => v.isSearchMatch),
        raw: sub,
        networkRaw: net,
      };
    });

    const allRouterIdsForVpc = [...new Set(subnetCards.flatMap((sc) => sc.connectedRouterIds))];
    const totalVms = subnetCards.reduce((acc, sc) => acc + sc.vms.length, 0);
    const totalErrors = subnetCards.reduce((acc, sc) => acc + sc.errorVmCount, 0);
    const totalShutoff = subnetCards.reduce((acc, sc) => acc + sc.shutoffVmCount, 0);

    vpcGroups.push({
      id: net.id,
      name: net.name || net.id.slice(0, 10),
      shared: !!net.shared,
      status: net.status || 'ACTIVE',
      segType: net['provider:network_type'] || '',
      segId: net['provider:segmentation_id'] || '',
      routerIds: allRouterIdsForVpc,
      subnets: subnetCards,
      totalVms,
      totalErrors,
      totalShutoff,
      raw: net,
    });
  });

  // Unattached / No-NIC VMs (SDN Pool)
  const unplacedVms = serverItems.filter((vm) => !placedServerIds.has(vm.id));
  if (unplacedVms.length > 0) {
    const formattedUnplaced = unplacedVms.map((vm) => ({
      ...vm,
      isUnattachedVm: true,
      ipInSubnet: vm.fixedAddresses[0] || vm.floatingAddresses[0] || '',
      isSearchMatch: matchesQuery([vm.name, vm.id, ...vm.fixedAddresses, ...vm.floatingAddresses]),
    }));
    vpcGroups.push({
      id: 'vpc-unattached',
      name: t('Unattached / SDN Instance Pool'),
      isUnattachedPool: true,
      shared: false,
      status: 'ACTIVE',
      segType: 'SDN',
      segId: 'POOL',
      routerIds: [],
      subnets: [
        {
          id: 'sub-unattached',
          code: 'SDN-BUS',
          name: t('No-NIC / Unattached SDN Bus'),
          isUnattachedPool: true,
          cidr: 'SDN Ready',
          gatewayIp: '-',
          dhcpEnabled: false,
          networkId: 'vpc-unattached',
          networkName: t('Unattached / SDN Instance Pool'),
          accentIndex: 1,
          connectedRouterIds: [],
          vms: formattedUnplaced,
          activeVmCount: formattedUnplaced.filter((v) => v.healthy).length,
          shutoffVmCount: formattedUnplaced.filter((v) => v.isShutoff).length,
          errorVmCount: formattedUnplaced.filter((v) => v.isError).length,
          isSearchMatch: formattedUnplaced.some((v) => v.isSearchMatch),
          raw: { id: 'sub-unattached', name: t('No-NIC / Unattached SDN Bus') },
          networkRaw: { id: 'vpc-unattached', name: t('Unattached / SDN Instance Pool') },
        },
      ],
      totalVms: formattedUnplaced.length,
      totalErrors: formattedUnplaced.filter((v) => v.isError).length,
      totalShutoff: formattedUnplaced.filter((v) => v.isShutoff).length,
      raw: { id: 'vpc-unattached', name: t('Unattached / SDN Instance Pool') },
    });
  }

  const allSubnetsFlat = vpcGroups.flatMap((v) => v.subnets);
  const subnetById = Object.fromEntries(allSubnetsFlat.map((s) => [s.id, s]));

  routerNodes.forEach((r) => {
    const rSubs = r.connectedSubnetIds.map((sid) => subnetById[sid]).filter(Boolean);
    const vmIdSet = new Set();
    let errCount = r.isError ? 1 : 0;
    let shutCount = 0;
    rSubs.forEach((s) => {
      s.vms.forEach((v) => {
        if (!vmIdSet.has(v.id)) {
          vmIdSet.add(v.id);
          if (v.isError) errCount += 1;
          if (v.isShutoff) shutCount += 1;
        }
      });
    });
    r.totalVms = vmIdSet.size;
    r.errorCount = errCount;
    r.shutoffCount = shutCount;
    r.isSearchMatch = matchesQuery([r.name, r.id, ...r.extFixedIps]);
  });

  // Apply Focus Router & Alerts Only filters
  let filteredRouters = routerNodes;
  let filteredVpcs = vpcGroups;

  if (focusRouterId && focusRouterId !== 'ALL') {
    filteredRouters = routerNodes.filter((r) => r.id === focusRouterId);
    filteredVpcs = vpcGroups
      .map((vpc) => ({
        ...vpc,
        subnets: vpc.subnets.filter((s) => s.connectedRouterIds.includes(focusRouterId)),
      }))
      .filter((vpc) => vpc.subnets.length > 0);
  }

  if (alertsOnly) {
    filteredVpcs = filteredVpcs
      .map((vpc) => ({
        ...vpc,
        subnets: vpc.subnets.filter(
          (s) =>
            s.errorVmCount > 0 ||
            s.connectedRouterIds.some((rid) => {
              const rn = routerNodes.find((r) => r.id === rid);
              return rn && rn.isError;
            })
        ),
      }))
      .filter((vpc) => vpc.subnets.length > 0);
    const activeRouterIds = new Set(
      filteredVpcs.flatMap((v) => v.subnets.flatMap((s) => s.connectedRouterIds))
    );
    filteredRouters = filteredRouters.filter(
      (r) => r.isError || r.errorCount > 0 || activeRouterIds.has(r.id)
    );
  }

  const totalInstances = serverItems.length;
  const activeInstances = serverItems.filter((s) => s.healthy).length;
  const shutoffInstances = serverItems.filter((s) => s.isShutoff).length;
  const errorInstances = serverItems.filter((s) => s.isError).length;
  const errorRouters = routerNodes.filter((r) => r.isError).length;

  return {
    extNetworks,
    routers: filteredRouters,
    allRouters: routerNodes,
    vpcGroups: filteredVpcs,
    allVpcGroups: vpcGroups,
    allSubnetsFlat,
    subnetById,
    serverItems,
    stats: {
      totalRouters: routerNodes.length,
      totalSubnets: subnets.length,
      totalInstances,
      activeInstances,
      shutoffInstances,
      totalErrors: errorInstances + errorRouters,
    },
  };
}

/* ---------------- Top-to-Bottom Vertical v4 Layout Engine (with Drag Offsets) ---------------- */
const WAN_H = 58;
const ROUTER_W = 244;
const ROUTER_H = 98;
const SWITCH_W = 508;
const SWITCH_H = 58;
const VM_CARD_W = 236;
const VM_CARD_H = 80;
const VM_GAP_X = 20;
const VM_GAP_Y = 24;
const VPC_PAD_X = 20;
const VPC_GAP_X = 28;

function computeVerticalV4Layout(
  model,
  { expandedSubnets, collapsedSubnets, compactMode, nodeOffsets }
) {
  const getOffset = (key) => nodeOffsets[key] || { dx: 0, dy: 0 };

  // 1. Compute VPC Columns horizontally (side by side, or minimum width)
  const vpcStartY = 308;
  let curVpcX = 32;

  const vpcBoxes = [];
  const subnetBoxes = {};
  const vmBoxes = [];
  const vmBoxByKey = {};

  model.vpcGroups.forEach((vpc) => {
    const vpcOff = getOffset(`vpc:${vpc.id}`);
    const vpcBaseX = Math.max(16, curVpcX + vpcOff.dx);
    const vpcBaseY = Math.max(260, vpcStartY + vpcOff.dy);

    const defaultVpcW = SWITCH_W + VPC_PAD_X * 2;
    let localSubY = vpcBaseY + 34;

    const sBoxes = [];
    const vpcVmBoxes = [];

    vpc.subnets.forEach((sub) => {
      const subOff = getOffset(`subnet:${sub.id}`);
      const sx = Math.max(16, vpcBaseX + VPC_PAD_X + subOff.dx);
      const sy = Math.max(vpcBaseY + 28, localSubY + subOff.dy);

      const sBox = {
        id: sub.id,
        dragKey: `subnet:${sub.id}`,
        x: sx,
        y: sy,
        w: SWITCH_W,
        h: SWITCH_H,
        subnet: sub,
      };
      sBoxes.push(sBox);
      subnetBoxes[sub.id] = sBox;

      const isCollapsed = compactMode || collapsedSubnets.has(sub.id);
      const isExpanded = !isCollapsed && expandedSubnets.has(sub.id);
      const totalVms = sub.vms.length;
      const shownVms = isCollapsed
        ? []
        : isExpanded
          ? sub.vms
          : sub.vms.slice(0, DEFAULT_VMS_PER_SUBNET);
      const hiddenCount = Math.max(0, totalVms - shownVms.length);

      sBox.isCollapsed = isCollapsed;
      sBox.isExpanded = isExpanded;
      sBox.shownVms = shownVms;
      sBox.hiddenCount = hiddenCount;

      let nextSubTop = sy + SWITCH_H + 30;

      if (!isCollapsed && shownVms.length > 0) {
        const vmStartY = sy + SWITCH_H + 46;
        shownVms.forEach((vm, vIdx) => {
          const col = vIdx % VM_COLS_PER_ROW;
          const row = Math.floor(vIdx / VM_COLS_PER_ROW);
          const vmDragKey = `vm:${sub.id}:${vm.id}`;
          const vmOff = getOffset(vmDragKey);

          const vx =
            sx +
            (SWITCH_W - (VM_COLS_PER_ROW * VM_CARD_W + (VM_COLS_PER_ROW - 1) * VM_GAP_X)) / 2 +
            col * (VM_CARD_W + VM_GAP_X) +
            vmOff.dx;
          const vy = vmStartY + row * (VM_CARD_H + VM_GAP_Y) + vmOff.dy;

          const vBox = {
            key: `${sub.id}:${vm.id}`,
            dragKey: vmDragKey,
            id: vm.id,
            subnetId: sub.id,
            subnetName: sub.name,
            accentIndex: sub.accentIndex,
            x: vx,
            y: vy,
            w: VM_CARD_W,
            h: VM_CARD_H,
            vm,
          };
          vmBoxes.push(vBox);
          vpcVmBoxes.push(vBox);
          vmBoxByKey[vBox.key] = vBox;
        });

        const totalRows = Math.ceil(shownVms.length / VM_COLS_PER_ROW);
        nextSubTop = vmStartY + totalRows * VM_CARD_H + (totalRows - 1) * VM_GAP_Y + 26;

        if (hiddenCount > 0 || (isExpanded && totalVms > DEFAULT_VMS_PER_SUBNET)) {
          sBox.foldBarY = nextSubTop - 14;
          nextSubTop += 34;
        }
      }

      localSubY = nextSubTop + 14;
    });

    // Dynamically calculate VPC container bounding box so subnets/VMs are ALWAYS wrapped inside
    const allChildX = [...sBoxes.map((b) => b.x), ...vpcVmBoxes.map((b) => b.x)];
    const allChildRight = [...sBoxes.map((b) => b.x + b.w), ...vpcVmBoxes.map((b) => b.x + b.w)];
    const allChildY = [...sBoxes.map((b) => b.y), ...vpcVmBoxes.map((b) => b.y)];
    const allChildBottom = [
      ...sBoxes.map((b) => b.y + b.h),
      ...vpcVmBoxes.map((b) => b.y + b.h),
      ...sBoxes.map((b) => (b.foldBarY ? b.foldBarY + 38 : 0)),
      localSubY + 6,
    ];

    const minChildX = allChildX.length > 0 ? Math.min(...allChildX) : vpcBaseX + VPC_PAD_X;
    const maxChildRight = allChildRight.length > 0 ? Math.max(...allChildRight) : vpcBaseX + defaultVpcW - VPC_PAD_X;
    const minChildY = allChildY.length > 0 ? Math.min(...allChildY) : vpcBaseY + 34;
    const maxChildBottom = allChildBottom.length > 0 ? Math.max(...allChildBottom) : vpcBaseY + 120;

    const vpcX = Math.min(vpcBaseX, minChildX - VPC_PAD_X);
    const vpcY = Math.min(vpcBaseY, minChildY - 34);
    const vpcW = Math.max(defaultVpcW, maxChildRight - vpcX + VPC_PAD_X);
    const vpcH = Math.max(120, maxChildBottom - vpcY + 16);

    vpcBoxes.push({
      id: vpc.id,
      dragKey: `vpc:${vpc.id}`,
      x: vpcX,
      y: vpcY,
      w: vpcW,
      h: vpcH,
      vpc,
      subnetBoxes: sBoxes,
    });

    curVpcX = Math.max(curVpcX + defaultVpcW + VPC_GAP_X, vpcX + vpcW + VPC_GAP_X);
  });

  const totalVpcSpanW = Math.max(960, curVpcX + 16);

  // 2. Position Tier 1: Virtual Routers Row (y = 156)
  // Center each router above its connected subnets, or spread evenly across canvas width
  const routerRowY = 156;
  const routerBoxes = [];
  const routerBoxById = {};
  let minNextRouterX = 48;

  model.routers.forEach((r, idx) => {
    const rOff = getOffset(`router:${r.id}`);
    const connSubBoxes = r.connectedSubnetIds.map((sid) => subnetBoxes[sid]).filter(Boolean);
    let idealCenterX =
      connSubBoxes.length > 0
        ? connSubBoxes.reduce((acc, b) => acc + b.x + b.w / 2, 0) / connSubBoxes.length
        : (totalVpcSpanW / (model.routers.length + 1)) * (idx + 1);

    const baseRx = Math.max(minNextRouterX, Math.round(idealCenterX - ROUTER_W / 2));
    minNextRouterX = baseRx + ROUTER_W + 36;

    const rx = Math.max(16, baseRx + rOff.dx);
    const ry = Math.max(90, routerRowY + rOff.dy);

    const rBox = {
      id: r.id,
      dragKey: `router:${r.id}`,
      x: rx,
      y: ry,
      w: ROUTER_W,
      h: ROUTER_H,
      router: r,
    };
    routerBoxes.push(rBox);
    routerBoxById[r.id] = rBox;
  });

  // 3. Position Tier 0: External WAN Banners Row (y = 26)
  const wanRowY = 26;
  const wanBoxes = [];
  const wanBoxById = {};
  const wanCount = model.extNetworks.length;
  const preliminaryWidth = Math.max(totalVpcSpanW, minNextRouterX + 48);
  const totalWanW = Math.min(preliminaryWidth - 64, Math.max(680, preliminaryWidth - 96));
  const singleWanW = Math.max(320, Math.floor((totalWanW - (wanCount - 1) * 24) / wanCount));
  const wanStartX = Math.round((preliminaryWidth - (singleWanW * wanCount + (wanCount - 1) * 24)) / 2);

  model.extNetworks.forEach((en, idx) => {
    const wOff = getOffset(`wan:${en.id}`);
    const wx = Math.max(16, wanStartX + idx * (singleWanW + 24) + wOff.dx);
    const wy = Math.max(16, wanRowY + wOff.dy);
    const wBox = {
      id: en.id,
      dragKey: `wan:${en.id}`,
      x: wx,
      y: wy,
      w: singleWanW,
      h: WAN_H,
      network: en,
    };
    wanBoxes.push(wBox);
    wanBoxById[en.id] = wBox;
  });

  // 4. Build Vertical Orthogonal Connectors (WAN -> Router, Router -> vSwitch, vSwitch -> VM)
  const edges = [];

  // [A] WAN Bottom -> Router Top
  routerBoxes.forEach((rb) => {
    const extId = rb.router.extNetId;
    const wb = extId ? wanBoxById[extId] || wanBoxes[0] : null;
    if (!wb) return;
    const x2 = rb.x + rb.w / 2;
    const y2 = rb.y;
    // Clamp WAN exit X within WAN banner bounds
    const x1 = Math.max(wb.x + 36, Math.min(wb.x + wb.w - 36, x2));
    const y1 = wb.y + wb.h;
    const midY = Math.round((y1 + y2) / 2);

    edges.push({
      id: `wan-${wb.id}-rtr-${rb.id}`,
      kind: 'wan-router',
      wanId: wb.id,
      routerId: rb.id,
      x1,
      y1,
      x2,
      y2,
      midY,
      pillText: rb.router.extFixedIps[0] ? `WAN ${rb.router.extFixedIps[0]}` : 'WAN GW',
      color: '#0068FF',
      dashed: !rb.router.healthy,
    });
  });

  // [B] Router Bottom -> vSwitch Top
  routerBoxes.forEach((rb) => {
    const connSubs = rb.router.connectedSubnetIds
      .map((sid) => subnetBoxes[sid])
      .filter(Boolean);
    connSubs.forEach((sb, sIdx) => {
      const spreadOffset =
        connSubs.length > 1
          ? Math.round((sIdx - (connSubs.length - 1) / 2) * 28)
          : 0;
      const x1 = rb.x + rb.w / 2 + spreadOffset;
      const y1 = rb.y + rb.h;

      // Connect naturally towards the subnet top area
      const subCenterX = sb.x + sb.w / 2;
      const x2 = Math.round(Math.max(sb.x + 48, Math.min(sb.x + sb.w - 48, subCenterX + (x1 - subCenterX) * 0.35)));
      const y2 = sb.y;
      const midY = Math.round((y1 + y2) / 2);

      edges.push({
        id: `rtr-${rb.id}-sub-${sb.id}`,
        kind: 'router-subnet',
        routerId: rb.id,
        subnetId: sb.id,
        x1,
        y1,
        x2,
        y2,
        midY,
        pillText:
          sb.subnet.gatewayIp && sb.subnet.gatewayIp !== '-'
            ? `GW ${sb.subnet.gatewayIp}`
            : '',
        color: sb.subnet.accentIndex === 0 ? '#0068FF' : '#0284C7',
        dashed: false,
      });
    });
  });

  // [C] vSwitch Bottom -> VM Card Top (including SDN Ready guide for No-NIC VMs)
  vmBoxes.forEach((vb) => {
    const sb = subnetBoxes[vb.subnetId];
    if (!sb) return;
    const x2 = vb.x + vb.w / 2;
    const y2 = vb.y;
    const x1 = Math.max(sb.x + 28, Math.min(sb.x + sb.w - 28, x2));
    const y1 = sb.y + sb.h;
    const midY = Math.round((y1 + y2) / 2);

    const isNoNicPool = Boolean(sb.subnet.isUnattachedPool && !vb.vm.hasNic);
    const vmState = vb.vm.stateCategory; // 'active' | 'shutoff' | 'error'
    const strokeCol = isNoNicPool
      ? '#6366F1'
      : vmState === 'error'
        ? '#EF4444'
        : vmState === 'shutoff'
          ? '#94A3B8'
          : vb.accentIndex === 0
            ? '#0068FF'
            : '#0284C7';

    edges.push({
      id: `sub-${sb.id}-vm-${vb.id}`,
      kind: 'subnet-vm',
      subnetId: sb.id,
      vmId: vb.id,
      vmState,
      isNoNicPool,
      x1,
      y1,
      x2,
      y2,
      midY,
      pillText: isNoNicPool
        ? 'SDN READY'
        : vb.vm.ipInSubnet === 'DHCP (SDN)'
          ? 'SDN DHCP'
          : shortIp(vb.vm.ipInSubnet),
      color: strokeCol,
      dashed: isNoNicPool || vmState !== 'active',
    });
  });

  // Dynamic canvas bounds ensuring NO dragged item or edge gets clipped
  const allElementsXRight = [
    totalVpcSpanW,
    minNextRouterX + 48,
    ...wanBoxes.map((b) => b.x + b.w),
    ...routerBoxes.map((b) => b.x + b.w),
    ...vpcBoxes.map((b) => b.x + b.w),
    ...Object.values(subnetBoxes).map((b) => b.x + b.w),
    ...vmBoxes.map((b) => b.x + b.w),
    ...edges.map((e) => Math.max(e.x1, e.x2) + 30),
  ];
  const allElementsYBottom = [
    640,
    ...wanBoxes.map((b) => b.y + b.h),
    ...routerBoxes.map((b) => b.y + b.h),
    ...vpcBoxes.map((b) => b.y + b.h),
    ...Object.values(subnetBoxes).map((b) => b.y + b.h),
    ...vmBoxes.map((b) => b.y + b.h),
    ...edges.map((e) => Math.max(e.y1, e.y2) + 30),
  ];

  const canvasWidth = Math.max(...allElementsXRight) + 64;
  const canvasHeight = Math.max(...allElementsYBottom) + 72;

  return {
    width: canvasWidth,
    height: canvasHeight,
    wanBoxes,
    routerBoxes,
    vpcBoxes,
    subnetBoxes,
    vmBoxes,
    edges,
  };
}

/**
 * Smooth Cubic Bézier (S-Curve) Path & Exact Bernstein Midpoint Evaluator
 * Produces organic, fluid connections between entities that adapt smoothly when nodes are dragged.
 */
function getSmoothConnectionGeometry(x1, y1, x2, y2, pillT = 0.54) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const absDy = Math.abs(dy);
  const absDx = Math.abs(dx);

  // Smooth handle calculation: strictly bounded so vertical S-curves never flatten prematurely
  const handle = dy >= 0
    ? Math.max(36, Math.min(absDy * 0.65, 140))
    : Math.max(48, Math.min(140, absDy * 0.55 + absDx * 0.15));

  const dir = dy >= -18 ? 1 : -0.7;
  const cx1 = x1;
  const cy1 = Math.round(y1 + handle * dir);
  const cx2 = x2;
  const cy2 = Math.round(y2 - handle * dir);
  const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

  const mt = 1 - pillT;
  const pillCx =
    mt * mt * mt * x1 +
    3 * mt * mt * pillT * cx1 +
    3 * mt * pillT * pillT * cx2 +
    pillT * pillT * pillT * x2;
  const pillCy =
    mt * mt * mt * y1 +
    3 * mt * mt * pillT * cy1 +
    3 * mt * pillT * pillT * cy2 +
    pillT * pillT * pillT * y2;

  return { d, pillCx, pillCy };
}

/* ---------------- Sangfor 3D Isometric Cylindrical Router Icon ---------------- */
const IsometricRouterGlyph = ({ active = true }) => (
  <svg width="46" height="42" viewBox="0 0 52 46" fill="none">
    <defs>
      <linearGradient id="rtrTopActive" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2580FF" />
        <stop offset="100%" stopColor="#0052CC" />
      </linearGradient>
    </defs>
    <path
      d="M 4 16 V 32 C 4 37.5 13.8 42 26 42 C 38.2 42 48 37.5 48 32 V 16"
      fill={active ? '#0052CC' : '#475569'}
    />
    <ellipse
      cx="26"
      cy="16"
      rx="22"
      ry="10"
      fill={active ? 'url(#rtrTopActive)' : '#64748B'}
      stroke={active ? '#93C5FD' : '#CBD5E1'}
      strokeWidth="1"
    />
    <path
      d="M 16 16 L 36 16 M 26 10 L 26 22 M 32 13 L 36 16 L 32 19 M 20 13 L 16 16 L 20 19"
      stroke="#FFFFFF"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
    <circle cx="18" cy="32" r="2" fill="#34D399" />
    <circle cx="26" cy="33" r="2" fill="#93C5FD" />
    <circle cx="34" cy="32" r="2" fill="#34D399" />
  </svg>
);

/* ---------------- Popover Preview (Memoized for Lazy Hover Mounting) ---------------- */
const VmQuickPopover = React.memo(({ vm, subnetName }) => (
  <div style={{ width: 290, fontSize: 13 }}>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}
    >
      <Link
        to={`/compute/instance/detail/${vm.id}`}
        style={{ fontWeight: 700, fontSize: 14, color: '#0068FF' }}
      >
        {vm.name}
      </Link>
      <Status status={String(vm.status)} />
    </div>
    <div style={{ color: '#475569', fontSize: 12, lineHeight: 1.7 }}>
      <div>
        <b>{t('UUID')}:</b> <span className="font-mono">{vm.id.slice(0, 18)}…</span>
      </div>
      <div>
        <b>{t('Subnet')}:</b> {subnetName}
      </div>
      <div>
        <b>{t('Fixed IP')}:</b>{' '}
        <span className="font-mono" style={{ color: '#0F172A', fontWeight: 600 }}>
          {vm.fixedAddresses.length ? vm.fixedAddresses.join(', ') : '-'}
        </span>
      </div>
      {vm.floatingAddresses.length > 0 && (
        <div>
          <b>{t('Floating IP')}:</b>{' '}
          <span className="font-mono" style={{ color: '#059669', fontWeight: 700 }}>
            {vm.floatingAddresses.join(', ')}
          </span>
        </div>
      )}
      {vm.raw?.image_name && (
        <div>
          <b>{t('Image')}:</b> {vm.raw.image_name}
        </div>
      )}
    </div>
  </div>
));
VmQuickPopover.displayName = 'VmQuickPopover';

/* ---------------- Memoized Compute VM Card Node (Senior-Frontend Optimization) ---------------- */
const VmCardNode = React.memo(
  ({
    vb,
    isSel,
    isTraced,
    isSdnDropTarget,
    isDragging,
    isDark,
    surfaceBg,
    cardBorder,
    titleText,
    subText,
    onStartNodeDrag,
    onSelectVm,
    onHoverVm,
    onLeaveVm,
    onStartSdnCableDrag,
    onOpenVmSdnModal,
  }) => {
    const vm = vb.vm;
    const stateCat = vm.stateCategory; // 'active' | 'shutoff' | 'error'
    const noNic = !vm.hasNic;

    const cardBg = isSdnDropTarget
      ? isDark
        ? 'rgba(16, 185, 129, 0.2)'
        : '#ECFDF5'
      : stateCat === 'error'
        ? isDark
          ? 'rgba(239, 68, 68, 0.16)'
          : '#FEF2F2'
        : stateCat === 'shutoff'
          ? isDark
            ? '#1E293B'
            : '#F8FAFC'
          : surfaceBg;

    const borderStroke = isSdnDropTarget
      ? '#10B981'
      : stateCat === 'error'
        ? '#EF4444'
        : isSel || isTraced || vm.isSearchMatch
          ? '#0068FF'
          : noNic
            ? '#6366F1'
            : stateCat === 'shutoff'
              ? '#94A3B8'
              : cardBorder;

    const iconBadgeBg =
      stateCat === 'error'
        ? '#FEE2E2'
        : stateCat === 'shutoff'
          ? '#E2E8F0'
          : noNic
            ? '#EEF2FF'
            : vb.accentIndex === 0
              ? '#EFF6FF'
              : '#F0F9FF';

    const rackColor =
      stateCat === 'error'
        ? '#EF4444'
        : stateCat === 'shutoff'
          ? '#64748B'
          : noNic
            ? '#6366F1'
            : vb.accentIndex === 0
              ? '#0068FF'
              : '#0284C7';

    return (
      <Popover
        placement="top"
        mouseEnterDelay={0.18}
        destroyTooltipOnHide
        content={<VmQuickPopover vm={vm} subnetName={vb.subnetName} />}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={`${t('Instance')} ${vm.name} (${vm.status})`}
          aria-pressed={isSel}
          data-draggable-node="true"
          onPointerDown={(e) => onStartNodeDrag(e, vb.dragKey, () => onSelectVm(vm.id))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectVm(vm.id);
            }
          }}
          onMouseEnter={() => onHoverVm(vm.id)}
          onMouseLeave={onLeaveVm}
          style={{
            position: 'absolute',
            left: vb.x,
            top: vb.y,
            width: vb.w,
            height: vb.h,
            borderRadius: 10,
            background: cardBg,
            border: `${
              isSdnDropTarget || isSel || stateCat === 'error' || noNic ? 2 : 1.5
            }px ${noNic ? 'dashed' : 'solid'} ${borderStroke}`,
            boxShadow: isSdnDropTarget
              ? '0 0 0 4px rgba(16, 185, 129, 0.2)'
              : isDragging || isSel
                ? `0 6px 14px ${activeShadowColor}`
                : '0 2px 5px rgba(15, 23, 42, 0.04)',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: isDragging ? 'grabbing' : 'grab',
            zIndex: isDragging ? 20 : 3,
          }}
        >
          {/* Top SDN Port Handle on VM Card (Drag to any Subnet to attach SDN NIC) */}
          <Tooltip
            title={
              noNic
                ? t('No NIC: Drag to any Subnet or click to connect SDN')
                : t('Drag to Subnet to attach additional SDN NIC')
            }
          >
            <div
              role="button"
              tabIndex={0}
              aria-label={`${t('Connect SDN NIC for')} ${vm.name}`}
              data-sdn-port="true"
              onPointerDown={(e) =>
                onStartSdnCableDrag(e, {
                  sourceKind: 'vm',
                  sourceId: vm.id,
                  sourceName: vm.name,
                  x1: vb.x + vb.w / 2,
                  y1: vb.y,
                })
              }
              onClick={(e) => {
                e.stopPropagation();
                onOpenVmSdnModal(vm.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenVmSdnModal(vm.id);
                }
              }}
              style={{
                position: 'absolute',
                left: '50%',
                top: -8,
                transform: 'translateX(-50%)',
                width: noNic ? 22 : 15,
                height: noNic ? 16 : 15,
                borderRadius: 8,
                background: noNic ? '#6366F1' : '#0068FF',
                border: '2px solid #FFFFFF',
                boxShadow: '0 2px 5px rgba(0, 104, 255, 0.3)',
                cursor: 'crosshair',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontSize: 9.5,
                fontWeight: 700,
                zIndex: 10,
              }}
            >
              +
            </div>
          </Tooltip>

          {/* Server Blade Icon Box (v4 style) */}
          <div
            aria-hidden="true"
            style={{
              width: 42,
              height: 42,
              borderRadius: 8,
              background: iconBadgeBg,
              border: `1px solid ${
                stateCat === 'error'
                  ? '#FCA5A5'
                  : stateCat === 'shutoff'
                    ? '#CBD5E1'
                    : noNic
                      ? '#C7D2FE'
                      : '#BFDBFE'
              }`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 26,
                height: 8,
                borderRadius: 2,
                background: rackColor,
                position: 'relative',
              }}
            />
            <div
              style={{
                width: 26,
                height: 8,
                borderRadius: 2,
                background: rackColor,
                position: 'relative',
              }}
            />
          </div>

          {/* VM Details */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color:
                    stateCat === 'error'
                      ? '#991B1B'
                      : stateCat === 'shutoff'
                        ? '#475569'
                        : titleText,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={vm.name}
              >
                {vm.name}
              </span>

              {/* Accurate Status Indicator: ACTIVE dot, SHUTOFF pill, or ERROR pill */}
              {stateCat === 'error' ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 4,
                    background: '#EF4444',
                    color: '#FFFFFF',
                    flexShrink: 0,
                  }}
                >
                  ERROR
                </span>
              ) : stateCat === 'shutoff' ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 4,
                    background: '#E2E8F0',
                    color: '#475569',
                    flexShrink: 0,
                  }}
                >
                  {vm.status === 'STOPPED' ? 'STOPPED' : 'SHUTOFF'}
                </span>
              ) : (
                <span
                  aria-label={t('Active')}
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: '#10B981',
                    flexShrink: 0,
                  }}
                />
              )}
            </div>

            <div
              className="font-mono"
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: noNic
                  ? '#4F46E5'
                  : stateCat === 'error'
                    ? '#991B1B'
                    : stateCat === 'shutoff'
                      ? '#64748B'
                      : titleText,
                marginTop: 2,
              }}
            >
              {noNic
                ? t('No NIC Attached')
                : `IP: ${vm.ipInSubnet || vm.fixedAddresses[0] || '-'}`}
            </div>

            {noNic ? (
              <div style={{ marginTop: 2 }}>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenVmSdnModal(vm.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenVmSdnModal(vm.id);
                    }
                  }}
                  style={{
                    display: 'inline-block',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '0 6px',
                    borderRadius: 4,
                    background: '#EEF2FF',
                    border: '1px solid #A5B4FC',
                    color: '#4F46E5',
                    cursor: 'pointer',
                  }}
                >
                  + {t('Connect SDN NIC')}
                </span>
              </div>
            ) : vm.floatingAddresses.length > 0 ? (
              <div
                className="font-mono"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#059669',
                  marginTop: 2,
                }}
              >
                FIP: {vm.floatingAddresses[0]}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: subText,
                  marginTop: 2,
                }}
              >
                {stateCat === 'shutoff'
                  ? t('Port state: DOWN (Shutoff)')
                  : vm.nicCount > 1
                    ? `${vm.nicCount} NICs Attached`
                    : t('Port state: UP')}
              </div>
            )}
          </div>
        </div>
      </Popover>
    );
  },
  (prev, next) =>
    prev.vb.x === next.vb.x &&
    prev.vb.y === next.vb.y &&
    prev.vb.vm === next.vb.vm &&
    prev.vb.subnetName === next.vb.subnetName &&
    prev.isSel === next.isSel &&
    prev.isTraced === next.isTraced &&
    prev.isSdnDropTarget === next.isSdnDropTarget &&
    prev.isDragging === next.isDragging &&
    prev.isDark === next.isDark
);
VmCardNode.displayName = 'VmCardNode';

/* ---------------- Main Topology Page ---------------- */
export default function Topology() {
  const navigate = useNavigate();
  const currentProject = useAuthStore((s) => s.currentProject);
  const projectId = currentProject?.id;
  const projectName = currentProject?.name || 'default';
  const hasAdminRole = useAuthStore((s) => s.hasAdminRole);
  usePolicyStore((s) => s.rules);

  const { currentTheme } = useThemeStore();
  const isDark = currentTheme === THEMES.DARK_OPS;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInstances, setShowInstances] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusRouterId, setFocusRouterId] = useState('ALL');
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [expandedSubnets, setExpandedSubnets] = useState(() => new Set());
  const [collapsedSubnets, setCollapsedSubnets] = useState(() => new Set());
  const [selectedItem, setSelectedItem] = useState(null);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const [inspectorSearch, setInspectorSearch] = useState('');
  const [inspectorPage, setInspectorPage] = useState(1);

  // Interactive Drag-and-Drop state for all canvas items
  const [nodeOffsets, setNodeOffsets] = useState({});
  const nodeOffsetsRef = useRef({});
  useEffect(() => {
    nodeOffsetsRef.current = nodeOffsets;
  }, [nodeOffsets]);
  const [draggingKey, setDraggingKey] = useState(null);
  const dragSessionRef = useRef(null);
  const canvasViewportRef = useRef(null);
  const canvasInnerRef = useRef(null);
  const panSessionRef = useRef(null);

  // Interactive SDN Connection Drawing & Provisioning State (persisted per project across F5)
  const sdnStorageKey = `skyline_sdn_links_${projectId || 'default'}`;
  const [sdnLinks, setSdnLinks] = useState(() => {
    try {
      const saved = localStorage.getItem(`skyline_sdn_links_${projectId || 'default'}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const persistSdnLinks = useCallback(
    (updater) => {
      setSdnLinks((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try {
          localStorage.setItem(sdnStorageKey, JSON.stringify(next));
        } catch {
          // ignore storage error
        }
        return next;
      });
    },
    [sdnStorageKey]
  );
  const [sdnDraft, setSdnDraft] = useState(null);
  const sdnDraftRef = useRef(null);
  const [sdnModal, setSdnModal] = useState(null);
  const [sdnSubmitting, setSdnSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTopology(projectId);
      setData(res);
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

  const { handleAction, actionModal } = useActionRunner({ onRefresh: load });

  const model = useMemo(
    () =>
      buildVerticalTopologyModel(data || {}, {
        showInstances,
        searchQuery,
        focusRouterId,
        alertsOnly,
        sdnLinks,
      }),
    [data, showInstances, searchQuery, focusRouterId, alertsOnly, sdnLinks]
  );

  // Auto-select first router (or first subnet) once loaded
  useEffect(() => {
    if (selectedItem) return;
    if (model.routers.length > 0) {
      setSelectedItem({ kind: 'router', id: model.routers[0].id });
    } else if (model.allSubnetsFlat.length > 0) {
      setSelectedItem({ kind: 'subnet', id: model.allSubnetsFlat[0].id });
    }
  }, [model.routers, model.allSubnetsFlat, selectedItem]);

  useEffect(() => {
    setInspectorPage(1);
    setInspectorSearch('');
  }, [selectedItem?.kind, selectedItem?.id]);

  const geometry = useMemo(
    () =>
      computeVerticalV4Layout(model, {
        expandedSubnets,
        collapsedSubnets,
        compactMode,
        nodeOffsets,
      }),
    [model, expandedSubnets, collapsedSubnets, compactMode, nodeOffsets]
  );

  // Real-time Mouse Wheel Zoom centered around cursor position
  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return undefined;

    const handleWheelZoom = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const oldZoom = zoomRef.current;
      const step = e.deltaY < 0 ? 0.08 : -0.08;
      const nextZoom = Math.min(2.2, Math.max(0.35, Number((oldZoom + step).toFixed(2))));
      if (nextZoom === oldZoom) return;

      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const canvasX = (viewport.scrollLeft + mouseX - 16) / oldZoom;
      const canvasY = (viewport.scrollTop + mouseY - 16) / oldZoom;

      zoomRef.current = nextZoom;
      setZoom(nextZoom);

      requestAnimationFrame(() => {
        if (!canvasViewportRef.current) return;
        canvasViewportRef.current.scrollLeft = Math.max(0, canvasX * nextZoom + 16 - mouseX);
        canvasViewportRef.current.scrollTop = Math.max(0, canvasY * nextZoom + 16 - mouseY);
      });
    };

    viewport.addEventListener('wheel', handleWheelZoom, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheelZoom);
  }, [loading]);

  // Open SDN Connection Modal (either from dragging an SDN cable or clicking "+ Connect SDN")
  const openSdnConnectModal = useCallback(
    ({ linkKind = 'vm-subnet', vmId, subnetId, routerId, wanId } = {}) => {
      const realSubnets = model.allSubnetsFlat.filter((s) => !s.isUnattachedPool);
      const defaultSubId = subnetId || realSubnets[0]?.id || '';
      const defaultVmId = vmId || model.serverItems[0]?.id || '';
      const defaultRouterId = routerId || model.allRouters[0]?.id || '';
      const defaultWanId = wanId || model.extNetworks[0]?.id || '';

      setSdnModal({
        linkKind,
        vmId: defaultVmId,
        subnetId: defaultSubId,
        routerId: defaultRouterId,
        wanId: defaultWanId,
        ipMode: 'dhcp',
        fixedIp: '',
      });
    },
    [model.allSubnetsFlat, model.serverItems, model.allRouters, model.extNetworks]
  );

  // Start dragging an SDN connection cable from a node port handle
  const startSdnCableDrag = useCallback((e, { sourceKind, sourceId, sourceName, x1, y1 }) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const draft = {
      sourceKind,
      sourceId,
      sourceName,
      x1,
      y1,
      x2: x1,
      y2: y1 + (sourceKind === 'vm' ? -28 : 28),
      targetKind: null,
      targetId: null,
      targetName: null,
    };
    sdnDraftRef.current = draft;
    setSdnDraft(draft);
  }, []);

  // Stable Node Drag-and-Drop Pointer Handler (zero dependencies via nodeOffsetsRef)
  const startNodeDrag = useCallback((e, dragKey, onClickSelect) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, a, [data-sdn-port="true"]')) return;
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const existing = nodeOffsetsRef.current[dragKey] || { dx: 0, dy: 0 };

    dragSessionRef.current = {
      dragKey,
      startX,
      startY,
      origDx: existing.dx,
      origDy: existing.dy,
      moved: false,
      onClickSelect,
    };
    setDraggingKey(dragKey);
  }, []);

  // Stable callbacks for memoized VmCardNode
  const handleSelectVmNode = useCallback((vmId) => {
    setSelectedItem({ kind: 'vm', id: vmId });
  }, []);
  const handleHoverVmNode = useCallback((vmId) => {
    setHoveredItem({ kind: 'vm', id: vmId });
  }, []);
  const handleLeaveNode = useCallback(() => {
    setHoveredItem(null);
  }, []);
  const handleOpenVmSdnModal = useCallback(
    (vmId) => {
      openSdnConnectModal({ linkKind: 'vm-subnet', vmId });
    },
    [openSdnConnectModal]
  );

  useEffect(() => {
    const onPointerMove = (e) => {
      // 0. Interactive SDN Cable Drawing
      if (sdnDraftRef.current && canvasInnerRef.current) {
        const cur = sdnDraftRef.current;
        const innerRect = canvasInnerRef.current.getBoundingClientRect();
        const cx = Math.round((e.clientX - innerRect.left) / zoomRef.current);
        const cy = Math.round((e.clientY - innerRect.top) / zoomRef.current);

        let snapX = cx;
        let snapY = cy;
        let targetKind = null;
        let targetId = null;
        let targetName = null;

        // Check compatible drop targets in geometry
        if (cur.sourceKind === 'vm') {
          const hitSub = Object.values(geometry.subnetBoxes).find(
            (sb) =>
              !sb.subnet.isUnattachedPool &&
              cx >= sb.x - 16 &&
              cx <= sb.x + sb.w + 16 &&
              cy >= sb.y - 16 &&
              cy <= sb.y + sb.h + 24
          );
          if (hitSub) {
            targetKind = 'subnet';
            targetId = hitSub.id;
            targetName = hitSub.subnet.name;
            snapX = Math.max(hitSub.x + 28, Math.min(hitSub.x + hitSub.w - 28, cur.x1));
            snapY = hitSub.y + hitSub.h;
          }
        } else if (cur.sourceKind === 'subnet') {
          const hitVm = geometry.vmBoxes.find(
            (vb) =>
              cx >= vb.x - 14 &&
              cx <= vb.x + vb.w + 14 &&
              cy >= vb.y - 20 &&
              cy <= vb.y + vb.h + 14
          );
          if (hitVm) {
            targetKind = 'vm';
            targetId = hitVm.id;
            targetName = hitVm.vm.name;
            snapX = hitVm.x + hitVm.w / 2;
            snapY = hitVm.y;
          } else {
            const hitRtr = geometry.routerBoxes.find(
              (rb) =>
                cx >= rb.x - 14 &&
                cx <= rb.x + rb.w + 14 &&
                cy >= rb.y - 14 &&
                cy <= rb.y + rb.h + 20
            );
            if (hitRtr) {
              targetKind = 'router';
              targetId = hitRtr.id;
              targetName = hitRtr.router.name;
              snapX = hitRtr.x + hitRtr.w / 2;
              snapY = hitRtr.y + hitRtr.h;
            }
          }
        } else if (cur.sourceKind === 'router') {
          const hitSub = Object.values(geometry.subnetBoxes).find(
            (sb) =>
              !sb.subnet.isUnattachedPool &&
              cx >= sb.x - 16 &&
              cx <= sb.x + sb.w + 16 &&
              cy >= sb.y - 20 &&
              cy <= sb.y + sb.h + 16
          );
          if (hitSub) {
            targetKind = 'subnet';
            targetId = hitSub.id;
            targetName = hitSub.subnet.name;
            snapX = Math.max(hitSub.x + 48, Math.min(hitSub.x + hitSub.w - 48, cur.x1));
            snapY = hitSub.y;
          } else {
            const hitWan = geometry.wanBoxes.find(
              (wb) =>
                cx >= wb.x - 14 &&
                cx <= wb.x + wb.w + 14 &&
                cy >= wb.y - 14 &&
                cy <= wb.y + wb.h + 20
            );
            if (hitWan) {
              targetKind = 'wan';
              targetId = hitWan.id;
              targetName = hitWan.network.name;
              snapX = cur.x1;
              snapY = hitWan.y + hitWan.h;
            }
          }
        }

        const nextDraft = {
          ...cur,
          x2: snapX,
          y2: snapY,
          targetKind,
          targetId,
          targetName,
        };
        sdnDraftRef.current = nextDraft;
        setSdnDraft(nextDraft);
        return;
      }

      // 1. Node dragging
      if (dragSessionRef.current) {
        const sess = dragSessionRef.current;
        const rawDx = e.clientX - sess.startX;
        const rawDy = e.clientY - sess.startY;
        if (!sess.moved && Math.hypot(rawDx, rawDy) >= 4) {
          sess.moved = true;
        }
        if (sess.moved) {
          const scaledDx = Math.round(rawDx / zoomRef.current);
          const scaledDy = Math.round(rawDy / zoomRef.current);
          setNodeOffsets((prev) => ({
            ...prev,
            [sess.dragKey]: {
              dx: sess.origDx + scaledDx,
              dy: sess.origDy + scaledDy,
            },
          }));
        }
        return;
      }

      // 2. Canvas background panning
      if (panSessionRef.current && canvasViewportRef.current) {
        const pan = panSessionRef.current;
        canvasViewportRef.current.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
        canvasViewportRef.current.scrollTop = pan.scrollTop - (e.clientY - pan.startY);
      }
    };

    const onPointerUp = () => {
      if (sdnDraftRef.current) {
        const finished = sdnDraftRef.current;
        sdnDraftRef.current = null;
        setSdnDraft(null);

        if (finished.sourceKind === 'vm' && finished.targetKind === 'subnet') {
          openSdnConnectModal({
            linkKind: 'vm-subnet',
            vmId: finished.sourceId,
            subnetId: finished.targetId,
          });
        } else if (finished.sourceKind === 'subnet' && finished.targetKind === 'vm') {
          openSdnConnectModal({
            linkKind: 'vm-subnet',
            vmId: finished.targetId,
            subnetId: finished.sourceId,
          });
        } else if (finished.sourceKind === 'subnet' && finished.targetKind === 'router') {
          openSdnConnectModal({
            linkKind: 'router-subnet',
            routerId: finished.targetId,
            subnetId: finished.sourceId,
          });
        } else if (finished.sourceKind === 'router' && finished.targetKind === 'subnet') {
          openSdnConnectModal({
            linkKind: 'router-subnet',
            routerId: finished.sourceId,
            subnetId: finished.targetId,
          });
        } else if (finished.sourceKind === 'router' && finished.targetKind === 'wan') {
          openSdnConnectModal({
            linkKind: 'wan-router',
            routerId: finished.sourceId,
            wanId: finished.targetId,
          });
        } else if (finished.sourceKind === 'vm') {
          // If dragged from a VM and released in open space, open SDN modal with that VM preselected
          openSdnConnectModal({
            linkKind: 'vm-subnet',
            vmId: finished.sourceId,
          });
        }
        return;
      }

      if (dragSessionRef.current) {
        const sess = dragSessionRef.current;
        if (!sess.moved && sess.onClickSelect) {
          sess.onClickSelect();
        }
        dragSessionRef.current = null;
        setDraggingKey(null);
      }
      if (panSessionRef.current) {
        panSessionRef.current = null;
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [geometry, openSdnConnectModal]);

  const handleConfirmSdnConnect = useCallback(async () => {
    if (!sdnModal) return;
    setSdnSubmitting(true);
    try {
      if (sdnModal.linkKind === 'vm-subnet') {
        const sub = model.subnetById[sdnModal.subnetId];
        if (!sdnModal.vmId || !sub) {
          message.warning(t('Please select both an Instance and a Target Subnet'));
          setSdnSubmitting(false);
          return;
        }
        const fixedIp = sdnModal.ipMode === 'fixed' ? String(sdnModal.fixedIp || '').trim() : '';
        try {
          if (fixedIp) {
            const portRes = await neutronApi.createPort({
              network_id: sub.networkId,
              fixed_ips: [{ subnet_id: sub.id, ip_address: fixedIp }],
            });
            const portId = portRes?.port?.id;
            if (portId) {
              await novaApi.createServerInterfaceV(sdnModal.vmId, {
                interfaceAttachment: { port_id: portId },
              });
            }
          } else {
            await novaApi.createServerInterfaceV(sdnModal.vmId, {
              interfaceAttachment: { net_id: sub.networkId },
            });
          }
          message.success(t('SDN Interface attached to instance successfully'));
          load();
        } catch (err) {
          const errMsg = err?.response?.data?.NeutronError?.message || err?.message;
          message.warning(errMsg ? `${t('SDN Overlay link added')}: ${errMsg}` : t('SDN Virtual Link connected on topology'));
        }
        persistSdnLinks((prev) => [
          ...prev.filter(
            (l) => !(l.kind === 'vm-subnet' && l.vmId === sdnModal.vmId && l.subnetId === sub.id)
          ),
          {
            id: `sdn-vm-${sdnModal.vmId}-sub-${sub.id}`,
            kind: 'vm-subnet',
            vmId: sdnModal.vmId,
            subnetId: sub.id,
            ipAddress: fixedIp || 'DHCP (SDN)',
          },
        ]);
      } else if (sdnModal.linkKind === 'router-subnet') {
        if (!sdnModal.routerId || !sdnModal.subnetId) {
          message.warning(t('Please select both a Router and a Subnet'));
          setSdnSubmitting(false);
          return;
        }
        try {
          await neutronApi.addRouterInterface(sdnModal.routerId, {
            subnet_id: sdnModal.subnetId,
          });
          message.success(t('Router interface connected to subnet'));
          load();
        } catch (err) {
          const errMsg = err?.response?.data?.NeutronError?.message || err?.message;
          message.warning(errMsg ? `${t('SDN Overlay link added')}: ${errMsg}` : t('SDN Router-Subnet link connected on topology'));
        }
        persistSdnLinks((prev) => [
          ...prev,
          {
            id: `sdn-rtr-${sdnModal.routerId}-sub-${sdnModal.subnetId}`,
            kind: 'router-subnet',
            routerId: sdnModal.routerId,
            subnetId: sdnModal.subnetId,
          },
        ]);
      } else if (sdnModal.linkKind === 'wan-router') {
        if (!sdnModal.routerId || !sdnModal.wanId) {
          message.warning(t('Please select both an External Network and a Router'));
          setSdnSubmitting(false);
          return;
        }
        try {
          await neutronApi.updateRouter(sdnModal.routerId, {
            external_gateway_info: { network_id: sdnModal.wanId },
          });
          message.success(t('External WAN Gateway connected to router'));
          load();
        } catch (err) {
          const errMsg = err?.response?.data?.NeutronError?.message || err?.message;
          message.warning(errMsg ? `${t('SDN Overlay link added')}: ${errMsg}` : t('SDN WAN-Router link connected on topology'));
        }
        persistSdnLinks((prev) => [
          ...prev,
          {
            id: `sdn-wan-${sdnModal.wanId}-rtr-${sdnModal.routerId}`,
            kind: 'wan-router',
            wanId: sdnModal.wanId,
            routerId: sdnModal.routerId,
          },
        ]);
      }
      setSdnModal(null);
    } finally {
      setSdnSubmitting(false);
    }
  }, [sdnModal, model.subnetById, load, persistSdnLinks]);

  const handleCanvasPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('[data-draggable-node="true"], [data-sdn-port="true"], button, a')) return;
    if (!canvasViewportRef.current) return;
    panSessionRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: canvasViewportRef.current.scrollLeft,
      scrollTop: canvasViewportRef.current.scrollTop,
    };
  };

  // Active Path Trace computation
  const activeFocus = hoveredItem || selectedItem;
  const activeTrace = useMemo(() => {
    const routerIds = new Set();
    const subnetIds = new Set();
    const wanIds = new Set();
    const vmIds = new Set();

    if (!activeFocus) return { routerIds, subnetIds, wanIds, vmIds };

    if (activeFocus.kind === 'router') {
      const r = model.allRouters.find((it) => it.id === activeFocus.id);
      if (r) {
        routerIds.add(r.id);
        if (r.extNetId) wanIds.add(r.extNetId);
        r.connectedSubnetIds.forEach((sid) => subnetIds.add(sid));
      }
    } else if (activeFocus.kind === 'subnet') {
      const s = model.subnetById[activeFocus.id];
      if (s) {
        subnetIds.add(s.id);
        s.connectedRouterIds.forEach((rid) => {
          routerIds.add(rid);
          const r = model.allRouters.find((it) => it.id === rid);
          if (r?.extNetId) wanIds.add(r.extNetId);
        });
      }
    } else if (activeFocus.kind === 'vm') {
      vmIds.add(activeFocus.id);
      const vm = model.serverItems.find((it) => it.id === activeFocus.id);
      if (vm) {
        vm.attachedSubnetIds.forEach((sid) => {
          subnetIds.add(sid);
          const s = model.subnetById[sid];
          (s?.connectedRouterIds || []).forEach((rid) => {
            routerIds.add(rid);
            const r = model.allRouters.find((it) => it.id === rid);
            if (r?.extNetId) wanIds.add(r.extNetId);
          });
        });
      }
    } else if (activeFocus.kind === 'wan') {
      wanIds.add(activeFocus.id);
      model.allRouters
        .filter((r) => r.extNetId === activeFocus.id)
        .forEach((r) => {
          routerIds.add(r.id);
          r.connectedSubnetIds.forEach((sid) => subnetIds.add(sid));
        });
    }

    return { routerIds, subnetIds, wanIds, vmIds };
  }, [activeFocus, model]);

  const toggleSubnetExpand = useCallback((subnetId, e) => {
    if (e) e.stopPropagation();
    setExpandedSubnets((prev) => {
      const next = new Set(prev);
      if (next.has(subnetId)) next.delete(subnetId);
      else next.add(subnetId);
      return next;
    });
    setCollapsedSubnets((prev) => {
      const next = new Set(prev);
      next.delete(subnetId);
      return next;
    });
  }, []);

  const toggleSubnetCollapse = useCallback((subnetId, e) => {
    if (e) e.stopPropagation();
    setCollapsedSubnets((prev) => {
      const next = new Set(prev);
      if (next.has(subnetId)) next.delete(subnetId);
      else next.add(subnetId);
      return next;
    });
  }, []);

  const handleFoldAllToggle = useCallback(() => {
    const allIds = model.allSubnetsFlat.map((s) => s.id);
    if (collapsedSubnets.size >= allIds.length && allIds.length > 0) {
      setCollapsedSubnets(new Set());
      setCompactMode(false);
    } else {
      setCollapsedSubnets(new Set(allIds));
      setExpandedSubnets(new Set());
    }
  }, [model.allSubnetsFlat, collapsedSubnets.size]);

  const canCreateRouter = checkActionPolicy(createRouterAction());
  const canCreateNetwork = checkActionPolicy(
    createNetworkAction({ isAdmin: false, projectId, hasAdminRole })
  );
  const canCreateInstance = checkActionPolicy({ policy: 'os_compute_api:servers:create' });

  const createMenuItems = [
    canCreateRouter && {
      key: 'create-router',
      icon: <ApartmentOutlined style={{ color: '#0068FF' }} />,
      label: t('Create Router'),
      onClick: () => handleAction(createRouterAction(), undefined),
    },
    canCreateNetwork && {
      key: 'create-network',
      icon: <GlobalOutlined style={{ color: '#0284C7' }} />,
      label: t('Create Network'),
      onClick: () =>
        handleAction(createNetworkAction({ isAdmin: false, projectId, hasAdminRole }), undefined),
    },
    canCreateInstance && {
      key: 'create-instance',
      icon: <DesktopOutlined style={{ color: '#059669' }} />,
      label: t('Create Instance'),
      onClick: () => navigate('/compute/instance/create'),
    },
  ].filter(Boolean);

  // Resolve currently inspected object for Right Drawer
  const inspectedData = useMemo(() => {
    if (!selectedItem) return null;
    if (selectedItem.kind === 'router') {
      const r = model.allRouters.find((it) => it.id === selectedItem.id);
      if (!r) return null;
      const connSubnets = r.connectedSubnetIds.map((sid) => model.subnetById[sid]).filter(Boolean);
      const attachedVms = [];
      const seen = new Set();
      connSubnets.forEach((s) => {
        s.vms.forEach((vm) => {
          if (!seen.has(vm.id)) {
            seen.add(vm.id);
            attachedVms.push({ ...vm, subnetName: s.name });
          }
        });
      });
      return { kind: 'router', router: r, connSubnets, attachedVms };
    }
    if (selectedItem.kind === 'subnet') {
      const s = model.subnetById[selectedItem.id];
      if (!s) return null;
      return {
        kind: 'subnet',
        subnet: s,
        attachedVms: s.vms.map((vm) => ({ ...vm, subnetName: s.name })),
      };
    }
    if (selectedItem.kind === 'vm') {
      const vm = model.serverItems.find((it) => it.id === selectedItem.id);
      if (!vm) return null;
      const attachedSubnets = vm.attachedSubnetIds.map((sid) => model.subnetById[sid]).filter(Boolean);
      return { kind: 'vm', vm, attachedSubnets };
    }
    if (selectedItem.kind === 'wan') {
      const wan = model.extNetworks.find((it) => it.id === selectedItem.id);
      if (!wan) return null;
      const connRouters = model.allRouters.filter((r) => r.extNetId === wan.id);
      return { kind: 'wan', wan, connRouters };
    }
    return null;
  }, [selectedItem, model]);

  const surfaceBg = isDark ? '#111827' : '#FFFFFF';
  const canvasBg = isDark ? '#0B1120' : '#F8FAFC';
  const borderCol = isDark ? '#1E293B' : '#E2E8F0';
  const cardBorder = isDark ? '#334155' : '#CBD5E1';
  const titleText = isDark ? '#F8FAFC' : '#0F172A';
  const subText = isDark ? '#94A3B8' : '#475569';

  const hasCustomPositions = Object.keys(nodeOffsets).length > 0;
  const isEmpty =
    !loading &&
    !(data?.networks || []).length &&
    !(data?.routers || []).length &&
    !(data?.servers || []).length;

  return (
    <div style={{ maxWidth: 1680, margin: '0 auto' }}>
      <Breadcrumb
        items={[{ title: t('Network') }, { title: t('Network Topology') }]}
        style={{ marginBottom: 12, fontSize: 13 }}
      />

      {/* ================= MAIN WORKSPACE CARD (v4 Enterprise Light) ================= */}
      <div
        style={{
          background: surfaceBg,
          border: `1px solid ${borderCol}`,
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
        }}
      >
        {/* ================= 1. TOP COMMAND HEADER BAR ================= */}
        <div
          style={{
            padding: '12px 18px',
            borderBottom: `1px solid ${borderCol}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            background: surfaceBg,
          }}
        >
          {/* Left: Title + Live Project Telemetry */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Tooltip title={leftOpen ? t('Hide Navigator') : t('Show Navigator')}>
              <Button
                type="text"
                aria-label={leftOpen ? t('Hide Navigator') : t('Show Navigator')}
                aria-expanded={leftOpen}
                icon={leftOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                onClick={() => setLeftOpen((v) => !v)}
              />
            </Tooltip>
            <div
              aria-hidden="true"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: isDark ? 'rgba(0, 104, 255, 0.15)' : '#EFF6FF',
                border: '1px solid #BFDBFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0068FF',
                fontSize: 18,
              }}
            >
              <NodeIndexOutlined />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: titleText, lineHeight: 1.2 }}>
                {t('Network Topology')}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: subText,
                  marginTop: 2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t('Project')}: <b style={{ color: titleText }}>{projectName}</b>
                {'  ·  '}
                <span style={{ color: '#059669', fontWeight: 600 }}>
                  {model.stats.activeInstances} {t('Active')}
                </span>
                {model.stats.shutoffInstances > 0 && (
                  <>
                    {'  ·  '}
                    <span style={{ color: '#64748B', fontWeight: 600 }}>
                      {model.stats.shutoffInstances} {t('Shutoff')}
                    </span>
                  </>
                )}
                {model.stats.totalErrors > 0 && (
                  <>
                    {'  ·  '}
                    <span style={{ color: '#DC2626', fontWeight: 700 }}>
                      {model.stats.totalErrors} {t('Error')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Center: Search + Show VMs + Reset Layout */}
          <Space wrap size={10}>
            <Input
              allowClear
              name="topologySearch"
              aria-label={t('Search IP, Subnet, Router, VM')}
              prefix={<SearchOutlined style={{ color: '#64748B' }} />}
              placeholder={t('Search IP, Subnet, Router, VM...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: 270, borderRadius: 8, fontSize: 13.5 }}
            />

            <Checkbox
              checked={showInstances}
              onChange={(e) => setShowInstances(e.target.checked)}
              style={{ fontSize: 13.5, fontWeight: 600 }}
            >
              {t('Show VMs')}
            </Checkbox>

            {hasCustomPositions && (
              <Button
                icon={<RetweetOutlined />}
                onClick={() => setNodeOffsets({})}
                style={{
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#0068FF',
                  borderColor: '#93C5FD',
                  background: '#EFF6FF',
                }}
              >
                {t('Reset Positions')}
              </Button>
            )}
          </Space>

          {/* Right: Refresh, Create Actions, Inspector Toggle */}
          <Space wrap size={8}>
            <Button
              icon={<ReloadOutlined />}
              onClick={load}
              loading={loading}
              style={{ borderRadius: 8, fontWeight: 600, fontSize: 13 }}
            >
              {t('Refresh')}
            </Button>

            {createMenuItems.length > 0 && (
              <Dropdown menu={{ items: createMenuItems }} trigger={['click']}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  style={{
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 13.5,
                    background: '#0068FF',
                  }}
                >
                  {t('Create')} <DownOutlined style={{ fontSize: 10 }} />
                </Button>
              </Dropdown>
            )}

            <Tooltip title={rightOpen ? t('Hide Inspector') : t('Show Inspector')}>
              <Button
                aria-label={rightOpen ? t('Hide Inspector') : t('Show Inspector')}
                aria-expanded={rightOpen}
                icon={rightOpen ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setRightOpen((v) => !v)}
                style={{ borderRadius: 8 }}
              />
            </Tooltip>
          </Space>
        </div>

        {/* ================= 2. SUB-HEADER: ROUTER FOCUS & FOLD CONTROLS ================= */}
        <div
          style={{
            padding: '8px 18px',
            borderBottom: `1px solid ${borderCol}`,
            background: isDark ? '#0F172A' : '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#64748B',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginRight: 4,
              }}
            >
              {t('Focus Router')}:
            </span>
            <Button
              size="small"
              type={focusRouterId === 'ALL' ? 'primary' : 'default'}
              onClick={() => setFocusRouterId('ALL')}
              style={{
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12.5,
                ...(focusRouterId === 'ALL' ? { background: '#0068FF' } : {}),
              }}
            >
              {t('All')} ({model.allRouters.length})
            </Button>
            {model.allRouters.slice(0, 6).map((r) => {
              const active = focusRouterId === r.id;
              return (
                <Button
                  key={r.id}
                  size="small"
                  onClick={() => {
                    setFocusRouterId(active ? 'ALL' : r.id);
                    setSelectedItem({ kind: 'router', id: r.id });
                  }}
                  style={{
                    borderRadius: 6,
                    fontWeight: active ? 700 : 500,
                    fontSize: 12.5,
                    background: active ? '#EFF6FF' : undefined,
                    borderColor: active ? '#60A5FA' : undefined,
                    color: active ? '#0052CC' : undefined,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: r.isError ? '#EF4444' : '#10B981',
                      marginRight: 6,
                    }}
                  />
                  {r.name}
                  <span className="font-mono" style={{ marginLeft: 6, fontSize: 11, opacity: 0.75 }}>
                    ({r.totalVms})
                  </span>
                </Button>
              );
            })}
          </div>

          <Space size={8}>
            <span style={{ fontSize: 12, color: '#64748B', marginRight: 4 }}>
              <DragOutlined style={{ marginRight: 4, color: '#0068FF' }} />
              {t('Drag items to move · Scroll wheel to Zoom · Drag SDN port to connect')}
            </span>

            <Button
              size="small"
              icon={<ApiOutlined />}
              onClick={() => openSdnConnectModal({ linkKind: 'vm-subnet' })}
              style={{
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12.5,
                color: '#0052CC',
                borderColor: '#93C5FD',
                background: isDark ? 'rgba(0, 104, 255, 0.18)' : '#EFF6FF',
              }}
            >
              + {t('Connect SDN')}
            </Button>

            {model.stats.totalErrors > 0 && (
              <Button
                size="small"
                danger={alertsOnly}
                onClick={() => setAlertsOnly((v) => !v)}
                style={{
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 12.5,
                  background: alertsOnly ? '#FEF2F2' : undefined,
                  borderColor: alertsOnly ? '#EF4444' : '#FECACA',
                  color: '#B91C1C',
                }}
              >
                <WarningFilled style={{ color: '#EF4444', marginRight: 4 }} />
                {t('Errors Only')} ({model.stats.totalErrors})
              </Button>
            )}

            <Button
              size="small"
              icon={
                collapsedSubnets.size >= model.allSubnetsFlat.length &&
                model.allSubnetsFlat.length > 0 ? (
                  <ExpandOutlined />
                ) : (
                  <CompressOutlined />
                )
              }
              onClick={handleFoldAllToggle}
              style={{ borderRadius: 6, fontWeight: 600, fontSize: 12.5 }}
            >
              {collapsedSubnets.size >= model.allSubnetsFlat.length &&
              model.allSubnetsFlat.length > 0
                ? t('Expand All Subnets')
                : t('Fold All Subnets')}
            </Button>
          </Space>
        </div>

        {/* ================= 3. THREE-PANE BODY WORKSPACE ================= */}
        <Spin spinning={loading}>
          <div style={{ display: 'flex', minHeight: 760, position: 'relative' }}>
            {/* ---------- LEFT PANE: QUICK CREATE & TOPOLOGY EXPLORER (248px) ---------- */}
            {leftOpen && (
              <div
                style={{
                  width: 248,
                  flexShrink: 0,
                  borderRight: `1px solid ${borderCol}`,
                  background: surfaceBg,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                {/* Quick Create 2x2 Grid (v4 style) */}
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#475569',
                      letterSpacing: '0.04em',
                      marginBottom: 8,
                    }}
                  >
                    {t('QUICK CREATE')}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {canCreateRouter && (
                      <Button
                        onClick={() => handleAction(createRouterAction(), undefined)}
                        style={{
                          height: 40,
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: 13,
                          color: '#0068FF',
                          background: isDark ? '#1E293B' : '#F8FAFC',
                        }}
                      >
                        + {t('Router')}
                      </Button>
                    )}
                    {canCreateNetwork && (
                      <Button
                        onClick={() =>
                          handleAction(
                            createNetworkAction({ isAdmin: false, projectId, hasAdminRole }),
                            undefined
                          )
                        }
                        style={{
                          height: 40,
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: 13,
                          color: '#0284C7',
                          background: isDark ? '#1E293B' : '#F8FAFC',
                        }}
                      >
                        + {t('Network')}
                      </Button>
                    )}
                    {canCreateInstance && (
                      <Button
                        onClick={() => navigate('/compute/instance/create')}
                        style={{
                          height: 40,
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: 13,
                          gridColumn: 'span 2',
                          background: isDark ? '#1E293B' : '#F8FAFC',
                        }}
                      >
                        + {t('Instance')}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Health Overview (3 Distinct States: Active, Shutoff, Error) */}
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#475569',
                      letterSpacing: '0.04em',
                      marginBottom: 8,
                    }}
                  >
                    {t('HEALTH OVERVIEW')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#065F46' }}>
                        ● {t('Active Instances')}
                      </span>
                      <span
                        className="font-mono"
                        style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}
                      >
                        {model.stats.activeInstances}
                      </span>
                    </div>

                    {model.stats.shutoffInstances > 0 && (
                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: isDark ? '#1E293B' : '#F1F5F9',
                          border: `1px solid ${cardBorder}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                          ○ {t('Shutoff / Stopped')}
                        </span>
                        <span
                          className="font-mono"
                          style={{ fontSize: 14, fontWeight: 700, color: '#475569' }}
                        >
                          {model.stats.shutoffInstances}
                        </span>
                      </div>
                    )}

                    {model.stats.totalErrors > 0 && (
                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
                          border: '1px solid #FECACA',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#991B1B' }}>
                          ▲ {t('Error State')}
                        </span>
                        <span
                          className="font-mono"
                          style={{ fontSize: 14, fontWeight: 700, color: '#DC2626' }}
                        >
                          {model.stats.totalErrors}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Topology Explorer Tree */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#475569',
                      letterSpacing: '0.04em',
                      marginBottom: 8,
                    }}
                  >
                    {t('TOPOLOGY EXPLORER')}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {model.allRouters.map((r) => {
                      const isSel = selectedItem?.kind === 'router' && selectedItem?.id === r.id;
                      const connSubs = r.connectedSubnetIds
                        .map((sid) => model.subnetById[sid])
                        .filter(Boolean);
                      return (
                        <div key={r.id}>
                          <div
                            onClick={() => setSelectedItem({ kind: 'router', id: r.id })}
                            style={{
                              padding: '7px 10px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              background: isSel
                                ? isDark
                                  ? 'rgba(0, 104, 255, 0.2)'
                                  : '#EFF6FF'
                                : isDark
                                  ? '#1E293B'
                                  : '#F8FAFC',
                              border: `1px solid ${isSel ? '#60A5FA' : borderCol}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                overflow: 'hidden',
                              }}
                            >
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: '50%',
                                  background: r.isError ? '#EF4444' : '#0068FF',
                                  flexShrink: 0,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 13.5,
                                  fontWeight: isSel ? 700 : 600,
                                  color: isSel ? '#0052CC' : titleText,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {r.name}
                              </span>
                            </div>
                            <span
                              className="font-mono"
                              style={{
                                fontSize: 11.5,
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: isDark ? '#0F172A' : '#FFFFFF',
                                border: '1px solid #BFDBFE',
                                color: '#0052CC',
                                flexShrink: 0,
                              }}
                            >
                              {r.totalVms} VM
                            </span>
                          </div>

                          {connSubs.length > 0 && (
                            <div
                              style={{
                                marginLeft: 12,
                                paddingLeft: 10,
                                borderLeft: '1.5px solid #CBD5E1',
                                marginTop: 4,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                              }}
                            >
                              {connSubs.map((s) => {
                                const subSel =
                                  selectedItem?.kind === 'subnet' && selectedItem?.id === s.id;
                                return (
                                  <div
                                    key={s.id}
                                    onClick={() => setSelectedItem({ kind: 'subnet', id: s.id })}
                                    style={{
                                      padding: '5px 8px',
                                      borderRadius: 6,
                                      cursor: 'pointer',
                                      background: subSel ? '#EFF6FF' : 'transparent',
                                      border: subSel
                                        ? '1px solid #93C5FD'
                                        : '1px solid transparent',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 13,
                                        fontWeight: subSel ? 700 : 500,
                                        color: subSel ? '#0052CC' : subText,
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                      }}
                                    >
                                      {s.name}
                                    </span>
                                    <span
                                      className="font-mono"
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: '0 6px',
                                        borderRadius: 4,
                                        background:
                                          s.errorVmCount > 0 ? '#FEF2F2' : '#EFF6FF',
                                        color: s.errorVmCount > 0 ? '#DC2626' : '#0052CC',
                                      }}
                                    >
                                      {s.vms.length}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ---------- CENTER PANE: VERTICAL TOP-TO-BOTTOM v4 CANVAS ---------- */}
            <div
              ref={canvasViewportRef}
              onPointerDown={handleCanvasPointerDown}
              style={{
                flex: 1,
                background: canvasBg,
                backgroundImage: isDark
                  ? 'radial-gradient(#334155 1px, transparent 1px)'
                  : 'radial-gradient(#CBD5E1 1.1px, transparent 1.1px)',
                backgroundSize: '24px 24px',
                overflow: 'auto',
                position: 'relative',
                padding: 16,
                cursor: draggingKey ? 'grabbing' : 'grab',
                userSelect: 'none',
              }}
            >
              {isEmpty ? (
                <div
                  style={{
                    height: 560,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Empty description={t('No network topology data in current project')} />
                </div>
              ) : (
                <div
                  style={{
                    position: 'relative',
                    width: geometry.width * zoom,
                    height: geometry.height * zoom,
                    margin: '0 auto',
                  }}
                >
                  <div
                    ref={canvasInnerRef}
                    style={{
                      position: 'relative',
                      width: geometry.width,
                      height: geometry.height,
                      transform: `scale(${zoom})`,
                      transformOrigin: '0 0',
                    }}
                  >
                    {/* Z-ORDER PASS 1: SOFT VPC CONTAINMENT ZONES */}
                    {geometry.vpcBoxes.map((vb) => {
                      const vpc = vb.vpc;
                      return (
                        <div key={vb.id}>
                          <div
                            style={{
                              position: 'absolute',
                              left: vb.x,
                              top: vb.y,
                              width: vb.w,
                              height: vb.h,
                              borderRadius: 12,
                              background: isDark
                                ? 'rgba(17, 24, 39, 0.7)'
                                : 'rgba(255, 255, 255, 0.72)',
                              border: `1.5px dashed ${
                                vpc.totalErrors > 0 ? '#FCA5A5' : '#CBD5E1'
                              }`,
                            }}
                          />
                          {/* Draggable VPC Header Pill */}
                          <div
                            data-draggable-node="true"
                            onPointerDown={(e) => startNodeDrag(e, vb.dragKey)}
                            style={{
                              position: 'absolute',
                              left: vb.x + 16,
                              top: vb.y - 13,
                              height: 26,
                              padding: '0 12px',
                              borderRadius: 6,
                              background: surfaceBg,
                              border: `1px solid ${cardBorder}`,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              fontSize: 13,
                              fontWeight: 700,
                              color: titleText,
                              cursor: draggingKey === vb.dragKey ? 'grabbing' : 'grab',
                              zIndex: 3,
                            }}
                          >
                            <span
                              style={{
                                width: 9,
                                height: 9,
                                borderRadius: '50%',
                                background: '#0068FF',
                              }}
                            />
                            <span>VPC: {vpc.name}</span>
                            {vpc.segId && (
                              <span
                                className="font-mono"
                                style={{ fontSize: 12, fontWeight: 500, color: subText }}
                              >
                                ({vpc.segType?.toUpperCase()} {vpc.segId})
                              </span>
                            )}
                            <DragOutlined style={{ fontSize: 12, color: '#94A3B8' }} />
                          </div>
                        </div>
                      );
                    })}

                    {/* Z-ORDER PASS 2: SMOOTH CUBIC BÉZIER CONNECTORS, SDN CABLES & IP PILLS */}
                    <svg
                      width={geometry.width}
                      height={geometry.height}
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        overflow: 'visible',
                        pointerEvents: 'none',
                        zIndex: sdnDraft ? 25 : 1,
                      }}
                    >
                      {geometry.edges.map((edge) => {
                        const isTraced =
                          edge.kind === 'wan-router'
                            ? activeTrace.routerIds.has(edge.routerId) &&
                              activeTrace.wanIds.has(edge.wanId)
                            : edge.kind === 'router-subnet'
                              ? activeTrace.routerIds.has(edge.routerId) &&
                                activeTrace.subnetIds.has(edge.subnetId)
                              : activeTrace.subnetIds.has(edge.subnetId) &&
                                (activeTrace.vmIds.size === 0 ||
                                  activeTrace.vmIds.has(edge.vmId));

                        const pillRatio = edge.kind === 'subnet-vm' ? 0.6 : 0.5;
                        const { d, pillCx, pillCy } = getSmoothConnectionGeometry(
                          edge.x1,
                          edge.y1,
                          edge.x2,
                          edge.y2,
                          pillRatio
                        );
                        const strokeColor = edge.isNoNicPool
                          ? '#6366F1'
                          : edge.vmState === 'error'
                            ? '#EF4444'
                            : edge.vmState === 'shutoff'
                              ? '#94A3B8'
                              : isTraced
                                ? '#0068FF'
                                : edge.color;

                        const pillW = Math.max(58, edge.pillText.length * 7.6 + 16);
                        const pillX = Math.round(pillCx - pillW / 2);
                        const pillY = Math.round(pillCy - 10);

                        return (
                          <g key={edge.id}>
                            {isTraced && edge.vmState !== 'shutoff' && (
                              <path
                                d={d}
                                fill="none"
                                stroke={edge.vmState === 'error' ? '#EF4444' : '#0068FF'}
                                strokeWidth={10}
                                strokeOpacity={0.14}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            )}
                            <path
                              d={d}
                              fill="none"
                              stroke={strokeColor}
                              strokeWidth={isTraced ? 2.6 : 2.1}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeDasharray={edge.dashed ? '6,4' : undefined}
                            />
                            <circle
                              cx={edge.x1}
                              cy={edge.y1}
                              r={4.5}
                              fill="#FFFFFF"
                              stroke={strokeColor}
                              strokeWidth={2}
                            />
                            <circle
                              cx={edge.x2}
                              cy={edge.y2}
                              r={4.5}
                              fill="#FFFFFF"
                              stroke={strokeColor}
                              strokeWidth={2}
                            />
                            {edge.pillText && (
                              <g transform={`translate(${pillX}, ${pillY})`}>
                                <rect
                                  x={0}
                                  y={0}
                                  width={pillW}
                                  height={20}
                                  rx={10}
                                  fill={
                                    edge.isNoNicPool
                                      ? '#EEF2FF'
                                      : edge.vmState === 'error'
                                        ? '#FEF2F2'
                                        : edge.vmState === 'shutoff'
                                          ? '#F8FAFC'
                                          : isTraced
                                            ? '#EFF6FF'
                                            : '#FFFFFF'
                                  }
                                  stroke={strokeColor}
                                  strokeWidth={1.2}
                                />
                                <text
                                  x={pillW / 2}
                                  y={14}
                                  fontFamily="'JetBrains Mono', monospace"
                                  fontSize={11.5}
                                  fontWeight={700}
                                  fill={
                                    edge.isNoNicPool
                                      ? '#4F46E5'
                                      : edge.vmState === 'error'
                                        ? '#DC2626'
                                        : edge.vmState === 'shutoff'
                                          ? '#475569'
                                          : '#0052CC'
                                  }
                                  textAnchor="middle"
                                >
                                  {edge.pillText}
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}

                      {/* LIVE INTERACTIVE SDN CABLE DRAFT WHILE DRAGGING */}
                      {sdnDraft &&
                        (() => {
                          const { d, pillCx, pillCy } = getSmoothConnectionGeometry(
                            sdnDraft.x1,
                            sdnDraft.y1,
                            sdnDraft.x2,
                            sdnDraft.y2,
                            0.5
                          );
                          const hasSnap = Boolean(sdnDraft.targetId);
                          const draftColor = hasSnap ? '#10B981' : '#0068FF';
                          const labelText = hasSnap
                            ? `SDN → ${sdnDraft.targetName}`
                            : t('Drop on target to connect SDN');
                          const lW = Math.max(120, labelText.length * 7.2 + 20);
                          return (
                            <g>
                              <path
                                d={d}
                                fill="none"
                                stroke={draftColor}
                                strokeWidth={9}
                                strokeOpacity={0.18}
                                strokeLinecap="round"
                              />
                              <path
                                d={d}
                                fill="none"
                                stroke={draftColor}
                                strokeWidth={2.8}
                                strokeDasharray="7,4"
                                strokeLinecap="round"
                              />
                              <circle
                                cx={sdnDraft.x1}
                                cy={sdnDraft.y1}
                                r={6}
                                fill="#FFFFFF"
                                stroke={draftColor}
                                strokeWidth={2.5}
                              />
                              <circle
                                cx={sdnDraft.x2}
                                cy={sdnDraft.y2}
                                r={6.5}
                                fill={draftColor}
                                stroke="#FFFFFF"
                                strokeWidth={2}
                              />
                              <g
                                transform={`translate(${Math.round(pillCx - lW / 2)}, ${Math.round(
                                  pillCy - 12
                                )})`}
                              >
                                <rect
                                  x={0}
                                  y={0}
                                  width={lW}
                                  height={24}
                                  rx={12}
                                  fill={hasSnap ? '#ECFDF5' : '#EFF6FF'}
                                  stroke={draftColor}
                                  strokeWidth={1.5}
                                />
                                <text
                                  x={lW / 2}
                                  y={16}
                                  fontFamily="'JetBrains Mono', monospace"
                                  fontSize={11.5}
                                  fontWeight={700}
                                  fill={hasSnap ? '#059669' : '#0052CC'}
                                  textAnchor="middle"
                                >
                                  {labelText}
                                </text>
                              </g>
                            </g>
                          );
                        })()}
                    </svg>

                    {/* Z-ORDER PASS 3: TIER 0 — EXTERNAL WAN BANNERS (Top Row) */}
                    {geometry.wanBoxes.map((wb) => {
                      const net = wb.network;
                      const isSel =
                        selectedItem?.kind === 'wan' && selectedItem?.id === net.id;
                      const isTraced = activeTrace.wanIds.has(net.id);
                      const firstSub = net.subnetObjs?.[0];
                      const gwCount = model.allRouters.filter(
                        (r) => r.extNetId === net.id
                      ).length;

                      return (
                        <div
                          key={wb.id}
                          data-draggable-node="true"
                          onPointerDown={(e) =>
                            startNodeDrag(e, wb.dragKey, () =>
                              setSelectedItem({ kind: 'wan', id: net.id })
                            )
                          }
                          onMouseEnter={() => setHoveredItem({ kind: 'wan', id: net.id })}
                          onMouseLeave={() => setHoveredItem(null)}
                          style={{
                            position: 'absolute',
                            left: wb.x,
                            top: wb.y,
                            width: wb.w,
                            height: wb.h,
                            borderRadius: 10,
                            background: isDark
                              ? '#1E293B'
                              : 'linear-gradient(90deg, #EFF6FF 0%, #F8FAFC 50%, #EFF6FF 100%)',
                            border: `${isSel || isTraced ? 2 : 1.6}px solid ${
                              isSel || isTraced ? '#0068FF' : '#93C5FD'
                            }`,
                            boxShadow:
                              draggingKey === wb.dragKey || isSel
                                ? `0 6px 14px ${activeShadowColor}`
                                : '0 2px 6px rgba(15, 23, 42, 0.04)',
                            padding: '0 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: draggingKey === wb.dragKey ? 'grabbing' : 'grab',
                            zIndex: draggingKey === wb.dragKey ? 20 : 2,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                background: '#0068FF',
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 18,
                              }}
                            >
                              <GlobalOutlined />
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: titleText,
                                }}
                              >
                                {t('External Network')} · {net.name || net.id}
                              </div>
                              <div
                                className="font-mono"
                                style={{
                                  fontSize: 12.5,
                                  fontWeight: 500,
                                  color: subText,
                                }}
                              >
                                CIDR:{' '}
                                <span style={{ color: '#0052CC', fontWeight: 700 }}>
                                  {firstSub?.cidr || '-'}
                                </span>
                                {firstSub?.gateway_ip ? `  ·  GW ${firstSub.gateway_ip}` : ''}
                              </div>
                            </div>
                          </div>

                          <Space size={8}>
                            <div
                              style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: surfaceBg,
                                border: '1px solid #BFDBFE',
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: titleText,
                              }}
                            >
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  background: '#10B981',
                                  marginRight: 6,
                                }}
                              />
                              {gwCount} {t('Gateways')}
                            </div>
                            <DragOutlined style={{ color: '#64748B', fontSize: 14 }} />
                          </Space>
                        </div>
                      );
                    })}

                    {/* Z-ORDER PASS 4: TIER 1 — VIRTUAL ROUTER APPLIANCE CARDS */}
                    {geometry.routerBoxes.map((rb) => {
                      const r = rb.router;
                      const isSel =
                        selectedItem?.kind === 'router' && selectedItem?.id === r.id;
                      const isTraced = activeTrace.routerIds.has(r.id);

                      return (
                        <div
                          key={rb.id}
                          data-draggable-node="true"
                          onPointerDown={(e) =>
                            startNodeDrag(e, rb.dragKey, () =>
                              setSelectedItem({ kind: 'router', id: r.id })
                            )
                          }
                          onMouseEnter={() => setHoveredItem({ kind: 'router', id: r.id })}
                          onMouseLeave={() => setHoveredItem(null)}
                          style={{
                            position: 'absolute',
                            left: rb.x,
                            top: rb.y,
                            width: rb.w,
                            height: rb.h,
                            borderRadius: 10,
                            background: surfaceBg,
                            border: `${isSel || isTraced ? 2.5 : 1.5}px solid ${
                              r.isError
                                ? '#EF4444'
                                : isSel || isTraced
                                  ? '#0068FF'
                                  : cardBorder
                            }`,
                            boxShadow:
                              draggingKey === rb.dragKey || isSel
                                ? `0 6px 14px ${activeShadowColor}`
                                : '0 2px 6px rgba(15, 23, 42, 0.04)',
                            padding: 3,
                            cursor: draggingKey === rb.dragKey ? 'grabbing' : 'grab',
                            zIndex: draggingKey === rb.dragKey ? 20 : 3,
                          }}
                        >
                          {/* Router Header Strip */}
                          <div
                            style={{
                              height: 25,
                              borderRadius: 7,
                              background:
                                isSel || isTraced
                                  ? isDark
                                    ? 'rgba(0, 104, 255, 0.25)'
                                    : '#EFF6FF'
                                  : isDark
                                    ? '#1E293B'
                                    : '#F8FAFC',
                              padding: '0 10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: isSel || isTraced ? '#0052CC' : '#475569',
                              }}
                            >
                              VIRTUAL ROUTER
                            </span>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: r.isError ? '#FEF2F2' : '#ECFDF5',
                                color: r.isError ? '#DC2626' : '#059669',
                              }}
                            >
                              {r.status}
                            </span>
                          </div>

                          {/* Router Body with 3D Isometric Cylinder Icon */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '6px 10px',
                            }}
                          >
                            <IsometricRouterGlyph active={isSel || isTraced || r.healthy} />
                            <div style={{ overflow: 'hidden', flex: 1 }}>
                              <div
                                style={{
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: titleText,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                                title={r.name}
                              >
                                {r.name}
                              </div>
                              <div
                                className="font-mono"
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: '#0052CC',
                                  marginTop: 1,
                                }}
                              >
                                SNAT: {r.extFixedIps[0] || '-'}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 500,
                                  color: subText,
                                }}
                              >
                                {r.connectedSubnetIds.length} {t('Subnets Connected')}
                              </div>
                            </div>
                          </div>

                          {/* Router Bottom SDN Port Handle (Drag to connect Subnet) */}
                          <Tooltip title={t('Drag to connect Router to Subnet (SDN)')}>
                            <div
                              data-sdn-port="true"
                              onPointerDown={(e) =>
                                startSdnCableDrag(e, {
                                  sourceKind: 'router',
                                  sourceId: r.id,
                                  sourceName: r.name,
                                  x1: rb.x + rb.w / 2,
                                  y1: rb.y + rb.h,
                                })
                              }
                              style={{
                                position: 'absolute',
                                left: '50%',
                                bottom: -8,
                                transform: 'translateX(-50%)',
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                background: '#0068FF',
                                border: '2px solid #FFFFFF',
                                boxShadow: '0 2px 5px rgba(0, 104, 255, 0.35)',
                                cursor: 'crosshair',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#FFFFFF',
                                fontSize: 10,
                                fontWeight: 700,
                                zIndex: 10,
                              }}
                            >
                              +
                            </div>
                          </Tooltip>
                        </div>
                      );
                    })}

                    {/* Z-ORDER PASS 5: TIER 2 — VIRTUAL SWITCH (SUBNET) FACEPLATES */}
                    {Object.values(geometry.subnetBoxes).map((sb) => {
                      const sub = sb.subnet;
                      const isSel =
                        selectedItem?.kind === 'subnet' && selectedItem?.id === sub.id;
                      const isTraced = activeTrace.subnetIds.has(sub.id);
                      const isSdnDropTarget =
                        sdnDraft &&
                        sdnDraft.targetKind === 'subnet' &&
                        sdnDraft.targetId === sub.id;
                      const accentColor = sub.isUnattachedPool
                        ? '#6366F1'
                        : sub.accentIndex === 0
                          ? '#0068FF'
                          : '#0284C7';
                      const tagBg = sub.isUnattachedPool
                        ? '#EEF2FF'
                        : sub.accentIndex === 0
                          ? '#EFF6FF'
                          : '#F0F9FF';

                      // Build RJ45 port bay LEDs (first LED = GW, next LEDs = VMs)
                      const portLeds = [
                        { id: 'gw', color: accentColor },
                        ...sub.vms.slice(0, 4).map((v) => ({
                          id: v.id,
                          color: v.isError
                            ? '#EF4444'
                            : v.isShutoff
                              ? '#94A3B8'
                              : '#10B981',
                        })),
                      ];
                      while (portLeds.length < 5) {
                        portLeds.push({ id: `empty-${portLeds.length}`, color: '#E2E8F0' });
                      }

                      return (
                        <React.Fragment key={sb.id}>
                          <div
                            data-draggable-node="true"
                            onPointerDown={(e) =>
                              startNodeDrag(e, sb.dragKey, () =>
                                setSelectedItem({ kind: 'subnet', id: sub.id })
                              )
                            }
                            onMouseEnter={() =>
                              setHoveredItem({ kind: 'subnet', id: sub.id })
                            }
                            onMouseLeave={() => setHoveredItem(null)}
                            style={{
                              position: 'absolute',
                              left: sb.x,
                              top: sb.y,
                              width: sb.w,
                              height: sb.h,
                              borderRadius: 9,
                              background: isSdnDropTarget
                                ? isDark
                                  ? 'rgba(16, 185, 129, 0.2)'
                                  : '#ECFDF5'
                                : surfaceBg,
                              border: `${
                                isSdnDropTarget || isSel || isTraced ? 2.2 : 1.6
                              }px ${sub.isUnattachedPool ? 'dashed' : 'solid'} ${
                                isSdnDropTarget
                                  ? '#10B981'
                                  : sub.errorVmCount > 0
                                    ? '#EF4444'
                                    : isSel || isTraced
                                      ? accentColor
                                      : sub.isUnattachedPool
                                        ? '#818CF8'
                                        : sub.accentIndex === 0
                                          ? '#60A5FA'
                                          : '#38BDF8'
                              }`,
                              borderLeft: `8px solid ${
                                isSdnDropTarget ? '#10B981' : accentColor
                              }`,
                              boxShadow: isSdnDropTarget
                                ? '0 0 0 4px rgba(16, 185, 129, 0.2)'
                                : draggingKey === sb.dragKey || isSel
                                  ? `0 6px 14px ${activeShadowColor}`
                                  : '0 2px 6px rgba(15, 23, 42, 0.04)',
                              padding: '0 10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: draggingKey === sb.dragKey ? 'grabbing' : 'grab',
                              zIndex: draggingKey === sb.dragKey ? 20 : 3,
                            }}
                          >
                            {/* Left: vSW Tag + Subnet Name + CIDR + GW */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: 56,
                                  height: 36,
                                  borderRadius: 6,
                                  background: tagBg,
                                  border: `1px solid ${
                                    sub.isUnattachedPool
                                      ? '#C7D2FE'
                                      : sub.accentIndex === 0
                                        ? '#BFDBFE'
                                        : '#BAE6FD'
                                  }`,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                <span
                                  className="font-mono"
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    color: sub.isUnattachedPool
                                      ? '#4F46E5'
                                      : sub.accentIndex === 0
                                        ? '#0052CC'
                                        : '#0369A1',
                                    lineHeight: 1.1,
                                  }}
                                >
                                  {sub.code}
                                </span>
                                <span
                                  style={{
                                    fontSize: 9.5,
                                    fontWeight: 600,
                                    color: accentColor,
                                    lineHeight: 1.1,
                                  }}
                                >
                                  {sub.isUnattachedPool ? 'SDN BUS' : 'SUBNET'}
                                </span>
                              </div>

                              <div style={{ overflow: 'hidden' }}>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 15,
                                      fontWeight: 700,
                                      color: titleText,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      maxWidth: 150,
                                    }}
                                    title={sub.name}
                                  >
                                    {sub.name}
                                  </span>
                                  {sub.cidr && sub.cidr !== '-' && (
                                    <span
                                      className="font-mono"
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 700,
                                        padding: '1px 7px',
                                        borderRadius: 5,
                                        background: tagBg,
                                        border: `1px solid ${
                                          sub.isUnattachedPool
                                            ? '#C7D2FE'
                                            : sub.accentIndex === 0
                                              ? '#93C5FD'
                                              : '#7DD3FC'
                                        }`,
                                        color: sub.isUnattachedPool
                                          ? '#4F46E5'
                                          : sub.accentIndex === 0
                                            ? '#0052CC'
                                            : '#0369A1',
                                      }}
                                    >
                                      {sub.cidr}
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 500,
                                    color: subText,
                                    marginTop: 2,
                                  }}
                                >
                                  {sub.isUnattachedPool ? (
                                    <span>
                                      {t('Drag VM SDN port to any Subnet to attach NIC')}
                                    </span>
                                  ) : (
                                    <>
                                      GW:{' '}
                                      <span
                                        className="font-mono"
                                        style={{ fontWeight: 600, color: titleText }}
                                      >
                                        {sub.gatewayIp}
                                      </span>
                                      {'  ·  '}
                                      {sub.dhcpEnabled ? 'DHCP On' : 'DHCP Off'}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Light-Mode RJ45 Port Bay + Fold Toggle */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  background: isDark ? '#1E293B' : '#F8FAFC',
                                  border: `1px solid ${borderCol}`,
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  {portLeds.map((led) => (
                                    <span
                                      key={led.id}
                                      style={{
                                        width: 12,
                                        height: 8,
                                        borderRadius: 2,
                                        background: led.color,
                                      }}
                                    />
                                  ))}
                                  <span
                                    className="font-mono"
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      marginLeft: 4,
                                      color:
                                        sub.errorVmCount > 0
                                          ? '#DC2626'
                                          : '#059669',
                                    }}
                                  >
                                    {sub.activeVmCount} UP
                                    {sub.shutoffVmCount > 0
                                      ? ` · ${sub.shutoffVmCount} OFF`
                                      : ''}
                                  </span>
                                </div>
                              </div>

                              <Button
                                type="text"
                                size="small"
                                aria-label={sb.isCollapsed ? t('Expand VMs') : t('Fold VMs')}
                                aria-expanded={!sb.isCollapsed}
                                onClick={(e) => toggleSubnetCollapse(sub.id, e)}
                                title={sb.isCollapsed ? t('Expand VMs') : t('Fold VMs')}
                                style={{
                                  padding: '0 4px',
                                  fontWeight: 700,
                                  color: accentColor,
                                }}
                              >
                                {sb.isCollapsed ? `▸ (${sub.vms.length})` : '▾'}
                              </Button>
                            </div>

                            {/* Subnet Bottom SDN Port Handle (Drag to connect VM) */}
                            {!sub.isUnattachedPool && (
                              <Tooltip title={t('Drag to connect Subnet to VM or Router (SDN)')}>
                                <div
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`${t('Connect Subnet')} ${sub.name} (SDN)`}
                                  data-sdn-port="true"
                                  onPointerDown={(e) =>
                                    startSdnCableDrag(e, {
                                      sourceKind: 'subnet',
                                      sourceId: sub.id,
                                      sourceName: sub.name,
                                      x1: sb.x + sb.w / 2,
                                      y1: sb.y + sb.h,
                                    })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openSdnConnectModal({
                                        linkKind: 'vm-subnet',
                                        subnetId: sub.id,
                                      });
                                    }
                                  }}
                                  style={{
                                    position: 'absolute',
                                    left: '50%',
                                    bottom: -8,
                                    transform: 'translateX(-50%)',
                                    width: 16,
                                    height: 16,
                                    borderRadius: '50%',
                                    background: accentColor,
                                    border: '2px solid #FFFFFF',
                                    boxShadow: '0 2px 5px rgba(0, 104, 255, 0.3)',
                                    cursor: 'crosshair',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#FFFFFF',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    zIndex: 10,
                                  }}
                                >
                                  +
                                </div>
                              </Tooltip>
                            )}
                          </div>

                          {/* Optional "+N more VMs" Expand/Collapse Pill below VM rows */}
                          {!sb.isCollapsed &&
                            (sb.hiddenCount > 0 ||
                              (sb.isExpanded && sub.vms.length > DEFAULT_VMS_PER_SUBNET)) && (
                              <div
                                role="button"
                                tabIndex={0}
                                aria-expanded={sb.isExpanded}
                                onClick={(e) => toggleSubnetExpand(sub.id, e)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggleSubnetExpand(sub.id, e);
                                  }
                                }}
                                style={{
                                  position: 'absolute',
                                  left: sb.x + 80,
                                  top: sb.foldBarY,
                                  width: sb.w - 160,
                                  height: 28,
                                  borderRadius: 14,
                                  background: surfaceBg,
                                  border: '1px dashed #60A5FA',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 12.5,
                                  fontWeight: 600,
                                  color: '#0068FF',
                                  cursor: 'pointer',
                                  zIndex: 4,
                                }}
                              >
                                {sb.isExpanded
                                  ? `▲ ${t('Collapse extra VMs')} (${DEFAULT_VMS_PER_SUBNET}/${sub.vms.length})`
                                  : `+ ${sb.hiddenCount} ${t('more instances')} · ${t('Click to Expand')} ▾`}
                              </div>
                            )}
                        </React.Fragment>
                      );
                    })}

                    {/* Z-ORDER PASS 6: TIER 3 — MEMOIZED COMPUTE VM APPLIANCE CARDS */}
                    {geometry.vmBoxes.map((vb) => {
                      const vmId = vb.vm.id;
                      const isSel =
                        selectedItem?.kind === 'vm' && selectedItem?.id === vmId;
                      const isTraced = activeTrace.vmIds.has(vmId);
                      const isSdnDropTarget = Boolean(
                        sdnDraft &&
                          sdnDraft.targetKind === 'vm' &&
                          sdnDraft.targetId === vmId
                      );
                      const isDragging = draggingKey === vb.dragKey;

                      return (
                        <VmCardNode
                          key={vb.key}
                          vb={vb}
                          isSel={isSel}
                          isTraced={isTraced}
                          isSdnDropTarget={isSdnDropTarget}
                          isDragging={isDragging}
                          isDark={isDark}
                          surfaceBg={surfaceBg}
                          cardBorder={cardBorder}
                          titleText={titleText}
                          subText={subText}
                          onStartNodeDrag={startNodeDrag}
                          onSelectVm={handleSelectVmNode}
                          onHoverVm={handleHoverVmNode}
                          onLeaveVm={handleLeaveNode}
                          onStartSdnCableDrag={startSdnCableDrag}
                          onOpenVmSdnModal={handleOpenVmSdnModal}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* FLOATING BOTTOM ZOOM & LEGEND BAR */}
              <div
                style={{
                  position: 'sticky',
                  bottom: 12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 'fit-content',
                  margin: '16px auto 0 auto',
                  padding: '6px 16px',
                  borderRadius: 22,
                  background: surfaceBg,
                  border: `1px solid ${cardBorder}`,
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  zIndex: 10,
                }}
              >
                <Space size={6}>
                  <Button
                    type="text"
                    size="small"
                    aria-label={t('Zoom Out')}
                    icon={<ZoomOutOutlined />}
                    onClick={() => {
                      const next = Math.max(0.35, Number((zoom - 0.1).toFixed(2)));
                      zoomRef.current = next;
                      setZoom(next);
                    }}
                  />
                  <Tooltip title={t('Use Mouse Wheel on canvas to zoom smoothly')}>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        minWidth: 48,
                        textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {Math.round(zoom * 100)}%
                    </span>
                  </Tooltip>
                  <Button
                    type="text"
                    size="small"
                    aria-label={t('Zoom In')}
                    icon={<ZoomInOutlined />}
                    onClick={() => {
                      const next = Math.min(2.2, Number((zoom + 0.1).toFixed(2)));
                      zoomRef.current = next;
                      setZoom(next);
                    }}
                  />
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      zoomRef.current = 1;
                      setZoom(1);
                      setNodeOffsets({});
                    }}
                    style={{ fontWeight: 600, fontSize: 12.5 }}
                  >
                    {t('Fit / Reset')}
                  </Button>
                </Space>

                <div style={{ width: 1, height: 18, background: borderCol }} />

                <Space size={14} style={{ fontSize: 12.5, fontWeight: 500, color: titleText }}>
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: '#10B981',
                        marginRight: 6,
                      }}
                    />
                    {t('Active')} ({model.stats.activeInstances})
                  </span>
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: '#94A3B8',
                        marginRight: 6,
                      }}
                    />
                    {t('Shutoff')} ({model.stats.shutoffInstances})
                  </span>
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: '#EF4444',
                        marginRight: 6,
                      }}
                    />
                    {t('Error')} ({model.stats.totalErrors})
                  </span>
                </Space>
              </div>
            </div>

            {/* ---------- RIGHT PANE: SEARCHABLE & PAGINATED INSPECTOR DRAWER (356px) ---------- */}
            {rightOpen && (
              <div
                style={{
                  width: 356,
                  flexShrink: 0,
                  borderLeft: `1px solid ${borderCol}`,
                  background: surfaceBg,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {!inspectedData ? (
                  <div style={{ padding: 32, textAlign: 'center', color: subText }}>
                    {t('Select any Router, Subnet, or Instance on the canvas to inspect.')}
                  </div>
                ) : inspectedData.kind === 'router' ? (
                  <RouterInspector
                    data={inspectedData}
                    inspectorSearch={inspectorSearch}
                    setInspectorSearch={setInspectorSearch}
                    inspectorPage={inspectorPage}
                    setInspectorPage={setInspectorPage}
                    onSelectVm={(id) => setSelectedItem({ kind: 'vm', id })}
                    onSelectSubnet={(id) => setSelectedItem({ kind: 'subnet', id })}
                    onAction={(act, item) => handleAction(act, item)}
                    titleText={titleText}
                    subText={subText}
                    borderCol={borderCol}
                    isDark={isDark}
                  />
                ) : inspectedData.kind === 'subnet' ? (
                  <SubnetInspector
                    data={inspectedData}
                    inspectorSearch={inspectorSearch}
                    setInspectorSearch={setInspectorSearch}
                    inspectorPage={inspectorPage}
                    setInspectorPage={setInspectorPage}
                    onSelectVm={(id) => setSelectedItem({ kind: 'vm', id })}
                    onOpenSdnModal={openSdnConnectModal}
                    titleText={titleText}
                    subText={subText}
                    borderCol={borderCol}
                    isDark={isDark}
                  />
                ) : inspectedData.kind === 'vm' ? (
                  <VmInspector
                    data={inspectedData}
                    onSelectSubnet={(id) => setSelectedItem({ kind: 'subnet', id })}
                    onOpenSdnModal={openSdnConnectModal}
                    titleText={titleText}
                    subText={subText}
                    borderCol={borderCol}
                    isDark={isDark}
                  />
                ) : (
                  <WanInspector
                    data={inspectedData}
                    onSelectRouter={(id) => setSelectedItem({ kind: 'router', id })}
                    titleText={titleText}
                    subText={subText}
                    borderCol={borderCol}
                    isDark={isDark}
                  />
                )}
              </div>
            )}
          </div>
        </Spin>
      </div>

      {/* ================= INTERACTIVE SDN LINK PROVISIONING MODAL ================= */}
      <Modal
        open={Boolean(sdnModal)}
        title={
          <Space>
            <ApiOutlined style={{ color: '#0068FF' }} />
            <span>{t('SDN Topology Link Provisioning')}</span>
          </Space>
        }
        onCancel={() => setSdnModal(null)}
        onOk={handleConfirmSdnConnect}
        confirmLoading={sdnSubmitting}
        okText={t('Connect SDN Link')}
        width={520}
      >
        {sdnModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                {t('Connection Type')}
              </div>
              <Radio.Group
                value={sdnModal.linkKind}
                onChange={(e) =>
                  setSdnModal((prev) => ({ ...prev, linkKind: e.target.value }))
                }
              >
                <Radio.Button value="vm-subnet">{t('Instance ↔ Subnet (Attach NIC)')}</Radio.Button>
                <Radio.Button value="router-subnet">{t('Router ↔ Subnet')}</Radio.Button>
                <Radio.Button value="wan-router">{t('WAN ↔ Router')}</Radio.Button>
              </Radio.Group>
            </div>

            {sdnModal.linkKind === 'vm-subnet' && (
              <>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    {t('Source Instance (VM)')}
                  </div>
                  <Select
                    style={{ width: '100%' }}
                    showSearch
                    optionFilterProp="label"
                    value={sdnModal.vmId}
                    onChange={(val) => setSdnModal((prev) => ({ ...prev, vmId: val }))}
                    options={model.serverItems.map((vm) => ({
                      value: vm.id,
                      label: `${vm.name} (${
                        vm.hasNic ? vm.fixedAddresses.join(', ') || 'NIC Attached' : 'No NIC'
                      })`,
                    }))}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    {t('Target vSwitch Subnet')}
                  </div>
                  <Select
                    style={{ width: '100%' }}
                    showSearch
                    optionFilterProp="label"
                    value={sdnModal.subnetId}
                    onChange={(val) => setSdnModal((prev) => ({ ...prev, subnetId: val }))}
                    options={model.allSubnetsFlat
                      .filter((s) => !s.isUnattachedPool)
                      .map((s) => ({
                        value: s.id,
                        label: `${s.name} (${s.cidr}) · VPC: ${s.networkName}`,
                      }))}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    {t('IPv4 Assignment Mode')}
                  </div>
                  <Radio.Group
                    value={sdnModal.ipMode}
                    onChange={(e) =>
                      setSdnModal((prev) => ({ ...prev, ipMode: e.target.value }))
                    }
                  >
                    <Radio value="dhcp">{t('Auto DHCP Allocation')}</Radio>
                    <Radio value="fixed">{t('Specify Fixed IP')}</Radio>
                  </Radio.Group>
                </div>

                {sdnModal.ipMode === 'fixed' && (
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                      {t('Fixed IPv4 Address')}
                    </div>
                    <Input
                      placeholder="e.g. 192.168.1.50"
                      value={sdnModal.fixedIp}
                      onChange={(e) =>
                        setSdnModal((prev) => ({ ...prev, fixedIp: e.target.value }))
                      }
                    />
                  </div>
                )}
              </>
            )}

            {sdnModal.linkKind === 'router-subnet' && (
              <>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    {t('Virtual Router')}
                  </div>
                  <Select
                    style={{ width: '100%' }}
                    value={sdnModal.routerId}
                    onChange={(val) => setSdnModal((prev) => ({ ...prev, routerId: val }))}
                    options={model.allRouters.map((r) => ({
                      value: r.id,
                      label: `${r.name} (${r.status})`,
                    }))}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    {t('Target Subnet')}
                  </div>
                  <Select
                    style={{ width: '100%' }}
                    value={sdnModal.subnetId}
                    onChange={(val) => setSdnModal((prev) => ({ ...prev, subnetId: val }))}
                    options={model.allSubnetsFlat
                      .filter((s) => !s.isUnattachedPool)
                      .map((s) => ({
                        value: s.id,
                        label: `${s.name} (${s.cidr})`,
                      }))}
                  />
                </div>
              </>
            )}

            {sdnModal.linkKind === 'wan-router' && (
              <>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    {t('External WAN Network')}
                  </div>
                  <Select
                    style={{ width: '100%' }}
                    value={sdnModal.wanId}
                    onChange={(val) => setSdnModal((prev) => ({ ...prev, wanId: val }))}
                    options={model.extNetworks.map((en) => ({
                      value: en.id,
                      label: en.name || en.id,
                    }))}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    {t('Virtual Router')}
                  </div>
                  <Select
                    style={{ width: '100%' }}
                    value={sdnModal.routerId}
                    onChange={(val) => setSdnModal((prev) => ({ ...prev, routerId: val }))}
                    options={model.allRouters.map((r) => ({
                      value: r.id,
                      label: `${r.name} (${r.status})`,
                    }))}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {actionModal}
    </div>
  );
}

/* ---------------- Right Drawer Sub-Inspectors ---------------- */
const PAGE_SIZE = 6;

const InspectorWorkloadRow = React.memo(
  ({ vm, onSelectVm, titleText, subText, borderCol, isDark, showSubnetName }) => (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${t('Inspect Instance')} ${vm.name} (${vm.status})`}
      onClick={() => onSelectVm(vm.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectVm(vm.id);
        }
      }}
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        background: vm.isError
          ? isDark
            ? 'rgba(239, 68, 68, 0.15)'
            : '#FEF2F2'
          : isDark
            ? '#1E293B'
            : '#FFFFFF',
        border: `1px solid ${vm.isError ? '#FCA5A5' : borderCol}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: vm.isError ? '#991B1B' : titleText,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: vm.isError
                ? '#EF4444'
                : vm.isShutoff
                  ? '#94A3B8'
                  : '#10B981',
              marginRight: 6,
            }}
          />
          {vm.name}
        </span>
        <Status status={String(vm.status)} />
      </div>
      <div className="font-mono" style={{ fontSize: 12, color: subText, marginTop: 4 }}>
        {showSubnetName
          ? `${vm.fixedAddresses.join(', ') || '-'} · ${vm.subnetName}`
          : `IP: ${vm.ipInSubnet || vm.fixedAddresses.join(', ') || t('No NIC')}`}
      </div>
    </div>
  )
);
InspectorWorkloadRow.displayName = 'InspectorWorkloadRow';

function RouterInspector({
  data,
  inspectorSearch,
  setInspectorSearch,
  inspectorPage,
  setInspectorPage,
  onSelectVm,
  onSelectSubnet,
  onAction,
  titleText,
  subText,
  borderCol,
  isDark,
}) {
  const { router, connSubnets, attachedVms } = data;
  const q = inspectorSearch.trim().toLowerCase();
  const filteredVms = useMemo(
    () =>
      attachedVms.filter(
        (v) =>
          !q ||
          v.name.toLowerCase().includes(q) ||
          v.fixedAddresses.some((ip) => ip.toLowerCase().includes(q)) ||
          v.floatingAddresses.some((ip) => ip.toLowerCase().includes(q))
      ),
    [attachedVms, q]
  );
  const pagedVms = useMemo(
    () => filteredVms.slice((inspectorPage - 1) * PAGE_SIZE, inspectorPage * PAGE_SIZE),
    [filteredVms, inspectorPage]
  );

  const canConnect = checkActionPolicy(connectSubnetAction(router.raw));
  const canDisconnect = checkActionPolicy(disconnectSubnetAction(router.raw));
  const canSetGw = checkActionPolicy(setGatewayAction());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: 16,
          background: isDark ? '#0F172A' : '#F8FAFC',
          borderBottom: `1px solid ${borderCol}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16.5, fontWeight: 700, color: titleText }}>{router.name}</div>
            <div className="font-mono" style={{ fontSize: 12, color: subText, marginTop: 2 }}>
              SNAT: {router.extFixedIps[0] || '-'} · {attachedVms.length} VMs
            </div>
          </div>
          <Tag color={router.isError ? 'error' : 'success'} style={{ fontWeight: 700 }}>
            {routerStatus()[router.status] || router.status}
          </Tag>
        </div>
        <div style={{ marginTop: 8 }}>
          <Link
            to={`/network/router/detail/${router.id}`}
            style={{ fontSize: 13, fontWeight: 600, color: '#0068FF' }}
          >
            {t('View Full Router Detail')} →
          </Link>
        </div>
      </div>

      {/* Connected Subnets Strip */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${borderCol}` }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: '#475569',
            letterSpacing: '0.04em',
            marginBottom: 8,
          }}
        >
          {t('CONNECTED SUBNETS')} ({connSubnets.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {connSubnets.map((s) => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectSubnet(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectSubnet(s.id);
                }
              }}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                background: isDark ? '#1E293B' : '#EFF6FF',
                border: '1px solid #93C5FD',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: '#0052CC',
              }}
            >
              {s.name} <span className="font-mono">({s.cidr})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Searchable & Paginated Workloads */}
      <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
        <Input
          allowClear
          size="small"
          name="routerWorkloadFilter"
          aria-label={t('Filter attached instances by name or IP')}
          prefix={<SearchOutlined style={{ color: '#64748B' }} />}
          placeholder={t('Filter attached instances by name or IP...')}
          value={inspectorSearch}
          onChange={(e) => {
            setInspectorSearch(e.target.value);
            setInspectorPage(1);
          }}
          style={{ marginBottom: 12, borderRadius: 6, fontSize: 12.5 }}
        />

        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: '#475569',
            letterSpacing: '0.04em',
            marginBottom: 8,
          }}
        >
          {t('ATTACHED WORKLOADS')} ({filteredVms.length})
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pagedVms.map((vm) => (
            <InspectorWorkloadRow
              key={vm.id}
              vm={vm}
              onSelectVm={onSelectVm}
              titleText={titleText}
              subText={subText}
              borderCol={borderCol}
              isDark={isDark}
              showSubnetName
            />
          ))}
        </div>

        {filteredVms.length > PAGE_SIZE && (
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <Pagination
              size="small"
              current={inspectorPage}
              pageSize={PAGE_SIZE}
              total={filteredVms.length}
              onChange={(p) => setInspectorPage(p)}
              showSizeChanger={false}
            />
          </div>
        )}
      </div>

      {/* Bottom Router Actions */}
      <div
        style={{
          padding: 14,
          borderTop: `1px solid ${borderCol}`,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        {canConnect && (
          <Button
            type="primary"
            onClick={() => onAction(connectSubnetAction(router.raw), router.raw)}
            style={{ borderRadius: 7, fontWeight: 600, background: '#0068FF' }}
          >
            + {t('Attach Subnet')}
          </Button>
        )}
        {canDisconnect && connSubnets.length > 0 && (
          <Button
            onClick={() => onAction(disconnectSubnetAction(router.raw), router.raw)}
            style={{ borderRadius: 7, fontWeight: 600 }}
          >
            {t('Detach Subnet')}
          </Button>
        )}
        {canSetGw && !router.raw?.external_gateway_info && (
          <Button
            onClick={() => onAction(setGatewayAction(), router.raw)}
            style={{ borderRadius: 7, fontWeight: 600 }}
          >
            {t('Open Gateway')}
          </Button>
        )}
      </div>
    </div>
  );
}

function SubnetInspector({
  data,
  inspectorSearch,
  setInspectorSearch,
  inspectorPage,
  setInspectorPage,
  onSelectVm,
  onOpenSdnModal,
  titleText,
  subText,
  borderCol,
  isDark,
}) {
  const { subnet, attachedVms } = data;
  const q = inspectorSearch.trim().toLowerCase();
  const filteredVms = useMemo(
    () =>
      attachedVms.filter(
        (v) =>
          !q ||
          v.name.toLowerCase().includes(q) ||
          v.fixedAddresses.some((ip) => ip.toLowerCase().includes(q))
      ),
    [attachedVms, q]
  );
  const pagedVms = useMemo(
    () => filteredVms.slice((inspectorPage - 1) * PAGE_SIZE, inspectorPage * PAGE_SIZE),
    [filteredVms, inspectorPage]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: 16,
          background: isDark ? '#0F172A' : '#F8FAFC',
          borderBottom: `1px solid ${borderCol}`,
        }}
      >
        <div style={{ fontSize: 16.5, fontWeight: 700, color: titleText }}>{subnet.name}</div>
        <div className="font-mono" style={{ fontSize: 12.5, color: '#0052CC', marginTop: 2 }}>
          CIDR: {subnet.cidr} · GW: {subnet.gatewayIp}
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          {subnet.networkId && subnet.networkId !== 'vpc-unattached' && (
            <Link
              to={`/network/networks/detail/${subnet.networkId}`}
              style={{ fontSize: 13, fontWeight: 600, color: '#0068FF' }}
            >
              {t('Open Network')}: {subnet.networkName} →
            </Link>
          )}
          {!subnet.isUnattachedPool && onOpenSdnModal && (
            <Button
              size="small"
              type="primary"
              icon={<ApiOutlined />}
              onClick={() =>
                onOpenSdnModal({ linkKind: 'vm-subnet', subnetId: subnet.id })
              }
              style={{ borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#0068FF' }}
            >
              + {t('Connect VM (SDN)')}
            </Button>
          )}
        </div>
      </div>

      <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
        <Input
          allowClear
          size="small"
          name="subnetWorkloadFilter"
          aria-label={t('Filter instances in this subnet')}
          prefix={<SearchOutlined style={{ color: '#64748B' }} />}
          placeholder={t('Filter instances in this subnet...')}
          value={inspectorSearch}
          onChange={(e) => {
            setInspectorSearch(e.target.value);
            setInspectorPage(1);
          }}
          style={{ marginBottom: 12, borderRadius: 6, fontSize: 12.5 }}
        />

        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: '#475569',
            letterSpacing: '0.04em',
            marginBottom: 8,
          }}
        >
          {t('SUBNET INSTANCES')} ({filteredVms.length})
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pagedVms.map((vm) => (
            <InspectorWorkloadRow
              key={vm.id}
              vm={vm}
              onSelectVm={onSelectVm}
              titleText={titleText}
              subText={subText}
              borderCol={borderCol}
              isDark={isDark}
              showSubnetName={false}
            />
          ))}
        </div>

        {filteredVms.length > PAGE_SIZE && (
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <Pagination
              size="small"
              current={inspectorPage}
              pageSize={PAGE_SIZE}
              total={filteredVms.length}
              onChange={(p) => setInspectorPage(p)}
              showSizeChanger={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function VmInspector({
  data,
  onSelectSubnet,
  onOpenSdnModal,
  titleText,
  subText,
  borderCol,
  isDark,
}) {
  const { vm, attachedSubnets } = data;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: 16,
          background: isDark ? '#0F172A' : '#F8FAFC',
          borderBottom: `1px solid ${borderCol}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: titleText }}>{vm.name}</div>
          <Status status={String(vm.status)} />
        </div>
        <div className="font-mono" style={{ fontSize: 12, color: subText, marginTop: 4 }}>
          UUID: {vm.id}
        </div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link
            to={`/compute/instance/detail/${vm.id}`}
            style={{ fontSize: 13, fontWeight: 600, color: '#0068FF' }}
          >
            {t('Open Instance Detail')} →
          </Link>
          {onOpenSdnModal && (
            <Button
              size="small"
              type="primary"
              icon={<ApiOutlined />}
              onClick={() => onOpenSdnModal({ linkKind: 'vm-subnet', vmId: vm.id })}
              style={{ borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#0068FF' }}
            >
              + {t('Connect SDN NIC')}
            </Button>
          )}
        </div>
      </div>

      <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: '#475569',
            letterSpacing: '0.04em',
            marginBottom: 8,
          }}
        >
          {t('NETWORK INTERFACES')} ({vm.nicCount})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!vm.hasNic && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: '#EEF2FF',
                border: '1px dashed #818CF8',
                fontSize: 12.5,
                color: '#4F46E5',
                fontWeight: 600,
              }}
            >
              {t('This instance has no NIC attached. Drag its SDN port to a Subnet or click "+ Connect SDN NIC" above.')}
            </div>
          )}
          {vm.fixedAddresses.map((ip) => (
            <div
              key={ip}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${borderCol}`,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12.5,
                fontWeight: 600,
                color: titleText,
              }}
            >
              Fixed IP: {ip}
            </div>
          ))}
          {vm.floatingAddresses.map((fip) => (
            <div
              key={fip}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12.5,
                fontWeight: 700,
                color: '#059669',
              }}
            >
              Floating IP: {fip}
            </div>
          ))}
        </div>

        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: '#475569',
            letterSpacing: '0.04em',
            marginTop: 18,
            marginBottom: 8,
          }}
        >
          {t('ATTACHED SUBNETS')} ({attachedSubnets.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {attachedSubnets.map((s) => (
            <div
              key={s.id}
              onClick={() => onSelectSubnet(s.id)}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #93C5FD',
                background: '#EFF6FF',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                color: '#0052CC',
              }}
            >
              {s.name} <span className="font-mono">({s.cidr})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WanInspector({ data, onSelectRouter, titleText, subText, borderCol, isDark }) {
  const { wan, connRouters } = data;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: 16,
          background: isDark ? '#0F172A' : '#F8FAFC',
          borderBottom: `1px solid ${borderCol}`,
        }}
      >
        <div style={{ fontSize: 16.5, fontWeight: 700, color: titleText }}>{wan.name}</div>
        <div className="font-mono" style={{ fontSize: 12, color: subText, marginTop: 4 }}>
          UUID: {wan.id}
        </div>
      </div>
      <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: '#475569',
            letterSpacing: '0.04em',
            marginBottom: 8,
          }}
        >
          {t('CONNECTED ROUTER GATEWAYS')} ({connRouters.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {connRouters.map((r) => (
            <div
              key={r.id}
              onClick={() => onSelectRouter(r.id)}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${borderCol}`,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 700, color: titleText }}>{r.name}</div>
              <div className="font-mono" style={{ fontSize: 12, color: '#0052CC', marginTop: 2 }}>
                SNAT: {r.extFixedIps[0] || '-'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
