import React from 'react';
import { Checkbox, Divider, message } from 'antd';
import { Link } from 'react-router-dom';
import { keystoneApi } from '@/api/keystone';
import ResourcePage, { nameColumn, deleteAction } from '@/components/ResourcePage';
import { invalidateProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import {
  detailPath,
  enabledColumn,
  descriptionColumn,
  domainColumn,
  statusTypes,
  yesNoFilterOptions,
  ProjectTags,
  MemberRoleSelector,
  RoleLinks,
  TagsExtra,
  tagsRule,
  nameRegexWithoutChinese,
  fetchDomainOptions,
  listDomains,
  listRoles,
  listAllUsers,
  listAllGroups,
  withDomainName,
  safeList,
  applyRoleDiff,
  DomainSelect,
} from '../common';
import { manageQuotaAction } from './quota';

/* ------------------------------ Data ------------------------------ */

/** legacy ProjectStore.updateProject */
export const updateProject = (project, roleAssignments, roles, domains) => {
  const users = {};
  const groups = {};
  roleAssignments.forEach((ra) => {
    const projectId = ra?.scope?.project?.id;
    const userId = ra?.user?.id;
    const groupId = ra?.group?.id;
    const roleId = ra?.role?.id;
    const roleItem = roles.find((it) => it.id === roleId);
    if (projectId === project.id && roleId) {
      if (userId) users[userId] = [...(users[userId] || []), roleItem];
      if (groupId) groups[groupId] = [...(groups[groupId] || []), roleItem];
    }
  });
  const domain = domains.find((it) => it.id === project.domain_id);
  return {
    ...project,
    tags: project.tags || [],
    users,
    groups,
    userCount: Object.keys(users).length,
    groupCount: Object.keys(groups).length,
    domain,
    domainName: domain?.name || project.domain_id,
  };
};

/** legacy ProjectStore list + listDidFetch (userId / groupId / domainId scoped variants) */
export const fetchProjects = async ({ userId, groupId, domainId, withRole = true } = {}) => {
  let items;
  if (userId) {
    items = (await keystoneApi.listUserProjects(userId))?.projects || [];
  } else {
    items = (await keystoneApi.listProjects(domainId ? { domain_id: domainId } : undefined))?.projects || [];
  }
  if (!items.length) return items;
  const params = {};
  if (groupId) params['group.id'] = groupId;
  const [assigns, roles, domains] = await Promise.all([
    withRole ? safeList(keystoneApi.listRoleAssignments(params), 'role_assignments') : [],
    withRole ? listRoles() : [],
    listDomains(),
  ]);
  const newItems = items.map((p) => updateProject(p, assigns, roles, domains));
  if (userId) {
    const userGroups = await safeList(keystoneApi.listUserGroups(userId), 'groups');
    const groupIds = userGroups.map((g) => g.id);
    return newItems.map((it) => {
      const currentUsers = it.users[userId] ? { [userId]: it.users[userId] } : {};
      const currentGroups = Object.keys(it.groups).reduce((acc, gid) => {
        if (groupIds.includes(gid)) acc[gid] = { roles: it.groups[gid], group: userGroups.find((g) => g.id === gid) };
        return acc;
      }, {});
      return {
        ...it,
        users: currentUsers,
        userCount: Object.keys(currentUsers).length,
        groups: currentGroups,
        groupCount: Object.keys(currentGroups).length,
      };
    });
  }
  if (groupId) return newItems.filter((it) => !!it.groupCount);
  return newItems;
};

/** legacy detailDidFetch */
export const fetchProjectDetail = async (id) => {
  const res = await keystoneApi.getProject(id);
  const project = { id, ...(res?.project || {}) };
  const [assigns, roles, domains] = await Promise.all([
    safeList(keystoneApi.listRoleAssignments({ 'scope.project.id': id }), 'role_assignments'),
    listRoles(),
    listDomains(),
  ]);
  return updateProject(project, assigns, roles, domains);
};

/* ------------------------------ Columns ------------------------------ */

/** legacy getUserProjectRole: [{ role, groups }] for the user detail page */
const getUserProjectRole = (record) => {
  const { users = {}, groups = {} } = record || {};
  const userRoleIds = [];
  const result = [];
  Object.keys(users).forEach((id) => {
    (users[id] || []).filter(Boolean).forEach((r) => {
      result.push({ role: r, groups: [] });
      userRoleIds.push(r.id);
    });
  });
  Object.keys(groups).forEach((gid) => {
    const { roles = [], group } = groups[gid] || {};
    roles
      .filter(Boolean)
      .filter((r) => !userRoleIds.includes(r.id))
      .forEach((r) => {
        const existing = result.find((it) => it.role.id === r.id);
        if (existing) existing.groups.push(group);
        else result.push({ role: r, groups: [group] });
      });
  });
  return result;
};

/**
 * mode: 'list' (project list), 'domain' (domain detail tab), 'user' (user detail tab), 'group' (user group detail tab)
 */
export const projectColumns = ({ mode = 'list' } = {}) => {
  const cols = [nameColumn({ title: t('Project ID/Name'), linkTo: (r) => detailPath.project(r.id) })];
  if (mode === 'user') {
    cols.push({
      title: t('Role'),
      dataIndex: 'userProjectRole',
      key: 'userProjectRole',
      render: (_, record) => {
        const roles = getUserProjectRole(record);
        if (!roles.length) return '-';
        return (
          <div>
            {roles.map(({ role, groups }) => (
              <div key={role.id}>
                <Link to={detailPath.role(role.id)}>{role.name}</Link>
                {groups.length ? (
                  <>
                    {' '}
                    ({t('authorized by group ')}
                    {groups.filter(Boolean).map((g) => (
                      <Link key={g.id} to={detailPath.group(g.id)} style={{ marginRight: 8 }}>
                        {g.name}
                      </Link>
                    ))}
                    )
                  </>
                ) : null}
              </div>
            ))}
          </div>
        );
      },
    });
  }
  if (mode === 'group') {
    cols.push({
      title: t('Role'),
      dataIndex: 'groupProjectRole',
      key: 'groupProjectRole',
      render: (_, record) => <RoleLinks roles={Object.values(record.groups || {}).flat()} />,
    });
  }
  if (mode === 'list' || mode === 'domain') {
    cols.push({
      title: t('Member Num'),
      dataIndex: 'num',
      key: 'num',
      render: (_, r) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <span>
            {t('User Num: ')}
            {r.userCount}
          </span>
          <Divider type="vertical" />
          <span>
            {t('User Group Num: ')}
            {r.groupCount}
          </span>
        </div>
      ),
    });
  }
  if (mode !== 'domain') cols.push(domainColumn());
  cols.push(enabledColumn());
  cols.push({ title: t('Tags'), dataIndex: 'tags', key: 'tags', render: (tags) => <ProjectTags tags={tags} /> });
  cols.push(descriptionColumn());
  return cols;
};

