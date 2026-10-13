import axios from 'axios';

// OpenStack API Client
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Standard UUID v4 generator for OpenStack request tracing
export const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const generateRequestId = () => `req-${generateUUID()}`;

// Request interceptor: Attach Keystone X-Auth-Token and X-Openstack-Request-Id
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('keystone_token');
    if (token) {
      config.headers['X-Auth-Token'] = token;
    }
    // OpenStack backend strictly validates: ^$|^req-\w{8}(-\w{4}){3}-\w{12}
    config.headers['X-Openstack-Request-Id'] = generateRequestId();
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Global error handler
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('Keystone session expired. Please re-authenticate.');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
