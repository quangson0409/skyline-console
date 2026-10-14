import React from 'react';
import { magnumApi } from '@/api/magnum';
import { quotaApi } from '@/api/quota';
import { currentProjectId } from '@/api/endpoints';
import { deleteAction } from '@/components/ResourcePage';
import SelectTable from '@/pages/Instances/Create/components/SelectTable';
import { t } from '@/core/i18n';
import { updateQuotaData } from '../common';
import { templateColumns, fetchTemplates } from '../ClusterTemplates/TemplateList';

export const createClusterAction = (navigate) => ({
  id: 'create-cluster',
  type: 'custom',
  policy: 'cluster:create',
  title: t('Create Cluster'),
  onExecute: () => navigate('/container-infra/clusters/create'),
});

/** Legacy Delete.allowedCheckFunc */
export const deleteClusterAction = () => ({
  ...deleteAction({
    name: t('Cluster'),
    title: t('Delete Cluster'),
    allowed: (item) => {
      const { stack_id, status } = item || {};
      return !(status === 'DELETE_IN_PROGRESS' || (status === 'CREATE_IN_PROGRESS' && !stack_id));
    },
    onDelete: (it) => magnumApi.deleteCluster(it.uuid || it.id),
  }),
  policy: 'cluster:delete',
});

const selectRule = (message) => ({
  validator: (_, value) =>
    value?.selectedRowKeys?.length ? Promise.resolve() : Promise.reject(new Error(message)),
});

/** Legacy Resize (modal, quota aware: max = instances left + current nodes) */
export const resizeClusterAction = () => ({
  id: 'resize-cluster',
  type: 'modal',
  policy: 'cluster:resize',
  title: t('Resize Cluster'),
  width: 640,
  allowed: (item) => String(item?.status || '').includes('COMPLETE'),
  getDefaultValues: (item) => ({
    current_master_node_count: item.master_count ?? 0,
    current_node_count: item.node_count ?? 0,
    changed_node_count: (item.node_count || 0) + 1,
  }),
  getFormItems: async (item) => {
    const nodeCount = item.node_count || 0;
    let instances = null;
    try {
      const res = await quotaApi.getNovaQuota(currentProjectId());
      instances = updateQuotaData(res?.quota_set || {}).instances || null;
    } catch {
      instances = null;
    }
    const left = instances ? instances.left : -1;
    const maxSize = left === -1 ? undefined : left + nodeCount;
    return [
      instances && {
        name: 'quota',
        type: 'alert',
        alertType: 'info',
        message: `${t('Instance')} - ${t('Quota')}: ${t('Used')} ${instances.used ?? 0} / ${
          instances.limit === -1 ? t('Unlimit') : instances.limit
        }, ${t('Available')}: ${left === -1 ? t('Unlimit') : left}`,
      },
      { name: 'current_master_node_count', label: t('Current Master Node Count'), type: 'label' },
      { name: 'current_node_count', label: t('Current Node Count'), type: 'label' },
      {
        name: 'changed_node_count',
        label: t('Changed Node Count'),
        type: 'number',
        min: 1,
        max: maxSize,
        required: true,
        rules: [
          {
            validator: (_, value) =>
              value === nodeCount
                ? Promise.reject(new Error(t('The changed node count can not be equal to the current value')))
                : Promise.resolve(),
          },
        ],
      },
      {
        name: 'nodes_to_remove',
        label: t('Nodes To Remove'),
        type: 'textarea',
        rows: 3,
        placeholder: t('Please enter the server ID to be reduced, and separate different ID with ","'),
        visible: (values) => (values.changed_node_count || 0) < nodeCount,
        rules: [
          {
            validator: (_, value) =>
              value && !/^[0-9a-zA-Z]+([0-9a-zA-Z,-][0-9a-zA-Z]+)*$/.test(value)
                ? Promise.reject(new Error(t('Please enter the correct ID')))
                : Promise.resolve(),
          },
        ],
      },
    ].filter(Boolean);
  },
  onSubmit: (values, item) => {
    const { changed_node_count, nodes_to_remove } = values;
    const body = { node_count: changed_node_count, nodes_to_remove: [] };
    if (nodes_to_remove) body.nodes_to_remove = nodes_to_remove.split(',');
    return magnumApi.resizeCluster(item.uuid || item.id, body);
  },
});

/** Legacy Upgrade (pick a new cluster template) */
export const upgradeClusterAction = () => ({
  id: 'upgrade-cluster',
  type: 'modal',
  policy: 'cluster:upgrade',
  title: t('Upgrade Cluster'),
  width: 960,
  getFormItems: async (item) => {
    const templates = await fetchTemplates().catch(() => []);
    return [
      {
        name: 'currentTemplate',
        type: 'alert',
        alertType: 'info',
        message: `${t('Cluster Template')}: ${
          templates.find((it) => it.uuid === item.cluster_template_id)?.name || item.cluster_template_id || '-'
        }`,
      },
      {
        name: 'clusterTemplate',
        label: t('Cluster Template'),
        rules: [selectRule(t('Please select cluster template'))],
        render: () => (
          <SelectTable
            data={templates}
            rowKey="uuid"
            columns={templateColumns({ inSelect: true })}
            filterParams={[{ label: t('Name'), name: 'name' }]}
          />
        ),
      },
    ];
  },
  onSubmit: (values, item) =>
    magnumApi.upgradeCluster(item.uuid || item.id, {
      cluster_template: values.clusterTemplate.selectedRowKeys[0],
    }),
});

export const clusterRowActions = (isAdmin) =>
  isAdmin
    ? { firstAction: deleteClusterAction(), moreActions: [] }
    : {
        firstAction: deleteClusterAction(),
        moreActions: [{ action: resizeClusterAction() }, { action: upgradeClusterAction() }],
      };