export const projectFilters = ({ inDomain } = {}) => [
  { name: 'name', label: t('Project Name') },
  { name: 'id', label: t('Project ID') },
  { name: 'enabled', label: t('Enabled'), options: yesNoFilterOptions() },
  ...(inDomain ? [] : [{ name: 'domainName', label: t('Domain Name') }]),
  { name: 'tags', label: t('Tags') },
];

/* ------------------------------ Actions ------------------------------ */

const projectNameRule = (getDomainId, selfId) => ({
  validator: async (_, value) => {
    if (!value) return;
    if (!selfId && !nameRegexWithoutChinese.test(value)) {
      throw new Error(t('Invalid: Project name can not be chinese'));
    }
    const domainId = getDomainId();
    if (!domainId) return;
    const projects = await safeList(keystoneApi.listProjects(), 'projects');
    if (projects.find((p) => p.name === value && p.domain_id === domainId && p.id !== selfId)) {
      throw new Error(t('Invalid: Project names in the domain can not be repeated'));
    }
  },
});

/** Domain select with legacy "Show All Domains" toggle */
export const domainFormItems = async (item = {}) => {
  const [options, all] = await Promise.all([fetchDomainOptions(item), listDomains()]);
  const allOptions = all.map((d) => ({ label: d.name, value: d.id }));
  return [
    {
      name: 'domain_id',
      label: t('Domain'),
      required: true,
      render: ({ form }) => <DomainSelect form={form} options={options} allOptions={allOptions} />,
    },
    { name: 'showAllDomains', type: 'checkbox', render: () => <Checkbox>{t('Show All Domains')}</Checkbox> },
  ];
};

/** name field whose duplicate check depends on the selected domain_id */
export const nameInDomainRule = (check) => ({ getFieldValue }) => check(() => getFieldValue('domain_id'));

