import axios from 'axios';
import { message } from 'antd';

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

// Debounced session expiry redirect handler
let isHandlingExpiry = false;
export const handleSessionExpired = (customMsg = 'Phiên làm việc OpenStack đã hết hạn. Vui lòng đăng nhập lại.') => {
  if (isHandlingExpiry) return;
  isHandlingExpiry = true;

  // Clear auth credentials from client storage
  localStorage.removeItem('keystone_token');
  localStorage.removeItem('keystone_token_expires_at');

  message.warning(customMsg);

  setTimeout(() => {
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname + window.location.search;
      if (!window.location.pathname.startsWith('/auth')) {
        window.location.href = `/auth/login?redirect=${encodeURIComponent(currentPath)}&expired=1`;
      }
    }
    isHandlingExpiry = false;
  }, 400);
};

// Check if token expiration timestamp has passed
export const isTokenExpired = () => {
  const expiresAt = localStorage.getItem('keystone_token_expires_at');
  if (!expiresAt) return false;
  return Date.now() >= new Date(expiresAt).getTime();
};

// Request interceptor: Attach Keystone X-Auth-Token and X-Openstack-Request-Id
apiClient.interceptors.request.use(
  (config) => {
    // 1. Proactively check if token has already expired before sending request
    const isLoginEndpoint = config.url?.includes('/login');
    if (!isLoginEndpoint && isTokenExpired()) {
      handleSessionExpired('Phiên làm việc OpenStack đã hết hạn.');
      return Promise.reject(new axios.Cancel('Session expired'));
    }

    // 2. Attach X-Auth-Token
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

// Response interceptor: Global error handler & 401 Session Expiry Interceptor
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || '';
      const isLoginRequest = requestUrl.includes('/login');
      // Only handle expiry if not in login attempt (so login errors show as invalid credentials)
      if (!isLoginRequest) {
        console.warn('Keystone session expired (401). Triggering re-authentication.');
        handleSessionExpired('Phiên làm việc OpenStack đã hết hạn. Vui lòng đăng nhập lại.');
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

