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

  // Build Antd 5 dropdown items
  const menuItems = [];

  moreActions.forEach((group, gIdx) => {
    // If it's a categorized group with actions array
    if (group.actions && Array.isArray(group.actions)) {
      const groupChildren = group.actions
        .filter(checkAllowed)
        .map((act) => ({
          key: act.id || act.key || act.title,
          label: act.title || act.name,
          danger: Boolean(act.isDanger || act.danger),
          onClick: () => onActionClick && onActionClick(act, item),
        }));

      if (groupChildren.length > 0) {
        menuItems.push({
          key: `group-${gIdx}`,
          label: group.title,
          type: 'group',
          children: groupChildren,
        });
      }
    } else if (group.action) {
      // Single action without group wrapper
      const act = group.action;
      if (checkAllowed(act)) {
        menuItems.push({
          key: act.id || act.key || act.title,
          label: act.title || act.name,
          danger: Boolean(act.isDanger || act.danger),
          onClick: () => onActionClick && onActionClick(act, item),
        });
      }
    } else if (group.title || group.label) {
      // Direct action object
      if (checkAllowed(group)) {
        menuItems.push({
          key: group.id || group.key || group.title,
          label: group.title || group.label,
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

  return (
    <Space size={6} split={hasFirst && hasMore ? <Divider type="vertical" style={{ margin: 0 }} /> : null}>
      {hasFirst && (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, fontWeight: 600, color: '#0068ff' }}
          onClick={() => onActionClick && onActionClick(firstAction, item)}
        >
          {firstAction.title || firstAction.label || t('Action')}
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
