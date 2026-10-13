import React, { useMemo } from 'react';
import { Layout, Menu, Tag, Typography } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useThemeStore, THEMES } from '@/store/themeStore';
import { getTenantMenu, getAdminMenu, isAdminPath, filterMenuByEndpoints } from '@/layouts/menuConfig';
import { hasEndpoint } from '@/api/endpoints';
import { SafetyCertificateOutlined, AppstoreOutlined } from '@ant-design/icons';
import { useTranslation } from '@/core/i18n';

const { Sider } = Layout;
const { Text } = Typography;

export default function SidebarNav({ collapsed }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentTheme } = useThemeStore();
  const { t, locale } = useTranslation();

  const isDark = currentTheme === THEMES.DARK_OPS;
  const isAdmin = isAdminPath(location.pathname);

  const rawMenu = useMemo(() => {
    return filterMenuByEndpoints(isAdmin ? getAdminMenu(t) : getTenantMenu(t), hasEndpoint);
  }, [isAdmin, t, locale]);

  // Transform menu items for Ant Design Menu component
  const menuItems = useMemo(() => {
    return rawMenu.map((item) => {
      if (item.children) {
        return {
          key: item.key,
          icon: item.icon,
          label: item.label,
          children: item.children.map((child) => ({
            key: child.path || child.key,
            icon: child.icon,
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span>{child.label}</span>
                {child.badge && (
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 8,
                      background: 'rgba(0, 104, 255, 0.15)',
                      color: '#0068ff',
                      fontWeight: 600,
                      marginLeft: 6,
                    }}
                  >
                    {child.badge}
                  </span>
                )}
              </div>
            ),
          })),
        };
      }

      return {
        key: item.path || item.key,
        icon: item.icon,
        label: item.label,
      };
    });
  }, [rawMenu]);

  // Find active parent keys to expand
  const defaultOpenKeys = useMemo(() => {
    const active = location.pathname;
    const parent = rawMenu.find(
      (m) => m.children && m.children.some((c) => c.path === active || active.startsWith(c.path))
    );
    return parent ? [parent.key] : ['compute', 'network', 'storage', 'computeAdmin'];
  }, [location.pathname, rawMenu]);

  const siderBg = isDark ? '#0c101a' : '#ffffff';
  const siderBorder = isDark ? '1px solid #1f293d' : '1px solid #f1f5f9';

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      trigger={null}
      width={250}
      style={{
        background: siderBg,
        borderRight: siderBorder,
        minHeight: 'calc(100vh - 56px)',
        height: 'calc(100vh - 56px)',
        position: 'sticky',
        top: 56,
        left: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'all 0.25s ease',
      }}
    >
      {/* Scope banner inside sidebar */}
      {!collapsed && (
        <div
          style={{
            padding: '10px 16px 6px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: isDark ? '1px solid #1e293b' : '1px solid #f1f5f9',
            marginBottom: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isAdmin ? (
              <SafetyCertificateOutlined style={{ color: '#ef4444', fontSize: 13 }} />
            ) : (
              <AppstoreOutlined style={{ color: '#0068ff', fontSize: 13 }} />
            )}
            <Text
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: isAdmin ? '#ef4444' : (isDark ? '#94a3b8' : '#64748b'),
              }}
            >
              {isAdmin ? `${t('Administrator')} View` : `${t('Project')} View`}
            </Text>
          </div>
          <Tag
            color={isAdmin ? 'error' : 'processing'}
            variant="borderless"
            style={{ fontSize: 10, lineHeight: '16px', padding: '0 6px', margin: 0, borderRadius: 10 }}
          >
            {isAdmin ? t('System Admin') : t('Project')}
          </Tag>
        </div>
      )}

      <div style={{ paddingTop: 4, paddingBottom: 20 }}>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={defaultOpenKeys}
          items={menuItems}
          theme={isDark ? 'dark' : 'light'}
          onClick={({ key }) => {
            if (key.startsWith('/')) {
              navigate(key);
              if (onSelect) onSelect();
            }
          }}
          style={{
            background: 'transparent',
            borderRight: 0,
            fontSize: 13,
            fontWeight: 500,
          }}
        />
      </div>
    </Sider>
  );
}
