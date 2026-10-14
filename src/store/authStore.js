import { create } from 'zustand';
import { skylineApi } from '@/api/skyline';
import apiClient from '@/api/client';
import { message } from 'antd';
import { t } from '@/core/i18n';
import { saveEndpoints, serviceBase } from '@/api/endpoints';
import { usePolicyStore } from '@/core/policy';

export const formatErrorMessage = (err) => {
  if (!err) return t('Unknown error');
  if (typeof err === 'string') return err;
  if (err.response?.data) {
    const data = err.response.data;
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((d) => (typeof d === 'string' ? d : d.msg || JSON.stringify(d))).join(', ');
    }
    if (typeof data.message === 'string') return data.message;
    if (typeof data === 'string') return data;
  }
  if (err.message) return err.message;
  return t('Server connection error');
};

const readJSON = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const EMPTY_PROJECT = { id: '', name: '', domainId: '', domainName: '', displayName: '', description: '' };

// Token expiration verification on store load
const savedToken = localStorage.getItem('keystone_token') || '';
const savedExpiresAt = localStorage.getItem('keystone_token_expires_at');
const isInitialExpired = (() => {
  if (!savedToken) return true;
  if (!savedExpiresAt) return false;
  return Date.now() >= new Date(savedExpiresAt).getTime();
})();

if (savedToken && isInitialExpired) {
  localStorage.removeItem('keystone_token');
  localStorage.removeItem('keystone_token_expires_at');
}

const initialToken = isInitialExpired ? '' : savedToken;
const initialIsAuth = !isInitialExpired && !!savedToken;

const savedUser = readJSON('skyline_user');

/**
 * Normalizes a skyline Profile (login / profile / switch_project / switch_region response).
 * projects is a map { id: { name, domain_id, enabled, description } } in skyline-apiserver.
 */
const parseProfile = (res = {}) => {
  const domainNames = {};
  if (res.project?.domain) domainNames[res.project.domain.id] = res.project.domain.name;
  if (res.user?.domain) domainNames[res.user.domain.id] = res.user.domain.name;

  const toProject = (id, p = {}) => {
    const domainId = p.domain_id || p.domain?.id || '';
    const domainName = p.domain?.name || domainNames[domainId] || '';
    return {
      id,
      name: p.name || id,
      domainId,
      domainName,
      displayName: domainName ? `${domainName} > ${p.name || id}` : p.name || id,
      description: p.description || '',
      enabled: p.enabled !== false,
    };
  };

  let projects = [];
  if (Array.isArray(res.projects)) projects = res.projects.map((p) => toProject(p.id, p));
  else if (res.projects && typeof res.projects === 'object') {
    projects = Object.entries(res.projects).map(([id, p]) => toProject(id, p));
  }

  const currentProject = res.project ? toProject(res.project.id, res.project) : projects[0] || EMPTY_PROJECT;
  const roles = Array.isArray(res.roles) ? res.roles.map((r) => (typeof r === 'string' ? r : r.name)) : [];
  const expiresAt =
    res.keystone_token_exp ||
    (res.exp ? new Date(res.exp * 1000).toISOString() : null) ||
    new Date(Date.now() + 3600 * 1000).toISOString();

  return {
    token: res.keystone_token || res.token || '',
    expiresAt,
    region: res.region || 'RegionOne',
    regions: Array.isArray(res.regions) && res.regions.length ? res.regions : null,
    projects,
    currentProject,
    roles,
    user: {
      id: res.user?.id || '',
      username: res.user?.name || '',
      domain: res.user?.domain?.name || '',
      domainId: res.user?.domain?.id || '',
      roles,
      email: res.user?.email || '',
      defaultProjectId: res.default_project_id || '',
    },
    baseDomains: res.base_domains || [],
    endpoints: res.endpoints,
    version: res.version || '',
  };
};

