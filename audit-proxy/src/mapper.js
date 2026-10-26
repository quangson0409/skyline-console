/**
 * Request -> human readable audit record (service, resource type/id/name, action).
 * Works on the Skyline proxy paths  /api/openstack/<region>/<service>/<version>/...
 * and on the backup-scheduler / cinder internal routes. Unknown paths fall back to "METHOD path".
 */
import { cleanPath } from './redact.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX32 = /^[0-9a-f]{32}$/i;
const VERSION = /^v\d+(\.\d+)?$/;
const isId = (s) => UUID.test(s) || HEX32.test(s) || /^\d+$/.test(s);

/** collection segment -> label */
const TYPES = {
  servers: 'Instance',
  flavors: 'Flavor',
  'os-keypairs': 'Keypair',
  keypairs: 'Keypair',
  'os-aggregates': 'Host Aggregate',
  'os-server-groups': 'Server Group',
  'server-groups': 'Server Group',
  'os-hypervisors': 'Hypervisor',
  'os-services': 'Compute Service',
  'os-quota-sets': 'Quota',
  'os-volume_attachments': 'Volume Attachment',
  'os-interface': 'Network Interface',
  volumes: 'Volume',
  snapshots: 'Volume Snapshot',
  backups: 'Volume Backup',
  types: 'Volume Type',
  qos_specs: 'QoS Spec',
  'os-volume-transfer': 'Volume Transfer',
  attachments: 'Volume Attachment',
  groups: 'Group',
  networks: 'Network',
  subnets: 'Subnet',
  subnetpools: 'Subnet Pool',
  ports: 'Port',
  routers: 'Router',
  floatingips: 'Floating IP',
  'security-groups': 'Security Group',
  'security-group-rules': 'Security Group Rule',
  qos: 'QoS Policy',
  trunks: 'Trunk',
  agents: 'Network Agent',
  images: 'Image',
  tasks: 'Image Task',
  metadefs: 'Metadata Definition',
  users: 'User',
  projects: 'Project',
  domains: 'Domain',
  roles: 'Role',
  role_assignments: 'Role Assignment',
  regions: 'Region',
  services: 'Service',
  endpoints: 'Endpoint',
  credentials: 'Credential',
  application_credentials: 'Application Credential',
  stacks: 'Stack',
  loadbalancers: 'Load Balancer',
  listeners: 'Listener',
  pools: 'Pool',
  members: 'Pool Member',
  healthmonitors: 'Health Monitor',
  l7policies: 'L7 Policy',
  l7rules: 'L7 Rule',
  zones: 'DNS Zone',
  recordsets: 'DNS Record Set',
  secrets: 'Secret',
  containers: 'Container',
  orders: 'Order',
  shares: 'Share',
  'share-networks': 'Share Network',
  'share-servers': 'Share Server',
  'security-services': 'Security Service',
  queues: 'Queue',
  clusters: 'Cluster',
  clustertemplates: 'Cluster Template',
  segments: 'Failover Segment',
  notifications: 'Notification',
  instances: 'Database Instance',
  datastores: 'Datastore',
  schedules: 'Backup Schedule',
};

