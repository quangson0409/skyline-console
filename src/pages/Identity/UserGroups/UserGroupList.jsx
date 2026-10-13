import React from 'react';
import { Typography } from 'antd';
import { Link } from 'react-router-dom';
import { keystoneApi } from '@/api/keystone';
import ResourcePage, { nameColumn, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  detailPath,
  descriptionColumn,
  listDomains,
  listRoles,
  listAllProjects,
  listAllUsers,
  withDomainName,
  safeList,
  RoleLinks,
} from '../common';
import { domainFormItems, nameInDomainRule } from '../Projects/ProjectList';

/* ------------------------------ Data ------------------------------ */

/** legacy GroupStore.updateUserGroup */
export const updateUserGroup = (group, assigns, roles, domains, projects) => {
  const projectMap = {};
  assigns.forEach((ra) => {
    const projectId = ra?.scope?.project?.id;
    const roleId = ra?.role?.id;
    if (ra?.group?.id === group.id && roleId && projectId) {
      const roleItem = roles.find((it) => it.id === roleId);
      if (!projectMap[projectId]) {
        projectMap[projectId] = { project: projects.find((it) => it.id === projectId) || { id: projectId }, roles: [roleItem] };
      } else {
        projectMap[projectId].roles = [...projectMap[projectId].roles, roleItem];
      }
    }
  });
  const domain = domains.find((it) => it.id === group.domain_id);
  return {
    ...group,
    projects: projectMap,
    projectCount: Object.keys(projectMap).length,
    domain,
    domainName: domain?.name || group.domain_id,
  };
};

/** legacy GroupStore list + listDidFetch */
export const fetchGroups = async ({ userId, projectId, roleId, domainId, withRole = true } = {}) => {
  let items = userId
    ? (await keystoneApi.listUserGroups(userId))?.groups || []
    : (await keystoneApi.listGroups())?.groups || [];
  if (!items.length) return items;
  const params = {};
  if (projectId) params['scope.project.id'] = projectId;
  if (roleId) params['role.id'] = roleId;
  const [assigns, roles, domains, projects] = await Promise.all([
    withRole ? safeList(keystoneApi.listRoleAssignments(params), 'role_assignments') : [],
    withRole ? listRoles() : [],
    listDomains(),
    withRole ? listAllProjects() : [],
  ]);
  if (domainId) items = items.filter((it) => it.domain_id === domainId);
  const newItems = items.map((g) => updateUserGroup(g, assigns, roles, domains, projects));
  if (projectId || roleId) return newItems.filter((it) => it.projectCount);
  return newItems;
};

/** legacy detailDidFetch */
export const fetchGroupDetail = async (id) => {
  const res = await keystoneApi.getGroup(id);
  const group = { id, ...(res?.group || {}) };
  const [domains, users] = await Promise.all([listDomains(), safeList(keystoneApi.listGroupUsers(id), 'users')]);
  return { ...updateUserGroup(group, [], [], domains, []), userCount: users.length };
};

/* ------------------------------ Columns ------------------------------ */

/** mode: 'list' | 'user' | 'domain' | 'project' | 'role' */
export const groupColumns = ({ mode = 'list' } = {}) => {
  const hide = {
    list: ['rolesInProjectDetailPage', 'projectsInRoleDetailPage'],
    user: ['rolesInProjectDetailPage', 'projectsInRoleDetailPage'],
    domain: ['domainName', 'rolesInProjectDetailPage', 'projectsInRoleDetailPage'],
    project: ['projects', 'projectsInRoleDetailPage'],
    role: ['projects', 'rolesInProjectDetailPage'],
  }[mode] || [];
  return [
    nameColumn({ title: t('User Group ID/Name'), linkTo: (r) => detailPath.group(r.id) }),
    {
      title: t('Project Scope (Project Name: Role Names)'),
      dataIndex: 'projects',
      key: 'projects',
      width: 500,
      render: (value) => {
        const keys = Object.keys(value || {});
        if (!keys.length) return '-';
        return keys.map((pid) => {
          const { project, roles = [] } = value[pid];
          return (
            <div key={pid}>
              <Typography.Text strong>
                <Link to={detailPath.project(project.id)}>{project.name || project.id}</Link>
              </Typography.Text>
              : {roles.filter(Boolean).map((r) => r.name).join(', ')}
            </div>
          );
        });
      },
    },
    {
      title: t('Roles'),
      dataIndex: 'rolesInProjectDetailPage',
      key: 'rolesInProjectDetailPage',
      render: (_, r) => <RoleLinks roles={Object.values(r.projects || {}).flatMap((p) => p.roles || [])} />,
    },
    {
      title: t('Project Scope'),
      dataIndex: 'projectsInRoleDetailPage',
      key: 'projectsInRoleDetailPage',
      render: (_, r) => {
        const list = Object.values(r.projects || {});
        if (!list.length) return '-';
        return list.map(({ project }) => (
          <div key={project.id}>
            <Link to={detailPath.project(project.id)}>{project.name || project.id}</Link>
          </div>
        ));
      },
    },
    { title: t('Domain'), dataIndex: 'domainName', key: 'domainName', render: (v) => v || '-' },
    descriptionColumn(),
  ].filter((c) => !hide.includes(c.dataIndex));
};