export const createProjectAction = () => ({
  id: 'project-create',
  type: 'modal',
  title: t('Create Project'),
  getDefaultValues: () => ({ domain_id: 'default', enabled: true, tags: [] }),
  getFormItems: async () => {
    const domainItems = await domainFormItems();
    return [
      {
        name: 'name',
        label: t('Name'),
        type: 'input',
        required: true,
        placeholder: t('Please input name'),
        tip: t('Project name can not be duplicated'),
        rules: [nameInDomainRule((getDomain) => projectNameRule(getDomain))],
      },
      ...domainItems,
      {
        name: 'enabled',
        label: t('Status'),
        type: 'radio',
        required: true,
        options: statusTypes(),
        tip: t(
          'Disabling the project will have a negative impact. If the users associated with the project are only assigned to the project, they will not be able to log in'
        ),
      },
      { name: 'description', label: t('Description'), type: 'textarea' },
      { name: 'tags', label: t('Tags'), type: 'tags', rules: [tagsRule()], extra: <TagsExtra /> },
    ];
  },
  onSubmit: async ({ tags, showAllDomains, ...projectData }) => {
    const result = await keystoneApi.createProject(projectData);
    invalidateProjectMap();
    if (tags && tags.length && result?.project?.id) {
      try {
        await keystoneApi.updateProjectTags(result.project.id, tags);
      } catch {
        message.warning(
          `${t('Project created successfully, but failed to add tags')} ${t(
            'You can modify the tags later using the Modify Tags action.'
          )}`
        );
      }
    }
    return result;
  },
});

export const editProjectAction = () => ({
  id: 'project-edit',
  type: 'modal',
  title: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description, enabled: item.enabled }),
  getFormItems: (item) => [
    {
      name: 'name',
      label: t('Name'),
      type: 'input',
      required: true,
      tip: t('Project name can not be duplicated'),
      rules: [projectNameRule(() => item.domain_id, item.id)],
    },
    { name: 'description', label: t('Description'), type: 'textarea' },
  ],
  onSubmit: async ({ name, description }, item) => {
    const res = await keystoneApi.updateProject(item.id, { description, name });
    invalidateProjectMap();
    return res;
  },
});

export const deleteProjectAction = () => ({
  ...deleteAction({
    name: t('Project'),
    onDelete: async (it) => {
      try {
        await keystoneApi.deleteProject(it.id);
        invalidateProjectMap();
      } catch (err) {
        const msg = err?.response?.data?.error?.message || '';
        if (/^Resource(.*?)exists$/.test(msg)) {
          throw new Error(t('There are resources under the project and cannot be deleted.'));
        }
        throw err;
      }
    },
  }),
  title: t('Delete Project'),
  actionName: t('delete project'),
  description: t('Before deleting the project, it is recommended to clean up the resources under the project.'),
});

export const enableProjectAction = () => ({
  id: 'Enable',
  type: 'confirm',
  title: t('Enable Project'),
  actionName: t('Enable Project'),
  allowed: (item) => item.enabled !== true,
  onSubmit: (item) => keystoneApi.updateProject(item.id, { enabled: true }),
});

export const disableProjectAction = () => ({
  id: 'Disable',
  type: 'confirm',
  title: t('Disable Project'),
  actionName: t('Disable Project'),
  isDanger: true,
  allowed: (item) => item.enabled !== false,
  description: t(
    'Disabling the project will have negative effect, and users associated with the project will not be able to login if they are only assigned to the project'
  ),
  onSubmit: (item) => keystoneApi.updateProject(item.id, { enabled: false }),
});

const initRoleMap = (map = {}) =>
  Object.keys(map).reduce((acc, id) => {
    acc[id] = (map[id] || []).filter(Boolean).map((r) => r.id);
    return acc;
  }, {});

export const manageProjectUserAction = () => ({
  id: 'management-user',
  type: 'modal',
  title: t('Manage User'),
  width: 900,
  getDefaultValues: (item) => ({ name: item.name, domain: item.domainName, userRoles: initRoleMap(item.users) }),
  getFormItems: async (item) => {
    const [users, roles, domains] = await Promise.all([listAllUsers(), listRoles(), listDomains()]);
    const members = withDomainName(users, domains);
    return [
      { name: 'name', label: t('Name'), type: 'label' },
      { name: 'domain', label: t('Domain'), type: 'label' },
      {
        name: 'userRoles',
        label: t('User'),
        render: () => (
          <MemberRoleSelector
            members={members}
            roles={roles}
            memberTitle={t('User ID/Name')}
            defaultRolesFor={(id) =>
              item.users?.[id] ? item.users[id].filter(Boolean).map((r) => r.id) : roles[0] ? [roles[0].id] : []
            }
          />
        ),
      },
    ];
  },
  onSubmit: ({ userRoles = {} }, item) =>
    applyRoleDiff(
      initRoleMap(item.users),
      userRoles,
      (userId, roleId) => keystoneApi.assignProjectUserRole(item.id, userId, roleId),
      (userId, roleId) => keystoneApi.removeProjectUserRole(item.id, userId, roleId)
    ),
});

