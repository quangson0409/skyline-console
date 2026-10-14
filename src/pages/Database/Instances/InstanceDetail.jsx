import React from 'react';
import { Link } from 'react-router-dom';
import { Typography } from 'antd';
import { troveApi } from '@/api/trove';
import { novaApi } from '@/api/nova';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { formatTime, textColumn, timeColumn, statusColumn, yesNo, deleteAction, nameColumn } from '@/components/ResourcePage';
import DetailCard from '@/components/DetailCard';
import { passwordRule, confirmPasswordRule } from '@/components/form/rules';
import { t } from '@/core/i18n';
import {
  instanceStatus,
  localityMap,
  databasePort,
  MultiLine,
  backupStatus,
  databaseNameRule,
  databaseUserNameRule,
} from '../shared';
import { mapInstance } from './InstanceList';
import { instanceRowActions } from './actions';

/* ------------------------------------------------------------------ Detail tab (legacy BaseDetail) */
const connectionExample = (d) => {
  const host = (d.ip || [])[0] || d.hostname || '<host>';
  const port = databasePort(d.type);
  switch (String(d.type || '').toLowerCase()) {
    case 'mysql':
    case 'mariadb':
    case 'percona':
      return `mysql -h ${host} -P ${port} -u <user> -p`;
    case 'postgresql':
      return `psql -h ${host} -p ${port} -U <user> -d <database>`;
    case 'mongodb':
      return `mongo --host ${host} --port ${port} -u <user> -p`;
    case 'redis':
      return `redis-cli -h ${host} -p ${port}`;
    default:
      return '';
  }
};

