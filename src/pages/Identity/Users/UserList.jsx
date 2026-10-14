import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keystoneApi } from '@/api/keystone';
import ResourcePage, { nameColumn, textColumn, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  detailPath,
  enabledColumn,
  domainColumn,
  yesNoFilterOptions,
  IdNameLink,
  listDomains,
  listRoles,
  listAllProjects,
  safeList,
  passwordRule,
  confirmPasswordRule,
  emailRule,
  phoneRule,
} from '../common';

/* ------------------------------ Data ------------------------------ */

/** legacy UserStore.updateUser */
export const updateUser = (user, projectAssigns, systemAssigns, roles, projects, domains) => {
  const defaultProject = user.default_project_id
    ? projects.find((p) => p.id === user.default_project_id)?.name
    : undefined;
  const projectMap = {};
  projectAssigns.forEach((ra) => {
    const projectId = ra?.scope?.project?.id;
    const roleId = ra?.role?.id;
    if (ra?.user?.id === user.id && roleId && projectId) {
      const roleItem = roles.find((it) => it.id === roleId);
      if (!projectMap[projectId]) {
        projectMap[projectId] = { project: projects.find((it) => it.id === projectId) || { id: projectId }, roles: [roleItem] };
      } else {
        projectMap[projectId].roles = [...projectMap[projectId].roles, roleItem];
      }
    }
  });
  const systemRoles = [];
  systemAssigns.forEach((ra) => {
    if (ra?.user?.id === user.id && ra?.role?.id) {
      const roleItem = roles.find((it) => it.id === ra.role.id);
      if (roleItem) systemRoles.push(roleItem);
    }
  });
  const domain = domains.find((it) => it.id === user.domain_id);
  return {
    ...user,
    defaultProject,
    projects: projectMap,
    projectCount: Object.keys(projectMap).length,
    domain,
    domainName: domain?.name || user.domain_id,
    systemRoles,
  };
};

/** legacy UserStore list + listDidFetch */
export const fetchUsers = async ({
  groupId,
  domainId,
  projectId,
  roleId,
  withProjectRole = false,
  withSystemRole = true,
  withDefaultProject = true,
} = {}) => {
  const items = groupId
    ? (await keystoneApi.listGroupUsers(groupId))?.users || []
    : (await keystoneApi.listUsers(domainId ? { domain_id: domainId } : undefined))?.users || [];
  if (!items.length) return items;
  const withRole = withProjectRole || withSystemRole;
  const params = {};
  if (roleId) params['role.id'] = roleId;
  if (projectId) params['scope.project.id'] = projectId;
  const [assigns, systemAssigns, roles, projects, domains] = await Promise.all([
    withProjectRole ? safeList(keystoneApi.listRoleAssignments(params), 'role_assignments') : [],
    withSystemRole ? safeList(keystoneApi.listRoleAssignments({ 'scope.system': 'all' }), 'role_assignments') : [],
    withRole ? listRoles() : [],
    withProjectRole || withDefaultProject ? listAllProjects() : [],
    listDomains(),
  ]);
  const newItems = items.map((u) => updateUser(u, assigns, systemAssigns, roles, projects, domains));
  if (projectId) return newItems.filter((it) => !!it.projectCount);
  if (roleId) {
    return newItems.filter((it) => it.projectCount || it.systemRoles.find((r) => r.id === roleId));
  }
  return newItems;
};

/** legacy detailDidFetch */
export const fetchUserDetail = async (id) => {
  const res = await keystoneApi.getUser(id);
  const user = { id, ...(res?.user || {}) };
  const [systemAssigns, roles, domains, defaultProject] = await Promise.all([
    safeList(keystoneApi.listRoleAssignments({ 'user.id': id, 'scope.system': 'all' }), 'role_assignments'),
    listRoles(),
    listDomains(),
    user.default_project_id
      ? keystoneApi
          .getProject(user.default_project_id)
          .then((r) => r?.project)
          .catch(() => null)
      : null,
  ]);
  return updateUser(user, [], systemAssigns, roles, defaultProject ? [defaultProject] : [], domains);
};

/* ------------------------------ Columns ------------------------------ */

