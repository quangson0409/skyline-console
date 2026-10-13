import React from 'react';
import { Link } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { detailPath } from '../common';
import { fetchGroupDetail, groupRowActions } from './UserGroupList';
import { fetchProjects, projectColumns, projectFilters } from '../Projects/ProjectList';
import { fetchUsers, userColumns, userFilters } from '../Users/UserList';

export default function UserGroupDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Identity'), { title: t('User Groups'), path: '/identity/user-group-admin' }]}
      backPath="/identity/user-group-admin"
      fetch={fetchGroupDetail}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('User Group Name'), value: d.name },
        {
          label: t('Domain'),
          value: d.domainName,
          render: () => (d.domain_id ? <Link to={detailPath.domain(d.domain_id)}>{d.domain?.name || d.domain_id}</Link> : '-'),
        },
        { label: t('User Num'), value: d.userCount },
        { label: t('Description'), value: d.description },
      ]}
      tabs={(d) => [
        {
          key: 'project',
          label: t('Subordinate Projects'),
          render: () => (
            <ResourcePage
              embedded
              deps={[d.id]}
              fetch={() => fetchProjects({ groupId: d.id })}
              columns={() => projectColumns({ mode: 'group' })}
              filterParams={projectFilters()}
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
              fetch={() => fetchUsers({ groupId: d.id, withProjectRole: false, withSystemRole: true })}
              columns={() => userColumns({ mode: 'group' })}
              filterParams={userFilters()}
            />
          ),
        },
      ]}
      actions={groupRowActions()}
    />
  );
}
