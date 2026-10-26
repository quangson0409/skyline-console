import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openStore } from './store.js';
import { TokenResolver } from './auth.js';
import { createApp } from './server.js';

export const log = (level, msg) => console[level === 'error' ? 'error' : 'log'](`${new Date().toISOString()} ${level.toUpperCase()} ${msg}`);

/** Build and start the service. Returns { server, store, cfg, stop }. */
export async function startService(env = process.env, logger = log) {
  const cfg = loadConfig(env);
  const store = await openStore(cfg, logger);
  const resolver = new TokenResolver(cfg, logger);
  const server = createApp({ cfg, store, resolver, log: logger });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(cfg.port, cfg.host, resolve);
  });
  logger('info', `audit-proxy listening on ${cfg.host}:${server.address().port} (db=${cfg.db.driver}, api=${cfg.upstreamApi})`);
  const stop = async () => {
    await new Promise((r) => server.close(r));
    server.closeAllConnections?.();
    await store.close();
  };
  return { server, store, cfg, stop };
}

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
