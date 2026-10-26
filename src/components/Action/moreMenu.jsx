import React from 'react';
import { t } from '@/core/i18n';

/** Header of a group in a categorized "More Actions" menu (same look in lists and detail pages). */
export const MenuGroupLabel = ({ children }) => (
  <span
    style={{
      fontSize: 11,
      fontWeight: 700,
      color: '#94a3b8',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}
  >
    {children}
  </span>
);

const groupTitle = (group) => (group.titleKey ? t(group.titleKey) : group.title || group.label || '');

/**
 * Builds the items of an antd Dropdown from legacy style `moreActions`:
 *  - `{ title, actions: [...] }` -> a group with a header; hidden when none of its actions is allowed
 *  - `{ action }`                -> a single entry; every single entry goes after a divider
 *
 * options:
 *  - can(action)      -> whether the action is offered (policy, adminOnly, allowed(item))
 *  - onClick(action)  -> called when an entry is clicked
 *  - tooltip(action)  -> optional native tooltip of an entry (defaults to its title)
 *
 * Used by the Instance list rows and the Instance detail page, so both menus stay identical.
 */
export function buildGroupedMenuItems(moreActions = [], { can = () => true, onClick, tooltip } = {}) {
  const toItem = (act) => ({
    key: act.id || act.key || act.title,
    label: act.title,
    title: tooltip ? tooltip(act) : act.title,
    danger: Boolean(act.isDanger || act.danger),
    onClick: () => onClick && onClick(act),
  });

  const items = [];
  const singles = [];
  moreActions.forEach((group, idx) => {
    if (group.actions) {
      const children = group.actions.filter(can).map(toItem);
      if (children.length) {
        items.push({
          type: 'group',
          key: `group-${idx}`,
          label: <MenuGroupLabel>{groupTitle(group)}</MenuGroupLabel>,
          children,
        });
      }
    } else if (group.action && can(group.action)) {
      singles.push(toItem(group.action));
    }
  });
  if (singles.length) {
    if (items.length) items.push({ type: 'divider' });
    items.push(...singles);
  }
  return items;
}
