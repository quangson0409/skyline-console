import apiClient from './client';
import { serviceBase } from './endpoints';

/**
 * OpenStack Barbican (Key Manager) API v1 - port of legacy src/client/barbican + stores/barbican
 * Base path resolved per call: serviceBase('barbican') -> /openstack/<region>/barbican/v1
 */
const base = () => serviceBase('barbican');

/** "<endpoint>/v1/secrets/<uuid>" -> "<uuid>" */
export const refId = (ref = '', kind = 'secrets') => {
  const parts = String(ref || '').split(`/${kind}/`);
  return parts.length > 1 ? parts[1].replace(/\/$/, '') : '';
};

/** Barbican paginates with limit + offset and returns `total` (legacy requestListAllByLimit). */
const listAllByOffset = async (path, key, params = {}) => {
  const limit = 100;
  let items = [];
  for (let page = 0; page < 100; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await apiClient.get(`${base()}/${path}`, {
      params: { ...params, limit, offset: items.length },
      headers: { Accept: 'application/json' },
    });
    const data = res || {};
    const list = Array.isArray(data[key]) ? data[key] : [];
    items = items.concat(list);
    const total = Number(data.total);
    if (!list.length || list.length < limit || (Number.isFinite(total) && items.length >= total)) break;
  }
  return items;
};

/**
 * Decode a payload ArrayBuffer like legacy SecretsStore.fetchDetail:
 * printable text (and a text-like content type) stays text, everything else becomes base64.
 */
export const decodePayload = (payload, contentType = 'text/plain', { strictType = true } = {}) => {
  if (payload === undefined || payload === null) return payload;
  try {
    if (payload instanceof ArrayBuffer) {
      const bytes = new Uint8Array(payload);
      const decodedText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      // eslint-disable-next-line no-control-regex
      const isValidText = /^[\x20-\x7E\n\r\t]*$/.test(decodedText);
      const textType = /text|plain|json/.test(contentType || '');
      if (isValidText && (!strictType || textType)) return decodedText;
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }
    if (typeof payload === 'string') return payload;
    return JSON.stringify(payload, null, 2);
  } catch {
    return 'Error decoding payload';
  }
};

export const barbicanApi = {
  // ---- Secrets ----
  listSecrets: (params = {}) => listAllByOffset('secrets', 'secrets', params),

  getSecret: (id) =>
    apiClient.get(`${base()}/secrets/${id}`, { headers: { Accept: 'application/json' } }),

  /** raw payload as ArrayBuffer (legacy payloadClient.list with responseType arraybuffer) */
  getSecretPayload: (id) =>
    apiClient
      .get(`${base()}/secrets/${id}/payload`, { headers: { Accept: '*/*' }, responseType: 'arraybuffer' }),

  createSecret: (body) => apiClient.post(`${base()}/secrets`, body),

  deleteSecret: (id) => apiClient.delete(`${base()}/secrets/${id}`),

  // ---- Containers ----
  listContainers: (params = {}) => listAllByOffset('containers', 'containers', params),

  getContainer: (id) =>
    apiClient.get(`${base()}/containers/${id}`, { headers: { Accept: 'application/json' } }),

  createContainer: (body) => apiClient.post(`${base()}/containers`, body),

  deleteContainer: (id) => apiClient.delete(`${base()}/containers/${id}`),

  // ---- Orders ----
  createOrder: (body) => apiClient.post(`${base()}/orders`, body),

  // ---- Octavia listeners (legacy globalListenerStore.fetchList, used to show "in use" certificates) ----
  listLbListeners: () =>
    apiClient.get(`${serviceBase('octavia')}/lbaas/listeners`).then((r) => r?.listeners || []),
};

export default barbicanApi;
