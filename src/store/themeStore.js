import { create } from 'zustand';
import { theme } from 'antd';

export const THEMES = {
  SKYLINE_LIGHT: 'skyline-light',   // Default Skyline Console theme (clean white layout)
  TECH_BLUE: 'tech-blue',           // Option 1 (Slate sidebar)
  DARK_OPS: 'dark-ops',             // Option 2 (Dark mode)
  EMERALD_INDIGO: 'emerald-indigo', // Option 3 (Indigo)
};

export const useThemeStore = create((set, get) => ({
  currentTheme: THEMES.SKYLINE_LIGHT, // Set Skyline Light as DEFAULT

  setTheme: (newTheme) => {
    set({ currentTheme: newTheme });
    if (newTheme === THEMES.DARK_OPS) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  },

  getAntdThemeConfig: () => {
    const { currentTheme } = get();

    switch (currentTheme) {
      case THEMES.DARK_OPS:
        return {
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: '#06b6d4',
            colorInfo: '#38bdf8',
            colorSuccess: '#10b981',
            colorWarning: '#f59e0b',
            colorError: '#ef4444',
            colorBgBase: '#090d16',
            colorBgContainer: '#111827',
            colorBgElevated: '#1f2937',
            colorBorder: '#1f293d',
            borderRadius: 8,
            fontFamily: "'Inter', sans-serif",
          },
        };

      case THEMES.TECH_BLUE:
        return {
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#1677ff',
            colorSuccess: '#52c41a',
            colorWarning: '#fa8c16',
            colorError: '#f5222d',
            colorBgBase: '#ffffff',
            colorBorder: '#e2e8f0',
            borderRadius: 6,
            fontFamily: "'Inter', sans-serif",
          },
        };

      case THEMES.EMERALD_INDIGO:
        return {
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#4f46e5',
            colorSuccess: '#10b981',
            colorBgBase: '#ffffff',
            borderRadius: 8,
            fontFamily: "'Inter', sans-serif",
          },
        };

      case THEMES.SKYLINE_LIGHT:
      default:
        return {
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#0068ff',         // Skyline Console primary color from variables.less
            colorInfo: '#1677ff',
            colorSuccess: '#10b981',         // Green ACTIVE
            colorWarning: '#fa8c16',
            colorError: '#ef4444',
            colorTextBase: '#0f172a',
            colorBgBase: '#ffffff',
            colorBgContainer: '#ffffff',
            colorBgLayout: '#f8fafc',
            colorBorder: '#e2e8f0',
            borderRadius: 8,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          },
        };
    }
  },
}));