const titleCase = (s) =>
  String(s)
    .replace(/^os-/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** nova POST /servers/{id}/action body key -> action */
const NOVA_ACTIONS = {
  reboot: (b) => (b.reboot?.type === 'HARD' ? 'Hard Reboot Instance' : 'Reboot Instance'),
  'os-start': 'Start Instance',
  'os-stop': 'Stop Instance',
  pause: 'Pause Instance',
  unpause: 'Unpause Instance',
  suspend: 'Suspend Instance',
  resume: 'Resume Instance',
  lock: 'Lock Instance',
  unlock: 'Unlock Instance',
  shelve: 'Shelve Instance',
  shelveOffload: 'Shelve Offload Instance',
  unshelve: 'Unshelve Instance',
  rescue: 'Rescue Instance',
  unrescue: 'Unrescue Instance',
  resize: 'Resize Instance',
  confirmResize: 'Confirm Resize',
  revertResize: 'Revert Resize',
  rebuild: 'Rebuild Instance',
  createImage: 'Create Instance Snapshot',
  changePassword: 'Change Instance Password',
  migrate: 'Migrate Instance',
  'os-migrateLive': 'Live Migrate Instance',
  evacuate: 'Evacuate Instance',
  'os-resetState': 'Reset Instance State',
  forceDelete: 'Force Delete Instance',
  restore: 'Restore Instance',
  addSecurityGroup: 'Add Security Group',
  removeSecurityGroup: 'Remove Security Group',
  addFloatingIp: 'Associate Floating IP',
  removeFloatingIp: 'Disassociate Floating IP',
  trigger_crash_dump: 'Trigger Crash Dump',
};

/** read-only POSTs the console uses (policy checks, console url / output): never audited */
const READ_ONLY_POST = /(\/policies$|remote-consoles|os-getVNCConsole|os-getSPICEConsole|os-getSerialConsole|os-getRDPConsole|os-getConsoleOutput|\/cron\/preview$)/;
const READ_ONLY_BODY = /^(os-getVNCConsole|os-getSPICEConsole|os-getSerialConsole|os-getRDPConsole|os-getConsoleOutput)$/;

export const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const VERB = { POST: 'Create', PUT: 'Update', PATCH: 'Update', DELETE: 'Delete' };

/** first wrapped object in a nova/cinder/neutron style body: {"server": {...}} -> {...} */
function inner(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const keys = Object.keys(body);
  if (keys.length === 1 && body[keys[0]] && typeof body[keys[0]] === 'object' && !Array.isArray(body[keys[0]])) return body[keys[0]];
  return body;
}

const nameOf = (body) => {
  const o = inner(body);
  const v = o.name ?? o.display_name ?? o.title ?? o.username ?? o.fqdn;
  return typeof v === 'string' ? v.slice(0, 255) : null;
};

/**
 * Split a request path into { service, rest[] }.
 * kind: 'api' (Skyline /api/...), 'scheduler' (/scheduler-api/...), 'cinder' (/upstream/cinder/...)
 */
export function parsePath(kind, rawPath) {
  const segs = cleanPath(rawPath).split('/').filter(Boolean);
  if (kind === 'scheduler') return { service: 'backup-scheduler', rest: segs.slice(1).filter((s) => !VERSION.test(s) && s !== 'api') };
  if (kind === 'cinder') return { service: 'cinder', rest: segs.slice(2) };
  // /api/openstack/<region>/<service>/...   or   /api/openstack/skyline/api/v1/...
  if (segs[0] === 'api' && segs[1] === 'openstack') {
    if (segs[2] === 'skyline') return { service: 'skyline', rest: segs.slice(5) };
    return { service: segs[3] || 'unknown', rest: segs.slice(4) };
  }
  return { service: 'unknown', rest: segs.slice(1) };
}

function classifySwift(m, segs, out) {
  // segs: [AUTH_xxx, container, object...] (version already stripped)
  const rest = segs[0] && /^AUTH_/.test(segs[0]) ? segs.slice(1) : segs;
  const [container, ...obj] = rest;
  out.resource_type = obj.length ? 'Object' : 'Container';
  out.resource_id = obj.length ? obj.join('/') : container || null;
  out.resource_name = container || null;
  out.action = `${m === 'DELETE' ? 'Delete' : m === 'PUT' ? 'Create / Upload' : 'Update'} ${out.resource_type}`;
  return out;
}

/**
 * @returns {null | { service, action, resource_type, resource_id, resource_name, login? }}
 *          null = do not audit this request
 */
export function classify({ kind = 'api', method, path, body }) {
  const m = String(method).toUpperCase();
  if (!MUTATING.has(m)) return null;
  const clean = cleanPath(path);
  if (READ_ONLY_POST.test(clean)) return null;

  const { service, rest } = parsePath(kind, clean);
  const out = { service, action: '', resource_type: null, resource_id: null, resource_name: nameOf(body) };

  if (service === 'unknown') return { ...out, action: `${m} ${clean}` };

  if (service === 'skyline') {
    const [first, second] = rest;
    if (first === 'login') return { ...out, action: second === 'totp' ? 'Login (TOTP)' : 'Login', resource_type: 'session', login: true, resource_name: null };
    if (first === 'logout') return { ...out, action: 'Logout', resource_type: 'session', resource_name: null };
    if (first === 'switch_project') return { ...out, action: 'Switch Project', resource_type: 'project', resource_id: second || null, resource_name: null, session: true };
    return { ...out, action: `${m} ${clean}` };
  }

  let segs = rest.filter(Boolean);
  while (segs.length && (VERSION.test(segs[0]) || segs[0] === 'lbaas')) segs = segs.slice(1);
  // project id inside the URL (cinder /v3/<project>/volumes)
  if (segs.length && HEX32.test(segs[0]) && ['cinder', 'manilav2', 'trove', 'zaqar', 'masakari'].includes(service)) segs = segs.slice(1);
  if (service === 'swift') return classifySwift(m, segs, out);
  if (service === 'keystone' && segs[0] === 'auth' && segs[1] === 'tokens') {
    return { ...out, action: m === 'POST' ? 'Login (token request)' : `${m} token`, resource_type: 'session', resource_name: null, login: m === 'POST' };
  }

  const top = segs[0];
  if (!top) return { ...out, action: `${m} ${clean}` };
  out.resource_type = TYPES[top] || titleCase(top);
  const id = segs[1];
  out.resource_id = id && id !== 'detail' ? id : null;
  const sub = segs[2];
  const bodyKey = () => Object.keys(body && typeof body === 'object' ? body : {})[0];

  if (service === 'nova' && top === 'servers' && sub === 'action') {
    const key = bodyKey();
    if (READ_ONLY_BODY.test(key || '')) return null;
    const label = key && NOVA_ACTIONS[key];
    out.action = typeof label === 'function' ? label(body) : label || `Instance action: ${key || 'unknown'}`;
    // the body's name (createImage) is the new image, not the instance
    out.resource_name = key === 'createImage' && typeof body?.createImage?.name === 'string' ? body.createImage.name : null;
    return out;
  }
  if (service === 'cinder' && sub === 'action') {
    out.action = `${out.resource_type}: ${titleCase(bodyKey() || 'unknown')}`;
    out.resource_name = null;
    return out;
  }
  if (kind === 'scheduler' && sub === 'run') {
    out.action = 'Run Backup Schedule Now';
    out.resource_name = null;
    return out;
  }
  if (service === 'heat' && top === 'stacks') {
    // stacks/{name}/{id}[/actions|/snapshots...]
    out.resource_id = segs[2] && isId(segs[2]) ? segs[2] : segs[1] || null;
    out.resource_name = segs[1] && !isId(segs[1]) ? segs[1] : out.resource_name;
    const tail = segs.find((s, i) => i >= 2 && !isId(s));
    out.action = tail ? `${titleCase(tail)} Stack` : `${VERB[m]} Stack`;
    return out;
  }

  if (sub && !isId(sub)) {
    // PUT /routers/{id}/add_router_interface, POST /servers/{id}/os-volume_attachments ...
    const subLabel = TYPES[sub] || titleCase(sub);
    out.action = /^(add|remove|attach|detach|associate|disassociate)_/.test(sub)
      ? `${titleCase(sub)} (${out.resource_type})`
      : `${VERB[m]} ${subLabel} (${out.resource_type})`;
  } else if (m === 'POST' && out.resource_id) {
    out.action = `Run Action on ${out.resource_type}`;
  } else {
    out.action = `${VERB[m]} ${out.resource_type}`;
  }
  return out;
}
