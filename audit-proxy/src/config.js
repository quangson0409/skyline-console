import fs from 'node:fs';

const int = (v, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/** secret from NAME or from the file named by NAME_FILE (docker/kolla secrets) */
const secret = (env, name) => {
  if (env[name]) return env[name];
  const file = env[`${name}_FILE`];
  return file ? fs.readFileSync(file, 'utf8').trim() : undefined;
};

export function loadConfig(env = process.env) {
  const driver = (env.DB_DRIVER || 'mariadb').toLowerCase();
  if (!['mariadb', 'sqlite'].includes(driver)) throw new Error('DB_DRIVER must be mariadb or sqlite');
  const cfg = {
    port: env.PORT === '0' ? 0 : int(env.PORT, 8788),
    host: env.HOST || '0.0.0.0',
    upstreamApi: (env.UPSTREAM_API || 'http://10.0.29.10:9999').replace(/\/+$/, ''),
    upstreamScheduler: (env.UPSTREAM_SCHEDULER || 'http://127.0.0.1:8787').replace(/\/+$/, ''),
    upstreamCinder: (env.UPSTREAM_CINDER || '').replace(/\/+$/, ''),
    keystoneUrl: (env.KEYSTONE_URL || '').replace(/\/+$/, '').replace(/\/v3$/, ''),
    internalSecret: secret(env, 'AUDIT_INTERNAL_SECRET'),
    adminRole: env.ADMIN_ROLE || 'admin',
    retentionDays: int(env.RETENTION_DAYS, 180),
    bodyPeekBytes: int(env.BODY_PEEK_BYTES, 16384),
    skipRegex: env.AUDIT_SKIP_REGEX ? new RegExp(env.AUDIT_SKIP_REGEX) : null,
    tokenCacheSeconds: int(env.TOKEN_CACHE_SECONDS, 60),
    flushMs: int(env.FLUSH_MS, 1000),
    maxQueue: int(env.MAX_QUEUE, 10000),
    exportMax: int(env.EXPORT_MAX, 10000),
    db: {
      driver,
      host: env.DB_HOST || '127.0.0.1',
      port: int(env.DB_PORT, 3306),
      name: env.DB_NAME || 'skyline_audit',
      user: env.DB_USER || 'audit_app',
      password: secret(env, 'DB_PASSWORD'),
      // maintenance account (partitions / retention); never used by the proxy process
      maintUser: env.DB_MAINT_USER || 'audit_maint',
      maintPassword: secret(env, 'DB_MAINT_PASSWORD'),
      sqlitePath: env.SQLITE_PATH || './data/audit.sqlite',
    },
  };
  if (!cfg.keystoneUrl) throw new Error('KEYSTONE_URL is required');
  if (driver === 'mariadb' && !cfg.db.password) throw new Error('DB_PASSWORD (or DB_PASSWORD_FILE) is required for mariadb');
  return cfg;
}
