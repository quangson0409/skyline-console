import React from 'react';
import { keystoneApi } from '@/api/keystone';
import ResourcePage, { nameColumn, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  detailPath,
  enabledColumn,
  descriptionColumn,
  statusTypes,
  listAllUsers,
  listAllProjects,
  listAllGroups,
  safeList,
  withPagePolicy,
} from '../common';

/** legacy stores/keystone/domain listDidFetch */
export const fetchDomains = async () => {
  const domains = await safeList(keystoneApi.listDomains(), 'domains');
  if (!domains.length) return domains;
  const [users, projects, groups] = await Promise.all([listAllUsers(), listAllProjects(), listAllGroups()]);
  return domains.map((it) => {
    const u = users.filter((x) => x.domain_id === it.id);
    const p = projects.filter((x) => x.domain_id === it.id);
    const g = groups.filter((x) => x.domain_id === it.id);
    return { ...it, users: u, userCount: u.length, projects: p, projectCount: p.length, groups: g, groupCount: g.length };
  });
};

/** legacy detailDidFetch */
export const fetchDomainDetail = async (id) => {
  const res = await keystoneApi.getDomain(id);
  const domain = { id, ...(res?.domain || {}) };
  const [users, projects, groups] = await Promise.all([
    safeList(keystoneApi.listUsers({ domain_id: id }), 'users'),
    safeList(keystoneApi.listProjects({ domain_id: id }), 'projects'),
    safeList(keystoneApi.listGroups({ domain_id: id }), 'groups'),
  ]);
  return {
    ...domain,
    users,
    userCount: users.length,
    projects,
    projectCount: projects.length,
    groups,
    groupCount: groups.length,
  };
};

const duplicateNameRule = (selfId) => ({
  validator: async (_, value) => {
    if (!value) return;
    const domains = await safeList(keystoneApi.listDomains(), 'domains');
    if (domains.find((d) => d.name === value && d.id !== selfId)) {
      throw new Error(t('Invalid: Domain name cannot be duplicated'));
    }
  },
});

export const createDomainAction = () => ({
  id: 'domain-create',
  type: 'modal',
  aliasPolicy: 'keystone:identity:create_domain',
  title: t('Create Domain'),
  getDefaultValues: () => ({ enabled: true }),
  getFormItems: () => [
    {
      name: 'name',
      label: t('Name'),
      type: 'input',
      placeholder: t('Please input name'),
      required: true,
      rules: [duplicateNameRule()],
    },
    { name: 'description', label: t('Description'), type: 'textarea' },
    {
      name: 'enabled',
      label: t('Status'),
      type: 'radio',
      required: true,
      options: statusTypes(),
      tip: t('Disabling the domain will have a negative impact, all projects and users in domain will be disabled'),
    },
  ],
  onSubmit: (values) => keystoneApi.createDomain(values),
});

export const editDomainAction = () => ({
  id: 'domain-edit',
  type: 'modal',
  aliasPolicy: 'keystone:identity:update_domain',
  title: t('Edit Domain'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  getFormItems: (item) => [
    {
      name: 'name',
      label: t('Name'),
      type: 'input',
      placeholder: t('Please input name'),
      required: true,
      rules: [duplicateNameRule(item.id)],
    },
    { name: 'description', label: t('Description'), type: 'textarea' },
  ],
  onSubmit: ({ name, description }, item) => keystoneApi.updateDomain(item.id, { name, description }),
});

export const deleteDomainAction = () => ({
  ...deleteAction({
    name: t('Domain'),
    allowed: (item) => !item.enabled,
    onDelete: (it) => keystoneApi.deleteDomain(it.id),
  }),
  aliasPolicy: 'keystone:identity:delete_domain',
  title: t('Delete Domain'),
  actionName: t('delete domain'),
  description: t(
    'Please note that when deleting a domain, all projects, users, and user groups under the domain will be deleted directly!'
  ),
});

export const enableDomainAction = () => ({
  id: 'Enable',
  type: 'confirm',
  aliasPolicy: 'keystone:identity:update_domain',
  title: t('Enable Domain'),
  actionName: t('Enable Domain'),
  allowed: (item) => item.enabled !== true,
  onSubmit: (item) => keystoneApi.updateDomain(item.id, { enabled: true }),
});

export const disableDomainAction = () => ({
  id: 'Disable',
  type: 'confirm',
  aliasPolicy: 'keystone:identity:update_domain',
  title: t('Disable Domain'),
  actionName: t('Disable Domain'),
  isDanger: true,
  allowed: (item) => item.enabled !== false,
  description: t(
    'Disabling the domain will have negative effect, and users associated with the domain will not be able to login if they are only assigned to the domain'
  ),
  onSubmit: (item) => keystoneApi.updateDomain(item.id, { enabled: false }),
});

export const domainRowActions = () => ({
  firstAction: editDomainAction(),
  moreActions: [{ action: deleteDomainAction() }, { action: enableDomainAction() }, { action: disableDomainAction() }],
});

export const domainColumns = () => [
  nameColumn({ title: t('Domain ID/Name'), linkTo: (r) => detailPath.domain(r.id) }),
  { title: t('Project Num'), dataIndex: 'projectCount', key: 'projectCount' },
  { title: t('User Num'), dataIndex: 'userCount', key: 'userCount' },
  { title: t('User Group Num'), dataIndex: 'groupCount', key: 'groupCount' },
  enabledColumn(),
  descriptionColumn(),
];

export default function DomainList() {
  return (
    <ResourcePage
      aliasPolicy="keystone:identity:list_domains"
      title={t('Domains')}
      breadcrumb={[t('Identity'), t('Domains')]}
      description={t('Keystone domains group projects, users and user groups into isolated namespaces.')}
      fetch={withPagePolicy({ aliasPolicy: 'keystone:identity:list_domains' }, fetchDomains)}
      columns={domainColumns}
      filterParams={[{ name: 'name', label: t('Domain Name') }]}
      primaryActions={[createDomainAction()]}
      batchActions={[deleteDomainAction()]}
      rowActions={domainRowActions()}
    />
  );
}