export const manageProjectGroupAction = () => ({
  id: 'manage-group-group',
  type: 'modal',
  title: t('Manage User Group'),
  width: 900,
  getDefaultValues: (item) => ({ name: item.name, domain: item.domainName, groupRoles: initRoleMap(item.groups) }),
  getFormItems: async (item) => {
    const [groups, roles, domains] = await Promise.all([listAllGroups(), listRoles(), listDomains()]);
    const members = withDomainName(groups, domains);
    return [
      { name: 'name', label: t('Name'), type: 'label' },
      { name: 'domain', label: t('Domain'), type: 'label' },
      {
        name: 'groupRoles',
        label: t('User Group'),
        rules: [
          {
            validator: (_, value) =>
              Object.keys(value || {}).find((gid) => !(value[gid] || []).length)
                ? Promise.reject(new Error(t('Please set at least one role!')))
                : Promise.resolve(),
          },
        ],
        render: () => (
          <MemberRoleSelector
            members={members}
            roles={roles}
            memberTitle={t('User Group ID/Name')}
            defaultRolesFor={(id) =>
              item.groups?.[id] ? item.groups[id].filter(Boolean).map((r) => r.id) : roles[0] ? [roles[0].id] : []
            }
          />
        ),
      },
    ];
  },
  onSubmit: ({ groupRoles = {} }, item) =>
    applyRoleDiff(
      initRoleMap(item.groups),
      groupRoles,
      (groupId, roleId) => keystoneApi.assignProjectGroupRole(item.id, groupId, roleId),
      (groupId, roleId) => keystoneApi.removeProjectGroupRole(item.id, groupId, roleId)
    ),
});

export const modifyProjectTagsAction = () => ({
  id: 'modify-project-tags',
  type: 'modal',
  title: t('Modify Project Tags'),
  buttonText: t('Modify Project Tags'),
  getDefaultValues: (item) => ({ tags: item.tags || [] }),
  formItems: [{ name: 'tags', label: t('Tags'), type: 'tags', rules: [tagsRule()], extra: <TagsExtra /> }],
  onSubmit: ({ tags = [] }, item) => keystoneApi.updateProjectTags(item.id, tags),
});

/** User detail > projects tab: legacy Project/actions/SetDefaultProject (row action) */
export const setDefaultProjectAction = (user, onDone) => ({
  id: 'set-default-project',
  type: 'modal',
  title: t('Set Default Project'),
  allowed: (item) => user?.default_project_id !== item.id,
  getFormItems: (item) => [
    {
      name: 'hint',
      type: 'alert',
      message: t(
        'Are you sure set the project { project } as the default project? User login is automatically logged into the default project.',
        { project: item.name }
      ),
    },
  ],
  onSubmit: async (_values, item) => {
    const res = await keystoneApi.updateUser(user.id, { default_project_id: item.id });
    if (onDone) onDone();
    return res;
  },
});

/** User detail > projects tab: legacy RemoveDefaultProject (primary action) */
export const removeDefaultProjectAction = (user, onDone) => ({
  id: 'remove-default-project',
  type: 'confirm',
  title: t('Remove Default Project'),
  actionName: t('Remove default project for user'),
  confirmText: t('Are you sure to remove the default project?'),
  onSubmit: async () => {
    const res = await keystoneApi.updateUser(user.id, { default_project_id: null });
    if (onDone) onDone();
    return res;
  },
});

export const projectRowActions = () => ({
  firstAction: editProjectAction(),
  moreActions: [
    { action: deleteProjectAction() },
    { action: manageQuotaAction() },
    { action: manageProjectUserAction() },
    { action: manageProjectGroupAction() },
    { action: enableProjectAction() },
    { action: disableProjectAction() },
    { action: modifyProjectTagsAction() },
  ],
});

/* ------------------------------ Page ------------------------------ */

export default function ProjectList() {
  return (
    <ResourcePage
      title={t('Projects')}
      breadcrumb={[t('Identity'), t('Projects')]}
      description={t('Manage Keystone tenant projects and resource isolation domains.')}
      fetch={() => fetchProjects()}
      columns={() => projectColumns({ mode: 'list' })}
      filterParams={projectFilters()}
      searchFields={['name', 'id', 'description', 'domainName']}
      primaryActions={[createProjectAction()]}
      batchActions={[deleteProjectAction()]}
      rowActions={projectRowActions()}
    />
  );
}
