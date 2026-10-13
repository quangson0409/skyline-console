import React, { useEffect, useState } from 'react';
import { Form, Select } from 'antd';
import { troveApi } from '@/api/trove';
import { t } from '@/core/i18n';

/** Legacy resources/trove/database.js InstanceStatus (trove specific part + common nova states) */
export const instanceStatus = () => ({
  BUILD: t('Building'),
  ACTIVE: t('Active'),
  ERROR: t('Error'),
  DELETE: t('Delete'),
  MIGRATE: t('Migrate'),
  RESIZE: t('Resize'),
  REBOOT: t('Reboot'),
  PROMOTE: t('Promote'),
  EJECT: t('Eject'),
  SHUTDOWN: t('Shut Down'),
  SHUTOFF: t('Shut Off'),
  BLOCKED: t('Blocked'),
  BACKUP: t('Backup'),
  FAILED: t('Failed'),
  RESTART_REQUIRED: t('Restart Required'),
  UPGRADE: t('Upgrade'),
  DETACH: t('Detach'),
  HEALTHY: t('Healthy'),
});

const TROVE_TRANSITION = ['BUILD', 'DELETE', 'MIGRATE', 'RESIZE', 'REBOOT', 'PROMOTE', 'EJECT', 'BACKUP', 'UPGRADE', 'DETACH'];
export const isInstanceTransition = (item = {}) => TROVE_TRANSITION.includes(String(item.status || '').toUpperCase());

/** Legacy resources/nova/server-group policyType (Location Policy) */
export const localityMap = () => ({
  'anti-affinity': t('Anti-Affinity'),
  affinity: t('Affinity'),
  'soft-anti-affinity': t('Soft-Anti-Affinity'),
  'soft-affinity': t('Soft-Affinity'),
});

/** legacy resources/nova/instance checkStatus (case insensitive) */
export const checkStatus = (list = [], item = {}) => list.includes(String(item.status || '').toLowerCase());

export const backupStatus = () => ({
  NEW: t('New'),
  BUILDING: t('Building'),
  SAVING: t('Saving'),
  COMPLETED: t('Completed'),
  FAILED: t('Failed'),
  DELETE_FAILED: t('Delete Failed'),
  RESTORED: t('Restored'),
});

export const databasePort = (type) =>
  ({ mysql: '3306', mariadb: '3306', percona: '3306', mongodb: '27017', postgresql: '5432', redis: '6379', cassandra: '9042', couchdb: '5984' })[
    String(type || '').toLowerCase()
  ];

/* ---------------------------------------------------------------- validators (legacy utils/validate) */
const databaseNameRegex = /^(?=.*[0-9a-zA-Z])[-_0-9a-zA-Z]{2,64}$/;
const databaseUserRegex = /^(?=.*[0-9a-zA-Z])[-_0-9a-zA-Z]{1,16}$/;

export const databaseNameRule = () => ({
  validator: (_, value) => {
    if (!value || databaseNameRegex.test(value)) return Promise.resolve();
    return Promise.reject(
      new Error(
        `${t('Invalid: ')}${t(
          'The name should contain letter or number, the length is 2 to 64, characters can only contain "0-9, a-z, A-Z, -, _."'
        )}`
      )
    );
  },
});

export const databaseUserNameRule = () => ({
  validator: (_, value) => {
    if (!value) return Promise.resolve();
    if (['os_admin', 'root'].includes(value)) {
      return Promise.reject(new Error(t('The root and os_admin are default users and cannot be created!')));
    }
    if (databaseUserRegex.test(value)) return Promise.resolve();
    return Promise.reject(
      new Error(
        `${t('Invalid: ')}${t(
          'The name should contain letter or number, the length is 1 to 16, characters can only contain "0-9, a-z, A-Z, -, _."'
        )}`
      )
    );
  },
});

/* ---------------------------------------------------------------- datastores */
export const fetchDatastores = async () => {
  const res = await troveApi.listDatastores();
  return res?.datastores || [];
};

export const datastoreOptions = (datastores = []) => datastores.map((it) => ({ label: it.name, value: it.name }));

export const versionOptions = (datastores = [], type) => {
  const current = datastores.find((it) => it.name === type);
  return (current?.versions || []).map((it) => ({ label: it.name, value: it.name }));
};

/**
 * Datastore version select whose options follow the `datastore_type` field of the same form
 * (legacy resetFormValue(['datastore_version']) on type change).
 */
export function DatastoreVersionSelect({ value, onChange, form, datastores = [], typeField = 'datastore_type' }) {
  const type = Form.useWatch(typeField, form);
  const [lastType, setLastType] = useState(type);
  useEffect(() => {
    if (type !== lastType) {
      setLastType(type);
      onChange?.(undefined);
    }
  }, [type, lastType, onChange]);
  return (
    <Select
      value={value}
      onChange={onChange}
      options={versionOptions(datastores, type)}
      placeholder={t('Please select')}
      allowClear
      showSearch
    />
  );
}

export const MultiLine = ({ value }) =>
  Array.isArray(value) && value.length ? (
    <span>
      {value.map((it) => (
        <div key={it}>{it}</div>
      ))}
    </span>
  ) : (
    '-'
  );

/** Trove quota (legacy projectStore.fetchProjectTroveQuota) -> { instances: {limit, used, left}, volumes, backups } */
export const fetchTroveQuota = async (projectId) => {
  const res = await troveApi.getQuota(projectId);
  return (res?.quotas || []).reduce((acc, cur) => {
    const used = cur.in_use ?? cur.used ?? 0;
    const limit = cur.limit ?? -1;
    const reserved = cur.reserved || 0;
    acc[cur.resource] = { ...cur, used, limit, reserved, left: limit === -1 ? -1 : limit - used - reserved };
    return acc;
  }, {});
};
