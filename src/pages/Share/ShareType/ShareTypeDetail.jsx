import React from 'react';
import { useNavigate } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import { yesNo } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { KeyValueTab } from '../shareShared';
import { ShareTable } from '../Share/shareActions';
import { fetchShareTypeDetail, extraSpecApi, shareTypeActionConfigs } from './shareTypeShared';

export default function ShareTypeDetail() {
  const navigate = useNavigate();
  return (
    <ResourceDetail
      breadcrumb={[t('Share File Storage'), { title: t('Share Types'), path: '/share/share-type-admin' }]}
      backPath="/share/share-type-admin"
      fetch={(id) => fetchShareTypeDetail(id)}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Description'), value: d.description },
        { label: t('Public'), value: d.is_public, render: () => yesNo(d.is_public) },
      ]}
      tabs={(d) => [
        {
          key: 'ExtraSpec',
          label: t('Extra Specs'),
          render: () => (
            <KeyValueTab
              api={extraSpecApi(d.id)}
              kind="extra"
              policies={{
                create: 'share_types_extra_spec:create',
                edit: 'share_types_extra_spec:update',
                del: 'share_types_extra_spec:delete',
              }}
              canDelete={(it) => it.keyName !== 'driver_handles_share_servers'}
            />
          ),
        },
        {
          key: 'share',
          label: t('Shares'),
          render: () => (
            <ShareTable filterKey="share_type_id" filterValue={d.id} hide={['share_type_name']} navigate={navigate} />
          ),
        },
      ]}
      actions={() => shareTypeActionConfigs().rowActions}
    />
  );
}
