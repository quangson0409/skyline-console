import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startService } from '../src/index.js';
import { plan } from '../src/maintenance.js';

const SRV = '3b8c8c52-0000-4000-8000-000000000001';
const listen = (handler) =>
  new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
const readBody = (req) =>
  new Promise((resolve) => {
    const c = [];
    req.on('data', (d) => c.push(d));
    req.on('end', () => resolve(Buffer.concat(c)));
  });

const USERS = {
  'tok-admin': { id: 'u1', name: 'alice', roles: ['admin', 'member'] },
  'tok-user': { id: 'u2', name: 'bob', roles: ['member'] },
};
let keystone;
let upstream;
let scheduler;
let cinder;
let svc;
let base;
let upstreamSeen;

before(async () => {
  keystone = await listen((req, res) => {
    const u = USERS[req.headers['x-subject-token']];
    if (!u) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(
      JSON.stringify({
        token: {
          user: { id: u.id, name: u.name },
          project: { id: 'p1', name: 'demo' },
          roles: u.roles.map((n) => ({ name: n })),
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      })
    );
  });
  upstream = await listen(async (req, res) => {
    const body = await readBody(req);
    upstreamSeen = { method: req.method, url: req.url, body: body.toString(), auth: req.headers['x-auth-token'] };
    if (req.url.endsWith('/login')) {
      // a real Skyline compresses the profile when the client allows it: the proxy must ask for identity
      if (String(req.headers['accept-encoding'] || '').includes('gzip')) return res.writeHead(200, { 'content-encoding': 'gzip' }).end(Buffer.from([0x1f, 0x8b, 0, 0]));
      if (JSON.parse(body.toString() || '{}').username === 'bad') return res.writeHead(401, { 'content-type': 'application/json' }).end('{"detail":"Invalid credentials"}');
      return res.writeHead(200, { 'content-type': 'application/json' }).end('{"profile":{"projects":[]},"keystone_token":"tok-user"}');
    }
    if (req.url.includes('/switch_project/')) return res.writeHead(200, { 'content-type': 'application/json' }).end('{"keystone_token":"tok-admin"}');
    if (req.url.includes('/fail')) return res.writeHead(403, { 'content-type': 'application/json' }).end('{"forbidden":{"message":"Policy does not allow this"}}');
    if (req.url.includes('/big')) return res.writeHead(200).end(`size=${body.length}`);
    res.writeHead(req.method === 'POST' ? 202 : 200, { 'content-type': 'application/json', 'x-openstack-request-id': 'req-abc' });
    return res.end('{"ok":true}');
  });
  scheduler = await listen(async (req, res) => {
    await readBody(req);
    res.writeHead(201, { 'content-type': 'application/json' }).end(`{"path":"${req.url}"}`);
  });
  cinder = await listen(async (req, res) => {
    await readBody(req);
    res.writeHead(202, { 'content-type': 'application/json' }).end('{"backup":{}}');
  });
  const port = (s) => s.address().port;
  svc = await startService(
    {
      PORT: '0',
      HOST: '127.0.0.1',
      DB_DRIVER: 'sqlite',
      SQLITE_PATH: ':memory:',
      FLUSH_MS: '20',
      KEYSTONE_URL: `http://127.0.0.1:${port(keystone)}`,
      UPSTREAM_API: `http://127.0.0.1:${port(upstream)}`,
      UPSTREAM_SCHEDULER: `http://127.0.0.1:${port(scheduler)}`,
      UPSTREAM_CINDER: `http://127.0.0.1:${port(cinder)}`,
      AUDIT_INTERNAL_SECRET: 'shared-secret-for-tests',
    },
    () => {}
  );
  base = `http://127.0.0.1:${svc.server.address().port}`;
});

after(async () => {
  await svc.stop();
  for (const s of [keystone, upstream, scheduler, cinder]) s.close();
});

const call = (path, { method = 'GET', headers = {}, body } = {}) =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
const settle = () => svc.store.drain(2000);
const events = async (token, qs = '') => (await call(`/audit-api/events${qs}`, { headers: { 'x-auth-token': token } })).json();

test('GET is proxied and not audited', async () => {
  const r = await call(`/api/openstack/regionone/nova/v2.1/servers/${SRV}`, { headers: { 'x-auth-token': 'tok-admin' } });
  assert.equal(r.status, 200);
  await settle();
  assert.equal((await events('tok-admin')).events.length, 0);
});

test('POST action is forwarded untouched and audited with identity', async () => {
  const r = await call(`/api/openstack/regionone/nova/v2.1/servers/${SRV}/action`, {
    method: 'POST',
    headers: { 'x-auth-token': 'tok-admin', 'x-openstack-request-id': 'req-11111111-2222-3333-4444-555555555555', 'sec-fetch-mode': 'cors' },
    body: { reboot: { type: 'SOFT' } },
  });
  assert.equal(r.status, 202);
  assert.equal(upstreamSeen.body, '{"reboot":{"type":"SOFT"}}');
  assert.equal(upstreamSeen.auth, 'tok-admin');
  await settle();
  const e = (await events('tok-admin')).events[0];
  assert.equal(e.action, 'Reboot Instance');
  assert.equal(e.user_name, 'alice');
  assert.equal(e.project_name, 'demo');
  assert.equal(e.outcome, 'accepted');
  assert.equal(e.http_status, 202);
  assert.equal(e.resource_id, SRV);
  assert.equal(e.source, 'ui');
  assert.equal(e.request_id, 'req-11111111-2222-3333-4444-555555555555');
  assert.deepEqual(e.fields, ['reboot.type']);
});

test('failed request records the upstream error message', async () => {
  const r = await call('/api/openstack/regionone/neutron/v2.0/networks/fail', { method: 'DELETE', headers: { 'x-auth-token': 'tok-user' } });
  assert.equal(r.status, 403);
  await settle();
  const e = (await events('tok-admin', '?outcome=failed')).events[0];
  assert.equal(e.outcome, 'failed');
  assert.equal(e.error, 'Policy does not allow this');
  assert.equal(e.user_name, 'bob');
});

test('non-admin users only see their own events; admins see all', async () => {
  const mine = await events('tok-user');
  assert.ok(mine.events.length >= 1 && mine.events.every((e) => e.user_id === 'u2'));
  assert.equal(mine.is_admin, false);
  const all = await events('tok-admin');
  assert.ok(new Set(all.events.map((e) => e.user_id)).size >= 2);
});

test('audit API needs a valid token', async () => {
  assert.equal((await call('/audit-api/events')).status, 401);
  assert.equal((await call('/audit-api/events', { headers: { 'x-auth-token': 'nope' } })).status, 401);
});

test('login: identity comes from the returned token, body never stored', async () => {
  await call('/api/openstack/skyline/api/v1/login', { method: 'POST', headers: { 'accept-encoding': 'gzip, deflate' }, body: { username: 'carol', password: 'TopSecret!', region: 'RegionOne' } });
  await settle();
  const all = await events('tok-admin', '?action=Login');
  const e = all.events[0];
  assert.deepEqual([e.user_name, e.project_name, e.outcome], ['bob', 'demo', 'success']);
  assert.ok(!JSON.stringify(all).includes('TopSecret'));
});

test('failed login records the typed username', async () => {
  const r = await call('/api/openstack/skyline/api/v1/login', { method: 'POST', body: { username: 'bad', password: 'x' } });
  assert.equal(r.status, 401);
  await settle();
  const e = (await events('tok-admin', '?outcome=failed&action=Login')).events[0];
  assert.deepEqual([e.user_name, e.error], ['bad', 'Invalid credentials']);
});

test('switch_project is named and takes the project from the new token', async () => {
  await call('/api/openstack/skyline/api/v1/switch_project/99b1fbbf5b3a4b6486288d842a33781e', { method: 'POST', headers: { 'x-auth-token': 'tok-user' }, body: { project_domain_id: 'default' } });
  await settle();
  const e = (await events('tok-admin', '?action=Switch')).events[0];
  assert.deepEqual([e.action, e.resource_id, e.resource_name, e.user_name], ['Switch Project', '99b1fbbf5b3a4b6486288d842a33781e', 'demo', 'alice']);
});

test('large non-json uploads stream through', async () => {
  const big = Buffer.alloc(3 * 1024 * 1024, 7);
  const r = await fetch(`${base}/api/openstack/regionone/glance/v2/images/${SRV}/file/big`, {
    method: 'PUT',
    headers: { 'x-auth-token': 'tok-admin', 'content-type': 'application/octet-stream' },
    body: big,
  });
  assert.equal(await r.text(), `size=${big.length}`);
  await settle();
  assert.equal((await events('tok-admin', '?action=Image')).events.length >= 1, true);
});

test('scheduler route is rewritten to /api/v1 and audited', async () => {
  const r = await call('/scheduler-api/schedules', { method: 'POST', headers: { 'x-auth-token': 'tok-user' }, body: { name: 'nightly', credential: { secret: 'zzz' } } });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).path, '/api/v1/schedules');
  await settle();
  const e = (await events('tok-admin', '?service=backup-scheduler')).events[0];
  assert.deepEqual([e.action, e.resource_name, e.source], ['Create Backup Schedule', 'nightly', 'ui']);
  assert.ok(!JSON.stringify(e).includes('zzz'));
});

