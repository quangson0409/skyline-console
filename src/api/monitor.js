import apiClient from './client';

/**
 * Prometheus queries proxied by the skyline apiserver (legacy skylineClient.query / queryRange).
 *   GET /openstack/skyline/api/v1/query?query=...
 *   GET /openstack/skyline/api/v1/query_range?query=...&start=...&end=...&step=...
 */
const SKYLINE = '/openstack/skyline/api/v1';

export const monitorApi = {
  query: (query) => apiClient.get(`${SKYLINE}/query`, { params: { query } }),
  queryRange: (query, start, end, step) =>
    apiClient.get(`${SKYLINE}/query_range`, { params: { query, start, end, step } }),
};

export default monitorApi;
