import React from 'react';
import { Dropdown, Button, Space, Divider } from 'antd';
import { DownOutlined, MoreOutlined } from '@ant-design/icons';
import { useTranslation } from '@/core/i18n';

/**
 * ItemActionButtons - Ant Design 5 Table Row Action Toolbar
 * Matches legacy Skyline 1:1:
 * - First action rendered as direct link or button
 * - Divider
 * - Dropdown 'More Actions' categorized into groups or single items
 */
export default function ItemActionButtons({
  firstAction,
  moreActions = [],
  item = {},
  onActionClick,
  isAdmin = false,
}) {
  const { t } = useTranslation();

  // Helper to check if an action is permitted
  const checkAllowed = (action) => {
    if (!action) return false;
    if (action.adminOnly && !isAdmin) return false;
    if (typeof action.allowed === 'function') {
      try {
        return Boolean(action.allowed(item));
      } catch {
        return false;
      }
    }
    return true;
  };

  // Helper to resolve translated text
  const resolveText = (key, fallback) => {
    if (key) return t(key);
    if (typeof fallback === 'function') return fallback();
    if (fallback) return t(fallback);
    return '';
  };

  // Build Antd 5 dropdown items
  const menuItems = [];

  moreActions.forEach((group, gIdx) => {
    // If it's a categorized group with actions array
    if (group.actions && Array.isArray(group.actions)) {
      const groupChildren = group.actions
        .filter(checkAllowed)
        .map((act) => {
          const actTitle = resolveText(act.titleKey, act.title || act.name);
          const actDesc = resolveText(act.descKey, act.description);
          return {
            key: act.id || act.key || actTitle,
            label: (
              <div style={{ display: 'flex', flexDirection: 'column', padding: '2px 0' }}>
                <span style={{ fontWeight: 500 }}>{actTitle}</span>
                {actDesc && (
                  <span style={{ fontSize: 11, color: '#94a3b8', maxWidth: 260, whiteSpace: 'normal', lineHeight: 1.25 }}>
                    {actDesc}
                  </span>
                )}
              </div>
            ),
            title: actDesc || actTitle,
            danger: Boolean(act.isDanger || act.danger),
            onClick: () => onActionClick && onActionClick(act, item),
          };
        });

      if (groupChildren.length > 0) {
        menuItems.push({
          key: `group-${gIdx}`,
          label: resolveText(group.titleKey, group.title),
          type: 'group',
          children: groupChildren,
        });
      }
    } else if (group.action) {
      // Single action without group wrapper
      const act = group.action;
      if (checkAllowed(act)) {
        const actTitle = resolveText(act.titleKey, act.title || act.name);
        const actDesc = resolveText(act.descKey, act.description);
        menuItems.push({
          key: act.id || act.key || actTitle,
          label: (
            <div style={{ display: 'flex', flexDirection: 'column', padding: '2px 0' }}>
              <span style={{ fontWeight: 500 }}>{actTitle}</span>
              {actDesc && (
                <span style={{ fontSize: 11, color: '#94a3b8', maxWidth: 260, whiteSpace: 'normal', lineHeight: 1.25 }}>
                  {actDesc}
                </span>
              )}
            </div>
          ),
          title: actDesc || actTitle,
          danger: Boolean(act.isDanger || act.danger),
          onClick: () => onActionClick && onActionClick(act, item),
        });
      }
    } else if (group.title || group.label) {
      // Direct action object
      if (checkAllowed(group)) {
        const gTitle = resolveText(group.titleKey, group.title || group.label);
        const gDesc = resolveText(group.descKey, group.description);
        menuItems.push({
          key: group.id || group.key || gTitle,
          label: gTitle,
          title: gDesc || gTitle,
          danger: Boolean(group.isDanger || group.danger),
          onClick: () => onActionClick && onActionClick(group, item),
        });
      }
    }
  });

  const hasFirst = firstAction && checkAllowed(firstAction);
  const hasMore = menuItems.length > 0;

  if (!hasFirst && !hasMore) {
    return <span style={{ color: '#cbd5e1' }}>-</span>;
  }

  const firstTitle = firstAction ? resolveText(firstAction.titleKey, firstAction.title || firstAction.label || t('Action')) : '';
  const firstDesc = firstAction ? resolveText(firstAction.descKey, firstAction.description) : '';

  return (
    <Space size={6} split={hasFirst && hasMore ? <Divider type="vertical" style={{ margin: 0 }} /> : null}>
      {hasFirst && (
        <Button
          type="link"
          size="small"
          title={firstDesc || firstTitle}
          style={{ padding: 0, fontWeight: 600, color: '#0068ff' }}
          onClick={() => onActionClick && onActionClick(firstAction, item)}
        >
          {firstTitle}
        </Button>
      )}

      {hasMore && (
        <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
          <Button
            type="link"
            size="small"
            style={{ padding: 0, color: '#64748b', fontSize: 13 }}
          >
            {t('More')} <DownOutlined style={{ fontSize: 10, marginLeft: 2 }} />
          </Button>
        </Dropdown>
      )}
    </Space>
  );
}
