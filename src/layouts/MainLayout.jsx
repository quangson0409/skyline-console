import React, { useState } from 'react';
import { Layout, ConfigProvider } from 'antd';
import { Outlet } from 'react-router-dom';
import GlobalHeader from '@/components/Layout/GlobalHeader';
import SidebarNav from '@/components/Layout/SidebarNav';
import { useThemeStore, THEMES } from '@/store/themeStore';
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
  const { getAntdThemeConfig, currentTheme } = useThemeStore();
  const { locale } = useTranslation();

  const themeConfig = getAntdThemeConfig();
  const antdLocale = antdLocales[locale] || viVN;

  const isDark = currentTheme === THEMES.DARK_OPS;
  const contentBg = isDark ? '#090d16' : '#f8fafc';

  return (
    <ConfigProvider theme={themeConfig} locale={antdLocale}>
      <Layout style={{ minHeight: '100vh', background: contentBg }}>
        <GlobalHeader onToggleSidebar={() => setCollapsed(!collapsed)} />
        <Layout style={{ background: contentBg }}>
          <SidebarNav collapsed={collapsed} />
          <Layout style={{ padding: '24px 28px', background: contentBg }}>
            <Content style={{ minHeight: 280 }}>
              <Outlet />
            </Content>
          </Layout>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
