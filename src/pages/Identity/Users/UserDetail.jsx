import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { CredentialsTable } from '@/pages/UserCenter/Credentials';
import { TOTPConfig } from '@/pages/UserCenter/TOTP';
import { EnabledBadge, detailPath } from '../common';
import { fetchUserDetail, userRowActions } from './UserList';
import {
  fetchProjects,
  projectColumns,
  projectFilters,
  setDefaultProjectAction,
  removeDefaultProjectAction,
} from '../Projects/ProjectList';
import { fetchGroups, groupColumns, groupFilters } from '../UserGroups/UserGroupList';

export default function UserDetail() {
  const navigate = useNavigate();
  return (
    <ResourceDetail
      breadcrumb={[t('Identity'), { title: t('Users'), path: '/identity/user-admin' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/identity/user-admin' : '/identity/user')}
      fetch={fetchUserDetail}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('User Name'), value: d.name },
        { label: t('Enabled'), value: d.enabled, render: () => <EnabledBadge value={d.enabled} /> },
        {
          label: t('System Roles'),
          value: d.systemRoles,
          render: () => ((d.systemRoles || []).length ? d.systemRoles.map((r) => <div key={r.id}>{r.name}</div>) : '-'),
        },
        { label: t('Real Name'), value: d.real_name },
        {
          label: t('Domain'),
          value: d.domainName,
          render: () => (d.domain_id ? <Link to={detailPath.domain(d.domain_id)}>{d.domainName}</Link> : '-'),
        },
        {
          label: t('Default Project'),
          value: d.default_project_id,
          render: () =>
            d.default_project_id ? (
              <Link to={detailPath.project(d.default_project_id)}>{d.defaultProject || d.default_project_id}</Link>
            ) : (
              '-'
            ),
        },
        { label: t('Email'), value: d.email },
        { label: t('Phone'), value: d.phone },
        { label: t('Description'), value: d.description },
      ]}
      tabs={(d, ctx) => [
        {
          key: 'project',
          label: t('Subordinate Projects'),
          render: () => (
            <ResourcePage
              embedded
              deps={[d.id]}
              fetch={() => fetchProjects({ userId: d.id })}
              columns={() => projectColumns({ mode: 'user' })}
              filterParams={projectFilters()}
              primaryActions={d.default_project_id ? [removeDefaultProjectAction(d, ctx.refetch)] : []}
              rowActions={{ firstAction: null, moreActions: [{ action: setDefaultProjectAction(d, ctx.refetch) }] }}
            />
          ),
        },
        {
          key: 'userGroup',
          label: t('Subordinate User Groups'),
          render: () => (
            <ResourcePage
              embedded
              deps={[d.id]}
              fetch={() => fetchGroups({ userId: d.id })}
              columns={() => groupColumns({ mode: 'user' })}
              filterParams={groupFilters()}
            />
          ),
        },
        {
          key: 'applicationCredentials',
          label: t('Application Credentials'),
          render: () => <CredentialsTable embedded userId={d.id} />,
        },
        {
          key: 'totp',
          label: t('Two-Factor Authentication'),
          render: () => <TOTPConfig targetUserId={d.id} targetUsername={d.name} isAdminView />,
        },
      ]}
      actions={({ isAdmin }) => (isAdmin ? userRowActions(navigate) : null)}
    />
  );
}
