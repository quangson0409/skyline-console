import React from 'react';
import { Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { novaApi } from '@/api/nova';
import ResourcePage, {
  nameColumn,
  projectColumn,
  deleteAction,
  CopyText,
  useIsAdminPage,
} from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { KpiCards } from '../_shared';

/** legacy resources/nova/server-group.js */
export const policyType = () => ({
  'anti-affinity': t('Anti-Affinity'),
  affinity: t('Affinity'),
  'soft-anti-affinity': t('Soft-Anti-Affinity'),
  'soft-affinity': t('Soft-Affinity'),
});

export const POLICY_COLORS = {
  affinity: 'blue',
  'anti-affinity': 'volcano',
  'soft-affinity': 'cyan',
  'soft-anti-affinity': 'orange',
};

export const policyTip = () => (
  <div style={{ fontSize: 12 }}>
    <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{t('Affinity (mandatory):')}</p>
    <p style={{ margin: 0 }}>
      {t(
        'The instances in the affinity group are strictly allocated to the same physical machine. When there are no more physical machines to allocate, the allocation fails.'
      )}
    </p>
    <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{t('Anti-affinity (mandatory):')}</p>
    <p style={{ margin: 0 }}>
      {t(
        'The instances in the anti-affinity group are strictly allocated to different physical machines. When there are no more physical machines to allocate, the allocation fails.'
      )}
    </p>
    <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{t('Soft Affinity (not mandatory):')}</p>
    <p style={{ margin: 0 }}>
      {t(
        'The instances in the affinity group are allocated to the same physical machine as much as possible, and when there are no more physical machines to allocate, the normal allocation strategy is returned.'
      )}
    </p>
    <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{t('Soft Anti-affinity (not mandatory):')}</p>
    <p style={{ margin: 0 }}>
      {t(
        'The instances in the anti-affinity group are allocated to different physical machines as much as possible. When there are no more physical machines to allocate, the normal allocation strategy is returned.'
      )}
    </p>
  </div>
);

/** microversion >= 2.64 returns `policy`; older ones `policies: []` */
export const mapServerGroup = (g = {}) => ({
  ...g,
  policy: g.policy || (Array.isArray(g.policies) ? g.policies[0] : g.policies),
  members: Array.isArray(g.members) ? g.members : [],
  member_count: Array.isArray(g.members) ? g.members.length : 0,
});

export const fetchServerGroups = async ({ isAdmin } = {}) => {
  const res = await novaApi.listServerGroupsV(isAdmin ? { all_projects: true } : {});
  return (res?.server_groups || []).map(mapServerGroup);
};

export const PolicyTag = ({ policy }) =>
  policy ? (
    <Tag color={POLICY_COLORS[policy] || 'blue'} style={{ borderRadius: 10, fontWeight: 600 }}>
      {policyType()[policy] || policy}
    </Tag>
  ) : (
    '-'
  );

export const createServerGroupAction = ({ projectId } = {}) => ({
  id: 'create',
  type: 'modal',
  title: t('Create Server Group'),
  getDefaultValues: () => ({ policy: 'anti-affinity' }),
  getFormItems: async () => {
    let quota = null;
    if (projectId) {
      try {
        const res = await novaApi.getQuotaSet(projectId);
        quota = res?.quota_set?.server_groups || null;
      } catch {
        quota = null;
      }
    }
    const limit = quota?.limit;
    const used = quota?.in_use ?? 0;
    const left = limit === -1 || limit === undefined ? Infinity : limit - used - (quota?.reserved || 0);
    return [
      quota && {
        type: 'alert',
        name: 'quota',
        alertType: left <= 0 ? 'warning' : 'info',
        message: `${t('Server Group')}: ${t('Used')} ${used} / ${t('Quota')} ${limit === -1 ? t('Unlimit') : limit}`,
      },
      { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: t('Please input name') },
      {
        name: 'policy',
        label: t('Policy'),
        type: 'select',
        required: true,
        placeholder: t('Please select policy'),
        options: Object.entries(policyType()).map(([value, label]) => ({ value, label })),
        tip: policyTip(),
      },
    ].filter(Boolean);
  },
  onSubmit: ({ name, policy }) => novaApi.createServerGroupV({ name, policy }),
});

export const deleteServerGroupAction = () =>
  deleteAction({
    name: t('Server Group'),
    title: t('Delete Server Group'),
    allowed: (it) => !it.members || it.members.length === 0,
    onDelete: (it) => novaApi.deleteServerGroupV(it.id),
  });

export const createInstanceFromGroupAction = (navigate) => ({
  id: 'instance-create',
  type: 'custom',
  title: t('Create Instance'),
  onExecute: (item) => navigate(`/compute/instance?servergroup=${item.id}`),
});

export const serverGroupColumns = ({ isAdmin, projectMap }) =>
  [
    nameColumn({
      linkTo: (r) => `/compute/${isAdmin ? 'server-group-admin' : 'server-group'}/detail/${r.id}`,
    }),
    isAdmin && { ...projectColumn(projectMap), title: t('Project ID/Name') },
    {
      title: t('Member Count'),
      dataIndex: 'member_count',
      key: 'member_count',
      sorter: (a, b) => a.member_count - b.member_count,
      render: (v) => (
        <span>
          <b>{v}</b> {t('instances')}
        </span>
      ),
    },
    {
      title: t('Policy'),
      dataIndex: 'policy',
      key: 'policy',
      render: (policy) => <PolicyTag policy={policy} />,
    },
    {
      title: 'UUID',
      dataIndex: 'id',
      key: 'uuid',
      render: (id) => (
        <CopyText value={id}>
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>{id}</span>
        </CopyText>
      ),
    },
  ].filter(Boolean);

export const serverGroupRowActions = ({ isAdmin, navigate }) =>
  isAdmin
    ? { firstAction: deleteServerGroupAction(), moreActions: [] }
    : {
        firstAction: deleteServerGroupAction(),
        moreActions: [{ action: createInstanceFromGroupAction(navigate) }],
      };

export default function ServerGroupList() {
  const navigate = useNavigate();
  const projectMap = useProjectMap();
  const isAdminPage = useIsAdminPage();

  return (
    <ResourcePage
      title={t('Server Groups')}
      breadcrumb={[t('Compute'), t('Server Groups')]}
      description={t(
        'Manage placement policies (Affinity / Anti-affinity) for compute instances across physical hosts.'
      )}
      fetch={fetchServerGroups}
      columns={({ isAdmin }) => serverGroupColumns({ isAdmin, projectMap })}
      header={({ data }) => (
        <KpiCards
          items={[
            { title: t('Total Groups'), value: data.length },
            {
              title: 'Anti-affinity Groups',
              value: data.filter((g) => g.policy === 'anti-affinity').length,
              color: '#f97316',
            },
            { title: 'Affinity Groups', value: data.filter((g) => g.policy === 'affinity').length, color: '#3b82f6' },
          ]}
        />
      )}
      filterParams={[
        { name: 'name', label: t('Name') },
        {
          name: 'policy',
          label: t('Policy'),
          options: Object.entries(policyType()).map(([key, label]) => ({ key, label })),
        },
        isAdminPage && { name: 'project_id', label: t('Project ID') },
      ].filter(Boolean)}
      primaryActions={({ isAdmin, projectId }) => (isAdmin ? [] : [createServerGroupAction({ projectId })])}
      batchActions={[deleteServerGroupAction()]}
      rowActions={({ isAdmin }) => serverGroupRowActions({ isAdmin, navigate })}
    />
  );
}
