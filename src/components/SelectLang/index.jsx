import React from 'react';
import { Dropdown, Space, Tooltip } from 'antd';
import { GlobalOutlined, CheckOutlined, DownOutlined } from '@ant-design/icons';
import { useTranslation, ENABLED_LOCALES } from '@/core/i18n';
import { useThemeStore, THEMES } from '@/store/themeStore';

const LANGS = [
  { key: 'vi', code: 'VI', label: 'Tiếng Việt', flag: '🇻🇳' },
  { key: 'en', code: 'EN', label: 'English', flag: '🇬🇧' },
  { key: 'zh', code: 'ZH', label: '简体中文', flag: '🇨🇳' },
].filter((l) => ENABLED_LOCALES.includes(l.key));

export default function SelectLang({ compact = false }) {
  const { locale, setLocale, t } = useTranslation();
  const { currentTheme } = useThemeStore();
  const isDark = currentTheme === THEMES.DARK_OPS;

  const current = LANGS.find((l) => l.key === locale) || LANGS[0];
  // a single enabled language: nothing to choose
  if (LANGS.length <= 1) return null;

  const menuItems = LANGS.map((item) => {
    const isSelected = item.key === locale;
    return {
      key: item.key,
      label: (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minWidth: 140,
            padding: '4px 2px',
          }}
        >
          <Space size={8}>
            <span style={{ fontSize: 15, lineHeight: 1 }}>{item.flag}</span>
            <span style={{ fontWeight: isSelected ? 600 : 400, fontSize: 13, color: isSelected ? '#0068ff' : 'inherit' }}>
              {item.label}
            </span>
          </Space>
          {isSelected && <CheckOutlined style={{ color: '#0068ff', fontSize: 12, marginLeft: 12 }} />}
        </div>
      ),
      onClick: () => setLocale(item.key),
    };
  });

  return (
    <Dropdown
      menu={{
        items: menuItems,
        style: {
          borderRadius: 8,
          boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.08)',
          border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
        },
      }}
      trigger={['click']}
      placement="bottomRight"
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={t('Select Language')}
        style={{
          cursor: 'pointer',
          height: 30,
          padding: compact ? '0 6px' : '0 8px',
          borderRadius: 6,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 12,
          fontWeight: 600,
          background: isDark ? '#1e293b' : '#ffffff',
          border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          color: isDark ? '#e2e8f0' : '#475569',
          transition: 'all 0.15s ease',
          userSelect: 'none',
          boxSizing: 'border-box',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#0068ff';
          e.currentTarget.style.color = '#0068ff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = isDark ? '#334155' : '#e2e8f0';
          e.currentTarget.style.color = isDark ? '#e2e8f0' : '#475569';
        }}
      >
        <GlobalOutlined style={{ fontSize: 13 }} />
        <span>{current.code}</span>
        <DownOutlined style={{ fontSize: 8, color: '#94a3b8' }} />
      </div>
    </Dropdown>
  );
}
