import React from 'react';
import { Dropdown, Space, Tooltip } from 'antd';
import { GlobalOutlined, CheckOutlined } from '@ant-design/icons';
import { useTranslation } from '@/core/i18n';
import { useThemeStore, THEMES } from '@/store/themeStore';

export default function SelectLang() {
  const { locale, setLocale, locales, t } = useTranslation();
  const { currentTheme } = useThemeStore();
  const isDark = currentTheme === THEMES.DARK_OPS;

  const currentLangObj = locales.find((l) => l.value === locale) || locales[0];

  const menuItems = locales.map((item) => ({
    key: item.value,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 140, padding: '2px 0' }}>
        <Space size={8}>
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.5px',
              background: item.value === locale ? 'rgba(0, 104, 255, 0.15)' : (isDark ? '#1f293d' : '#f1f5f9'),
              color: item.value === locale ? '#0068ff' : (isDark ? '#94a3b8' : '#64748b'),
            }}
          >
            {item.shortName.toUpperCase()}
          </span>
          <span style={{ fontWeight: item.value === locale ? 600 : 400 }}>{item.name}</span>
        </Space>
        {item.value === locale && <CheckOutlined style={{ color: '#0068ff', fontSize: 12 }} />}
      </div>
    ),
    onClick: () => setLocale(item.value),
  }));

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['click']}>
      <Tooltip title={t('Select Language')}>
        <div
          role="button"
          tabIndex={0}
          aria-label={t('Select Language')}
          style={{
            cursor: 'pointer',
            padding: '4px 10px',
            borderRadius: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            background: isDark ? '#141c2b' : '#f1f5f9',
            border: isDark ? '1px solid #1f293d' : '1px solid #e2e8f0',
            color: isDark ? '#e2e8f0' : '#1e293b',
            transition: 'all 0.2s ease',
          }}
        >
          <GlobalOutlined style={{ color: '#0068ff', fontSize: 13 }} />
          <span>{currentLangObj.shortName.toUpperCase()}</span>
        </div>
      </Tooltip>
    </Dropdown>
  );
}
