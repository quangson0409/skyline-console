// End-to-end: scheduler service against an in-process fake Keystone + Cinder. No real cloud involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startService } from '../src/index.js';

const silent = () => {};
const SECRET = 'integration-test-secret-0123456789';
const USER = { 'X-Auth-Token': 'user-token' };

function startFake() {
  const state = { backups: [], volumes: { 'vol-aaaaaaaa': { id: 'vol-aaaaaaaa', status: 'available' }, 'vol-inuse01': { id: 'vol-inuse01', status: 'in-use' } }, seq: 0, created: [] };
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      const send = (code, json, headers = {}) => res.writeHead(code, { 'Content-Type': 'application/json', ...headers }).end(json ? JSON.stringify(json) : '');
      const base = `http://127.0.0.1:${server.address().port}`;
      const p = url.pathname;
      // ---- keystone
      if (p === '/v3/auth/tokens' && req.method === 'GET') {
        const t = req.headers['x-subject-token'];
        if (t === 'user-token') return send(200, { token: { user: { id: 'u1' }, project: { id: 'p1' }, roles: [{ name: 'member' }], expires_at: '2099-01-01T00:00:00Z' } });
        if (t === 'other-token') return send(200, { token: { user: { id: 'u2' }, project: { id: 'p2' }, roles: [{ name: 'member' }], expires_at: '2099-01-01T00:00:00Z' } });
        if (t === 'admin-token') return send(200, { token: { user: { id: 'u3' }, project: { id: 'p3' }, roles: [{ name: 'admin' }], expires_at: '2099-01-01T00:00:00Z' } });
        return send(401, { error: { message: 'nope' } });
      }
      if (p === '/v3/auth/tokens' && req.method === 'POST') {
        const ac = body.auth?.identity?.application_credential;
        if (ac?.id === 'ac1' && ac.secret === 'good') {
          return send(
            201,
            { token: { project: { id: 'p1' }, catalog: [{ type: 'volumev3', endpoints: [{ interface: 'public', region: 'RegionOne', url: `${base}/volume/v3/$(project_id)s` }] }] } },
            { 'X-Subject-Token': 'app-token' }
          );
        }
        return send(401, { error: { message: 'bad credential' } });
      }
      // ---- cinder
      if (p.startsWith('/volume/v3/p1/')) {
        if (req.headers['x-auth-token'] !== 'app-token') return send(401, {});
        const rest = p.slice('/volume/v3/p1'.length);
        let m;
        if ((m = rest.match(/^\/volumes\/(.+)$/)) && req.method === 'GET') {
          const v = state.volumes[m[1]];
          return v ? send(200, { volume: v }) : send(404, {});
        }
        if (rest === '/backups' && req.method === 'POST') {
          const r = body.backup;
          state.created.push(r);
          const bk = { id: `bk-${++state.seq}`, name: r.name, description: r.description, volume_id: r.volume_id, status: 'creating', polls: 0, has_dependent_backups: false, created_at: new Date(Date.now() + state.seq * 1000).toISOString() };
          state.backups.push(bk);
          return send(202, { backup: { id: bk.id, name: bk.name } });
        }
        if (rest === '/backups/detail' && req.method === 'GET') return send(200, { backups: state.backups.filter((b) => b.volume_id === url.searchParams.get('volume_id')) });
        if ((m = rest.match(/^\/backups\/(.+)$/))) {
          const b = state.backups.find((x) => x.id === m[1]);
          if (!b) return send(404, {});
          if (req.method === 'DELETE') {
            b.status = 'deleting';
            return send(202, null);
          }
          if (b.status === 'deleting') {
            state.backups = state.backups.filter((x) => x !== b);
            return send(404, {});
          }
          if (b.status === 'creating' && ++b.polls >= 2) b.status = 'available';
          return send(200, { backup: b });
        }
      }
      send(404, {});
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, state, url: `http://127.0.0.1:${server.address().port}` })));
}

const waitFor = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 100));
  }
};

