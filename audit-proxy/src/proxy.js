/**
 * Streaming reverse proxy. Requests are forwarded untouched (no buffering of bodies, so large
 * image / object uploads are fine); for mutating methods a bounded copy of a JSON body is peeked to name
 * the action. The audit event is queued when the response is finished and never blocks or fails the request.
 */
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Transform } from 'node:stream';
import { timingSafeEqual } from 'node:crypto';
import { classify, MUTATING } from './mapper.js';
import { cleanPath, errorMessage, fieldNames } from './redact.js';

const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host']);
const AUDIT_HEADERS = ['x-audit-secret', 'x-audit-actor', 'x-audit-on-behalf-of'];
const PEEK_ERROR_BYTES = 4096;
const PEEK_SESSION_BYTES = 262144;
const SESSION_PATH = /\/skyline\/api\/v1\/(login|switch_project)|\/auth\/tokens$/;
const TOKEN_IN_BODY = /"keystone_token"\s*:\s*"([^"]+)"/;

class Peek extends Transform {
  constructor(limit) {
    super();
    this.limit = limit;
    this.chunks = [];
    this.size = 0;
    this.truncated = false;
  }

  _transform(chunk, _enc, cb) {
    if (this.size < this.limit) {
      const take = chunk.subarray(0, this.limit - this.size);
      this.chunks.push(take);
      this.size += take.length;
      if (take.length < chunk.length) this.truncated = true;
    } else {
      this.truncated = true;
    }
    cb(null, chunk);
  }

  text() {
    return Buffer.concat(this.chunks).toString('utf8');
  }

  json() {
    if (this.truncated || !this.size) return null;
    try {
      return JSON.parse(this.text());
    } catch {
      return null;
    }
  }
}

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
};

const headerOne = (v) => (Array.isArray(v) ? v[0] : v);

