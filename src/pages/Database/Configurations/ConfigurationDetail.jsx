import React from 'react';
import { troveApi } from '@/api/trove';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import ResourcePage, { formatTime, textColumn, nameColumn } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { deleteConfigurationAction } from './ConfigurationList';

const valueText = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));

function ValuesTab({ detail }) {
  const values = detail.values || {};
  const rows = Object.entries(values).map(([name, value]) => ({ name, value: valueText(value) }));
  return (
    <ResourcePage
      embedded
      rowKey="name"
      fetch={async () => rows}
      deps={[JSON.stringify(values)]}
      columns={[textColumn(t('Parameter'), 'name'), textColumn(t('Value'), 'value')]}
      filterParams={[{ name: 'name', label: t('Parameter') }]}
      autoRefreshEnabled={false}
    />
  );
}

function InstancesTab({ detail }) {
  return (
    <div>
      <DetailCard title={t('Defaults')} items={[{ label: t('Instances'), value: detail.instance_count ?? 0 }]} />
      <ResourcePage
        embedded
        fetch={async () => (await troveApi.listConfigurationInstances(detail.id))?.instances || []}
        deps={[detail.id]}
        columns={[
          nameColumn({ linkTo: (r) => `/database/instances/detail/${r.id}` }),
        ]}
        filterParams={[{ name: 'name', label: t('Name') }]}
      />
    </div>
  );
}

export default function ConfigurationDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Databases'), { title: t('Configuration Groups'), path: '/database/configurations' }]}
      backPath="/database/configurations"
      fetch={async (id) => (await troveApi.getConfiguration(id))?.configuration}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
      ]}
      tabs={(d) => [
        {
          key: 'general_info',
          label: t('Detail'),
          render: () => (
            <DetailCard
              title={t('Base Info')}
              items={[
                { label: t('Name'), value: d.name },
                { label: t('Description'), value: d.description },
                { label: t('Datastore'), value: d.datastore_name },
                { label: t('Datastore Version'), value: d.datastore_version_name },
                { label: t('Created At'), value: formatTime(d.created) },
                { label: t('Updated At'), value: formatTime(d.updated) },
              ]}
            />
          ),
        },
        { key: 'values', label: t('Values'), render: () => <ValuesTab detail={d} /> },
        { key: 'instances', label: t('Instances'), render: () => <InstancesTab detail={d} /> },
      ]}
      actions={{ firstAction: deleteConfigurationAction(), moreActions: [] }}
    />
  );
}