test('internal cinder route needs the shared secret and records the scheduler actor', async () => {
  const path = '/upstream/cinder/v3/0123456789abcdef0123456789abcdef/backups';
  assert.equal((await call(path, { method: 'POST', headers: { 'x-auth-token': 'tok-user' }, body: { backup: { name: 'b1' } } })).status, 403);
  const r = await call(path, {
    method: 'POST',
    headers: { 'x-auth-token': 'tok-user', 'x-audit-secret': 'shared-secret-for-tests', 'x-audit-actor': 'backup-scheduler', 'x-audit-on-behalf-of': 'schedule 12' },
    body: { backup: { name: 'b1' } },
  });
  assert.equal(r.status, 202);
  await settle();
  const e = (await events('tok-admin', '?source=scheduler')).events[0];
  assert.deepEqual([e.actor, e.on_behalf_of, e.action, e.user_name], ['backup-scheduler', 'schedule 12', 'Create Volume Backup (scheduled)', 'bob']);
});

test('trusted services can report their own events (scheduler run results)', async () => {
  const ev = { action: 'Backup Schedule Run (manual)', outcome: 'failed', error: 'volume is in-use and force_in_use is disabled', resource_type: 'Backup Schedule', resource_id: 'sch-1', resource_name: 'nightly', user_id: 'u2', project_id: 'p1', on_behalf_of: 'schedule sch-1', duration_ms: 480 };
  const post = (headers, body) => call('/audit-api/internal/events', { method: 'POST', headers, body });
  assert.equal((await post({}, ev)).status, 403);
  assert.equal((await post({ 'x-audit-secret': 'wrong' }, ev)).status, 403);
  assert.equal((await post({ 'x-audit-secret': 'shared-secret-for-tests' }, { nothing: true })).status, 400);
  const r = await post({ 'x-audit-secret': 'shared-secret-for-tests' }, { events: [ev, { action: 'Backup Volume (scheduled)', outcome: 'bogus' }] });
  assert.equal(r.status, 202);
  assert.equal((await r.json()).accepted, 2);
  await settle();
  const mine = await events('tok-admin', '?source=scheduler');
  const e = mine.events.find((x) => x.action === 'Backup Schedule Run (manual)');
  assert.deepEqual([e.outcome, e.error, e.actor, e.service, e.resource_name], ['failed', 'volume is in-use and force_in_use is disabled', 'backup-scheduler', 'backup-scheduler', 'nightly']);
  assert.equal(mine.events.find((x) => x.action === 'Backup Volume (scheduled)').outcome, 'success'); // unknown outcome falls back
});

