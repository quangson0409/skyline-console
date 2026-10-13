import React from 'react';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { EnabledBadge } from '../common';
import { fetchDomainDetail, domainRowActions } from './DomainList';
import { fetchProjects, projectColumns, projectFilters } from '../Projects/ProjectList';
import { fetchUsers, userColumns, userFilters } from '../Users/UserList';
import { fetchGroups, groupColumns, groupFilters } from '../UserGroups/UserGroupList';

export default function DomainDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Identity'), { title: t('Domains'), path: '/identity/domain-admin' }]}
      backPath="/identity/domain-admin"
      fetch={fetchDomainDetail}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Domain Name'), value: d.name },
        { label: t('Enabled'), value: d.enabled, render: () => <EnabledBadge value={d.enabled} /> },
        { label: t('Project Num'), value: d.projectCount },
        { label: t('User Num'), value: d.userCount },
        { label: t('User Group Num'), value: d.groupCount },
        { label: t('Description'), value: d.description },
      ]}
      tabs={(d) => [
        {
          key: 'project',
          label: t('Projects'),
          render: () => (
            <ResourcePage
              embedded
              deps={[d.id]}
              fetch={() => fetchProjects({ domainId: d.id })}
              columns={() => projectColumns({ mode: 'domain' })}
              filterParams={projectFilters({ inDomain: true })}
            />
          ),
        },
        {
          key: 'user',
          label: t('Users'),
          render: () => (
            <ResourcePage
              embedded
              deps={[d.id]}
              fetch={() => fetchUsers({ domainId: d.id, withProjectRole: false, withSystemRole: true })}
              columns={() => userColumns({ mode: 'domain' })}
              filterParams={userFilters({ inDomain: true })}
            />
          ),
        },
        {
          key: 'userGroup',
          label: t('User Groups'),
          render: () => (
            <ResourcePage
              embedded
              deps={[d.id]}
              fetch={() => fetchGroups({ domainId: d.id })}
              columns={() => groupColumns({ mode: 'domain' })}
              filterParams={groupFilters({ inDomain: true })}
            />
          ),
        },
      ]}
      actions={domainRowActions()}
    />
  );
}
