import React from 'react';
import { Link } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import { yesNo } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { KeyValueTab } from '../shareShared';
import { fetchShareGroupTypeDetail, groupSpecApi, shareGroupTypeActionConfigs } from './shareGroupTypeShared';

export default function ShareGroupTypeDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Share File Storage'), { title: t('Share Group Types'), path: '/share/share-group-type-admin' }]}
      backPath="/share/share-group-type-admin"
      fetch={(id) => fetchShareGroupTypeDetail(id, { allProjects: true })}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Public'), value: d.is_public, render: () => yesNo(d.is_public) },
        {
          label: t('Share Types'),
          value: (d.shareTypes || []).length,
          render: () =>
            (d.shareTypes || []).length
              ? d.shareTypes.map((it) => (
                  <div key={it.id}>
                    <Link to={`/share/share-type-admin/detail/${it.id}`}>{it.name || it.id}</Link>
                  </div>
                ))
              : '-',
        },
      ]}
      tabs={(d) => [
        {
          key: 'extraSpec',
          label: t('Extra Specs'),
          render: () => <KeyValueTab api={groupSpecApi(d.id)} kind="extra" />,
        },
      ]}
      actions={() => shareGroupTypeActionConfigs().rowActions}
    />
  );
}
