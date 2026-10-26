import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { nextRun, nextRuns, parseCron } from './cron.js';
import { encrypt } from './crypto.js';
import { authenticateAppCredential, HttpError, validateToken } from './openstack.js';
import { normalizeRetention } from './retention.js';

const BASE = '/api/v1';
const MAX_BODY = 64 * 1024;

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const bad = (m) => new ApiError(400, 'bad_request', m);

/** Strip secrets from a stored schedule. */
export function publicSchedule(s) {
  const { credential_enc, ...rest } = s;
  return { ...rest, has_credential: Boolean(credential_enc) };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new ApiError(413, 'too_large', 'request body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
        resolve(v);
      } catch {
        reject(bad('body must be a JSON object'));
      }
    });
    req.on('error', reject);
  });
}

export function createApp({ cfg, store, key, runner, log }) {
  const tokenCache = new Map(); // sha256(token) -> { exp, identity }

  async function authenticate(req) {
    const token = req.headers['x-auth-token'];
    if (!token) throw new ApiError(401, 'unauthorized', 'X-Auth-Token header is required');
    const h = createHash('sha256').update(token).digest('hex');
    const hit = tokenCache.get(h);
    if (hit && hit.exp > Date.now()) return hit.identity;
    let identity;
    try {
      identity = await validateToken(cfg, token);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) throw new ApiError(401, 'unauthorized', e.message);
      throw new ApiError(502, 'keystone_unavailable', `cannot validate token: ${e.message}`);
    }
    if (!identity.project_id) throw new ApiError(403, 'forbidden', 'token must be project scoped');
    const exp = Math.min(Date.now() + 30000, Date.parse(identity.expires_at) || Infinity);
    tokenCache.set(h, { exp, identity });
    if (tokenCache.size > 500) for (const k of tokenCache.keys()) tokenCache.delete(k);
    return identity;
  }

  function visible(identity, url) {
    const all = url.searchParams.get('all_projects');
    const wantAll = all === '1' || all === 'true';
    const admin = identity.roles.includes(cfg.adminRole);
    if (wantAll && !admin) throw new ApiError(403, 'forbidden', 'all_projects requires the admin role');
    return wantAll;
  }

  function findSchedule(identity, id, all) {
    const s = store.getSchedule(id);
    if (!s || (!all && s.project_id !== identity.project_id)) throw new ApiError(404, 'not_found', 'schedule not found');
    return s;
  }

  function checkCron(expr) {
    let spec;
    try {
      spec = parseCron(expr);
    } catch (e) {
      throw bad(`invalid cron: ${e.message}`);
    }
    const runs = nextRuns(expr, Date.now(), 2, cfg.timezone);
    if (!runs.length) throw bad('cron never fires');
    if (runs.length > 1 && runs[1] - runs[0] < cfg.minIntervalMinutes * 60000) {
      throw bad(`cron fires more often than every ${cfg.minIntervalMinutes} minutes`);
    }
    return spec;
  }

  function validName(v) {
    if (typeof v !== 'string' || !v.trim() || v.length > 100) throw bad('name is required (max 100 characters)');
    return v.trim();
  }
  function validMode(v) {
    if (!['full', 'incremental'].includes(v)) throw bad("mode must be 'full' or 'incremental'");
    return v;
  }
  /** instances to back up: [{ id, name? }], 1..maxVms, unique; every volume attached to them is backed up */
  function validVms(v) {
    if (!Array.isArray(v) || !v.length) throw bad('vms must be a non-empty list of instances');
    if (v.length > cfg.maxVms) throw bad(`a schedule can back up at most ${cfg.maxVms} instances`);
    const seen = new Set();
    return v.map((x) => {
      const id = typeof x === 'string' ? x : x?.id;
      if (typeof id !== 'string' || !/^[0-9a-zA-Z-]{8,64}$/.test(id)) throw bad('every vms entry needs a valid instance id');
      if (seen.has(id)) throw bad(`instance ${id} is listed twice`);
      seen.add(id);
      const name = typeof x === 'object' && typeof x.name === 'string' ? x.name.slice(0, 255) : '';
      return { id, name };
    });
  }
  /** max minutes to wait for the backup to become available (null/undefined = service default BACKUP_WAIT_SECONDS) */
  function validTimeout(v) {
    if (v === null || v === undefined || v === '') return null;
    if (!Number.isInteger(v) || v < 5 || v > 2880) throw bad('timeout_minutes must be an integer between 5 and 2880');
    return v;
  }
  /** Proxmox style prune options: keep_last / keep_hourly / keep_daily / keep_weekly / keep_monthly / keep_yearly / keep_all */
  function validKeep(r) {
    try {
      return normalizeRetention(r);
    } catch (e) {
      throw bad(e.message);
    }
  }
  async function validCredential(c, identity) {
    if (!c || typeof c.application_credential_id !== 'string' || typeof c.secret !== 'string' || !c.application_credential_id || !c.secret) {
      throw bad('credential.application_credential_id and credential.secret are required');
    }
    try {
      const session = await authenticateAppCredential(cfg, c);
      if (session.projectId !== identity.project_id) throw bad('application credential belongs to a different project');
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw bad(`application credential rejected: ${e.message}`);
    }
    return encrypt(key, JSON.stringify({ application_credential_id: c.application_credential_id, secret: c.secret }));
  }

  async function handle(req, res, url) {
    const path = url.pathname;
    if (!path.startsWith(BASE)) throw new ApiError(404, 'not_found', 'not found');
    const parts = path.slice(BASE.length).split('/').filter(Boolean);
    const method = req.method;

    if (parts[0] === 'health' && method === 'GET') return [200, { status: 'ok', timezone: cfg.timezone, time: new Date().toISOString() }];

    const identity = await authenticate(req);

    if (parts[0] === 'cron' && parts[1] === 'preview' && method === 'POST') {
      const body = await readBody(req);
      try {
        parseCron(String(body.cron));
      } catch (e) {
        return [200, { valid: false, error: e.message, next_runs: [] }];
      }
      const count = Math.min(Math.max(Number(body.count) || 3, 1), 10);
      return [
        200,
        {
          valid: true,
          timezone: cfg.timezone,
          next_runs: nextRuns(String(body.cron), Date.now(), count, cfg.timezone).map((n) => new Date(n).toISOString()),
        },
      ];
    }

    if (parts[0] !== 'schedules') throw new ApiError(404, 'not_found', 'not found');

    if (parts.length === 1) {
      if (method === 'GET') {
        const all = visible(identity, url);
        const list = store
          .listSchedules()
          .filter((s) => all || s.project_id === identity.project_id)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .map(publicSchedule);
        return [200, { schedules: list, timezone: cfg.timezone }];
      }
      if (method === 'POST') {
        const b = await readBody(req);
        const name = validName(b.name);
        // either instances (back up every attached volume) or a single volume (older schedules / API users)
        const hasVms = b.vms !== undefined;
        if (hasVms && b.volume_id !== undefined) throw bad('give either vms or volume_id, not both');
        const vms = hasVms ? validVms(b.vms) : null;
        if (!hasVms && (typeof b.volume_id !== 'string' || !/^[0-9a-zA-Z-]{8,64}$/.test(b.volume_id))) throw bad('vms (instances) or volume_id is required');
        const mode = validMode(b.mode);
        if (typeof b.cron !== 'string') throw bad('cron is required');
        const spec = checkCron(b.cron);
        const retention = validKeep(b.retention);
        const credential_enc = await validCredential(b.credential, identity);
        const now = new Date().toISOString();
        const enabled = b.enabled !== false;
        const n = enabled ? nextRun(spec, Date.now(), cfg.timezone) : null;
        const s = {
          id: randomUUID(),
          name,
          project_id: identity.project_id,
          ...(vms ? { vms, volume_id: null } : { volume_id: b.volume_id }),
          mode,
          cron: spec.expr,
          retention,
          enabled,
          force_in_use: vms ? true : b.force_in_use === true, // attached volumes are always in-use
          timeout_minutes: validTimeout(b.timeout_minutes),
          application_credential_id: b.credential.application_credential_id,
          credential_enc,
          created_by: identity.user_id,
          created_at: now,
          updated_at: now,
          next_run: n ? new Date(n).toISOString() : null,
          last_run: null,
        };
        store.putSchedule(s);
        log('info', `schedule ${s.id} (${s.name}) created by ${identity.user_id} in project ${s.project_id}`);
        return [201, { schedule: publicSchedule(s) }];
      }
      throw new ApiError(405, 'method_not_allowed', 'method not allowed');
    }

    const all = visible(identity, url);
    const id = parts[1];

    if (parts.length === 2) {
      const s = findSchedule(identity, id, all);
      if (method === 'GET') return [200, { schedule: publicSchedule(s) }];
      if (method === 'DELETE') {
        if (runner.running.has(id)) throw new ApiError(409, 'conflict', 'a run is in progress; try again when it finishes');
        store.deleteSchedule(id);
        log('info', `schedule ${id} deleted by ${identity.user_id}`);
        return [204, null];
      }
      if (method === 'PATCH') {
        const b = await readBody(req);
        let reschedule = false;
        if (b.name !== undefined) s.name = validName(b.name);
        if (b.mode !== undefined) s.mode = validMode(b.mode);
        if (b.retention !== undefined) s.retention = validKeep(b.retention);
        if (b.force_in_use !== undefined) s.force_in_use = b.force_in_use === true;
        if (b.vms !== undefined) {
          if (!s.vms) throw bad('this schedule backs up a single volume; create a new schedule to back up instances');
          s.vms = validVms(b.vms);
        }
        if (b.timeout_minutes !== undefined) s.timeout_minutes = validTimeout(b.timeout_minutes);
        if (b.cron !== undefined) {
          if (typeof b.cron !== 'string') throw bad('cron must be a string');
          s.cron = checkCron(b.cron).expr;
          reschedule = true;
        }
        if (b.enabled !== undefined) {
          const en = b.enabled === true;
          if (en !== s.enabled) reschedule = true;
          s.enabled = en;
        }
        if (b.credential !== undefined) {
          s.credential_enc = await validCredential(b.credential, { project_id: s.project_id });
          s.application_credential_id = b.credential.application_credential_id;
        }
        if (reschedule) s.next_run = null;
        s.updated_at = new Date().toISOString();
        runner.refreshNextRun(s);
        return [200, { schedule: publicSchedule(s) }];
      }
      throw new ApiError(405, 'method_not_allowed', 'method not allowed');
    }

    if (parts.length === 3 && parts[2] === 'runs' && method === 'GET') {
      findSchedule(identity, id, all);
      return [200, { runs: store.listRuns(id) }];
    }
    if (parts.length === 3 && parts[2] === 'run' && method === 'POST') {
      const s = findSchedule(identity, id, all);
      try {
        const run = runner.launch(s, 'manual');
        return [202, { run }];
      } catch (e) {
        if (e.code === 'conflict') throw new ApiError(409, 'conflict', e.message);
        throw e;
      }
    }
    throw new ApiError(404, 'not_found', 'not found');
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      const [status, body] = await handle(req, res, url);
      if (status === 204) {
        res.writeHead(204).end();
      } else {
        res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
      }
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) log('error', `${req.method} ${url.pathname}: ${e.stack || e.message}`);
      if (!res.headersSent) {
        res
          .writeHead(status, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: { code: e.code || 'internal_error', message: status >= 500 && !e.code ? 'internal error' : e.message } }));
      }
    }
  });
}
