import apiClient from './client';
import { serviceBase } from './endpoints';
import { getPage } from './paging';

/**
 * OpenStack Designate (DNS) API v2 - port of legacy src/client/designate + stores/designate
 * Base path resolved per call: serviceBase('designate') -> /openstack/<region>/designate/v2
 *
 * Admin pages list every project's resources through the `x-auth-all-projects` header
 * (legacy DNSBaseStore.listFetchByClient / detailFetchByClient).
 */
const base = () => serviceBase('designate');

const JSON_HEADERS = { 'content-type': 'application/json' };

const projectHeaders = (allProjects) => ({
  headers: { 'x-auth-all-projects': allProjects ? 'true' : 'false' },
});

/**
 * Designate paginates with `limit` + `marker` and returns `links.next`.
 * Follow every page so the client-side table (filter/sort) sees the whole collection.
 */
const listAll = async (url, key, params = {}, config = {}) => {
  const limit = 1000;
  let marker;
  let items = [];
  // eslint-disable-next-line no-constant-condition
  for (let page = 0; page < 50; page += 1) {
    const query = { limit, ...params };
    if (marker) query.marker = marker;
    // eslint-disable-next-line no-await-in-loop
    const res = await apiClient.get(url, { ...config, params: query });
    const data = res || {};
    const list = Array.isArray(data[key]) ? data[key] : [];
    items = items.concat(list);
    const hasNext = Boolean(data.links?.next) && list.length > 0;
    if (!hasNext) break;
    marker = list[list.length - 1].id;
  }
  return items;
};

export const designateApi = {
  // ---- Zones ----
  listZones: (params = {}, { allProjects = false } = {}) =>
    listAll(`${base()}/zones`, 'zones', params, projectHeaders(allProjects)),

  getZone: (id, { allProjects = false } = {}) =>
    apiClient.get(`${base()}/zones/${id}`, projectHeaders(allProjects)),

  createZone: (body) => apiClient.post(`${base()}/zones`, body),

  updateZone: (id, body) => apiClient.patch(`${base()}/zones/${id}`, body),

  deleteZone: (id) => apiClient.delete(`${base()}/zones/${id}`),

  // ---- Record sets (zones/{zone_id}/recordsets) ----
  listRecordsets: (zoneId, params = {}, { allProjects = false } = {}) =>
    listAll(`${base()}/zones/${zoneId}/recordsets`, 'recordsets', params, projectHeaders(allProjects)),

  getRecordset: (zoneId, id, { allProjects = false } = {}) =>
    apiClient.get(`${base()}/zones/${zoneId}/recordsets/${id}`, projectHeaders(allProjects)),

  createRecordset: (zoneId, body) =>
    apiClient.post(`${base()}/zones/${zoneId}/recordsets`, body),

  /** legacy client.update -> PUT */
  updateRecordset: (zoneId, id, body) =>
    apiClient.put(`${base()}/zones/${zoneId}/recordsets/${id}`, body),

  deleteRecordset: (zoneId, id) =>
    apiClient.delete(`${base()}/zones/${zoneId}/recordsets/${id}`),

  // ---- Reverse DNS (PTR of floating IPs) ----
  listReverseFloatingips: () =>
    apiClient.get(`${base()}/reverse/floatingips`).then((r) => r?.floatingips || []),

  /** id format: "<region>:<floatingip_id>" */
  getReverseFloatingip: (id) =>
    apiClient.get(`${base()}/reverse/floatingips/${id}`, { headers: JSON_HEADERS }),

  setReverse: (id, body) =>
    apiClient.patch(`${base()}/reverse/floatingips/${id}`, body, { headers: JSON_HEADERS }),

  unsetReverse: (id) =>
    apiClient
      .patch(`${base()}/reverse/floatingips/${id}`, { ptrdname: null }, { headers: JSON_HEADERS }),
};

export default designateApi;

/**
 * Single pages for server-side lists (legacy DNSBaseStore fetchListByPage): limit, marker,
 * sort_key, sort_dir + filters; total from metadata.total_count, next from links.next.
 */
Object.assign(designateApi, {
  listZonesPage: (params = {}, { allProjects = false } = {}) =>
    getPage(`${base()}/zones`, { key: 'zones', params, config: projectHeaders(allProjects) }),
  listRecordsetsPage: (zoneId, params = {}, { allProjects = false } = {}) =>
    getPage(`${base()}/zones/${zoneId}/recordsets`, { key: 'recordsets', params, config: projectHeaders(allProjects) }),
});
