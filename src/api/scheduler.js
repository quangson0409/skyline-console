import axios from 'axios';
import { handleSessionExpired, isTokenExpired } from './client';
import { t } from '@/core/i18n';

/**
 * Backup scheduler service client (see backup-scheduler/ and docs/BACKUP_SCHEDULER.md).
 * Separate axios instance: the service is NOT behind /api. In dev Vite proxies
 * /scheduler-api -> <scheduler>/api/v1; in production the reverse proxy does the same.
 */
const schedulerClient = axios.create({
  baseURL: import.meta.env.VITE_SCHEDULER_URL || '/scheduler-api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

export class SchedulerUnavailableError extends Error {
  constructor(message) {
    super(message || t('Backup scheduler service is not available'));
    this.name = 'SchedulerUnavailableError';
    this.schedulerUnavailable = true;
  }
}

export const isSchedulerUnavailable = (err) => Boolean(err && err.schedulerUnavailable);

schedulerClient.interceptors.request.use((config) => {
  if (isTokenExpired()) {
    handleSessionExpired(t('Your OpenStack session has expired.'));
    return Promise.reject(new axios.Cancel('Session expired'));
  }
  const token = localStorage.getItem('keystone_token');
  if (token) config.headers['X-Auth-Token'] = token;
  return config;
});

schedulerClient.interceptors.response.use(
  (response) => {
    // a missing proxy answers with the SPA index.html (200, text/html): not our service
    const data = response.data;
    if (response.status !== 204 && (data === null || typeof data !== 'object')) {
      throw new SchedulerUnavailableError();
    }
    return data;
  },
  (error) => {
    const status = error.response?.status;
    if (!error.response || [502, 503, 504].includes(status) || typeof error.response.data === 'string') {
      if (axios.isCancel(error)) return Promise.reject(error);
      return Promise.reject(new SchedulerUnavailableError());
    }
    if (status === 401) handleSessionExpired(t('Your OpenStack session has expired. Please log in again.'));
    // the service answers { error: { code, message } }
    const msg = error.response.data?.error?.message;
    if (msg) error.message = msg;
    return Promise.reject(error);
  }
);

const unwrapList = (res, key) => {
  const list = res?.[key];
  if (!Array.isArray(list)) throw new SchedulerUnavailableError();
  return list;
};

export const schedulerApi = {
  health: () => schedulerClient.get('/health'),
  listSchedules: async ({ allProjects } = {}) => {
    const res = await schedulerClient.get('/schedules', { params: allProjects ? { all_projects: 1 } : undefined });
    return { schedules: unwrapList(res, 'schedules'), timezone: res?.timezone };
  },
  getSchedule: async (id, { allProjects } = {}) => {
    const res = await schedulerClient.get(`/schedules/${id}`, { params: allProjects ? { all_projects: 1 } : undefined });
    if (!res?.schedule) throw new SchedulerUnavailableError();
    return res.schedule;
  },
  createSchedule: (data) => schedulerClient.post('/schedules', data),
  updateSchedule: (id, data, { allProjects } = {}) =>
    schedulerClient.patch(`/schedules/${id}`, data, { params: allProjects ? { all_projects: 1 } : undefined }),
  deleteSchedule: (id, { allProjects } = {}) =>
    schedulerClient.delete(`/schedules/${id}`, { params: allProjects ? { all_projects: 1 } : undefined }),
  runSchedule: (id, { allProjects } = {}) =>
    schedulerClient.post(`/schedules/${id}/run`, {}, { params: allProjects ? { all_projects: 1 } : undefined }),
  listRuns: async (id, { allProjects } = {}) => {
    const res = await schedulerClient.get(`/schedules/${id}/runs`, { params: allProjects ? { all_projects: 1 } : undefined });
    return unwrapList(res, 'runs');
  },
  previewCron: (cron, count = 3) => schedulerClient.post('/cron/preview', { cron, count }),
};

export default schedulerApi;
