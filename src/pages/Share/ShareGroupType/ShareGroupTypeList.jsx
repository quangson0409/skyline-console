import React from 'react';
import ResourcePage, { nameColumn, IdNameCell, yesNo } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { fetchShareGroupTypes, shareGroupTypeActionConfigs } from './shareGroupTypeShared';

/** resources/manila/share-group-type shareGroupTypeColumns */
export const shareGroupTypeColumns = () => [
  nameColumn({ linkTo: (r) => `/share/share-group-type-admin/detail/${r.id}` }),
  { title: t('Public'), dataIndex: 'is_public', key: 'is_public', render: (v) => yesNo(v) },
  {
    title: t('Share Types'),
    dataIndex: 'shareTypes',
    key: 'shareTypes',
    render: (v) =>
      (v || []).length
        ? v.map((it) => (
            <div key={it.id} style={{ marginBottom: 4 }}>
              <IdNameCell id={it.id} name={it.name} bold={false} />
            </div>
          ))
        : '-',
  },
];

/** Legacy pages/share/containers/ShareGroupType (share-group-type-admin) */
export default function ShareGroupTypeList() {
  const cfg = (data) => shareGroupTypeActionConfigs({ existingNames: () => data.map((it) => it.name) });
  return (
    <ResourcePage
      policy="share_type:index"
      title={t('Share Group Types')}
      breadcrumb={[t('Share File Storage'), t('Share Group Types')]}
      description={t('Share group types bundle share types that can be used together in a share group.')}
      fetch={() => fetchShareGroupTypes({ all: true })}
      columns={shareGroupTypeColumns}
      filterParams={[{ name: 'name', label: t('Name') }]}
      primaryActions={({ data }) => cfg(data).primaryActions}
      batchActions={({ data }) => cfg(data).batchActions}
      rowActions={({ data }) => cfg(data).rowActions}
    />
  );
}