export function createProxy({ cfg, resolver, store, log }) {
  const agents = { 'http:': new http.Agent({ keepAlive: true }), 'https:': new https.Agent({ keepAlive: true }) };

  /** route: { kind, target: URL string, ... } built by server.js */
  function forwardHeaders(req, target) {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && !AUDIT_HEADERS.includes(k)) headers[k] = v;
    headers.host = target.host;
    const ip = req.socket.remoteAddress;
    headers['x-forwarded-for'] = req.headers['x-forwarded-for'] ? `${req.headers['x-forwarded-for']}, ${ip}` : ip;
    return headers;
  }

  function handle(req, res, route) {
    const started = Date.now();
    const target = new URL(route.url);
    const method = req.method.toUpperCase();
    const cleanedPath = cleanPath(req.url);

    // internal cinder route is only for trusted services holding the shared secret
    let actor = null;
    if (route.kind === 'cinder') {
      if (!cfg.internalSecret || !safeEqual(req.headers['x-audit-secret'], cfg.internalSecret)) {
        res.writeHead(403, { 'content-type': 'application/json' }).end('{"error":"forbidden"}');
        return;
      }
      actor = { actor: String(headerOne(req.headers['x-audit-actor']) || 'service').slice(0, 32), on_behalf_of: headerOne(req.headers['x-audit-on-behalf-of']) || null };
    }

    const audited = MUTATING.has(method) && !(cfg.skipRegex && cfg.skipRegex.test(cleanedPath));
    const token = headerOne(req.headers['x-auth-token']);
    const identityP = audited && token ? resolver.resolve(token) : Promise.resolve(null);
    const type = String(req.headers['content-type'] || '');
    const reqPeek = audited && /json/i.test(type) ? new Peek(cfg.bodyPeekBytes) : null;
    let resPeek = null;
    let status = 0;
    let finished = false;
    let upstreamError = null;
    let respHeaders = {};

    const record = async () => {
      if (finished || !audited) return;
      finished = true;
      try {
        const body = reqPeek ? reqPeek.json() : null;
        const c = classify({ kind: route.kind, method, path: cleanedPath, body });
        if (!c) return;
        let identity = await identityP;
        // login has no token yet; switch_project re-scopes it: the answer carries the new token
        if ((c.login || c.session) && status > 0 && status < 400) {
          const fresh = headerOne(respHeaders['x-subject-token']) || (resPeek && TOKEN_IN_BODY.exec(resPeek.text())?.[1]);
          if (fresh) identity = (await resolver.resolve(fresh)) || identity;
        }
        const failed = status >= 400 || status === 0;
        const aborted = status === 0 && !upstreamError;
        let error = null;
        if (upstreamError) error = upstreamError;
        else if (failed && resPeek) {
          let json = null;
          try {
            json = JSON.parse(resPeek.text());
          } catch {
            /* not json */
          }
          error = errorMessage(json, json ? '' : resPeek.text());
        }
        const loginName = c.login && body ? body.username || body.auth?.identity?.password?.user?.name || null : null;
        const requestId = headerOne(req.headers['x-openstack-request-id']) || respHeaders['x-openstack-request-id'] || respHeaders['x-compute-request-id'] || null;
        store.record({
          ts: new Date(started),
          actor: actor ? actor.actor : 'user',
          on_behalf_of: actor?.on_behalf_of || null,
          user_id: identity?.user_id || null,
          user_name: identity?.user_name || loginName || null,
          project_id: identity?.project_id || null,
          project_name: identity?.project_name || null,
          roles: identity?.roles || null,
          service: c.service,
          method,
          path: cleanedPath,
          action: actor ? `${c.action} (scheduled)` : c.action,
          resource_type: c.resource_type,
          resource_id: c.resource_id,
          resource_name: c.session ? identity?.project_name || null : c.resource_name,
          request_id: requestId,
          http_status: status || null,
          outcome: aborted ? 'aborted' : failed ? 'failed' : status === 202 ? 'accepted' : 'success',
          error,
          duration_ms: Date.now() - started,
          client_ip: String(headerOne(req.headers['x-forwarded-for']) || req.socket.remoteAddress || '').split(',')[0].trim(),
          user_agent: headerOne(req.headers['user-agent']) || null,
          source: actor ? 'scheduler' : route.kind === 'scheduler' ? 'ui' : req.headers['sec-fetch-mode'] || req.headers.referer ? 'ui' : 'api',
          fields: reqPeek ? fieldNames(body) : null,
        });
      } catch (e) {
        log('error', `audit record failed: ${e.message}`); // never affects the proxied request
      }
    };

    // login / switch_project: the response body is read to find the new token, so it must not be compressed
    const sessionHeaders = (h) => (audited && SESSION_PATH.test(cleanedPath) ? { ...h, 'accept-encoding': 'identity' } : h);

    const upReq = (target.protocol === 'https:' ? https : http).request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        method,
        path: `${target.pathname}${target.search}`,
        headers: sessionHeaders(forwardHeaders(req, target)),
        agent: agents[target.protocol],
        rejectUnauthorized: false, // internal endpoints use private CAs (same as nginx proxy_pass today)
      },
      (upRes) => {
        status = upRes.statusCode;
        respHeaders = upRes.headers;
        const outHeaders = { ...upRes.headers };
        for (const h of HOP) delete outHeaders[h];
        res.writeHead(status, outHeaders);
        if (audited && (status >= 400 || SESSION_PATH.test(cleanedPath))) {
          // errors: short message; login / switch_project: the profile carries the new keystone_token
          resPeek = new Peek(status >= 400 ? PEEK_ERROR_BYTES : PEEK_SESSION_BYTES);
          upRes.pipe(resPeek).pipe(res);
        } else {
          upRes.pipe(res);
        }
      }
    );

    upReq.on('error', (e) => {
      upstreamError = 'upstream unavailable';
      status = 502;
      log('error', `upstream ${target.host} failed: ${e.cause?.code || e.code || e.message}`);
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      res.end('{"error":"upstream unavailable"}');
    });
    res.on('close', () => {
      if (!res.writableFinished) upReq.destroy();
      record();
    });
    res.on('finish', record);

    if (reqPeek) req.pipe(reqPeek).pipe(upReq);
    else req.pipe(upReq);
  }

  /** WebSocket / upgrade passthrough (not audited) */
  function handleUpgrade(req, socket, head, route) {
    const target = new URL(route.url);
    const upSocket = net.connect(Number(target.port) || (target.protocol === 'https:' ? 443 : 80), target.hostname, () => {
      const lines = [`${req.method} ${target.pathname}${target.search} HTTP/1.1`, `Host: ${target.host}`];
      for (const [k, v] of Object.entries(req.headers)) if (k !== 'host') lines.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
      upSocket.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head?.length) upSocket.write(head);
      socket.pipe(upSocket).pipe(socket);
    });
    const close = () => {
      socket.destroy();
      upSocket.destroy();
    };
    upSocket.on('error', close);
    socket.on('error', close);
  }

  return { handle, handleUpgrade };
}
