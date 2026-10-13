import axios from 'axios';
import apiClient, { generateRequestId, generateUUID } from './client';
import { serviceBase } from './endpoints';

/**
 * OpenStack Zaqar (Messaging) API v2 - port of legacy src/client/zaqar
 * Every request carries a `Client-ID` header (RFC 4122 UUID, legacy utils/zaqar.js):
 * it prevents message echo and identifies claim ownership. One id per browser tab session.
 */
const ZAQAR_CLIENT_UUID_KEY = 'zaqar_client_uuid';

export const getZaqarClientId = () => {
  try {
    let clientId = sessionStorage.getItem(ZAQAR_CLIENT_UUID_KEY);
    if (!clientId) {
      clientId = generateUUID();
      sessionStorage.setItem(ZAQAR_CLIENT_UUID_KEY, clientId);
    }
    return clientId;
  } catch {
    return generateUUID();
  }
};

const base = () => serviceBase('zaqar');
const q = (name) => `${base()}/queues/${encodeURIComponent(name)}`;
const conf = (extra = {}) => ({
  ...extra,
  headers: { ...(extra.headers || {}), 'Client-ID': getZaqarClientId() },
});

export const zaqarApi = {
  // ----------------------------------------------------------------- Queues
  listQueues: (params) => apiClient.get(`${base()}/queues`, conf({ params })),
  /** PUT /v2/queues/{name} (body = metadata) */
  createQueue: (name, metadata = {}) => apiClient.put(q(name), metadata, conf()),
  deleteQueue: (name) => apiClient.delete(q(name), conf()),
  getQueueStats: (name) => apiClient.get(`${q(name)}/stats`, conf()),
  /** GET /v2/queues/{name} -> queue metadata */
  getQueueMetadata: (name) => apiClient.get(q(name), conf()),
  /** PATCH with JSON Patch ("add" works for new and existing keys) */
  setQueueMetadata: (name, data = {}) =>
    apiClient.patch(
      q(name),
      Object.keys(data).map((key) => ({ op: 'add', path: `/metadata/${key}`, value: data[key] })),
      conf({ headers: { 'Content-Type': 'application/openstack-messaging-v2.0-json-patch' } })
    ),
  /** DELETE /v2/queues/{name}/messages?pop=20 (legacy purge step) */
  popMessages: (name, pop = 20) => apiClient.delete(`${q(name)}/messages`, conf({ params: { pop } })),

  // --------------------------------------------------------------- Messages
  listMessages: (name, params) => apiClient.get(`${q(name)}/messages`, conf({ params })),
  postMessages: (name, messages) => apiClient.post(`${q(name)}/messages`, { messages }, conf()),
  deleteMessage: (name, messageId, params) =>
    apiClient.delete(`${q(name)}/messages/${encodeURIComponent(messageId)}`, conf({ params })),

  // ----------------------------------------------------------------- Claims
  /**
   * POST /v2/queues/{name}/claims?limit=N { ttl, grace }
   * Uses a raw axios call (like legacy) so the Location header (claim id) is available.
   */
  createClaim: ({ queueName, limit, ...body }) => {
    const token = localStorage.getItem('keystone_token') || '';
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    return axios.post(`${apiBase}${q(queueName)}/claims`, body, {
      params: limit ? { limit } : undefined,
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Client-ID': getZaqarClientId(),
        'X-Openstack-Request-Id': generateRequestId(),
        ...(token ? { 'X-Auth-Token': token } : {}),
      },
      validateStatus: (status) => status < 500,
    });
  },
  releaseClaim: (name, claimId) => apiClient.delete(`${q(name)}/claims/${encodeURIComponent(claimId)}`, conf()),

  // ---------------------------------------------------------- Subscriptions
  listSubscriptions: (name, params) => apiClient.get(`${q(name)}/subscriptions`, conf({ params })),
  createSubscription: (name, body) => apiClient.post(`${q(name)}/subscriptions`, body, conf()),
  updateSubscription: (name, id, body) =>
    apiClient.patch(`${q(name)}/subscriptions/${encodeURIComponent(id)}`, body, conf()),
  deleteSubscription: (name, id) => apiClient.delete(`${q(name)}/subscriptions/${encodeURIComponent(id)}`, conf()),
};

export default zaqarApi;