export const useAuthStore = create((set, get) => ({
  user: savedUser || { id: '', username: '', domain: '', roles: [], email: '' },
  token: initialToken,
  expiresAt: isInitialExpired ? null : savedExpiresAt,
  isAuthenticated: initialIsAuth,
  backendUrl: 'http://10.0.29.10:9999',
  backendConnected: false,
  lastPingMs: null,

  currentProject: readJSON('keystone_current_project', EMPTY_PROJECT),
  projects: readJSON('keystone_projects', []),
  currentRegion: localStorage.getItem('keystone_region') || 'RegionOne',
  regions: readJSON('skyline_regions', ['RegionOne']),
  baseDomains: readJSON('skyline_base_domains', []),
  // Legacy rootStore semantics: hasAdminPageRole = system-scope admin/reader role,
  // hasAdminRole mirrors it, hasAdminOnlyRole = project role "admin".
  hasAdminPageRole: localStorage.getItem('skyline_admin_page_role') === '1',
  hasAdminRole: localStorage.getItem('skyline_admin_page_role') === '1',
  hasAdminOnlyRole: Boolean(savedUser?.roles?.includes('admin')),
  isSystemReaderOnly: localStorage.getItem('skyline_system_reader_only') === '1',

  /** Applies a skyline Profile and persists it (single place for login / profile / switch). */
  applyProfile: async (res) => {
    const p = parseProfile(res);
    if (p.token) {
      localStorage.setItem('keystone_token', p.token);
      localStorage.setItem('keystone_token_expires_at', p.expiresAt);
    }
    saveEndpoints(p.endpoints);
    localStorage.setItem('keystone_username', p.user.username);
    localStorage.setItem('keystone_domain', p.user.domain);
    localStorage.setItem('keystone_region', p.region);
    localStorage.setItem('keystone_current_project', JSON.stringify(p.currentProject));
    localStorage.setItem('keystone_projects', JSON.stringify(p.projects));
    localStorage.setItem('skyline_user', JSON.stringify(p.user));
    localStorage.setItem('skyline_base_domains', JSON.stringify(p.baseDomains));
    if (p.regions) localStorage.setItem('skyline_regions', JSON.stringify(p.regions));

    set({
      ...(p.token ? { token: p.token, expiresAt: p.expiresAt } : {}),
      isAuthenticated: true,
      backendConnected: true,
      currentRegion: p.region,
      ...(p.regions ? { regions: p.regions } : {}),
      user: p.user,
      projects: p.projects,
      currentProject: p.currentProject,
      baseDomains: p.baseDomains,
      hasAdminOnlyRole: p.roles.includes('admin'),
    });
    await Promise.all([get().refreshSystemRoles(p.user.id), usePolicyStore.getState().load()]);
  },

  /** Legacy getUserSystemRoles: only system-scope admin/reader may open administrator pages */
  refreshSystemRoles: async (userId = get().user?.id) => {
    let systemRoles = [];
    if (userId) {
      try {
        const res = await apiClient.get(`${serviceBase('keystone')}/system/users/${userId}/roles`);
        systemRoles = (res?.roles || []).map((r) => r.name);
      } catch {
        systemRoles = [];
      }
    }
    const allowed = systemRoles.includes('admin') || systemRoles.includes('reader');
    // legacy systemRoleIsReader: reader without admin -> read-only on administrator pages
    const isSystemReaderOnly = systemRoles.includes('reader') && !systemRoles.includes('admin');
    localStorage.setItem('skyline_admin_page_role', allowed ? '1' : '0');
    localStorage.setItem('skyline_system_reader_only', isSystemReaderOnly ? '1' : '0');
    set({ hasAdminPageRole: allowed, hasAdminRole: allowed, isSystemReaderOnly });
    return allowed;
  },

  // Kept for compatibility: local selection only. Use switchProject to re-scope the token.
  setProject: (project) => {
    localStorage.setItem('keystone_current_project', JSON.stringify(project));
    set({ currentProject: project });
  },
  setRegion: (region) => {
    localStorage.setItem('keystone_region', region);
    set({ currentRegion: region });
  },

  /** Re-scopes the keystone token to another project (legacy rootStore.switchProject) */
  switchProject: async (projectId, domainId) => {
    const project = get().projects.find((p) => p.id === projectId);
    const res = await skylineApi.switchProject(projectId, domainId || project?.domainId);
    await get().applyProfile(res);
    return res;
  },

  /** Legacy rootStore.switchRegion */
  switchRegion: async (region) => {
    const res = await skylineApi.switchRegion(region);
    await get().applyProfile(res);
    return res;
  },

  // Set keystone token manually
  setToken: async (token) => {
    if (token) {
      localStorage.setItem('keystone_token', token);
      set({ token, isAuthenticated: true });
      await get().fetchProfile();
    } else {
      localStorage.removeItem('keystone_token');
      set({ token: '', isAuthenticated: false });
    }
  },

  // Ping backend to check if proxy & backend are alive
  checkBackendStatus: async () => {
    const start = performance.now();
    try {
      await apiClient.get('/openstack/skyline/api/v1/profile').catch((err) => {
        // 401 still means backend is reachable and alive
        if (err.response && (err.response.status === 401 || err.response.status === 200)) {
          return { ok: true, status: err.response.status };
        }
        throw err;
      });
      const duration = Math.round(performance.now() - start);
      set({ backendConnected: true, lastPingMs: duration });
      return { success: true, latency: duration };
    } catch (err) {
      set({ backendConnected: false, lastPingMs: null });
      return { success: false, error: formatErrorMessage(err) };
    }
  },

  // Login via Skyline API
  login: async ({ domain = 'Default', username, password, region }) => {
    try {
      const res = await skylineApi.login({ domain, username, password, ...(region ? { region } : {}) });
      if (!res?.keystone_token) {
        throw new Error(t('No Keystone token received in the server response'));
      }
      await get().applyProfile(res);
      message.success(t('Logged in to Keystone successfully as {username}!', { username }));
      return { success: true };
    } catch (err) {
      const detail = err?.response?.data?.detail;
      // Two-factor users: keystone answers with a receipt, the passcode step follows (legacy setTotpRequired)
      if (detail && typeof detail === 'object' && detail.totp_required) {
        return { success: false, totpRequired: true, receipt: detail.receipt };
      }
      const errorMsg = formatErrorMessage(err);
      // the login page shows the (friendly) error inline; no duplicate toast
      return { success: false, error: errorMsg, detail };
    }
  },

  /** Second login step for users with TOTP enabled (legacy rootStore.loginTotp) */
  loginTotp: async ({ domain, username, passcode, receipt }) => {
    try {
      const res = await skylineApi.loginTotp({ domain, username, passcode, receipt });
      await get().applyProfile(res);
      message.success(t('Logged in to Keystone successfully as {username}!', { username }));
      return { success: true };
    } catch (err) {
      // legacy Login.onFinish: 'receipt_expired' -> back to the password step, anything else -> 'invalid_totp'
      const detail = err?.response?.data?.detail || '';
      const code = detail === 'receipt_expired' ? 'receipt_expired' : 'invalid_totp';
      return { success: false, error: formatErrorMessage(err), code };
    }
  },

  // Fetch current Keystone profile & projects
  fetchProfile: async () => {
    try {
      const profile = await skylineApi.getProfile();
      if (profile) await get().applyProfile(profile);
    } catch (err) {
      console.warn('Could not load profile from live Keystone, using cached state.', err.message);
    }
  },

  // Disconnect / Logout
  logout: async (silent = false) => {
    try {
      await skylineApi.logout().catch(() => {});
    } finally {
      [
        'keystone_token',
        'keystone_token_expires_at',
        'keystone_username',
        'skyline_user',
        'skyline_admin_page_role',
        'skyline_system_reader_only',
        'keystone_current_project',
        'keystone_projects',
      ].forEach((k) => localStorage.removeItem(k));
      set({
        token: '',
        expiresAt: null,
        isAuthenticated: false,
        hasAdminPageRole: false,
        hasAdminRole: false,
        hasAdminOnlyRole: false,
        isSystemReaderOnly: false,
        user: { id: '', username: '', domain: '', roles: [], email: '' },
      });
      usePolicyStore.getState().clear();
      if (!silent) {
        message.info(t('You have been logged out of your OpenStack session.'));
      }
    }
  },

  // Check if token has expired
  checkTokenExpiry: () => {
    const { token, expiresAt } = get();
    if (!token) return true;
    const exp = expiresAt || localStorage.getItem('keystone_token_expires_at');
    if (exp && Date.now() >= new Date(exp).getTime()) {
      get().logout(true);
      return true;
    }
    return false;
  },
}));