/** mode: 'list' | 'group' | 'domain' | 'project' | 'role' (legacy getColumns variants) */
export const userColumns = ({ mode = 'list' } = {}) => {
  const hide = {
    list: ['projectRoles', 'projects'],
    group: ['projectRoles', 'projects'],
    domain: ['domainName', 'projects', 'projectRoles'],
    role: ['projectRoles'],
    project: ['projects'],
  }[mode] || [];
  return [
    nameColumn({ title: t('User ID/Name'), linkTo: (r) => detailPath.user(r.id) }),
    textColumn(t('Real Name'), 'real_name'),
    {
      title: t('Default Project ID/Name'),
      dataIndex: 'defaultProject',
      key: 'defaultProject',
      render: (v, r) =>
        r.default_project_id ? (
          <IdNameLink id={r.default_project_id} name={v} to={detailPath.project(r.default_project_id)} />
        ) : (
          '-'
        ),
    },
    {
      title: t('Roles'),
      dataIndex: 'projectRoles',
      key: 'projectRoles',
      render: (_, r) => {
        const roles = Object.values(r.projects || {}).flatMap((it) => (it?.roles || []).filter(Boolean));
        return roles.length ? roles.map((role, i) => <div key={`${role.id}-${i}`}>{role.name}</div>) : '-';
      },
    },
    {
      title: t('Project Scope'),
      dataIndex: 'projects',
      key: 'projects',
      render: (value) => {
        const list = Object.values(value || {});
        if (!list.length) return '-';
        return list.map(({ project }) => (
          <div key={project.id} style={{ marginBottom: 4 }}>
            <IdNameLink id={project.id} name={project.name} to={detailPath.project(project.id)} />
          </div>
        ));
      },
    },
    domainColumn(),
    {
      title: t('System Roles'),
      dataIndex: 'systemRoles',
      key: 'systemRoles',
      render: (value) => ((value || []).length ? value.map((it) => <div key={it.id}>{it.name}</div>) : '-'),
    },
    textColumn(t('Email'), 'email'),
    textColumn(t('Phone'), 'phone'),
    enabledColumn(),
  ].filter((c) => !hide.includes(c.dataIndex));
};

export const userFilters = ({ inDomain } = {}) => [
  { name: 'name', label: t('User Name') },
  { name: 'real_name', label: t('Real Name') },
  { name: 'enabled', label: t('Enabled'), options: yesNoFilterOptions() },
  ...(inDomain ? [] : [{ name: 'domainName', label: t('Domain Name') }]),
];

/* ------------------------------ Actions ------------------------------ */

export const userNameRule = (getDomainId, selfId) => ({
  validator: async (_, value) => {
    if (!value) return;
    const domainId = getDomainId();
    if (!domainId) return;
    const users = await safeList(keystoneApi.listUsers(), 'users');
    if (users.find((u) => u.name === value && u.domain_id === domainId && u.id !== selfId)) {
      throw new Error(t('Invalid: User names in the domain can not be repeated'));
    }
  },
});

