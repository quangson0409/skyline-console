import React from 'react';
import { neutronApi } from '@/api/neutron';
import { keystoneApi } from '@/api/keystone';
import ResourceDetail from '@/components/ResourceDetail';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { yesNoText } from '@/pages/Network/common';
import { TagList } from '../FloatingIps/helpers';
import {
  createRuleAction,
  deleteSecurityGroupAction,
  editSecurityGroupAction,
  RulesTable,
} from './actions';

const fetchDetail = async (id, { isAdmin } = {}) => {
  const sg = (await neutronApi.getSecurityGroup(id))?.security_group;
  if (!sg) return sg;
  const pid = sg.project_id || sg.tenant_id;
  let projectName;
  if (isAdmin && pid) {
    projectName = (await keystoneApi.getProject?.(pid).catch(() => null))?.project?.name;
  }
  return { ...sg, project_name: projectName || (isAdmin ? '-' : undefined) };
};

export default function SecurityGroupDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Network'), { title: t('Security Groups'), path: '/network/security-group' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/network/security-group-admin' : '/network/security-group')}
      fetch={fetchDetail}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Name'), value: d.name },
          isAdmin && { label: t('Project ID'), value: d.tenant_id || d.project_id },
          isAdmin && { label: t('Project Name'), value: d.project_name },
          { label: t('Description'), value: d.description },
          { label: t('Stateful'), value: d.stateful === undefined ? undefined : yesNoText(d.stateful) },
          { label: t('Rules Count'), value: (d.security_group_rules || []).length },
          { label: t('Tags'), value: d.tags, render: () => <TagList items={d.tags} /> },
          { label: t('Revision Number'), value: d.revision_number },
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) => [
        {
          key: 'rules',
          label: t('Rules'),
          render: () => <RulesTable
              securityGroupId={d.id}
              isAdmin={isAdmin}
              refreshKey={`${d.revision_number}-${(d.security_group_rules || []).length}`}
            />,
        },
      ]}
      actions={({ isAdmin, detail }) =>
        isAdmin
          ? { firstAction: deleteSecurityGroupAction({ isAdmin }), moreActions: [] }
          : {
              firstAction: editSecurityGroupAction(),
              moreActions: [
                { action: createRuleAction({ securityGroupId: detail?.id }) },
                { action: deleteSecurityGroupAction({ isAdmin }) },
              ],
            }
      }
    />
  );
}
