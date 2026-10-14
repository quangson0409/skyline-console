import React from 'react';
import { useNavigate } from 'react-router-dom';
import { novaApi } from '@/api/nova';
import ResourceDetail from '@/components/ResourceDetail';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import InstanceTable from '../_shared/InstanceTable';
import { filterTabsByPolicy } from '../_shared';
import { mapServerGroup, PolicyTag, serverGroupRowActions } from './ServerGroupList';

export default function ServerGroupDetail() {
  const navigate = useNavigate();
  const projectMap = useProjectMap();
  return (
    <ResourceDetail
      breadcrumb={[t('Compute'), { title: t('Server Groups'), path: '/compute/server-group' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/compute/server-group-admin' : '/compute/server-group')}
      title={t('Server Group')}
      policy="os_compute_api:os-server-groups:show"
      fetch={async (id) => mapServerGroup({ id, ...((await novaApi.getServerGroupV(id))?.server_group || {}) })}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Name'), value: d.name },
          isAdmin && {
            label: t('Project ID'),
            value: d.project_id,
            render: () => (d.project_id ? `${projectMap[d.project_id] || '-'} (${d.project_id})` : '-'),
          },
          { label: t('User ID'), value: d.user_id },
          { label: t('Policy'), value: d.policy, render: () => <PolicyTag policy={d.policy} /> },
          { label: t('Member Count'), value: String(d.members.length) },
          d.rules && Object.keys(d.rules).length
            ? { label: t('Rules'), value: JSON.stringify(d.rules) }
            : null,
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) =>
        filterTabsByPolicy([
          {
            key: 'members',
            label: t('Members'),
            // legacy Instance list (inServerGroupDetailPage): members by id, legacy row / batch actions
            policy: isAdmin ? 'os_compute_api:servers:index:get_all_tenants' : 'os_compute_api:servers:index',
            render: () => <InstanceTable memberIds={d.members} serverGroupId={d.id} />,
          },
        ])
      }
      actions={({ isAdmin }) => serverGroupRowActions({ isAdmin, navigate })}
    />
  );
}
