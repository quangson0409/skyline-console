import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Dropdown,
  Space,
  Avatar,
  Segmented,
  Tooltip,
  Button,
  Tag,
  message,
} from 'antd';
import {
  MenuOutlined,
  DownOutlined,
  GlobalOutlined,
  BankOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  ThunderboltOutlined,
  BgColorsOutlined,
  CheckCircleFilled,
  DownloadOutlined,
  KeyOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  AppstoreOutlined,
  UserOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore, THEMES } from '@/store/themeStore';
import { isAdminPath } from '@/layouts/menuConfig';
import { useTranslation } from '@/core/i18n';
import SelectLang from '@/components/SelectLang';
import useActionRunner from '@/components/Action/useActionRunner';
import { openRcAction, cloudsYamlAction, tokenAction } from './accountActions';

export default function GlobalHeader({ onToggleSidebar, isMobile = false }) {
  const navigate = useNavigate();
  const { handleAction, actionModal } = useActionRunner();
  const location = useLocation();
  const { t } = useTranslation();

  const {
    currentProject,
    projects,
    setProject,
    currentRegion,
    regions,
    setRegion,
    user,
    logout,
  } = useAuthStore();

  const { currentTheme, setTheme } = useThemeStore();
  const isDark = currentTheme === THEMES.DARK_OPS;
  const isAdmin = isAdminPath(location.pathname);

  // Projects list
  const projectList = Array.isArray(projects) ? projects : Object.values(projects || {});
  const projectItems = projectList.map((p) => {
    const pId = p.id || p.key || 'admin';
    const pName = p.displayName || p.name || 'Default > admin';
    const pDesc = p.description || '';
    const isCurrent = currentProject && (pId === currentProject.id || pName === currentProject.displayName);
    return {
      key: pId,
      label: (
        <Space size={8}>
          {isCurrent && <CheckCircleFilled style={{ color: '#0068ff' }} />}
          <span style={{ fontWeight: isCurrent ? 700 : 500 }}>{pName}</span>
          {pDesc && <span style={{ fontSize: 11, color: '#8c8c8c' }}>({pDesc})</span>}
        </Space>
      ),
      onClick: () => {
        setProject(p);
        message.success(`${t('Project')}: ${pName}`);
      },
    };
  });

  // Regions list
  const regionList = Array.isArray(regions) ? regions : ['RegionOne'];
  const regionItems = regionList.map((r) => {
    const rName = typeof r === 'string' ? r : r.id || 'RegionOne';
    return {
      key: rName,
      label: (
        <Space size={8}>
          {rName === currentRegion && <CheckCircleFilled style={{ color: '#0068ff' }} />}
          <span>{rName}</span>
        </Space>
      ),
      onClick: () => {
        setRegion(rName);
        message.success(`Region: ${rName}`);
      },
    };
  });

  const userRoleTags = ((user && user.roles) || ['admin']).map((r, i) => {
    const roleName = typeof r === 'string' ? r : (r && r.name) || 'member';
    return (
      <Tag key={i} color="blue" variant="borderless" style={{ fontSize: 10, margin: '0 2px' }}>
        {roleName}
      </Tag>
    );
  });

  const userMenuItems = [
    {
      key: 'user-info',
      disabled: true,
      label: (
        <div style={{ padding: '6px 4px' }}>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{(user && user.username) || 'admin'}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            {t('Domain')}: <b>{(user && user.domain) || 'Default'}</b> | {t('Roles')}: {userRoleTags}
          </div>
        </div>
      ),
    },
    { type: 'divider' },
    {
      key: 'user-center',
      icon: <UserOutlined />,
      label: t('User Center'),
      onClick: () => navigate('/user/center'),
    },
    {
      key: 'credentials',
      icon: <KeyOutlined />,
      label: t('Application Credentials'),
      onClick: () => navigate('/user/application-credentials'),
    },
    {
      key: 'totp',
      icon: <SafetyOutlined />,
      label: t('Two-Factor Authentication'),
      onClick: () => navigate('/user/totp'),
    },
    { type: 'divider' },
    {
      key: 'change-pass',
      icon: <KeyOutlined />,
      label: t('Update Password'),
      onClick: () => navigate('/user/change-password'),
    },
    {
      key: 'token',
      icon: <SafetyOutlined />,
      label: t('Get Token'),
      onClick: () => handleAction(tokenAction()),
    },
    {
      key: 'openrc',
      icon: <DownloadOutlined />,
      label: t('Get OpenRC file'),
      onClick: () => handleAction(openRcAction()),
    },
    {
      key: 'clouds-yaml',
      icon: <DownloadOutlined />,
      label: t('Get clouds.yaml file'),
      onClick: () => handleAction(cloudsYamlAction()),
    },
    { type: 'divider' },
    {
      key: 'logout',
      danger: true,
      icon: <LogoutOutlined />,
      label: t('Log Out'),
      onClick: async () => {
        await logout();
        navigate('/auth/login', { replace: true });
      },
    },
  ];

  const themeOptions = [
    { label: 'Light', value: THEMES.SKYLINE_LIGHT },
    { label: 'Tech', value: THEMES.TECH_BLUE },
    { label: 'Dark', value: THEMES.DARK_OPS },
  ];

  return (
    <header
      style={{
        height: 54,
        padding: isMobile ? '0 12px' : '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: isDark ? '#0f172a' : '#ffffff',
        borderBottom: isDark ? '1px solid #1e293b' : '1px solid #f1f5f9',
        color: isDark ? '#ffffff' : '#0f172a',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.03)',
        boxSizing: 'border-box',
      }}
    >
      {/* Left: Hamburger, Brand, Project & Region Selectors */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14 }}>
        {/* Hamburger Toggle */}
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle navigation"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            width: 32,
            height: 32,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isDark ? '#94a3b8' : '#475569',
            padding: 0,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? '#1e293b' : '#f1f5f9')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <MenuOutlined style={{ fontSize: 16 }} />
        </button>

        {/* Brand Logo & Name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onClick={() => navigate(isAdmin ? '/base/overview-admin' : '/base/overview')}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: 'linear-gradient(135deg, #0068ff, #0052cc)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0, 104, 255, 0.25)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M4 18 L12 6 L20 18 Z" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="2" fill="#ffffff" />
            </svg>
          </div>

          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.2, whiteSpace: 'nowrap' }}>
            <span style={{ color: '#0068ff' }}>Skyline</span>
            {!isMobile && (
              <span style={{ color: isDark ? '#ffffff' : '#0f172a', fontWeight: 600, marginLeft: 4 }}>
                Console
              </span>
            )}
          </div>
        </div>

        {/* Project & Region Context Dropdowns (Desktop only) */}
        {!isMobile && (
          <>
            <div style={{ width: 1, height: 16, background: isDark ? '#334155' : '#e2e8f0', margin: '0 2px' }} />

            {/* Project Dropdown (Clean text style matching legacy Skyline) */}
            <Dropdown menu={{ items: projectItems }} trigger={['click']}>
              <div
                style={{
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  color: isDark ? '#cbd5e1' : '#334155',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? '#1e293b' : '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <BankOutlined style={{ color: '#0068ff', fontSize: 13 }} />
                <span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>Default &gt; </span>
                  <span style={{ fontWeight: 600 }}>{currentProject ? (currentProject.name || currentProject.displayName) : 'admin'}</span>
                </span>
                <DownOutlined style={{ fontSize: 9, color: '#94a3b8' }} />
              </div>
            </Dropdown>

            {/* Region Dropdown */}
            <Dropdown menu={{ items: regionItems }} trigger={['click']}>
              <div
                style={{
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  color: isDark ? '#cbd5e1' : '#334155',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? '#1e293b' : '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <GlobalOutlined style={{ color: '#0068ff', fontSize: 13 }} />
                <span style={{ fontWeight: 500 }}>{currentRegion || 'RegionOne'}</span>
                <DownOutlined style={{ fontSize: 9, color: '#94a3b8' }} />
              </div>
            </Dropdown>
          </>
        )}
      </div>

      {/* Right Side: Scope Toggle, SelectLang, Theme Switcher, Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
        {/* Project / Administrator Scope Switcher */}
        {isAdmin ? (
          <Button
            type="text"
            size="small"
            icon={<AppstoreOutlined style={{ color: '#0068ff' }} />}
            onClick={() => {
              navigate('/base/overview');
              message.info(t('Switched to Project view'));
            }}
            style={{
              height: 30,
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 12,
              color: '#0068ff',
              padding: isMobile ? '0 6px' : '0 8px',
            }}
          >
            {isMobile ? '' : t('Project View')}
          </Button>
        ) : (
          <Button
            type="text"
            size="small"
            icon={<SafetyCertificateOutlined style={{ color: '#475569' }} />}
            onClick={() => {
              navigate('/base/overview-admin');
              message.info(t('Switched to Administrator view'));
            }}
            style={{
              height: 30,
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 12,
              color: isDark ? '#cbd5e1' : '#475569',
              padding: isMobile ? '0 6px' : '0 8px',
            }}
          >
            {isMobile ? '' : t('Administrator')}
          </Button>
        )}

        {/* Language selector (i18n) */}
        <SelectLang compact={isMobile} />

        {/* Theme mode switcher (Desktop only) */}
        {!isMobile && (
          <Segmented
            size="small"
            value={currentTheme}
            onChange={(val) => setTheme(val)}
            options={themeOptions}
            style={{ fontSize: 12 }}
          />
        )}

        {/* User Avatar & Menu */}
        <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              padding: '2px',
              borderRadius: 20,
            }}
          >
            <Avatar
              size={28}
              style={{
                backgroundColor: '#0068ff',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {user && user.username ? user.username.substring(0, 2).toUpperCase() : 'AD'}
            </Avatar>
            <DownOutlined style={{ fontSize: 8, color: '#94a3b8' }} />
          </div>
        </Dropdown>
      </div>
      {actionModal}
    </header>
  );
}
