import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/mapper.js';
import { fieldNames, errorMessage, cleanPath } from '../src/redact.js';

const SRV = '3b8c8c52-0000-4000-8000-000000000001';
const api = (method, path, body) => classify({ kind: 'api', method, path, body });

test('GET / HEAD are never audited', () => {
  assert.equal(api('GET', `/api/openstack/regionone/nova/v2.1/servers/${SRV}`), null);
  assert.equal(api('HEAD', '/api/openstack/regionone/nova/v2.1/servers'), null);
});

test('nova server actions get readable names', () => {
  const r = api('POST', `/api/openstack/regionone/nova/v2.1/servers/${SRV}/action`, { reboot: { type: 'SOFT' } });
  assert.equal(r.action, 'Reboot Instance');
  assert.equal(r.resource_type, 'Instance');
  assert.equal(r.resource_id, SRV);
  assert.equal(api('POST', `/api/openstack/regionone/nova/v2.1/servers/${SRV}/action`, { reboot: { type: 'HARD' } }).action, 'Hard Reboot Instance');
  const snap = api('POST', `/api/openstack/regionone/nova/v2.1/servers/${SRV}/action`, { createImage: { name: 'snap-1' } });
  assert.equal(snap.action, 'Create Instance Snapshot');
  assert.equal(snap.resource_name, 'snap-1');
});

test('console url / policy POSTs are read-only and skipped', () => {
  assert.equal(api('POST', `/api/openstack/regionone/nova/v2.1/servers/${SRV}/remote-consoles`, { remote_console: {} }), null);
  assert.equal(api('POST', `/api/openstack/regionone/nova/v2.1/servers/${SRV}/action`, { 'os-getVNCConsole': { type: 'novnc' } }), null);
  assert.equal(api('POST', '/api/openstack/skyline/api/v1/policies', {}), null);
});

test('create / update / delete on other services', () => {
  const c = api('POST', '/api/openstack/regionone/neutron/v2.0/networks', { network: { name: 'net-1', admin_state_up: true } });
  assert.deepEqual([c.service, c.action, c.resource_name], ['neutron', 'Create Network', 'net-1']);
  const d = api('DELETE', '/api/openstack/regionone/cinder/v3/0123456789abcdef0123456789abcdef/volumes/3b8c8c52-0000-4000-8000-000000000002');
  assert.deepEqual([d.service, d.action, d.resource_id], ['cinder', 'Delete Volume', '3b8c8c52-0000-4000-8000-000000000002']);
  const u = api('PUT', '/api/openstack/regionone/neutron/v2.0/routers/3b8c8c52-0000-4000-8000-000000000003/add_router_interface', { subnet_id: 'x' });
  assert.equal(u.action, 'Add Router Interface (Router)');
  const lb = api('DELETE', '/api/openstack/regionone/octavia/v2/lbaas/loadbalancers/3b8c8c52-0000-4000-8000-000000000004');
  assert.deepEqual([lb.action, lb.resource_type], ['Delete Load Balancer', 'Load Balancer']);
});

test('skyline session events', () => {
  const l = api('POST', '/api/openstack/skyline/api/v1/login', { username: 'u', password: 'secret' });
  assert.equal(l.action, 'Login');
  assert.equal(l.login, true);
  assert.equal(l.resource_name, null);
});

test('swift objects and unknown paths', () => {
  const o = api('DELETE', '/api/openstack/regionone/swift/v1/AUTH_abc/cont/dir/x.txt');
  assert.deepEqual([o.action, o.resource_id, o.resource_name], ['Delete Object', 'dir/x.txt', 'cont']);
  assert.match(api('POST', '/api/something/else').action, /^POST /);
});

test('backup-scheduler routes', () => {
  const run = classify({ kind: 'scheduler', method: 'POST', path: '/scheduler-api/schedules/12/run' });
  assert.deepEqual([run.service, run.action, run.resource_id], ['backup-scheduler', 'Run Backup Schedule Now', '12']);
  const create = classify({ kind: 'scheduler', method: 'POST', path: '/scheduler-api/schedules', body: { name: 'nightly', credential: { secret: 'x' } } });
  assert.deepEqual([create.action, create.resource_name], ['Create Backup Schedule', 'nightly']);
  assert.equal(classify({ kind: 'scheduler', method: 'POST', path: '/scheduler-api/cron/preview' }), null);
  const bk = classify({ kind: 'cinder', method: 'POST', path: '/upstream/cinder/v3/0123456789abcdef0123456789abcdef/backups', body: { backup: { name: 'b' } } });
  assert.deepEqual([bk.service, bk.action], ['cinder', 'Create Volume Backup']);
});

test('redaction keeps field names only', () => {
  assert.deepEqual(fieldNames({ server: { name: 'a', adminPass: 'p', user_data: 'zzz', metadata: { k: 'v' } } }), ['server.adminPass', 'server.metadata', 'server.name', 'server.user_data']);
  assert.equal(cleanPath('/a/b?token=abc#x'), '/a/b');
  assert.equal(errorMessage({ error: { message: 'Quota exceeded' } }), 'Quota exceeded');
  assert.equal(errorMessage({ NeutronError: { message: 'bad cidr' } }), 'bad cidr');
});
