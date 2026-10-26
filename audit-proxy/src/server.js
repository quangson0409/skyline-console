import http from 'node:http';
import { createProxy, safeEqual } from './proxy.js';

const json = (res, status, body) => {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store' });
  res.end(text);
};

const OUTCOMES = new Set(['success', 'accepted', 'failed', 'aborted', 'partial', 'skipped']);
const STR_FIELDS = ['actor', 'on_behalf_of', 'user_id', 'user_name', 'project_id', 'project_name', 'service', 'method', 'path', 'action', 'resource_type', 'resource_id', 'resource_name', 'request_id', 'error', 'source'];

const FILTERS = ['from', 'to', 'user', 'project', 'service', 'action', 'outcome', 'source', 'resource_id', 'resource_type', 'request_id', 'q', 'before_id'];

/** Map the incoming URL to an upstream route (null = not proxied) */
export function resolveRoute(cfg, url) {
  if (url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')) return { kind: 'api', url: `${cfg.upstreamApi}${url}` };
  if (url.startsWith('/scheduler-api/') || url.startsWith('/scheduler-api?')) {
    return { kind: 'scheduler', url: `${cfg.upstreamScheduler}/api/v1${url.slice('/scheduler-api'.length)}` };
  }
  if (url.startsWith('/upstream/cinder/')) {
    if (!cfg.upstreamCinder) return { kind: 'disabled' };
    return { kind: 'cinder', url: `${cfg.upstreamCinder}${url.slice('/upstream/cinder'.length)}` };
  }
  return null;
}

export function createApp({ cfg, store, resolver, log }) {
  const proxy = createProxy({ cfg, resolver, store, log });

  /** GET /audit-api/events: admins see everything, other users only their own events */
  async function events(req, res, url) {
    const token = req.headers['x-auth-token'];
    const identity = token ? await resolver.resolve(token) : null;
    if (!identity) return json(res, 401, { error: 'invalid or missing token' });
    const isAdmin = identity.roles.includes(cfg.adminRole);
    const filter = {};
    for (const k of FILTERS) if (url.searchParams.get(k)) filter[k] = url.searchParams.get(k);
    if (filter.from && Number.isNaN(Date.parse(filter.from))) return json(res, 400, { error: 'invalid from' });
    if (filter.to && Number.isNaN(Date.parse(filter.to))) return json(res, 400, { error: 'invalid to' });
    if (!isAdmin) filter.user_id = identity.user_id;
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit'), 10) || 50, 1), 200);
    try {
      const { items, hasMore } = await store.query(filter, { limit });
      return json(res, 200, { events: items, has_more: hasMore, next_before_id: hasMore ? items[items.length - 1].id : null, is_admin: isAdmin });
    } catch (e) {
      log('error', `audit query failed: ${e.message}`);
      return json(res, 500, { error: 'query failed' });
    }
  }

  /**
   * POST /audit-api/internal/events: trusted services (backup-scheduler) report what they did on their own,
   * e.g. the result of a scheduled run. Needs the shared secret; strings are bounded; the store truncates them again.
   */
  async function internalEvents(req, res) {
    if (!cfg.internalSecret || !safeEqual(req.headers['x-audit-secret'], cfg.internalSecret)) return json(res, 403, { error: 'forbidden' });
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 256 * 1024) return json(res, 413, { error: 'too large' });
      chunks.push(c);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return json(res, 400, { error: 'invalid json' });
    }
    const list = Array.isArray(body?.events) ? body.events : body && typeof body === 'object' ? [body] : [];
    if (!list.length || list.length > 200) return json(res, 400, { error: 'send 1 to 200 events' });
    let accepted = 0;
    for (const e of list) {
      if (!e || typeof e !== 'object' || typeof e.action !== 'string' || !e.action) continue;
      const ev = { source: 'scheduler', actor: 'backup-scheduler', method: 'RUN', service: 'backup-scheduler', path: '' };
      for (const k of STR_FIELDS) if (typeof e[k] === 'string') ev[k] = e[k].slice(0, 512);
      ev.outcome = OUTCOMES.has(e.outcome) ? e.outcome : 'success';
      ev.ts = e.ts && !Number.isNaN(Date.parse(e.ts)) ? new Date(e.ts) : new Date();
      if (Number.isInteger(e.duration_ms)) ev.duration_ms = e.duration_ms;
      if (Array.isArray(e.fields)) ev.fields = e.fields.filter((f) => typeof f === 'string').slice(0, 40);
      store.record(ev);
      accepted += 1;
    }
    if (!accepted) return json(res, 400, { error: 'no valid event (an event needs an action)' });
    return json(res, 202, { accepted });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://audit');
      if (url.pathname === '/audit-api/health') {
        return json(res, 200, { status: 'ok', queued: store.queue.length, dropped: store.dropped });
      }
      if (url.pathname === '/audit-api/events' && req.method === 'GET') return await events(req, res, url);
      if (url.pathname === '/audit-api/internal/events' && req.method === 'POST') return await internalEvents(req, res);
      if (url.pathname.startsWith('/audit-api/')) return json(res, 404, { error: 'not found' });
      const route = resolveRoute(cfg, req.url);
      if (!route || route.kind === 'disabled') return json(res, 404, { error: 'not found' });
      return proxy.handle(req, res, route);
    } catch (e) {
      log('error', `request failed: ${e.message}`);
      if (!res.headersSent) return json(res, 500, { error: 'internal error' });
      res.destroy();
      return undefined;
    }
  });

  server.on('upgrade', (req, socket, head) => {
    const route = resolveRoute(cfg, req.url);
    if (route && route.kind === 'api') proxy.handleUpgrade(req, socket, head, route);
    else socket.destroy();
  });
  server.requestTimeout = 0; // large uploads must not be cut by the proxy
  server.headersTimeout = 60000;
  return server;
}
