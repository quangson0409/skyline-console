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
} from '@ant-design/icons';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore, THEMES } from '@/store/themeStore';
import { isAdminPath } from '@/layouts/menuConfig';
import { useTranslation } from '@/core/i18n';
import SelectLang from '@/components/SelectLang';

export default function GlobalHeader({ onToggleSidebar }) {
  const navigate = useNavigate();
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
  const isAdmin = isAdminPath(location.pathname);

  const projectList = Array.isArray(projects) ? projects : Object.values(projects || {});
  const projectItems = projectList.map((p) => {
    const pId = p.id || p.key || 'admin';
    const pName = p.displayName || p.name || 'Default > admin';
    const pDesc = p.description || '';
    const isCurrent = currentProject && (pId === currentProject.id || pName === currentProject.displayName);
    return {
      key: pId,
      label: (
        <Space>
          {isCurrent && <CheckCircleFilled style={{ color: '#0068ff' }} />}
          <b style={{ color: '#0f172a' }}>{pName}</b>
          {pDesc && <span style={{ fontSize: 11, color: '#8c8c8c' }}>({pDesc})</span>}
        </Space>
      ),
      onClick: () => {
        setProject(p);
        message.success(`${t('Project')}: ${pName}`);
      },
    };
  });

  const regionList = Array.isArray(regions) ? regions : ['RegionOne'];
  const regionItems = regionList.map((r) => {
    const rName = typeof r === 'string' ? r : r.id || 'RegionOne';
    return {
      key: rName,
      label: (
        <Space>
          {rName === currentRegion && <CheckCircleFilled style={{ color: '#0068ff' }} />}
          <span>Region: {rName}</span>
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
      <Tag key={i} color="blue" style={{ fontSize: 10, margin: '0 2px' }}>
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
      key: 'openrc',
      icon: <DownloadOutlined />,
      label: t('Download OpenRC'),
      onClick: () => message.success('admin-openrc.sh (v3)'),
    },
    {
      key: 'clouds-yaml',
      icon: <DownloadOutlined />,
      label: t('Download clouds.yaml'),
      onClick: () => message.success('clouds.yaml'),
    },
    {
      key: 'change-pass',
      icon: <KeyOutlined />,
      label: t('Change Password'),
      onClick: () => message.info(t('Change Password')),
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
    { label: 'Skyline Light', value: THEMES.SKYLINE_LIGHT },
    { label: 'Tech Blue', value: THEMES.TECH_BLUE },
    { label: 'Dark Ops', value: THEMES.DARK_OPS },
  ];

  const isDark = currentTheme === THEMES.DARK_OPS;

  return (
    <div
      className="skyline-header"
      style={{
        height: 56,
        lineHeight: '56px',
        padding: '0 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: isDark ? '#0d131f' : '#ffffff',
        borderBottom: isDark ? '1px solid #1f293d' : '1px solid #e2e8f0',
        color: isDark ? '#ffffff' : '#0f172a',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        transition: 'all 0.3s ease',
      }}
    >
      {/* Left: Hamburger, Skyline Logo, Subtitle, Project pill, Region pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 8px',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isDark ? '#94a3b8' : '#475569',
            fontSize: 16,
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = isDark ? '#1e293b' : '#f1f5f9')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          <MenuOutlined />
        </button>

        {/* Brand: Skyline Console */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => navigate('/base/overview')}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'linear-gradient(135deg, #0068ff, #005ade)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0, 104, 255, 0.3)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M4 18 L12 6 L20 18 Z" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="2" fill="#ffffff" />
            </svg>
          </div>

          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.2 }}>
            <span style={{ color: isDark ? '#60a5fa' : '#0068ff' }}>Skyline</span>{' '}
            <span style={{ color: isDark ? '#ffffff' : '#0f172a', fontWeight: 700 }}>Console</span>
          </div>

          {/* Vertical Divider */}
          <div style={{ width: 1, height: 18, background: isDark ? '#334155' : '#e2e8f0' }} />

          {/* Subtitle */}
          <span style={{ fontSize: 12, fontWeight: 500, color: '#64748b' }}>
            OpenStack Cloud Platform
          </span>
        </div>

        {/* Pill 1: Project Dropdown */}
        <Dropdown menu={{ items: projectItems }} trigger={['click']}>
          <div
            style={{
              background: isDark ? '#141c2b' : '#ffffff',
              border: isDark ? '1px solid #223048' : '1px solid #cbd5e1',
              borderRadius: 20,
              padding: '3px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: isDark ? '#e2e8f0' : '#1e293b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              lineHeight: '22px',
              transition: 'border-color 0.2s',
            }}
          >
            <BankOutlined style={{ color: '#0068ff', fontSize: 12 }} />
            <span>{currentProject ? (currentProject.displayName || currentProject.name) : 'Default > admin'}</span>
            <DownOutlined style={{ fontSize: 9, color: '#94a3b8' }} />
          </div>
        </Dropdown>

        {/* Pill 2: Region Dropdown */}
        <Dropdown menu={{ items: regionItems }} trigger={['click']}>
          <div
            style={{
              background: isDark ? '#141c2b' : '#ffffff',
              border: isDark ? '1px solid #223048' : '1px solid #cbd5e1',
              borderRadius: 20,
              padding: '3px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: isDark ? '#e2e8f0' : '#1e293b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              lineHeight: '22px',
              transition: 'border-color 0.2s',
            }}
          >
            <GlobalOutlined style={{ color: '#0068ff' }} />
            <span>Region: {currentRegion || 'RegionOne'}</span>
            <DownOutlined style={{ fontSize: 9, color: '#94a3b8' }} />
          </div>
        </Dropdown>
      </div>

      {/* Right: Quick actions, Theme switcher, Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Project / Administrator Scope Switcher */}
        {isAdmin ? (
          <Button
            type="primary"
            ghost
            size="small"
            icon={<AppstoreOutlined />}
            onClick={() => {
              navigate('/base/overview');
              message.info(t('Switch to Project'));
            }}
            style={{
              borderRadius: 14,
              fontWeight: 600,
              fontSize: 12,
              height: 28,
              borderColor: '#0068ff',
              color: '#0068ff',
            }}
          >
            {t('Switch to Project')}
          </Button>
        ) : (
          <Button
            size="small"
            icon={<SafetyCertificateOutlined style={{ color: '#ef4444' }} />}
            onClick={() => {
              navigate('/base/overview-admin');
              message.info(t('Administrator View'));
            }}
            style={{
              borderRadius: 14,
              fontWeight: 600,
              fontSize: 12,
              height: 28,
              borderColor: isDark ? '#334155' : '#cbd5e1',
              color: isDark ? '#f87171' : '#b91c1c',
              background: isDark ? '#1e293b' : '#fff1f2',
            }}
          >
            {t('Administrator')}
          </Button>
        )}

        {/* Language selector (i18n) */}
        <SelectLang />

        {/* Theme mode switcher */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: isDark ? '#141c2b' : '#f1f5f9',
            padding: '2px 8px',
            borderRadius: 16,
          }}
        >
          <Tooltip title={t('Theme')}>
            <BgColorsOutlined style={{ color: '#0068ff' }} />
          </Tooltip>
          <Segmented
            size="small"
            value={currentTheme}
            onChange={(val) => setTheme(val)}
            options={themeOptions}
          />
        </div>

        {/* AI Cloud Assistant */}
        <Tooltip title="Skyline Cloud Assistant">
          <div
            style={{
              cursor: 'pointer',
              padding: '6px 8px',
              borderRadius: 6,
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ThunderboltOutlined style={{ fontSize: 15 }} />
          </div>
        </Tooltip>

        {/* OpenStack CLI Terminal */}
        <Tooltip title={t('Web CLI')}>
          <div
            style={{
              cursor: 'pointer',
              padding: '6px 8px',
              borderRadius: 6,
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <CodeOutlined style={{ fontSize: 15 }} />
          </div>
        </Tooltip>

        {/* Activity log */}
        <Tooltip title={t('Operation Log')}>
          <div
            style={{
              cursor: 'pointer',
              padding: '6px 8px',
              borderRadius: 6,
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ClockCircleOutlined style={{ fontSize: 15 }} />
          </div>
        </Tooltip>

        {/* User Avatar */}
        <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              padding: '2px 4px',
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
              }}
            >
              {user && user.username ? user.username.substring(0, 2).toUpperCase() : 'AD'}
            </Avatar>
            <DownOutlined style={{ fontSize: 9, color: '#94a3b8' }} />
          </div>
        </Dropdown>
      </div>
    </div>
  );
}
