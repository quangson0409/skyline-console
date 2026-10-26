/**
 * Retention / partition maintenance. Run daily (host cron or `docker run ... node src/maintenance.js`).
 * Uses the maintenance account (DB_MAINT_USER / DB_MAINT_PASSWORD), never the proxy's INSERT+SELECT account.
 *  - mariadb: keeps monthly partitions for the next 3 months, drops partitions older than RETENTION_DAYS
 *  - sqlite : DELETE older than RETENTION_DAYS
 */
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openStore } from './store.js';

const pad = (n) => String(n).padStart(2, '0');
const monthStart = (y, m) => new Date(Date.UTC(y, m, 1));
const pname = (d) => `p${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}`;

/** partitions to add: every month from `now` through now+3 that does not exist yet (pure, unit-tested) */
export function plan({ existing, now = new Date(), retentionDays }) {
  const have = new Set(existing);
  const add = [];
  const last = [...have].filter((n) => /^p\d{6}$/.test(n)).sort().pop() || ''; // REORGANIZE can only append after the last month
  for (let i = 0; i <= 3; i += 1) {
    const start = monthStart(now.getUTCFullYear(), now.getUTCMonth() + i);
    const end = monthStart(start.getUTCFullYear(), start.getUTCMonth() + 1);
    if (!have.has(pname(start)) && pname(start) > last) add.push({ name: pname(start), lessThan: end.toISOString().slice(0, 10) });
  }
  const cutoff = new Date(now.getTime() - retentionDays * 86400000);
  // a monthly partition `pYYYYMM` holds that month; drop it when the whole month is older than the cutoff
  const drop = existing.filter((n) => {
    const m = /^p(\d{4})(\d{2})$/.exec(n);
    if (!m) return false;
    const end = monthStart(Number(m[1]), Number(m[2])); // exclusive end = first day of next month
    return end.getTime() <= cutoff.getTime();
  });
  return { add, drop };
}

export async function runMaintenance(env = process.env, log = console.log) {
  const cfg = loadConfig(env);
  if (cfg.db.driver === 'sqlite') {
    const store = await openStore(cfg, log);
    const n = await store.purge(cfg.retentionDays);
    await store.close();
    log(`sqlite: purged ${n} event(s) older than ${cfg.retentionDays} days`);
    return;
  }
  if (!cfg.db.maintPassword) throw new Error('DB_MAINT_PASSWORD (or DB_MAINT_PASSWORD_FILE) is required');
  const mysql = await import('mysql2/promise');
  const conn = await mysql.createConnection({ host: cfg.db.host, port: cfg.db.port, user: cfg.db.maintUser, password: cfg.db.maintPassword, database: cfg.db.name });
  try {
    const [rows] = await conn.query("SELECT PARTITION_NAME AS n FROM information_schema.PARTITIONS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'audit_events' AND PARTITION_NAME IS NOT NULL", [cfg.db.name]);
    const { add, drop } = plan({ existing: rows.map((r) => r.n), retentionDays: cfg.retentionDays });
    if (add.length) {
      // split the catch-all partition so new months stay cheap metadata operations
      const parts = add.map((p) => `PARTITION \`${p.name}\` VALUES LESS THAN (TO_DAYS('${p.lessThan}'))`).join(', ');
      await conn.query(`ALTER TABLE audit_events REORGANIZE PARTITION \`pmax\` INTO (${parts}, PARTITION \`pmax\` VALUES LESS THAN MAXVALUE)`);
      log(`added partitions: ${add.map((p) => p.name).join(', ')}`);
    }
    for (const name of drop) {
      // eslint-disable-next-line no-await-in-loop
      await conn.query(`ALTER TABLE audit_events DROP PARTITION \`${name}\``);
      log(`dropped partition ${name} (older than ${cfg.retentionDays} days)`);
    }
    if (!add.length && !drop.length) log('nothing to do');
  } finally {
    await conn.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMaintenance().catch((e) => {
    console.error(`maintenance failed: ${e.message}`);
    process.exit(1);
  });
}
