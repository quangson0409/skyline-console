import { neutronApi } from '@/api/neutron';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import { isIPv4 } from './ip';

const currentProjectId = () => useAuthStore.getState()?.currentProject?.id;

const safeList = async (promise, key) => {
  try {
    const res = await promise;
    return res?.[key] || [];
  } catch {
    return [];
  }
};

/* ---------------- floating IP helpers (legacy resources/neutron/floatingip + router) ---------------- */
const ROUTER_INTERFACE_OWNERS = [
  'network:router_interface_distributed',
  'network:router_interface',
  'network:ha_router_replicated_interface',
];

/** Builds the data needed by "Associate Floating IP": fixed IPs with reason + candidate FIPs per subnet */
export const loadAssociateFipData = async (port) => {
  const projectId = currentProjectId();
  const fixedIps = Array.isArray(port?.fixed_ips) ? port.fixed_ips : [];
  const [routers, routerPorts, externalNetworks, network, fipsOfPort] = await Promise.all([
    safeList(neutronApi.listRouters({ fields: ['id', 'external_gateway_info'], project_id: projectId }), 'routers'),
    safeList(neutronApi.listPorts({ device_owner: ROUTER_INTERFACE_OWNERS, fields: ['fixed_ips', 'device_id', 'device_owner'] }), 'ports'),
    safeList(neutronApi.listNetworks({ 'router:external': true }), 'networks'),
    port?.network_id
      ? neutronApi
          .getNetwork(port.network_id)
          .then((r) => r?.network)
          .catch(() => undefined)
      : undefined,
    Promise.all(
      fixedIps.map((f) =>
        isIPv4(f.ip_address)
          ? safeList(neutronApi.listFloatingIps({ fixed_ip_address: f.ip_address }), 'floatingips')
          : Promise.resolve([])
      )
    ),
  ]);
  // subnet -> router (routers with external gateway)
  const canReach = [];
  routerPorts.forEach((rp) => {
    const router = routers.find((r) => r.external_gateway_info && r.id === rp.device_id);
    if (router) (rp.fixed_ips || []).forEach((f) => canReach.push({ subnet_id: f.subnet_id, router_id: rp.device_id }));
  });
  const interfaces = fixedIps.map((f, idx) => {
    const isExternal = externalNetworks.some((n) => (n.subnets || []).includes(f.subnet_id));
    const bound = fipsOfPort[idx]?.[0];
    const floatingIP = (bound && bound.port_id === port.id && bound.floating_ip_address) || '';
    let available = true;
    let reason = '';
    if (!isIPv4(f.ip_address)) {
      reason = t('It is IPv6 type.');
      available = false;
    } else if (isExternal) {
      reason = t('Is external network port');
      available = false;
    } else if (floatingIP) {
      reason = `${t('Is associate to floating IP: ')} ${floatingIP}`;
      available = false;
    } else if (!canReach.some((c) => c.subnet_id === f.subnet_id)) {
      reason = t('It is unreachable for all floating IPs.');
      available = false;
    }
    return {
      fixed_ip_address: f.ip_address,
      subnet_id: f.subnet_id,
      mac_address: port.mac_address,
      network_name: network?.name || port.network_name || '',
      available,
      reason,
    };
  });
  // candidate FIPs per subnet (legacy getFipsFromRouterId)
  const extNetIds = Array.from(
    new Set(
      canReach
        .map((c) => routers.find((r) => r.id === c.router_id)?.external_gateway_info?.network_id)
        .filter(Boolean)
    )
  );
  const fipsByNet = {};
  await Promise.all(
    extNetIds.map(async (nid) => {
      const fips = await safeList(
        neutronApi.listFloatingIps({ floating_network_id: nid, status: 'DOWN', project_id: projectId }),
        'floatingips'
      );
      const netName = externalNetworks.find((n) => n.id === nid)?.name || nid;
      fipsByNet[nid] = fips
        .filter((fip) => !fip.fixed_ip_address && !fip.port_details)
        .map((fip) => ({ ...fip, network_name: netName }));
    })
  );
  const fipsForSubnet = (subnetId) => {
    const map = {};
    canReach
      .filter((c) => c.subnet_id === subnetId)
      .forEach((c) => {
        const nid = routers.find((r) => r.id === c.router_id)?.external_gateway_info?.network_id;
        (fipsByNet[nid] || []).forEach((fip) => {
          map[fip.id] = fip;
        });
      });
    return Object.values(map);
  };
  return { interfaces, fipsForSubnet };
};
