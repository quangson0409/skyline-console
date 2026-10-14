import React from 'react';
import ResourcePage from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { fetchShareTypes, shareTypeColumns, shareTypeActionConfigs } from './shareTypeShared';

/** Legacy pages/share/containers/ShareType (share-type-admin) */
export default function ShareTypeList() {
  return (
    <ResourcePage
      policy="share_type:index"
      title={t('Share Types')}
      breadcrumb={[t('Share File Storage'), t('Share Types')]}
      description={t('Share types define the capabilities (extra specs) and visibility of shares.')}
      fetch={() => fetchShareTypes({ all: true })}
      columns={shareTypeColumns}
      filterParams={[{ name: 'name', label: t('Name') }]}
      primaryActions={({ data }) => shareTypeActionConfigs({ existingNames: () => data.map((it) => it.name) }).primaryActions}
      batchActions={({ data }) => shareTypeActionConfigs({ existingNames: () => data.map((it) => it.name) }).batchActions}
      rowActions={({ data }) => shareTypeActionConfigs({ existingNames: () => data.map((it) => it.name) }).rowActions}
    />
  );
}
