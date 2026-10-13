import React, { useState } from 'react';
import { Drawer, Tag } from 'antd';
import { neutronResources } from '@/api/neutron';
import ResourcePage, { nameColumn, timeColumn, projectColumn } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { keystoneApi } from '@/api/keystone';
import { t } from '@/core/i18n';
import { detailPath } from '@/pages/Network/common';
import {
  createRuleAction,
  createSecurityGroupAction,
  deleteSecurityGroupAction,
  editSecurityGroupAction,
  RulesTable,
} from './actions';

/** legacy SecurityGroupStore (listFilterByProject + fetchDataByCurrentProject) */
export const fetchSecurityGroups = async ({ isAdmin, projectId, params = {} } = {}) => {
  const query = { ...params };
  if (!isAdmin && projectId) query.project_id = projectId;
  const [res, projects] = await Promise.all([
    neutronResources.securityGroups.list(query),
    isAdmin
      ? keystoneApi
          .listProjects()
          .then((r) => r?.projects || [])
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  return (res?.security_groups || [])
    .filter((sg) => isAdmin || !projectId || !(sg.project_id || sg.tenant_id) || (sg.project_id || sg.tenant_id) === projectId)
    .map((sg) => {
      const pid = sg.project_id || sg.tenant_id;
      return {
        ...sg,
        project_id: pid,
        project_name: isAdmin ? projectNames[pid] || '-' : undefined,
        rules_count: (sg.security_group_rules || []).length,
      };
    });
};

export const securityGroupColumns = ({ isAdmin, projectMap }) =>
  [
    nameColumn({ linkTo: (r) => detailPath('security-group', r.id, isAdmin) }),
    isAdmin && projectColumn(projectMap),
    { title: t('Description'), dataIndex: 'description', key: 'description', render: (v) => v || '-' },
    {
      title: t('Rules Count'),
      dataIndex: 'rules_count',
      key: 'rules_count',
      sorter: (a, b) => (a.rules_count || 0) - (b.rules_count || 0),
      render: (count) => <Tag color="blue">{`${count ?? 0} ${t('rules')}`}</Tag>,
    },
    timeColumn(),
  ].filter(Boolean);

export const securityGroupRowActions = ({ isAdmin, onManageRules }) => {
  const manage = onManageRules && {
    id: 'manage-rules',
    type: 'custom',
    title: t('Manage Rules'),
    onExecute: (item) => onManageRules(item),
  };
  return isAdmin
    ? {
        firstAction: deleteSecurityGroupAction({ isAdmin }),
        moreActions: manage ? [{ action: manage }] : [],
      }
    : {
        firstAction: editSecurityGroupAction(),
        moreActions: [
          manage && { action: manage },
          { action: createRuleAction() },
          { action: deleteSecurityGroupAction({ isAdmin }) },
        ].filter(Boolean),
      };
};

export default function SecurityGroupList() {
  const projectMap = useProjectMap();
  const [drawerGroup, setDrawerGroup] = useState(null);

  return (
    <ResourcePage
      title={t('Security Groups')}
      breadcrumb={[t('Network'), t('Security Groups')]}
      description={t('Virtual firewalls controlling inbound and outbound network traffic for compute instances.')}
      fetch={fetchSecurityGroups}
      columns={({ isAdmin }) => securityGroupColumns({ isAdmin, projectMap })}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'description', label: t('Description') },
      ]}
      primaryActions={({ isAdmin }) => (isAdmin ? [] : [createSecurityGroupAction()])}
      batchActions={({ isAdmin }) => [deleteSecurityGroupAction({ isAdmin })]}
      rowActions={({ isAdmin }) => securityGroupRowActions({ isAdmin, onManageRules: setDrawerGroup })}
      footer={({ isAdmin, refetch }) => (
        <Drawer
          title={`${t('Security Rules')}: ${drawerGroup?.name || drawerGroup?.id || ''}`}
          width={Math.min(1100, typeof window !== 'undefined' ? window.innerWidth - 40 : 1100)}
          open={!!drawerGroup}
          onClose={() => {
            setDrawerGroup(null);
            refetch();
          }}
          destroyOnHidden
        >
          {drawerGroup ? <RulesTable securityGroupId={drawerGroup.id} isAdmin={isAdmin} /> : null}
        </Drawer>
      )}
      interval={0}
    />
  );
}
