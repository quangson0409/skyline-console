import apiClient from './client';
import { serviceBase } from './endpoints';

/**
 * OpenStack Glance Image Service API (v2)
 * Port of legacy src/client/glance (images, members, metadefs).
 * Base path is resolved per call from the service catalog (serviceBase('glance')).
 */
const base = () => serviceBase('glance');

const PATCH_HEADERS = { 'Content-Type': 'application/openstack-images-v2.1-json-patch' };

export const glanceApi = {
  // Images
  listImages: (params) => apiClient.get(`${base()}/images`, { params }),
  /** Follows glance "next" links until every page is loaded (legacy fetchListByLimit) */
  listAllImages: async (params = {}, maxPages = 50) => {
    const all = [];
    let query = { limit: 1000, ...params };
    for (let i = 0; i < maxPages; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await apiClient.get(`${base()}/images`, { params: query });
      const images = res?.images || [];
      all.push(...images);
      const next = res?.next;
      if (!next || !images.length) break;
      const marker = new URLSearchParams(String(next).split('?')[1] || '').get('marker');
      if (!marker) break;
      query = { ...query, marker };
    }
    return { images: all };
  },
  getImage: (id) => apiClient.get(`${base()}/images/${id}`),
  createImage: (data) => apiClient.post(`${base()}/images`, data),
  deleteImage: (id) => apiClient.delete(`${base()}/images/${id}`),
  /** JSON-patch update: ops = [{ op: 'replace'|'add'|'remove', path: '/name', value }] */
  updateImage: (id, ops) => apiClient.patch(`${base()}/images/${id}`, ops, { headers: PATCH_HEADERS }),
  uploadImageFile: (id, file, conf = {}) =>
    apiClient.put(`${base()}/images/${id}/file`, file, {
      timeout: 0,
      ...conf,
      headers: { 'Content-Type': 'application/octet-stream', ...(conf.headers || {}) },
    }),
  importImage: (id, data) => apiClient.post(`${base()}/images/${id}/import`, data),
  importImageUrl: (id, uri) =>
    apiClient.post(`${base()}/images/${id}/import`, { method: { name: 'web-download', uri } }),

  // Members (image sharing)
  listMembers: (id) => apiClient.get(`${base()}/images/${id}/members`),
  createMember: (id, member) => apiClient.post(`${base()}/images/${id}/members`, { member }),
  updateMember: (id, member, status) =>
    apiClient.put(`${base()}/images/${id}/members/${member}`, { status }),
  deleteMember: (id, member) => apiClient.delete(`${base()}/images/${id}/members/${member}`),

  // Metadata definitions
  listNamespaces: (params) => apiClient.get(`${base()}/metadefs/namespaces`, { params }),
  getNamespace: (namespace, params) =>
    apiClient.get(`${base()}/metadefs/namespaces/${encodeURIComponent(namespace)}`, { params }),
  listResourceTypes: () => apiClient.get(`${base()}/metadefs/resource_types`),
};

export default glanceApi;
