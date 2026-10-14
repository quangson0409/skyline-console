import React from 'react';
import { troveApi } from '@/api/trove';
import ResourcePage, { nameColumn, textColumn, timeColumn, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { fetchDatastores, datastoreOptions, DatastoreVersionSelect } from '../shared';

const DEFAULT_VALUES = { connect_timeout: 200 };

const jsonRule = () => ({
  validator: (_, value) => {
    if (!value || !String(value).trim()) return Promise.resolve();
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return Promise.resolve();
    } catch {
      // fall through
    }
    return Promise.reject(new Error(t('Please enter valid JSON.')));
  },
});

/** legacy Configurations/actions/Create */
export const createConfigurationAction = () => ({
  id: 'create-configurations',
  type: 'modal',
  policy: 'configuration:create',
  title: t('Create Group'),
  width: 720,
  getDefaultValues: () => ({ values: JSON.stringify(DEFAULT_VALUES, null, 2) }),
  getFormItems: async () => {
    const datastores = await fetchDatastores().catch(() => []);
    return [
      { name: 'name', label: t('Group Name'), type: 'input', required: true },
      { name: 'description', label: t('Description'), type: 'input' },
      { name: 'datastore_type', label: t('Datastore Type'), type: 'select', required: true, options: datastoreOptions(datastores) },
      {
        name: 'datastore_version',
        label: t('Datastore Version'),
        required: true,
        render: ({ form }) => <DatastoreVersionSelect form={form} datastores={datastores} />,
      },
      {
        name: 'values',
        label: t('Values'),
        type: 'textarea',
        rows: 5,
        rules: [jsonRule()],
        tip: t('Configuration parameters as a JSON object, e.g. {"connect_timeout": 200}.'),
      },
    ];
  },
  onSubmit: (values) => {
    let parsed = DEFAULT_VALUES;
    if (values.values && String(values.values).trim()) parsed = JSON.parse(values.values);
    return troveApi.createConfiguration({
      configuration: {
        description: values.description,
        datastore: { type: values.datastore_type, version: values.datastore_version },
        name: values.name,
        values: parsed,
      },
    });
  },
});

/** legacy Configurations/actions/Delete */
export const deleteConfigurationAction = () => ({
  ...deleteAction({
    name: t('configurations'),
    title: t('Delete Configuration'),
    onDelete: (it) => troveApi.deleteConfiguration(it.id),
  }),
  policy: 'instance:delete',
});

export default function ConfigurationList() {
  return (
    <ResourcePage
      policy="configuration:index"
      title={t('Configuration Groups')}
      breadcrumb={[t('Databases'), t('Configuration Groups')]}
      description={t('Parameter groups that can be attached to database instances.')}
      fetch={async () => (await troveApi.listConfigurations())?.configurations || []}
      columns={[
        nameColumn({ title: t('Configuration Group ID/Name'), linkTo: (r) => `/database/configurations/detail/${r.id}` }),
        textColumn(t('Description'), 'description'),
        { title: t('Datastore'), key: 'datastore', render: (_, r) => r.datastore_name || r.datastore || '-' },
        {
          title: t('Datastore Version'),
          key: 'datastoreVersion',
          render: (_, r) => r.datastore_version_name || r.datastoreVersion || '-',
        },
        timeColumn({ dataIndex: 'created' }),
      ]}
      filterParams={[{ name: 'name', label: t('Name') }]}
      primaryActions={[createConfigurationAction()]}
      batchActions={[deleteConfigurationAction()]}
      rowActions={{ firstAction: deleteConfigurationAction(), moreActions: [] }}
    />
  );
}
