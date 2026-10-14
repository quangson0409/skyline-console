import React from 'react';
import { Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { novaApi } from '@/api/nova';
import ResourcePage, {
  nameColumn,
  projectColumn,
  deleteAction,
  useIsAdminPage,
} from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { nameRule } from '../_shared/nameRules';
import { quotaItem, withQuota } from '@/components/Quota/utils';
import { KpiCards } from '@/components/MetricCards';

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
  policy: 'os_compute_api:os-server-groups:create',
  title: t('Create Server Group'),
  getDefaultValues: () => ({ policy: 'anti-affinity' }),
  // legacy ServerGroup/actions/Create showQuota: nova server_groups quota
  quota: withQuota(
    async () => (projectId ? (await novaApi.getQuotaSet(projectId))?.quota_set?.server_groups || null : null),
    (quota) => [quotaItem(quota, { name: 'server_groups', title: t('Server Group'), add: 1 })]
  ),
  getFormItems: async () => {
    return [
      { name: 'name', label: t('Name'), type: 'input', required: true, placeholder: t('Please input name'), rules: [nameRule()] },
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

export const deleteServerGroupAction = () => ({
  ...deleteAction({
    name: t('Server Group'),
    title: t('Delete Server Group'),
    allowed: (it) => !it.members || it.members.length === 0,
    onDelete: (it) => novaApi.deleteServerGroupV(it.id),
  }),
  policy: 'os_compute_api:os-server-groups:delete',
});

export const createInstanceFromGroupAction = (navigate) => ({
  id: 'instance-create',
  type: 'custom',
  policy: 'os_compute_api:servers:create',
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
      policy="os_compute_api:os-server-groups:index"
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
              title: t('Anti-affinity Groups'),
              value: data.filter((g) => g.policy === 'anti-affinity').length,
              color: '#f97316',
            },
            { title: t('Affinity Groups'), value: data.filter((g) => g.policy === 'affinity').length, color: '#3b82f6' },
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
