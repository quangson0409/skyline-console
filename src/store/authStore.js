import { create } from 'zustand';
import { skylineApi } from '@/api/skyline';
import apiClient from '@/api/client';
import { message } from 'antd';

export const formatErrorMessage = (err) => {
  if (!err) return 'Lỗi không xác định';
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
  return 'Lỗi kết nối máy chủ';
};

const DEFAULT_PROJECT = {
  id: '99b1fbbf5b3a4b6486288d842a33781e',
  name: 'admin',
  domainName: 'Default',
  displayName: 'Default > admin',
  description: 'Bootstrap project for initializing the cloud.',
};

const savedProjects = (() => {
  try {
    const raw = localStorage.getItem('keystone_projects');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

const savedCurrentProject = (() => {
  try {
    const raw = localStorage.getItem('keystone_current_project');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

export const useAuthStore = create((set, get) => ({
  user: {
    username: localStorage.getItem('keystone_username') || 'admin',
    domain: localStorage.getItem('keystone_domain') || 'Default',
    roles: ['admin', 'member', 'manager'],
    email: 'admin@skyline.openstack.org',
  },
  token: localStorage.getItem('keystone_token') || '',
  isAuthenticated: !!localStorage.getItem('keystone_token'),
  backendUrl: 'http://10.0.29.10:9999',
  backendConnected: false,
  lastPingMs: null,

  currentProject: savedCurrentProject || DEFAULT_PROJECT,
  projects: savedProjects && savedProjects.length > 0 ? savedProjects : [DEFAULT_PROJECT],
  currentRegion: localStorage.getItem('keystone_region') || 'RegionOne',
  regions: ['RegionOne'],
  hasAdminRole: true,

  setProject: (project) => {
    localStorage.setItem('keystone_current_project', JSON.stringify(project));
    set({ currentProject: project });
  },
  setRegion: (region) => {
    localStorage.setItem('keystone_region', region);
    set({ currentRegion: region });
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
      const res = await apiClient.get('/openstack/skyline/api/v1/profile').catch((err) => {
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
  login: async ({ domain = 'Default', username = 'admin', password }) => {
    try {
      const res = await skylineApi.login({ domain, username, password });
      const token = res?.keystone_token || res?.token || res?.access_token || res?.id;

      if (!token) {
        throw new Error('Không nhận được Keystone Token từ phản hồi của máy chủ');
      }

      const currentRegion = res?.region || 'RegionOne';
      localStorage.setItem('keystone_token', token);
      localStorage.setItem('keystone_username', username);
      localStorage.setItem('keystone_domain', domain);
      localStorage.setItem('keystone_region', currentRegion);

      // Parse projects
      let projectsList = [];
      if (res.projects) {
        if (Array.isArray(res.projects)) {
          projectsList = res.projects.map((p) => ({
            id: p.id,
            name: p.name,
            domainName: p.domain?.name || 'Default',
            displayName: `Default > ${p.name}`,
            description: p.description || 'OpenStack Project',
          }));
        } else if (typeof res.projects === 'object') {
          projectsList = Object.entries(res.projects).map(([id, p]) => ({
            id,
            name: p.name || id,
            domainName: 'Default',
            displayName: `Default > ${p.name || id}`,
            description: p.description || 'OpenStack Project',
          }));
        }
      }

      const activeProject = res.project
        ? {
            id: res.project.id,
            name: res.project.name,
            domainName: res.project.domain?.name || 'Default',
            displayName: `${res.project.domain?.name || 'Default'} > ${res.project.name}`,
            description: 'Current Project',
          }
        : projectsList[0] || DEFAULT_PROJECT;

      if (projectsList.length > 0) {
        localStorage.setItem('keystone_projects', JSON.stringify(projectsList));
      }
      localStorage.setItem('keystone_current_project', JSON.stringify(activeProject));

      const roles = Array.isArray(res.roles)
        ? res.roles.map((r) => (typeof r === 'string' ? r : r.name || String(r)))
        : ['admin'];

      set({
        token,
        isAuthenticated: true,
        backendConnected: true,
        currentRegion,
        hasAdminRole: roles.some((r) => ['admin', 'administrator'].includes(String(r).toLowerCase())),
        user: {
          username: res.user?.name || username,
          domain: res.user?.domain?.name || domain,
          roles,
          email: `${res.user?.name || username}@openstack.local`,
        },
        projects: projectsList.length > 0 ? projectsList : [activeProject],
        currentProject: activeProject,
      });

      message.success(`Đăng nhập Keystone thành công với tài khoản ${username}!`);
      return { success: true };
    } catch (err) {
      const errorMsg = formatErrorMessage(err);
      message.error(`Đăng nhập thất bại: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  },

  // Fetch current Keystone profile & projects
  fetchProfile: async () => {
    try {
      const profile = await skylineApi.getProfile();
      if (profile) {
        const keystoneUser = profile.user || {};
        let projectsList = [];
        if (profile.projects) {
          if (Array.isArray(profile.projects)) {
            projectsList = profile.projects.map((p) => ({
              id: p.id,
              name: p.name,
              domainName: p.domain?.name || 'Default',
              displayName: `${p.domain?.name || 'Default'} > ${p.name}`,
              description: p.description || 'OpenStack Project',
            }));
          } else if (typeof profile.projects === 'object') {
            projectsList = Object.entries(profile.projects).map(([id, p]) => ({
              id,
              name: p.name || id,
              domainName: 'Default',
              displayName: `Default > ${p.name || id}`,
              description: p.description || 'OpenStack Project',
            }));
          }
        }

        set({
          user: {
            username: keystoneUser.name || get().user.username,
            domain: keystoneUser.domain?.name || get().user.domain,
            roles: profile.roles?.map((r) => r.name || r) || get().user.roles,
            email: keystoneUser.email || get().user.email,
          },
          projects: projectsList.length > 0 ? projectsList : get().projects,
          currentProject: projectsList.length > 0 ? projectsList[0] : get().currentProject,
          isAuthenticated: true,
          backendConnected: true,
        });
      }
    } catch (err) {
      console.warn('Could not load profile from live Keystone, using cached state.', err.message);
    }
  },

  // Disconnect / Logout
  logout: async () => {
    try {
      await skylineApi.logout().catch(() => {});
    } finally {
      localStorage.removeItem('keystone_token');
      localStorage.removeItem('keystone_username');
      set({
        token: '',
        isAuthenticated: false,
        user: {
          username: 'admin',
          domain: 'Default',
          roles: ['admin', 'member'],
          email: 'admin@skyline.openstack.org',
        },
      });
      message.info('Đã đăng xuất phiên làm việc OpenStack.');
    }
  },
}));