test('scheduler end to end', async (t) => {
  const fake = await startFake();
  const dataDir = mkdtempSync(join(tmpdir(), 'bs-'));
  const env = {
    HOST: '127.0.0.1',
    PORT: '0',
    DATA_DIR: dataDir,
    KEYSTONE_URL: fake.url,
    SCHEDULER_SECRET: SECRET,
    TZ: 'UTC',
    TICK_SECONDS: '1',
    BACKUP_POLL_MS: '30',
    MIN_INTERVAL_MINUTES: '1',
  };
  let svc = await startService(env, silent);
  t.after(async () => {
    await svc.stop().catch(() => {});
    fake.server.close();
    fake.server.closeAllConnections?.();
    rmSync(dataDir, { recursive: true, force: true });
  });
  const api = async (method, path, { token = 'user-token', body } = {}) => {
    const res = await fetch(`http://127.0.0.1:${svc.server.address().port}/api/v1${path}`, {
      method,
      headers: { 'X-Auth-Token': token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };

  await t.test('refuses to start without SCHEDULER_SECRET', async () => {
    await assert.rejects(() => startService({ ...env, SCHEDULER_SECRET: '' }, silent), /SCHEDULER_SECRET/);
  });

  await t.test('auth', async () => {
    const res = await fetch(`http://127.0.0.1:${svc.server.address().port}/api/v1/schedules`);
    assert.equal(res.status, 401);
    assert.equal((await api('GET', '/schedules', { token: 'garbage' })).status, 401);
    assert.equal((await api('GET', '/schedules?all_projects=1')).status, 403);
  });

  await t.test('validation', async () => {
    const base = { name: 'n', volume_id: 'vol-aaaaaaaa', mode: 'full', cron: '0 * * * *', retention: { keep_last: 2 }, credential: { application_credential_id: 'ac1', secret: 'good' } };
    assert.equal((await api('POST', '/schedules', { body: { ...base, cron: 'nope' } })).status, 400);
    assert.equal((await api('POST', '/schedules', { body: { ...base, mode: 'x' } })).status, 400);
    assert.equal((await api('POST', '/schedules', { body: { ...base, retention: { keep_last: 0 } } })).status, 400);
    assert.equal((await api('POST', '/schedules', { body: { ...base, credential: { application_credential_id: 'ac1', secret: 'wrong' } } })).status, 400);
    assert.equal((await api('POST', '/schedules', { token: 'other-token', body: base })).status, 400); // credential is for p1
    const prev = await api('POST', '/cron/preview', { body: { cron: '0 3 * * *', count: 3 } });
    assert.equal(prev.json.next_runs.length, 3);
  });

  let schedule;
  await t.test('create hides the credential and scopes by project', async () => {
    const r = await api('POST', '/schedules', {
      body: { name: 'nightly', volume_id: 'vol-aaaaaaaa', mode: 'incremental', cron: '* * * * *', retention: { keep_last: 2 }, credential: { application_credential_id: 'ac1', secret: 'good' } },
    });
    assert.equal(r.status, 201);
    schedule = r.json.schedule;
    assert.equal(schedule.has_credential, true);
    assert.ok(!JSON.stringify(r.json).includes('good'));
    assert.ok(!('credential_enc' in schedule));
    assert.ok(schedule.next_run);
    const onDisk = readFileSync(join(dataDir, 'state.json'), 'utf8');
    assert.ok(!onDisk.includes('"good"') && !onDisk.includes('good"'), 'secret must be encrypted at rest');
    assert.equal((await api('GET', '/schedules')).json.schedules.length, 1);
    assert.equal((await api('GET', '/schedules', { token: 'other-token' })).json.schedules.length, 0);
    assert.equal((await api('GET', `/schedules/${schedule.id}`, { token: 'other-token' })).status, 404);
    assert.equal((await api('GET', '/schedules?all_projects=1', { token: 'admin-token' })).json.schedules.length, 1);
  });

  await t.test('timer fires a due schedule: backup created with tag and name', async () => {
    const s = svc.store.getSchedule(schedule.id);
    s.next_run = new Date(Date.now() - 1000).toISOString();
    svc.store.putSchedule(s);
    await waitFor(() => svc.store.listRuns(schedule.id).some((r) => r.status === 'success'));
    const run = svc.store.listRuns(schedule.id)[0];
    assert.equal(run.trigger, 'schedule');
    assert.ok(run.backup_id);
    assert.equal(fake.state.created.length, 1);
    const c = fake.state.created[0];
    assert.equal(c.description, `scheduler:${schedule.id}`);
    assert.equal(c.incremental, true);
    assert.equal(c.force, false);
    assert.match(c.name, /^nightly-\d{8}-\d{6}$/);
    assert.ok(Date.parse(svc.store.getSchedule(schedule.id).next_run) > Date.now());
  });

  await t.test('retention keeps newest 2 and never deletes foreign backups', async () => {
    fake.state.backups.push({ id: 'foreign', name: 'manual', description: '', volume_id: 'vol-aaaaaaaa', status: 'available', has_dependent_backups: false, created_at: '2000-01-01T00:00:00' });
    for (let i = 0; i < 3; i++) {
      const r = await api('POST', `/schedules/${schedule.id}/run`);
      assert.equal(r.status, 202);
      await waitFor(() => svc.store.listRuns(schedule.id).filter((x) => x.status !== 'running').length === 2 + i);
    }
    const mine = fake.state.backups.filter((b) => b.description === `scheduler:${schedule.id}`);
    assert.equal(mine.length, 2);
    assert.ok(fake.state.backups.some((b) => b.id === 'foreign'));
    const runs = (await api('GET', `/schedules/${schedule.id}/runs`)).json.runs;
    assert.ok(runs.length >= 4);
    assert.ok(runs.some((r) => r.deleted_backups.length));
  });

  await t.test('no overlapping runs', async () => {
    const first = await api('POST', `/schedules/${schedule.id}/run`);
    assert.equal(first.status, 202);
    const second = await api('POST', `/schedules/${schedule.id}/run`);
    assert.equal(second.status, 409);
    await waitFor(() => svc.store.listRuns(schedule.id)[0].status !== 'running');
  });

  await t.test('in-use volume needs force_in_use', async () => {
    const mk = (force) =>
      api('POST', '/schedules', {
        body: { name: 'inuse', volume_id: 'vol-inuse01', mode: 'full', cron: '0 * * * *', retention: { keep_last: 1 }, force_in_use: force, credential: { application_credential_id: 'ac1', secret: 'good' } },
      });
    const a = (await mk(false)).json.schedule;
    await api('POST', `/schedules/${a.id}/run`);
    await waitFor(() => svc.store.listRuns(a.id)[0].status === 'error');
    assert.match(svc.store.listRuns(a.id)[0].error, /in-use/);
    const b = (await mk(true)).json.schedule;
    await api('POST', `/schedules/${b.id}/run`);
    await waitFor(() => svc.store.listRuns(b.id)[0].status === 'success');
    assert.equal(fake.state.created.at(-1).force, true);
    await api('DELETE', `/schedules/${a.id}`);
    await api('DELETE', `/schedules/${b.id}`);
  });

  await t.test('patch: disable clears next_run, enable restores it', async () => {
    let r = await api('PATCH', `/schedules/${schedule.id}`, { body: { enabled: false } });
    assert.equal(r.json.schedule.enabled, false);
    assert.equal(r.json.schedule.next_run, null);
    r = await api('PATCH', `/schedules/${schedule.id}`, { body: { enabled: true, cron: '0 4 * * *', retention: { keep_last: 3 } } });
    assert.ok(r.json.schedule.next_run);
    assert.equal(r.json.schedule.retention.keep_last, 3);
  });

  await t.test('survives restart: state and encrypted credential persist, due schedule fires once', async () => {
    const before = fake.state.created.length;
    await svc.stop();
    const s = JSON.parse(readFileSync(join(dataDir, 'state.json'), 'utf8')).schedules[schedule.id];
    s.next_run = new Date(Date.now() - 5000).toISOString(); // became due while the service was down
    const { writeFileSync } = await import('node:fs');
    const st = JSON.parse(readFileSync(join(dataDir, 'state.json'), 'utf8'));
    st.schedules[schedule.id] = s;
    writeFileSync(join(dataDir, 'state.json'), JSON.stringify(st));

    svc = await startService(env, silent);
    const list = (await api('GET', '/schedules')).json.schedules;
    assert.equal(list.length, 1);
    assert.equal(list[0].id, schedule.id);
    await waitFor(() => fake.state.created.length === before + 1 && svc.store.listRuns(schedule.id)[0].status === 'success');
    assert.ok((await api('GET', `/schedules/${schedule.id}/runs`)).json.runs.length >= 5);
    // wrong secret cannot decrypt
    await svc.stop();
    svc = await startService({ ...env, SCHEDULER_SECRET: 'another-secret-another-secret' }, silent);
    await api('POST', `/schedules/${schedule.id}/run`);
    await waitFor(() => svc.store.listRuns(schedule.id)[0].status === 'error');
    await svc.stop();
    svc = await startService(env, silent);
  });

  await t.test('delete', async () => {
    assert.equal((await api('DELETE', `/schedules/${schedule.id}`)).status, 204);
    assert.equal((await api('GET', `/schedules/${schedule.id}`)).status, 404);
  });
});
