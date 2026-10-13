import React from 'react';
import { Link } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { t } from '@/core/i18n';
import { fetchRbacPolicyDetail, objectTypes, rbacObjectPath, projectDetailPath, rbacRowActions } from './RbacPolicyList';

function DetailInfoTab({ detail: d }) {
  const objectPath = rbacObjectPath(d.object_type, d.object_id);
  return (
    <DetailCard
      title={t('Detail Info')}
      items={[
        { label: t('Object Type'), value: objectTypes()[d.object_type] || d.object_type },
        {
          label: t('Object ID'),
          value: d.object_id,
          render: () => (objectPath ? <Link to={objectPath}>{d.object_id}</Link> : d.object_id || '-'),
        },
        { label: t('Object Name'), value: d.object?.name },
        { label: t('Action'), value: d.action },
        {
          label: t('Target Project'),
          value: d.target_tenant,
          render: () => {
            if (!d.target_tenant) return '-';
            if (d.target_tenant === '*') return '*';
            return <Link to={projectDetailPath(d.target_tenant)}>{d.targetProject?.name || d.target_tenant}</Link>;
          },
        },
      ]}
    />
  );
}

export default function RbacPolicyDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Network'), { title: t('RBAC Policies'), path: '/network/rbac-policies-admin' }]}
      backPath="/network/rbac-policies-admin"
      title={(d) => d.id}
      fetch={(id) => fetchRbacPolicyDetail(id)}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Project ID'), value: d.project_id || d.tenant_id, copyable: true },
      ]}
      tabs={(d) => [{ key: 'rbacPolicyDetailAdmin', label: t('Detail'), render: () => <DetailInfoTab detail={d} /> }]}
      actions={rbacRowActions()}
    />
  );
}
