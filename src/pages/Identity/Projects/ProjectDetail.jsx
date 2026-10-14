import React from 'react';
import { Link } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { EnabledBadge, detailPath } from '../common';
import { fetchProjectDetail, projectRowActions } from './ProjectList';
import { QuotaOverview } from './quota';
import { fetchUsers, userColumns, userFilters } from '../Users/UserList';
import { fetchGroups, groupColumns, groupFilters } from '../UserGroups/UserGroupList';

export default function ProjectDetail() {
  return (
    <ResourceDetail
      aliasPolicy="keystone:identity:list_projects"
      breadcrumb={[t('Identity'), { title: t('Projects'), path: '/identity/project-admin' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/identity/project-admin' : '/identity/project')}
      fetch={fetchProjectDetail}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Project Name'), value: d.name },
        { label: t('Enabled'), value: d.enabled, render: () => <EnabledBadge value={d.enabled} /> },
        {
          label: t('Domain'),
          value: d.domainName,
          render: () => (d.domain_id ? <Link to={detailPath.domain(d.domain_id)}>{d.domainName}</Link> : '-'),
        },
        { label: t('User Num'), value: d.userCount },
        { label: t('User Group Num'), value: d.groupCount },
        { label: t('Tags'), value: (d.tags || []).join(',') },
        { label: t('Description'), value: d.description },
      ]}
      tabs={(d) => [
        {
          key: 'user',
          label: t('Project Users'),
          render: () => (
            <ResourcePage
              embedded
              aliasPolicy="keystone:identity:list_users"
              deps={[d.id]}
              fetch={() => fetchUsers({ projectId: d.id, withProjectRole: true, withSystemRole: true })}
              columns={() => userColumns({ mode: 'project' })}
              filterParams={userFilters()}
            />
          ),
        },
        {
          key: 'userGroup',
          label: t('Project User Groups'),
          render: () => (
            <ResourcePage
              embedded
              aliasPolicy="keystone:identity:list_groups"
              deps={[d.id]}
              fetch={() => fetchGroups({ projectId: d.id })}
              columns={() => groupColumns({ mode: 'project' })}
              filterParams={groupFilters()}
            />
          ),
        },
        {
          key: 'quota',
          label: t('Project Quota'),
          render: () => <QuotaOverview projectId={d.id} refreshKey={d} />,
        },
      ]}
      actions={projectRowActions()}
    />
  );
}
