import React from 'react';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage from '@/components/ResourcePage';
import DetailCard from '@/components/DetailCard';
import { t } from '@/core/i18n';
import { RoleLinks } from '../common';
import { fetchRoleDetail, roleRowActions } from './RoleList';
import { fetchUsers, userColumns, userFilters } from '../Users/UserList';
import { fetchGroups, groupColumns, groupFilters } from '../UserGroups/UserGroupList';

export default function RoleDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Identity'), { title: t('Roles'), path: '/identity/role-admin' }]}
      backPath="/identity/role-admin"
      fetch={fetchRoleDetail}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Role Name'), value: d.name },
        { label: t('Description'), value: d.description },
      ]}
      tabs={(d) => [
        {
          key: 'base',
          label: t('Base Info'),
          render: () => (
            <DetailCard
              title={t('Implied Roles')}
              column={1}
              items={[{ label: t('Roles'), value: d.implies, render: () => <RoleLinks roles={d.implies || []} /> }]}
            />
          ),
        },
        {
          key: 'user',
          label: t('Binding Users'),
          render: () => (
            <ResourcePage
              embedded
              deps={[d.id]}
              fetch={() => fetchUsers({ roleId: d.id, withProjectRole: true, withSystemRole: true })}
              columns={() => userColumns({ mode: 'role' })}
              filterParams={userFilters()}
            />
          ),
        },
        {
          key: 'group',
          label: t('Binding Groups'),
          render: () => (
            <ResourcePage
              embedded
              deps={[d.id]}
              fetch={() => fetchGroups({ roleId: d.id })}
              columns={() => groupColumns({ mode: 'role' })}
              filterParams={groupFilters()}
            />
          ),
        },
      ]}
      actions={roleRowActions()}
    />
  );
}
