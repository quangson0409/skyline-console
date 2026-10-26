/**
 * Event store. Two drivers behind one interface:
 *   - mariadb (production, mysql2, account with INSERT + SELECT only)
 *   - sqlite  (node:sqlite, local development / tests)
 * Writes are buffered and flushed in batches so a slow DB never delays proxied requests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const COLS = [
  'ts', 'event_uid', 'actor', 'on_behalf_of', 'user_id', 'user_name', 'project_id', 'project_name', 'roles',
  'service', 'method', 'path', 'action', 'resource_type', 'resource_id', 'resource_name', 'request_id',
  'http_status', 'outcome', 'error', 'duration_ms', 'client_ip', 'user_agent', 'source', 'fields',
];
const LIMITS = { path: 512, action: 160, resource_name: 255, resource_id: 255, error: 512, user_agent: 255, user_name: 255, project_name: 255, roles: 255, fields: 1024, on_behalf_of: 255 };

const pad = (n, w = 2) => String(n).padStart(w, '0');
/** UTC 'YYYY-MM-DD HH:MM:SS.mmm' (the DB session is always UTC) */
export const toDbTime = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:${pad(x.getUTCSeconds())}.${pad(x.getUTCMilliseconds(), 3)}`;
};
export const fromDbTime = (s) => (s instanceof Date ? s.toISOString() : new Date(`${String(s).replace(' ', 'T')}Z`).toISOString());

/** normalize an event to the table columns (bounded strings, UTC time) */
export function toRow(ev) {
  const row = {
    ts: toDbTime(ev.ts || new Date()),
    event_uid: ev.event_uid || randomUUID(),
    actor: ev.actor || 'user',
    source: ev.source || 'api',
    outcome: ev.outcome || 'accepted',
    service: ev.service || 'unknown',
    method: ev.method || '',
    action: ev.action || '',
    path: ev.path || '',
  };
  for (const c of COLS) if (!(c in row)) row[c] = ev[c] ?? null;
  for (const [c, max] of Object.entries(LIMITS)) if (typeof row[c] === 'string') row[c] = row[c].slice(0, max);
  if (Array.isArray(row.roles)) row.roles = row.roles.join(',').slice(0, LIMITS.roles);
  if (Array.isArray(row.fields)) row.fields = row.fields.join(',').slice(0, LIMITS.fields);
  return row;
}

const rowOut = (r) => ({ ...r, ts: fromDbTime(r.ts), roles: r.roles ? String(r.roles).split(',') : [], fields: r.fields ? String(r.fields).split(',') : [] });

/** WHERE clause shared by both drivers; `?` placeholders only */
export function buildWhere(f = {}) {
  const where = [];
  const args = [];
  const eq = (col, v) => {
    if (v !== undefined && v !== null && v !== '') {
      where.push(`${col} = ?`);
      args.push(v);
    }
  };
  if (f.from) { where.push('ts >= ?'); args.push(toDbTime(f.from)); }
  if (f.to) { where.push('ts <= ?'); args.push(toDbTime(f.to)); }
  eq('user_id', f.user_id);
  eq('project_id', f.project_id);
  eq('service', f.service);
  eq('outcome', f.outcome);
  eq('source', f.source);
  eq('resource_id', f.resource_id);
  eq('request_id', f.request_id);
  eq('resource_type', f.resource_type);
  if (f.user) { where.push('(user_name LIKE ? OR user_id = ?)'); args.push(`%${f.user}%`, f.user); }
  if (f.project) { where.push('(project_name LIKE ? OR project_id = ?)'); args.push(`%${f.project}%`, f.project); }
  if (f.action) { where.push('action LIKE ?'); args.push(`%${f.action}%`); }
  if (f.q) {
    where.push('(action LIKE ? OR resource_name LIKE ? OR resource_id LIKE ? OR user_name LIKE ? OR path LIKE ?)');
    const like = `%${f.q}%`;
    args.push(like, like, like, like, like);
  }
  if (f.before_id) { where.push('id < ?'); args.push(Number(f.before_id)); }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

class BufferedStore {
  constructor(cfg, log) {
    this.cfg = cfg;
    this.log = log;
    this.queue = [];
    this.dropped = 0;
    this.flushing = false;
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => this.flush().catch(() => {}), this.cfg.flushMs);
    this.timer.unref?.();
  }

  /** never throws, never awaits the DB */
  record(ev) {
    this.queue.push(toRow(ev));
    if (this.queue.length > this.cfg.maxQueue) {
      this.queue.shift();
      this.dropped += 1;
      if (this.dropped % 100 === 1) this.log('error', `audit queue full, dropped ${this.dropped} event(s) so far`);
    }
  }

  async flush() {
    if (this.flushing || !this.queue.length) return;
    this.flushing = true;
    const batch = this.queue.splice(0, 200);
    try {
      await this.insertMany(batch);
    } catch (e) {
      this.queue.unshift(...batch); // keep for the next tick
      this.log('error', `audit flush failed (${batch.length} queued): ${e.message}`);
    } finally {
      this.flushing = false;
    }
  }

  async drain(timeoutMs = 5000) {
    const until = Date.now() + timeoutMs;
    while (this.queue.length && Date.now() < until) {
      // eslint-disable-next-line no-await-in-loop
      await this.flush();
      if (this.queue.length) await new Promise((r) => setTimeout(r, 100));
    }
  }

  async close() {
    clearInterval(this.timer);
    await this.drain();
    await this.end();
  }
}

class SqliteStore extends BufferedStore {
  static async open(cfg, log) {
    const { DatabaseSync } = await import('node:sqlite');
    const file = cfg.db.sqlitePath;
    if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    const s = new SqliteStore(cfg, log);
    s.db = new DatabaseSync(file);
    s.db.exec(`CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ${COLS.map((c) => `${c} ${c === 'http_status' || c === 'duration_ms' ? 'INTEGER' : 'TEXT'}`).join(', ')});
      CREATE INDEX IF NOT EXISTS idx_ts ON audit_events (ts);
      CREATE INDEX IF NOT EXISTS idx_user ON audit_events (user_id, ts);`);
    return s;
  }

  async insertMany(rows) {
    const stmt = this.db.prepare(`INSERT INTO audit_events (${COLS.join(',')}) VALUES (${COLS.map(() => '?').join(',')})`);
    this.db.exec('BEGIN');
    try {
      for (const r of rows) stmt.run(...COLS.map((c) => r[c] ?? null));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  async query(filter = {}, { limit = 50 } = {}) {
    const { sql, args } = buildWhere(filter);
    const rows = this.db.prepare(`SELECT * FROM audit_events ${sql} ORDER BY id DESC LIMIT ?`).all(...args, Math.min(limit, 1000) + 1);
    return { hasMore: rows.length > limit, items: rows.slice(0, limit).map(rowOut) };
  }

  async purge(days) {
    const cutoff = toDbTime(Date.now() - days * 86400000);
    return this.db.prepare('DELETE FROM audit_events WHERE ts < ?').run(cutoff).changes;
  }

  async end() {
    this.db.close();
  }
}

class MariaStore extends BufferedStore {
  static async open(cfg, log) {
    const mysql = await import('mysql2/promise');
    const s = new MariaStore(cfg, log);
    s.pool = mysql.createPool({
      host: cfg.db.host,
      port: cfg.db.port,
      user: cfg.db.user,
      password: cfg.db.password,
      database: cfg.db.name,
      connectionLimit: 4,
      timezone: 'Z',
      dateStrings: true,
      charset: 'utf8mb4',
      connectTimeout: 5000,
    });
    // sessions always in UTC so DATETIME values are unambiguous
    s.pool.on('connection', (c) => c.query("SET time_zone = '+00:00'"));
    await s.pool.query('SELECT 1');
    return s;
  }

  async insertMany(rows) {
    const values = rows.map((r) => COLS.map((c) => r[c] ?? null));
    await this.pool.query(`INSERT INTO audit_events (${COLS.join(',')}) VALUES ?`, [values]);
  }

  async query(filter = {}, { limit = 50 } = {}) {
    const { sql, args } = buildWhere(filter);
    const [rows] = await this.pool.query(`SELECT * FROM audit_events ${sql} ORDER BY id DESC LIMIT ?`, [...args, Math.min(limit, 1000) + 1]);
    return { hasMore: rows.length > limit, items: rows.slice(0, limit).map(rowOut) };
  }

  async purge() {
    return 0; // retention is a partition drop done by src/maintenance.js with the maintenance account
  }

  async end() {
    await this.pool.end();
  }
}

export async function openStore(cfg, log) {
  const store = cfg.db.driver === 'sqlite' ? await SqliteStore.open(cfg, log) : await MariaStore.open(cfg, log);
  store.start();
  return store;
}
