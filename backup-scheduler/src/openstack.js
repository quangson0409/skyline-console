// Minimal Keystone + Cinder clients on top of global fetch.

export class HttpError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(url, { method = 'GET', headers = {}, body, timeoutMs = 30000 } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new HttpError(0, `${method} ${url} failed: ${e.cause?.code || e.message}`);
  }
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const detail = json && (json.error?.message || json.message || Object.values(json)[0]?.message);
    throw new HttpError(res.status, `${method} ${new URL(url).pathname} -> ${res.status}${detail ? `: ${detail}` : ''}`, json);
  }
  return { status: res.status, headers: res.headers, json };
}

const keystoneRoot = (cfg) => cfg.keystoneUrl.replace(/\/+$/, '').replace(/\/v3$/, '');

/** Validate a user's token; returns identity info. Throws HttpError(401) when invalid. */
export async function validateToken(cfg, token) {
  try {
    const { json } = await request(`${keystoneRoot(cfg)}/v3/auth/tokens`, {
      headers: { 'X-Auth-Token': token, 'X-Subject-Token': token },
      timeoutMs: 10000,
    });
    const t = json?.token;
    if (!t) throw new HttpError(401, 'invalid token');
    return {
      user_id: t.user?.id,
      user_name: t.user?.name,
      project_id: t.project?.id || null,
      roles: (t.roles || []).map((r) => r.name),
      expires_at: t.expires_at,
    };
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 404)) throw new HttpError(401, 'invalid or expired token');
    throw e;
  }
}

function pickCinder(catalog, cfg) {
  const types = ['volumev3', 'block-storage', 'volumev2', 'volume'];
  for (const type of types) {
    const svc = (catalog || []).find((s) => s.type === type);
    if (!svc) continue;
    const eps = (svc.endpoints || []).filter(
      (e) => e.interface === cfg.cinderInterface && (!cfg.regionName || e.region === cfg.regionName || e.region_id === cfg.regionName)
    );
    if (eps[0]) return eps[0].url;
  }
  return null;
}

/** Authenticate with an application credential; returns { token, projectId, cinderUrl }. */
export async function authenticateAppCredential(cfg, credential) {
  const { headers, json } = await request(`${keystoneRoot(cfg)}/v3/auth/tokens`, {
    method: 'POST',
    body: {
      auth: {
        identity: {
          methods: ['application_credential'],
          application_credential: { id: credential.application_credential_id, secret: credential.secret },
        },
      },
    },
    timeoutMs: 15000,
  });
  const token = headers.get('x-subject-token');
  const projectId = json?.token?.project?.id;
  if (!token || !projectId) throw new HttpError(401, 'application credential is not project scoped');
  let url = cfg.cinderUrl || pickCinder(json.token.catalog, cfg);
  if (!url) throw new HttpError(0, 'cinder endpoint not found in the service catalog (set CINDER_URL)');
  url = url
    .replace(/\$\(project_id\)s|\$\(tenant_id\)s|%\(project_id\)s|%\(tenant_id\)s|\{project_id\}/g, projectId)
    .replace(/\/+$/, '');
  return { token, projectId, cinderUrl: url };
}

/** Cinder client bound to one authenticated session. */
export function cinderClient(cfg, session, { onBehalfOf } = {}) {
  const h = { 'X-Auth-Token': session.token, 'OpenStack-API-Version': 'volume 3.51' };
  if (cfg.auditSecret) {
    // audit-proxy trusts these only together with the shared secret
    h['X-Audit-Secret'] = cfg.auditSecret;
    h['X-Audit-Actor'] = 'backup-scheduler';
    if (onBehalfOf) h['X-Audit-On-Behalf-Of'] = String(onBehalfOf).slice(0, 200).replace(/[\r\n]+/g, ' ');
  }
  const u = (p) => `${session.cinderUrl}${p}`;
  return {
    async getVolume(id) {
      return (await request(u(`/volumes/${encodeURIComponent(id)}`), { headers: h })).json?.volume;
    },
    /** All volumes of the project with their attachments (detail), following marker paging. */
    async listVolumes() {
      const out = [];
      let marker = null;
      for (let i = 0; i < 50; i++) {
        const qs = new URLSearchParams({ limit: '500' });
        if (marker) qs.set('marker', marker);
        const page = (await request(u(`/volumes/detail?${qs}`), { headers: h })).json?.volumes || [];
        out.push(...page);
        if (page.length < 500) break;
        marker = page[page.length - 1].id;
      }
      return out;
    },
    async createBackup(body) {
      return (await request(u('/backups'), { method: 'POST', headers: h, body: { backup: body } })).json?.backup;
    },
    async getBackup(id) {
      return (await request(u(`/backups/${encodeURIComponent(id)}`), { headers: h })).json?.backup;
    },
    /** All backups (detail) of a volume, following marker paging. */
    async listBackups(volumeId) {
      const out = [];
      let marker = null;
      for (let i = 0; i < 50; i++) {
        const qs = new URLSearchParams({ volume_id: volumeId, limit: '500', sort: 'created_at:asc' });
        if (marker) qs.set('marker', marker);
        const page = (await request(u(`/backups/detail?${qs}`), { headers: h })).json?.backups || [];
        out.push(...page);
        if (page.length < 500) break;
        marker = page[page.length - 1].id;
      }
      return out;
    },
    async deleteBackup(id) {
      await request(u(`/backups/${encodeURIComponent(id)}`), { method: 'DELETE', headers: h });
    },
  };
}
