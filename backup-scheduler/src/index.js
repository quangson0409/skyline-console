import { loadConfig } from './config.js';
import { deriveKey } from './crypto.js';
import { Store } from './store.js';
import { Runner } from './runner.js';
import { createApp } from './server.js';

export const log = (level, msg) => console[level === 'error' ? 'error' : 'log'](`${new Date().toISOString()} ${level.toUpperCase()} ${msg}`);

/** Build and start the service. Returns { server, runner, store, cfg, stop }. */
export async function startService(env = process.env, logger = log) {
  const cfg = loadConfig(env);
  const key = deriveKey(cfg.secret); // throws without SCHEDULER_SECRET
  const store = new Store(cfg.dataDir);
  const runner = new Runner({ cfg, store, key, log: logger });
  const server = createApp({ cfg, store, key, runner, log: logger });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(cfg.port, cfg.host, resolve);
  });
  runner.start();
  logger('info', `backup-scheduler listening on ${cfg.host}:${server.address().port} (tz=${cfg.timezone}, data=${cfg.dataDir})`);
  const stop = async () => {
    await new Promise((r) => server.close(r));
    server.closeAllConnections?.();
    await runner.stop();
  };
  return { server, runner, store, cfg, stop };
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const svc = await startService();
    const shutdown = async (sig) => {
      log('info', `${sig} received, shutting down`);
      await svc.stop();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (e) {
    log('error', `startup failed: ${e.message}`);
    process.exit(1);
  }
}