test('upstream down gives 502 and a failed event', async () => {
  const s = await startService(
    { PORT: '0', HOST: '127.0.0.1', DB_DRIVER: 'sqlite', SQLITE_PATH: ':memory:', FLUSH_MS: '20', KEYSTONE_URL: 'http://127.0.0.1:1', UPSTREAM_API: 'http://127.0.0.1:1' },
    () => {}
  );
  const r = await fetch(`http://127.0.0.1:${s.server.address().port}/api/openstack/regionone/nova/v2.1/servers/${SRV}`, { method: 'DELETE', headers: { 'x-auth-token': 'x' } });
  assert.equal(r.status, 502);
  await s.store.drain(2000);
  const rows = (await s.store.query({}, { limit: 5 })).items;
  assert.deepEqual([rows[0].outcome, rows[0].error], ['failed', 'upstream unavailable']);
  await s.stop();
});

test('keyset paging', async () => {
  const first = await events('tok-admin', '?limit=2');
  assert.equal(first.events.length, 2);
  assert.equal(first.has_more, true);
  const second = await events('tok-admin', `?limit=2&before_id=${first.next_before_id}`);
  assert.ok(second.events.every((e) => e.id < first.next_before_id));
});

test('partition plan adds upcoming months and drops expired ones', () => {
  const p = plan({ existing: ['p202601', 'p202609', 'p202610', 'pmax'], now: new Date('2026-10-20T00:00:00Z'), retentionDays: 180 });
  assert.deepEqual(p.add.map((x) => x.name), ['p202611', 'p202612', 'p202701']);
  assert.deepEqual(p.add.map((x) => x.lessThan), ['2026-12-01', '2027-01-01', '2027-02-01']);
  assert.deepEqual(p.drop, ['p202601']);
});
