import React, { useState, useEffect } from 'react';
import { Layout, ConfigProvider, Drawer } from 'antd';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import GlobalHeader from '@/components/Layout/GlobalHeader';
import SidebarNav from '@/components/Layout/SidebarNav';
import { useThemeStore, THEMES } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { handleSessionExpired, isTokenExpired } from '@/api/client';
import { useTranslation } from '@/core/i18n';
import viVN from 'antd/locale/vi_VN';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';

const { Content } = Layout;

const antdLocales = {
  vi: viVN,
  en: enUS,
  zh: zhCN,
};

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const { isAuthenticated, token, checkTokenExpiry } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const { getAntdThemeConfig, currentTheme } = useThemeStore();
  const { locale } = useTranslation();

  const themeConfig = getAntdThemeConfig();
  const antdLocale = antdLocales[locale] || viVN;

  const isDark = currentTheme === THEMES.DARK_OPS;
  const contentBg = isDark ? '#090d16' : '#f8fafc';

  // Session expiry heartbeat monitor
  useEffect(() => {
    const monitorSession = () => {
      if (isTokenExpired() || checkTokenExpiry()) {
        const currentPath = location.pathname + location.search;
        handleSessionExpired('Phiên làm việc OpenStack đã hết hạn. Vui lòng đăng nhập lại.');
      }
    };

    // Run check every 20 seconds
    const interval = setInterval(monitorSession, 20000);
    return () => clearInterval(interval);
  }, [location, checkTokenExpiry]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Proactive Route Guard: if unauthenticated or expired, redirect to login
  if (!isAuthenticated || !token || isTokenExpired()) {
    const currentPath = location.pathname + location.search;
    return <Navigate to={`/auth/login?redirect=${encodeURIComponent(currentPath)}&expired=1`} replace />;
  }

  const handleToggle = () => {
    if (isMobile) {
      setMobileDrawerOpen(!mobileDrawerOpen);
    } else {
      setCollapsed(!collapsed);
    }
  };

  return (
    <ConfigProvider theme={themeConfig} locale={antdLocale}>
      <Layout style={{ minHeight: '100vh', background: contentBg }}>
        <GlobalHeader onToggleSidebar={handleToggle} isMobile={isMobile} />
        <Layout style={{ background: contentBg }}>
          {isMobile ? (
            <Drawer
              open={mobileDrawerOpen}
              onClose={() => setMobileDrawerOpen(false)}
              placement="left"
              styles={{ body: { padding: 0 } }}
              width={260}
              destroyOnHidden
            >
              <SidebarNav collapsed={false} onSelect={() => setMobileDrawerOpen(false)} />
            </Drawer>
          ) : (
            <SidebarNav collapsed={collapsed} />
          )}
          <Layout style={{ padding: isMobile ? '12px 12px' : '24px 28px', background: contentBg }}>
            <Content style={{ minHeight: 280 }}>
              <Outlet />
            </Content>
          </Layout>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
