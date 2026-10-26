import { createHash } from 'node:crypto';

/**
 * Resolves a Keystone token to { user_id, user_name, project_id, project_name, roles }.
 * Results are cached (hash of the token, never the token) so auditing adds no Keystone call per request.
 * Resolution failures return null: the request is still proxied and logged as "unverified".
 */
export class TokenResolver {
  constructor(cfg, log, fetchImpl = fetch) {
    this.cfg = cfg;
    this.log = log;
    this.fetch = fetchImpl;
    this.cache = new Map();
  }

  async resolve(token) {
    if (!token) return null;
    const key = createHash('sha256').update(token).digest('hex');
    const hit = this.cache.get(key);
    if (hit && hit.until > Date.now()) return hit.identity;
    let identity = null;
    let ttl = 10000; // negative / failed lookups are retried soon
    try {
      const res = await this.fetch(`${this.cfg.keystoneUrl}/v3/auth/tokens`, {
        headers: { 'X-Auth-Token': token, 'X-Subject-Token': token, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const t = (await res.json())?.token;
        if (t?.user) {
          identity = {
            user_id: t.user.id,
            user_name: t.user.name,
            project_id: t.project?.id || null,
            project_name: t.project?.name || null,
            roles: (t.roles || []).map((r) => r.name),
          };
          const expires = t.expires_at ? new Date(t.expires_at).getTime() - Date.now() : Infinity;
          ttl = Math.max(1000, Math.min(this.cfg.tokenCacheSeconds * 1000, expires));
        }
      } else if (res.status !== 401 && res.status !== 404) {
        this.log('error', `keystone token lookup answered ${res.status}`);
      }
    } catch (e) {
      this.log('error', `keystone token lookup failed: ${e.cause?.code || e.message}`);
    }
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(key, { identity, until: Date.now() + ttl });
    return identity;
  }
}
