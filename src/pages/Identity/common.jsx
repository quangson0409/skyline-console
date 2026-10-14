import React, { useMemo } from 'react';
import { Badge, Form, Select, Table, Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import { keystoneApi } from '@/api/keystone';
import { skylineApi } from '@/api/skyline';
import { IdNameCell } from '@/components/ResourcePage';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';

/* ------------------------------------------------------------------ */
/* Shared helpers for the Identity module (port of resources/keystone) */
/* ------------------------------------------------------------------ */

export const detailPath = {
  domain: (id) => `/identity/domain-admin/detail/${id}`,
  project: (id) => `/identity/project-admin/detail/${id}`,
  user: (id) => `/identity/user-admin/detail/${id}`,
  group: (id) => `/identity/user-group-admin/detail/${id}`,
  role: (id) => `/identity/role-admin/detail/${id}`,
};

export const yesNoFilterOptions = () => [
  { key: 'true', label: t('Yes') },
  { key: 'false', label: t('No') },
];

export const statusTypes = () => [
  { label: t('Enable'), value: true },
  { label: t('Disable'), value: false },
];

export const EnabledBadge = ({ value }) =>
  value === true ? <Badge color="green" text={t('Yes')} /> : <Badge color="red" text={t('No')} />;

/** legacy resources/keystone/domain enabledColumn */
export const enabledColumn = () => ({
  title: t('Enabled'),
  dataIndex: 'enabled',
  key: 'enabled',
  render: (val) => <EnabledBadge value={val} />,
});

export const descriptionColumn = () => ({
  title: t('Description'),
  dataIndex: 'description',
  key: 'description',
  render: (v) => v || '-',
});

/** Related-resource id/name cell (copyable short id link + name below) */
export const IdNameLink = ({ id, name, to }) => {
  if (!id && !name) return '-';
  return <IdNameCell id={id} name={name && name !== id ? name : undefined} href={to && id ? to : undefined} bold={false} />;
};

export const domainColumn = () => ({
  title: t('Domain ID/Name'),
  dataIndex: 'domainName',
  key: 'domainName',
  render: (value, record) => (
    <IdNameLink id={record.domain_id} name={value} to={record.domain_id ? detailPath.domain(record.domain_id) : null} />
  ),
});

export const RoleLinks = ({ roles = [] }) => {
  const list = roles.filter(Boolean);
  if (!list.length) return '-';
  return (
    <div>
      {list.map((r) => (
        <div key={r.id}>
          <Link to={detailPath.role(r.id)}>{r.name}</Link>
        </div>
      ))}
    </div>
  );
};

const PALETTE = ['red', 'volcano', 'orange', 'gold', 'lime', 'green', 'cyan', 'blue', 'geekblue', 'purple'];

/** legacy SimpleTag */
export const ProjectTags = ({ tags = [] }) => {
  if (!tags || !tags.length) return '-';
  return (
    <span>
      {tags.map((tag, index) => {
        const isLong = tag.length > 20;
        const el = (
          <Tag key={tag} color={PALETTE[index % 10]} style={{ marginTop: 2, marginBottom: 2 }}>
            <span style={{ whiteSpace: 'pre-wrap' }}>{isLong ? `${tag.slice(0, 20)}...` : tag}</span>
          </Tag>
        );
        return isLong ? (
          <Tooltip key={tag} title={<span style={{ whiteSpace: 'pre-wrap' }}>{tag}</span>}>
            {el}
          </Tooltip>
        ) : (
          el
        );
      })}
    </span>
  );
};

/* ---------------------------- Data access ---------------------------- */

let profilePromise = null;
/** Skyline profile (user id, roles, base_domains) - cached per page load */
export const getProfile = (force = false) => {
  if (!profilePromise || force) {
    profilePromise = skylineApi.getProfile().catch(() => ({}));
  }
  return profilePromise;
};

export const currentUserId = async () => {
  const profile = await getProfile();
  return profile?.user?.id || '';
};

export const hasAdminOnlyRole = () => {
  try {
    const { user } = useAuthStore.getState();
    return (user?.roles || []).some((r) => String(r?.name || r) === 'admin');
  } catch {
    return false;
  }
};

export const safeList = async (promise, key) => {
  try {
    const res = await promise;
    return res?.[key] || [];
  } catch {
    return [];
  }
};

export const listDomains = () => safeList(keystoneApi.listDomains(), 'domains');
export const listRoles = () => safeList(keystoneApi.listRoles(), 'roles');
export const listAllProjects = () => safeList(keystoneApi.listProjects(), 'projects');
export const listAllUsers = () => safeList(keystoneApi.listUsers(), 'users');
export const listAllGroups = () => safeList(keystoneApi.listGroups(), 'groups');

export const withDomainName = (items, domains) =>
  items.map((it) => {
    const domain = domains.find((d) => d.id === it.domain_id);
    return { ...it, domain, domainName: domain?.name || it.domain_id };
  });

/** legacy getDomainOptions: hide base domains (except own) and disabled domains */
export const fetchDomainOptions = async (item = {}) => {
  const [domains, profile] = await Promise.all([listDomains(), getProfile()]);
  const baseDomains = profile?.base_domains || [];
  return domains
    .filter((d) => (baseDomains.indexOf(d.name) === -1 || d.id === item.domain_id) && !!d.enabled)
    .map((d) => ({ label: d.name, value: d.id }));
};

/** Domain select: filtered options, or every domain when the form's showAllDomains is checked */
export function DomainSelect({ form, options = [], allOptions = [], value, onChange, ...rest }) {
  const showAll = Form.useWatch('showAllDomains', form);
  return (
    <Select
      {...rest}
      value={value}
      onChange={onChange}
      showSearch
      placeholder={t('Please select')}
      options={showAll ? allOptions : options}
      filterOption={(input, opt) => (opt?.label || '').toLowerCase().includes((input || '').toLowerCase())}
    />
  );
}

/** legacy role resources: immutable roles cannot be edited / deleted */
export const editableRole = (item) => {
  const { options: { immutable } = {} } = item || {};
  return !(immutable || immutable === 'true' || immutable === 'True');
};

/** Diff two { id: roleIds[] } maps and run assign / remove calls (legacy ManageUser onSubmit) */
export const applyRoleDiff = (oldMap = {}, newMap = {}, assign, remove) => {
  const reqs = [];
  Object.keys(oldMap).forEach((id) => {
    (oldMap[id] || []).forEach((roleId) => {
      if (!(newMap[id] || []).includes(roleId)) reqs.push(remove(id, roleId));
    });
  });
  Object.keys(newMap).forEach((id) => {
    const oldRoles = oldMap[id] || [];
    (newMap[id] || []).forEach((roleId) => {
      if (!oldRoles.includes(roleId)) reqs.push(assign(id, roleId));
    });
  });
  return Promise.all(reqs);
};

/* ------------------------------ Validators ------------------------------ */

const emailRegex = /^[A-Za-z\d]+([._+-][A-Za-z\d]+)*@([A-Za-z\d]+[.-])+[A-Za-z\d]{2,63}$/;
const phoneRegex = /^\+?[\d\s()-]{5,24}$/;
export const nameRegexWithoutChinese = /^[a-zA-Z][\w"'[\]^.:()_-]{0,127}$/;

/** Password rules moved to src/components/form/rules (re-exported for existing imports) */
export { passwordRule, confirmPasswordRule } from '@/components/form/rules';

export const emailRule = () => ({
  validator(_, value) {
    if (!value || emailRegex.test(value)) return Promise.resolve();
    return Promise.reject(new Error(t('Please enter a valid Email Address!')));
  },
});

export const phoneRule = () => ({
  validator(_, value) {
    if (!value || phoneRegex.test(String(value).trim())) return Promise.resolve();
    return Promise.reject(new Error(t('Please enter a valid Phone Number')));
  },
});

/** Project tag rules (legacy Create / ModifyTags validators) */
export const tagsRule = () => ({
  validator(_, val) {
    if (!val || !val.length) return Promise.resolve();
    const bad = val.find((tag) => !/^[^,/]*$/.test(tag));
    if (bad) return Promise.reject(new Error(t('Invalid Tag Value: {tag}', { tag: bad })));
    const seen = new Set();
    const dup = val.find((tag) => {
      const l = tag.toLowerCase();
      if (seen.has(l)) return true;
      seen.add(l);
      return false;
    });
    if (dup) return Promise.reject(new Error(t('Duplicate tag name: {tag}', { tag: dup })));
    return Promise.resolve();
  },
});

export const TagsExtra = () => (
  <div>
    <div>1. {t('Tags are not case sensitive')}</div>
    <div>2. {t('Forward Slash ‘/’ is not allowed to be in a tag name')}</div>
    <div>
      3.{' '}
      {t('Commas ‘,’ are not allowed to be in a tag name in order to simplify requests that specify lists of tags')}
    </div>
  </div>
);

/* ------------------------- Member / role selector ------------------------- */

/**
 * Replacement for the legacy transfer + "Select Project Role" table.
 * value: { [memberId]: roleId[] }
 * members: [{ id, name, domainName, domain_id }]
 */
export function MemberRoleSelector({
  value = {},
  onChange,
  members = [],
  roles = [],
  memberTitle,
  roleTitle,
  placeholder,
  defaultRolesFor,
}) {
  const selectedIds = Object.keys(value || {});
  const roleOptions = roles.map((r) => ({ label: r.name, value: r.id }));
  const memberOptions = useMemo(
    () =>
      members.map((m) => ({
        value: m.id,
        label: `${m.name || m.id}${m.domainName ? ` (${m.domainName})` : ''}`,
      })),
    [members]
  );
  const emit = (next) => onChange && onChange(next);

  const onSelectMembers = (ids) => {
    const next = {};
    (ids || []).forEach((id) => {
      next[id] = value[id] || (defaultRolesFor ? defaultRolesFor(id) : roles[0] ? [roles[0].id] : []);
    });
    emit(next);
  };

  const rows = selectedIds.map((id) => {
    const m = members.find((it) => it.id === id) || { id, name: id };
    return { ...m, key: id };
  });

  return (
    <div>
      <Select
        mode="multiple"
        allowClear
        showSearch
        style={{ width: '100%', marginBottom: 12 }}
        placeholder={placeholder || t('Please select')}
        options={memberOptions}
        value={selectedIds}
        onChange={onSelectMembers}
        filterOption={(input, opt) => (opt?.label || '').toLowerCase().includes((input || '').toLowerCase())}
      />
      <Table
        size="small"
        rowKey="id"
        pagination={rows.length > 8 ? { pageSize: 8, size: 'small' } : false}
        dataSource={rows}
        columns={[
          {
            title: memberTitle || t('ID/Name'),
            dataIndex: 'name',
            render: (name, r) => <IdNameCell id={r.id} name={name !== r.id ? name : undefined} />,
          },
          {
            title: t('Domain ID/Name'),
            dataIndex: 'domainName',
            render: (v, r) => (r.domain_id ? <IdNameLink id={r.domain_id} name={v} /> : v || '-'),
          },
          {
            title: roleTitle || t('Select Project Role'),
            dataIndex: 'id',
            width: '45%',
            render: (id) => (
              <Select
                size="small"
                mode="multiple"
                style={{ width: '100%' }}
                options={roleOptions}
                value={value[id] || []}
                status={(value[id] || []).length ? undefined : 'warning'}
                onChange={(roleIds) => emit({ ...value, [id]: roleIds })}
                filterOption={(input, opt) =>
                  (opt?.label || '').toLowerCase().includes((input || '').toLowerCase())
                }
              />
            ),
          },
        ]}
      />
    </div>
  );
}

/** Heading inside an ActionModal form (ignores Form.Item injected props) */
export const SectionTitle = ({ title }) => (
  <div style={{ textAlign: 'center', fontWeight: 700, padding: '4px 0', borderBottom: '1px solid #e2e8f0' }}>
    {title}
  </div>
);

/** Triggers a browser download of a JSON object (legacy FileSaver.saveAs) */
export const downloadJson = (obj, filename) => {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
