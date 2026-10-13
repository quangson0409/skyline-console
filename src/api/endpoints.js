import { useAuthStore } from '@/store/authStore';

/**
 * Service endpoint resolution - port of legacy src/client/client/constants.js
 *
 * Skyline apiserver returns `endpoints` in the profile/login payload, e.g.
 *   { nova: '/api/openstack/regionone/nova', manilav2: '/api/openstack/regionone/manilav2', ... }
 * apiClient already uses baseURL '/api', so the '/api' prefix is stripped here.
 */
export const SERVICE_VERSIONS = {
  keystone: 'v3',
  nova: 'v2.1',
  cinder: 'v3',
  glance: 'v2',
  neutron: 'v2.0',
  ironic: 'v1',
  heat: 'v1',
  octavia: 'v2',
  swift: 'v1',
  trove: 'v1.0',
  manilav2: 'v2',
  barbican: 'v1',
  zun: 'v1',
  magnum: 'v1',
  designate: 'v2',
  masakari: 'v1',
  zaqar: 'v2',
  placement: '',
};

// Microversion headers used by legacy console (apiVersionMaps)
export const API_VERSION_HEADERS = {
  nova: { 'Openstack-Api-Version': 'compute 2.79', 'X-Openstack-Nova-Api-Version': '2.79' },
  placement: { 'Openstack-Api-Version': 'placement 1.28' },
  cinder: { 'Openstack-Api-Version': 'volume 3.59' },
  ironic: { 'X-Openstack-Ironic-Api-Version': '1.58' },
  manilav2: { 'X-OpenStack-Manila-API-Version': '2.55' },
  zun: { 'OpenStack-API-Version': 'container 1.40' },
};

const ENDPOINTS_KEY = 'skyline_endpoints';

export const loadEndpoints = () => {
  try {
    return JSON.parse(localStorage.getItem(ENDPOINTS_KEY) || '{}') || {};
  } catch {
    return {};
  }
};

export const saveEndpoints = (endpoints) => {
  if (!endpoints || typeof endpoints !== 'object') return;
  try {
    localStorage.setItem(ENDPOINTS_KEY, JSON.stringify(endpoints));
  } catch {
    // ignore storage errors
  }
};

const getRegion = () => {
  try {
    return (useAuthStore.getState().currentRegion || 'RegionOne').toLowerCase();
  } catch {
    return 'regionone';
  }
};

const stripApiPrefix = (url = '') => url.replace(/^(https?:\/\/[^/]+)?\/api(?=\/)/, '');

/** Raw endpoint of a service without version, e.g. '/openstack/regionone/nova' */
export const serviceEndpoint = (service) => {
  const endpoints = loadEndpoints();
  if (endpoints[service]) return stripApiPrefix(endpoints[service]).replace(/\/$/, '');
  return `/openstack/${getRegion()}/${service}`;
};

/** Versioned base path, e.g. '/openstack/regionone/nova/v2.1' */
export const serviceBase = (service) => {
  const version = SERVICE_VERSIONS[service];
  const endpoint = serviceEndpoint(service);
  return version ? `${endpoint}/${version}` : endpoint;
};

/** Whether the service is present in the catalog (legacy globalRootStore.checkEndpoint) */
export const hasEndpoint = (service) => {
  const endpoints = loadEndpoints();
  if (Object.keys(endpoints).length === 0) return true; // unknown catalog -> optimistic
  return Boolean(endpoints[service]);
};

export const currentProjectId = () => {
  try {
    const state = useAuthStore.getState();
    return state?.currentProject?.id || '';
  } catch {
    return '';
  }
};

export const versionHeaders = (service) => ({ headers: API_VERSION_HEADERS[service] || {} });
