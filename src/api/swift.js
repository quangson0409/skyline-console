import axios from 'axios';
import apiClient, { generateRequestId, handleSessionExpired, isTokenExpired } from './client';
import { serviceEndpoint, currentProjectId, loadEndpoints } from './endpoints';

/**
 * OpenStack Swift Object Storage API (v1) - port of legacy src/client/swift + stores/swift.
 *
 * Legacy builds the account URL as `${swiftBase()}/AUTH_${project}` where swiftBase() is
 * the catalog endpoint + '/v1'. Swift needs response headers (HEAD metadata, X-Container-*),
 * so this module uses its own axios instance that returns the full response
 * (apiClient's interceptor strips everything except `data`).
 */
const swiftHttp = axios.create({
  baseURL: apiClient.defaults.baseURL,
  timeout: 0, // uploads/downloads may take long
});

swiftHttp.interceptors.request.use((config) => {
  if (isTokenExpired()) {
    handleSessionExpired();
    return Promise.reject(new axios.Cancel('Session expired'));
  }
  const token = localStorage.getItem('keystone_token');
  if (token) config.headers['X-Auth-Token'] = token;
  config.headers['X-Openstack-Request-Id'] = generateRequestId();
  return config;
});

swiftHttp.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) handleSessionExpired();
    return Promise.reject(error);
  }
);

/** '/openstack/regionone/swift/v1' (version appended unless the catalog URL already has it) */
export const swiftBase = () => {
  const endpoint = serviceEndpoint('swift');
  if (/\/v1(\/|$)/.test(endpoint)) return endpoint.replace(/\/AUTH_[^/]*$/, '');
  return `${endpoint}/v1`;
};

/** Account URL: /openstack/<region>/swift/v1/AUTH_<project_id> */
export const swiftAccountUrl = () => `${swiftBase()}/AUTH_${currentProjectId()}`;

/** legacy getEncodeUrl: encode every path segment */
export const encodePath = (path = '') =>
  String(path)
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');

const url = (path) => (path ? `${swiftAccountUrl()}/${encodePath(path)}` : swiftAccountUrl());

/**
 * Public URL of an object (legacy CopyPublicUrl.getPublicUrl): uses the original catalog
 * endpoint of swift, prefixed with window origin when relative.
 */
export const getPublicObjectUrl = (container, objectPath = '') => {
  const raw = loadEndpoints().swift;
  let endpoint = raw || `/api${serviceEndpoint('swift')}`;
  if (endpoint.startsWith('/')) endpoint = `${window.location.origin}${endpoint}`;
  const clean = endpoint.replace(/\/$/, '');
  const baseUrl = clean.includes('/v1') ? clean : `${clean}/v1`;
  const projectId = currentProjectId();
  if (!projectId) return null;
  const objPart = objectPath ? `/${encodePath(objectPath)}` : '';
  return `${baseUrl}/AUTH_${projectId}/${encodeURIComponent(container)}${objPart}`;
};

export const swiftApi = {
  // ------------------------------------------------------------ containers
  /** GET account?format=json -> [{ name, count, bytes, last_modified }] */
  listContainers: async (params = {}) => {
    const res = await swiftHttp.get(url(''), { params: { format: 'json', ...params } });
    return Array.isArray(res.data) ? res.data : [];
  },
  createContainer: (name) => swiftHttp.put(url(name)),
  deleteContainer: (name) => swiftHttp.delete(url(name)),
  /** HEAD container -> headers */
  showContainerMetadata: async (name) => (await swiftHttp.head(url(name))).headers || {},
  updateContainerMetadata: (name, headers) => swiftHttp.post(url(name), null, { headers }),

  // --------------------------------------------------------------- objects
  /** GET container?format=json&delimiter=/&prefix=... */
  listObjects: async (container, params = {}) => {
    const res = await swiftHttp.get(url(container), {
      params: { format: 'json', delimiter: '/', ...params },
    });
    return Array.isArray(res.data) ? res.data : [];
  },
  showObjectMetadata: async (container, name) => (await swiftHttp.head(url(`${container}/${name}`))).headers || {},
  /** PUT container/name (empty body => folder marker when name ends with '/') */
  createFolder: (container, name) => swiftHttp.put(url(`${container}/${name}`)),
  uploadObject: (container, name, content, config = {}) =>
    swiftHttp.put(url(`${container}/${name}`), content, {
      ...config,
      headers: { ...(config.headers || {}) },
      transformRequest: [(d) => d], // send raw ArrayBuffer / Blob
    }),
  downloadObject: async (container, name) =>
    (await swiftHttp.get(url(`${container}/${name}`), { responseType: 'blob' })).data,
  deleteObject: (container, name) => swiftHttp.delete(url(`${container}/${name}`)),
  /** COPY fromContainer/fromName  Destination: toContainer/toName (legacy client.copy) */
  copyObject: (fromContainer, fromName, toContainer, toName) =>
    swiftHttp.request({
      method: 'COPY',
      url: url(`${fromContainer}/${fromName}`),
      headers: { Destination: encodePath(`${toContainer}/${toName}`) },
    }),
};

export default swiftApi;
