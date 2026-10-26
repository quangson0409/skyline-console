import axios from 'axios';
import { handleSessionExpired, isTokenExpired } from './client';
import { t } from '@/core/i18n';

/**
 * Audit log service client (see audit-proxy/). Separate axios instance: the service is NOT behind /api.
 * In dev Vite proxies /audit-api -> audit-proxy; in production the nginx of the console does the same.
 */
const auditClient = axios.create({
  baseURL: import.meta.env.VITE_AUDIT_URL || '/audit-api',
  timeout: 30000,
});

export class AuditUnavailableError extends Error {
  constructor(message) {
    super(message || t('Audit log service is not available'));
    this.name = 'AuditUnavailableError';
    this.auditUnavailable = true;
  }
}

export const isAuditUnavailable = (err) => Boolean(err && err.auditUnavailable);

auditClient.interceptors.request.use((config) => {
  if (isTokenExpired()) {
    handleSessionExpired(t('Your OpenStack session has expired.'));
    return Promise.reject(new axios.Cancel('Session expired'));
  }
  const token = localStorage.getItem('keystone_token');
  if (token) config.headers['X-Auth-Token'] = token;
  return config;
});

auditClient.interceptors.response.use(
  (response) => {
    // a missing proxy answers with the SPA index.html (200, text/html): not our service
    if (response.data === null || typeof response.data !== 'object') throw new AuditUnavailableError();
    return response.data;
  },
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);
    const status = error.response?.status;
    if (!error.response || [404, 502, 503, 504].includes(status) || typeof error.response.data === 'string') {
      return Promise.reject(new AuditUnavailableError());
    }
    if (status === 401) handleSessionExpired(t('Your OpenStack session has expired. Please log in again.'));
    const msg = error.response.data?.error;
    if (typeof msg === 'string') error.message = msg;
    return Promise.reject(error);
  }
);

export const auditApi = {
  /** one page, newest first: { events, has_more, next_before_id, is_admin } */
  listEvents: async (params = {}) => {
    const res = await auditClient.get('/events', { params });
    if (!Array.isArray(res?.events)) throw new AuditUnavailableError();
    return res;
  },
};

export default auditApi;
