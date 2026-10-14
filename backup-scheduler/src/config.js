import { resolve } from 'node:path';
import { assertTimezone } from './cron.js';

const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export function loadConfig(env = process.env) {
  const cfg = {
    host: env.HOST || '0.0.0.0',
    port: int(env.PORT, 8787),
    dataDir: resolve(env.DATA_DIR || './data'),
    keystoneUrl: env.KEYSTONE_URL || '',
    cinderUrl: env.CINDER_URL || '',
    cinderInterface: env.CINDER_INTERFACE || 'public',
    regionName: env.REGION_NAME || '',
    secret: env.SCHEDULER_SECRET || '',
    timezone: env.TZ || 'UTC',
    tickSeconds: int(env.TICK_SECONDS, 30),
    pollMs: int(env.BACKUP_POLL_MS, 5000),
    backupWaitSeconds: int(env.BACKUP_WAIT_SECONDS, 6 * 3600),
    deleteWaitSeconds: int(env.DELETE_WAIT_SECONDS, 600),
    minIntervalMinutes: int(env.MIN_INTERVAL_MINUTES, 5),
    adminRole: env.ADMIN_ROLE || 'admin',
  };
  if (!cfg.keystoneUrl) throw new Error('KEYSTONE_URL is required');
  assertTimezone(cfg.timezone);
  return cfg;
}