export const editUserAction = () => ({
  id: 'user-edit',
  type: 'modal',
  title: t('Edit User'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({
    name: item.name,
    domainName: item.domain?.name || item.domainName || item.domain_id,
    email: item.email,
    phone: item.phone,
    real_name: item.real_name,
    description: item.description,
  }),
  getFormItems: (item) => [
    {
      name: 'name',
      label: t('User Name'),
      type: 'input',
      required: true,
      placeholder: t('Please input user name'),
      tip: t('User name can not be duplicated'),
      rules: [userNameRule(() => item.domain_id, item.id)],
    },
    { name: 'email', label: t('Email'), type: 'input', required: true, rules: [emailRule()] },
    { name: 'phone', label: t('Phone'), type: 'input', required: true, rules: [phoneRule()], placeholder: '+86 13800000000' },
    { name: 'real_name', label: t('Real Name'), type: 'input', required: true },
    { name: 'domainName', label: t('Domain'), type: 'input', disabled: true },
    { name: 'description', label: t('Description'), type: 'textarea' },
  ],
  onSubmit: ({ email, phone, real_name, description, name }, item) =>
    keystoneApi.updateUser(item.id, { email, phone, real_name, description, name }),
});

/** legacy SystemRole: only "admin" / "reader" are system roles */
export const systemRoleAction = () => ({
  id: 'edit-system-permission',
  type: 'modal',
  title: t('Edit System Permission'),
  getDefaultValues: (item) => {
    const role = (item.systemRoles || [])[0]?.id;
    return role ? { name: item.name, role } : { name: item.name };
  },
  getFormItems: async () => {
    const roles = (await listRoles()).filter((r) => r.name === 'admin' || r.name === 'reader');
    return [
      { name: 'name', label: t('User'), type: 'label' },
      { name: 'role', label: t('Role'), type: 'select', options: roles.map((r) => ({ label: r.name, value: r.id })) },
    ];
  },
  onSubmit: async ({ role }, item) => {
    const oldRoles = item.systemRoles || [];
    const newRoles = role ? [role] : [];
    const oldIds = oldRoles.map((r) => r.id);
    const reqs = [];
    oldIds.forEach((roleId) => {
      if (!newRoles.includes(roleId)) reqs.push(keystoneApi.removeSystemUserRole(item.id, roleId));
    });
    newRoles.forEach((roleId) => {
      if (!oldIds.includes(roleId)) reqs.push(keystoneApi.assignSystemUserRole(item.id, roleId));
    });
    return Promise.all(reqs);
  },
});

export const userPasswordAction = () => ({
  id: 'update-user-password',
  type: 'modal',
  title: t('Update User Password'),
  getDefaultValues: (item) => ({ name: item.name, password: '', confirmPassword: '' }),
  formItems: [
    { name: 'name', label: t('User'), type: 'label' },
    { name: 'password', label: t('New password'), type: 'password', required: true, rules: [passwordRule()] },
    {
      name: 'confirmPassword',
      label: t('Confirm new password'),
      type: 'password',
      required: true,
      rules: [confirmPasswordRule()],
    },
  ],
  onSubmit: ({ password }, item) => keystoneApi.updateUser(item.id, { password }),
});

export const deleteUserAction = () => ({
  ...deleteAction({ name: t('User'), onDelete: (it) => keystoneApi.deleteUser(it.id) }),
  title: t('Delete User'),
  actionName: t('delete user'),
});

export const enableUserAction = () => ({
  id: 'Enable',
  type: 'confirm',
  title: t('Enable User'),
  actionName: t('Enable User'),
  allowed: (item) => item.enabled !== true,
  onSubmit: (item) => keystoneApi.updateUser(item.id, { enabled: true }),
});

export const disableUserAction = () => ({
  id: 'Disable',
  type: 'confirm',
  title: t('Disable User'),
  actionName: t('Disable User'),
  isDanger: true,
  allowed: (item) => item.enabled !== false,
  onSubmit: (item) => keystoneApi.updateUser(item.id, { enabled: false }),
});

/** legacy User/actions/SetDefaultProject: jumps to the user's projects tab */
export const gotoSetDefaultProjectAction = (navigate) => ({
  id: 'set-default-project',
  type: 'custom',
  title: t('Set Default Project'),
  onExecute: (item) => navigate(`${detailPath.user(item.id)}?tab=project`),
});

export const userRowActions = (navigate) => ({
  firstAction: editUserAction(),
  moreActions: [
    { action: systemRoleAction() },
    { action: gotoSetDefaultProjectAction(navigate) },
    { action: userPasswordAction() },
    { action: deleteUserAction() },
    { action: enableUserAction() },
    { action: disableUserAction() },
  ],
});

/* ------------------------------ Page ------------------------------ */

export default function UserList() {
  const navigate = useNavigate();
  return (
    <ResourcePage
      title={t('Users')}
      breadcrumb={[t('Identity'), t('Users')]}
      description={t('Manage user credentials and access authorization in OpenStack Keystone.')}
      fetch={() => fetchUsers()}
      columns={() => userColumns({ mode: 'list' })}
      filterParams={userFilters()}
      searchFields={['name', 'id', 'email', 'real_name', 'domainName']}
      primaryActions={[
        {
          id: 'user-create',
          type: 'custom',
          title: t('Create User'),
          onExecute: () => navigate('/identity/user-admin/create'),
        },
      ]}
      batchActions={[deleteUserAction()]}
      rowActions={userRowActions(navigate)}
    />
  );
}