function GeneralInfo({ detail: d, isAdmin }) {
  const flavor = d.flavor || {};
  const example = d.connection_examples || connectionExample(d);
  return (
    <div>
      <DetailCard
        title={t('Base Info')}
        items={[
          { label: t('Name'), value: d.name },
          { label: t('Datastore'), value: d.type },
          { label: t('Datastore Version'), value: d.version },
          { label: t('Status'), value: instanceStatus()[d.status] || d.status },
          { label: t('Location Policy'), value: localityMap()[d.locality] || d.locality },
          {
            label: t('Configuration Group'),
            value: d.configuration?.id,
            render: () =>
              d.configuration?.id ? (
                <Link to={`/database/configurations/detail/${d.configuration.id}`}>{d.configuration.name || d.configuration.id}</Link>
              ) : (
                '-'
              ),
          },
        ]}
      />
      <DetailCard
        title={t('Specs')}
        items={[
          {
            label: t('Database Flavor'),
            value: flavor.id,
            render: () =>
              flavor.id ? (
                <Link to={`/compute/${isAdmin ? 'flavor-admin' : 'flavor'}/detail/${flavor.id}`}>{flavor.name || flavor.id}</Link>
              ) : (
                '-'
              ),
          },
          { label: t('Volume Size'), value: d.size, unit: 'GiB' },
          { label: t('Created At'), value: formatTime(d.created) },
          { label: t('Updated At'), value: formatTime(d.updated) },
          { label: t('Service Status Updated'), value: d.service_status_updated || d.service_status_update },
        ]}
      />
      <DetailCard
        title={t('Connection Information')}
        items={[
          { label: t('Host'), value: d.ip, render: () => <MultiLine value={d.ip} /> },
          { label: t('Database Port'), value: databasePort(d.type) },
          {
            label: t('Connection Examples'),
            value: example,
            render: () => (example ? <Typography.Text code copyable>{example}</Typography.Text> : '-'),
          },
        ]}
      />
      <DetailCard
        title={t('Fault')}
        column={1}
        items={[
          { label: t('Created At'), value: formatTime(d.fault?.created || d.created) },
          { label: t('Message'), value: d.fault?.message },
          { label: t('Message Details'), value: d.fault?.details },
        ]}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Users tab */
const fetchDatabaseOptions = async (id) => {
  const res = await troveApi.listDatabases(id).catch(() => ({}));
  return (res?.databases || []).map((it) => ({ label: it.name, value: it.name }));
};

const createUserAction = (instanceId) => ({
  id: 'create-user',
  type: 'modal',
  policy: 'instance:extension:user:create',
  title: t('Create User'),
  getFormItems: async () => [
    { name: 'userName', label: t('Name'), type: 'input', required: true, rules: [databaseUserNameRule()] },
    { name: 'database', label: t('Database'), type: 'select', mode: 'multiple', required: true, options: await fetchDatabaseOptions(instanceId) },
    { name: 'password', label: t('Password'), type: 'password', required: true, rules: [passwordRule()] },
    { name: 'confirmPassword', label: t('Confirm Password'), type: 'password', required: true, rules: [confirmPasswordRule()] },
  ],
  onSubmit: (values) =>
    troveApi.createUsers(instanceId, {
      users: [
        {
          databases: (values.database || []).map((it) => ({ name: it })),
          name: values.userName,
          password: values.password,
        },
      ],
    }),
});

const deleteUserAction = (instanceId) => ({
  ...deleteAction({ name: t('User'), title: t('Delete User'), onDelete: (it) => troveApi.deleteUser(instanceId, it.name) }),
  policy: 'instance:extension:user:delete',
});

const grantDatabaseAction = (instanceId) => ({
  id: 'grant-databases-access',
  type: 'modal',
  policy: 'instance:extension:user_access:update',
  title: t('Grant Databases Access'),
  getDefaultValues: (item) => ({ name: item.name, database: item.databases }),
  getFormItems: async () => [
    { name: 'name', label: t('Name'), type: 'input', required: true, disabled: true },
    { name: 'database', label: t('Database'), type: 'select', mode: 'multiple', required: true, options: await fetchDatabaseOptions(instanceId) },
  ],
  onSubmit: (values, item) =>
    troveApi.grantDatabases(instanceId, values.name || item.name, {
      databases: (values.database || []).map((it) => ({ name: it })),
    }),
});

/** legacy stores/trove/instances-user listDidFetch: keep only databases that still exist */
const fetchUsers = async (id) => {
  const res = await troveApi.listUsers(id);
  const users = res?.users || [];
  if (!users.length) return users;
  const dbRes = await troveApi.listDatabases(id).catch(() => ({}));
  const names = (dbRes?.databases || []).map((db) => db.name);
  return users.map((it) => ({
    ...it,
    databases: (it.databases || []).filter((db) => names.includes(db.name)).map((db) => db.name),
  }));
};

function UsersTab({ instanceId }) {
  const del = deleteUserAction(instanceId);
  return (
    <ResourcePage
      embedded
      rowKey="name"
      fetch={() => fetchUsers(instanceId)}
      deps={[instanceId]}
      columns={[
        textColumn(t('User Name'), 'name'),
        textColumn(t('Allowed Host'), 'host'),
        { title: t('Databases'), dataIndex: 'databases', key: 'databases', render: (v) => <MultiLine value={v} /> },
      ]}
      filterParams={[{ name: 'name', label: t('User Name') }]}
      primaryActions={({ isAdmin }) => (isAdmin ? [] : [createUserAction(instanceId)])}
      batchActions={[del]}
      rowActions={({ isAdmin }) =>
        isAdmin ? { firstAction: del, moreActions: [] } : { firstAction: del, moreActions: [{ action: grantDatabaseAction(instanceId) }] }
      }
    />
  );
}

/* ------------------------------------------------------------------ Databases tab */
const createDatabaseAction = (instanceId) => ({
  id: 'create-database',
  type: 'modal',
  policy: 'instance:extension:database:create',
  title: t('Create Database'),
  formItems: [{ name: 'databaseName', label: t('Name'), type: 'input', required: true, rules: [databaseNameRule()] }],
  onSubmit: (values) =>
    troveApi.createDatabases(instanceId, {
      databases: [{ character_set: 'utf8', collate: 'utf8_general_ci', name: values.databaseName }],
    }),
});

function DatabasesTab({ instanceId }) {
  const del = {
    ...deleteAction({
      name: t('Database'),
      title: t('Delete Database'),
      onDelete: (it) => troveApi.deleteDatabase(instanceId, it.name),
    }),
    policy: 'instance:extension:database:delete',
  };
  return (
    <ResourcePage
      embedded
      rowKey="name"
      fetch={async () => (await troveApi.listDatabases(instanceId))?.databases || []}
      deps={[instanceId]}
      columns={[
        textColumn(t('Database Name'), 'name'),
        textColumn(t('Character Set'), 'character_set'),
        textColumn(t('Collation'), 'collate'),
      ]}
      filterParams={[{ name: 'name', label: t('Database Name') }]}
      primaryActions={({ isAdmin }) => (isAdmin ? [] : [createDatabaseAction(instanceId)])}
      batchActions={[del]}
      rowActions={{ firstAction: del, moreActions: [] }}
    />
  );
}

/* ------------------------------------------------------------------ Backups tab */
function BackupsTab({ instanceId, isAdmin }) {
  return (
    <ResourcePage
      embedded
      fetch={async () => (await troveApi.listInstanceBackups(instanceId))?.backups || []}
      deps={[instanceId]}
      columns={[
        nameColumn({ linkTo: (r) => (isAdmin ? null : `/database/backups/detail/${r.id}`) }),
        timeColumn({ dataIndex: 'created' }),
        textColumn(t('Backup File'), 'locationRef'),
        { title: t('Incremental'), dataIndex: 'incremental', key: 'incremental', render: (v) => yesNo(v) },
        statusColumn({ textMap: backupStatus() }),
      ]}
      filterParams={[{ name: 'name', label: t('Name') }]}
    />
  );
}

/* ------------------------------------------------------------------ Logs tab */
function LogsTab({ instanceId }) {
  return (
    <ResourcePage
      embedded
      rowKey="name"
      fetch={async () => (await troveApi.listInstanceLogs(instanceId))?.logs || []}
      deps={[instanceId]}
      columns={[
        textColumn(t('Name'), 'name'),
        textColumn(t('Type'), 'type'),
        textColumn(t('Status'), 'status'),
        textColumn(t('Published'), 'published'),
        textColumn(t('Pending'), 'pending'),
        textColumn(t('Container'), 'container'),
      ]}
      filterParams={[{ name: 'name', label: t('Name') }]}
    />
  );
}

/* ------------------------------------------------------------------ Defaults tab */
function DefaultsTab({ detail }) {
  return (
    <DetailCard
      title={t('Defaults')}
      items={[{ label: t('Number of Nodes'), value: detail?.node_groups?.[0]?.count ?? '-' }]}
    />
  );
}

/* ------------------------------------------------------------------ page */
export const fetchInstanceDetail = async (id) => {
  const res = await troveApi.getInstance(id);
  const item = mapInstance(res?.instance || {});
  const flavorId = item?.flavor?.id;
  if (flavorId) {
    try {
      const flavor = (await novaApi.getFlavor(flavorId))?.flavor;
      return { ...item, flavor: { ...item.flavor, ...(flavor || {}) } };
    } catch {
      // flavor may be private / deleted
    }
  }
  return item;
};

export default function InstanceDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Databases'), { title: t('Database Instances'), path: '/database/instances' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/database/instances-admin' : '/database/instances')}
      fetch={fetchInstanceDetail}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Name'), value: d.name },
          { label: t('Status'), value: d.status, render: () => instanceStatus()[d.status] || d.status || '-' },
          isAdmin && { label: t('Project ID'), value: d.tenant_id, copyable: true },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) => [
        { key: 'general_info', label: t('Detail'), render: () => <GeneralInfo detail={d} isAdmin={isAdmin} /> },
        { key: 'users', label: t('Users'), render: () => <UsersTab instanceId={d.id} /> },
        { key: 'databases', label: t('Databases'), render: () => <DatabasesTab instanceId={d.id} /> },
        { key: 'backups', label: t('Backups'), render: () => <BackupsTab instanceId={d.id} isAdmin={isAdmin} /> },
        { key: 'logs', label: t('Logs'), render: () => <LogsTab instanceId={d.id} /> },
        { key: 'defaults', label: t('Defaults'), render: () => <DefaultsTab detail={d} /> },
      ]}
      actions={({ isAdmin }) => instanceRowActions(isAdmin)}
    />
  );
}