export const groupFilters = ({ inDomain } = {}) => [
  { name: 'name', label: t('User Group Name') },
  ...(inDomain ? [] : [{ name: 'domainName', label: t('Domain Name') }]),
];

/* ------------------------------ Actions ------------------------------ */

const groupNameRule = (getDomainId, selfId) => ({
  validator: async (_, value) => {
    if (!value) return;
    const domainId = getDomainId();
    if (!domainId) return;
    const groups = await safeList(keystoneApi.listGroups(), 'groups');
    if (groups.find((g) => g.name === value && g.domain_id === domainId && g.id !== selfId)) {
      throw new Error(t('Invalid: User Group names in the domain can not be repeated'));
    }
  },
});

export const createGroupAction = () => ({
  id: 'user-group-create',
  type: 'modal',
  title: t('Create User Group'),
  getDefaultValues: () => ({ domain_id: 'default' }),
  getFormItems: async () => [
    {
      name: 'name',
      label: t('User Group Name'),
      type: 'input',
      placeholder: t('Please input name'),
      required: true,
      tip: t('User Groups name can not be duplicated'),
      rules: [{ max: 30 }, nameInDomainRule((getDomain) => groupNameRule(getDomain))],
    },
    ...(await domainFormItems()),
    { name: 'description', label: t('Description'), type: 'textarea' },
  ],
  onSubmit: ({ showAllDomains, ...values }) => keystoneApi.createGroup(values),
});

export const editGroupAction = () => ({
  id: 'user-group-edit',
  type: 'modal',
  title: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  getFormItems: (item) => [
    {
      name: 'name',
      label: t('User Group Name'),
      type: 'input',
      placeholder: t('Please input name'),
      required: true,
      tip: t('User Groups name can not be duplicated'),
      rules: [groupNameRule(() => item.domain_id, item.id)],
    },
    { name: 'description', label: t('Description'), type: 'textarea' },
  ],
  onSubmit: ({ name, description }, item) => keystoneApi.updateGroup(item.id, { name, description }),
});

/** legacy UserGroup/actions/ManageUser */
export const manageGroupUsersAction = () => {
  const current = {};
  return {
    id: 'manage-user',
    type: 'modal',
    title: t('Manage User'),
    width: 760,
    getDefaultValues: async (item) => {
      const users = await safeList(keystoneApi.listGroupUsers(item.id), 'users');
      current[item.id] = users.map((u) => u.id);
      return { name: item.name, domain: item.domainName, select_user: current[item.id] };
    },
    getFormItems: async () => {
      const [users, domains] = await Promise.all([listAllUsers(), listDomains()]);
      const options = withDomainName(users, domains).map((u) => ({
        value: u.id,
        label: `${u.name} (${u.domainName})`,
      }));
      return [
        { name: 'name', label: t('Name'), type: 'label' },
        { name: 'domain', label: t('Domain'), type: 'label' },
        { name: 'select_user', label: t('User'), type: 'select', mode: 'multiple', options },
      ];
    },
    onSubmit: async ({ select_user: newUsers = [] }, item) => {
      const oldUsers = current[item.id] || [];
      const reqs = [];
      oldUsers.forEach((uid) => {
        if (!newUsers.includes(uid)) reqs.push(keystoneApi.removeUserFromGroup(item.id, uid));
      });
      newUsers.forEach((uid) => {
        if (!oldUsers.includes(uid)) reqs.push(keystoneApi.addUserToGroup(item.id, uid));
      });
      return Promise.all(reqs);
    },
  };
};

export const deleteGroupAction = () => ({
  ...deleteAction({ name: t('User Group'), onDelete: (it) => keystoneApi.deleteGroup(it.id) }),
  title: t('Delete User Group'),
  actionName: t('delete user group'),
});

export const groupRowActions = () => ({
  firstAction: editGroupAction(),
  moreActions: [{ action: manageGroupUsersAction() }, { action: deleteGroupAction() }],
});

/* ------------------------------ Page ------------------------------ */

export default function UserGroupList() {
  return (
    <ResourcePage
      title={t('User Groups')}
      breadcrumb={[t('Identity'), t('User Groups')]}
      description={t('Group users together and grant project roles to the whole group.')}
      fetch={() => fetchGroups()}
      columns={() => groupColumns({ mode: 'list' })}
      filterParams={groupFilters()}
      searchFields={['name', 'id', 'description', 'domainName']}
      primaryActions={[createGroupAction()]}
      batchActions={[deleteGroupAction()]}
      rowActions={groupRowActions()}
    />
  );
}
