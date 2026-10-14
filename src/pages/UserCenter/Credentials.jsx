import React from 'react';
import { Checkbox, DatePicker, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { keystoneApi } from '@/api/keystone';
import ResourcePage, { nameColumn, IdNameCell, formatTime, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { getProfile, currentUserId, downloadJson } from '@/pages/Identity/common';

/** legacy CredentialStore.listDidFetch: adds project_name from auth/projects */
export const fetchCredentials = async (userId) => {
  const uid = userId || (await currentUserId());
  if (!uid) return [];
  const items = (await keystoneApi.listApplicationCredentials(uid))?.application_credentials || [];
  try {
    const projects = (await keystoneApi.listAuthProjects())?.projects || [];
    const map = new Map(projects.map((p) => [p.id, p.name]));
    return items.map((it) => ({ ...it, project_name: map.get(it.project_id) || '-' }));
  } catch {
    return items;
  }
};

export const credentialColumns = () => [
  nameColumn({ title: t('ID/Name') }),
  {
    title: t('Project ID/Name'),
    dataIndex: 'project_name',
    key: 'project_name',
    render: (v, r) => <IdNameCell id={r.project_id} name={v} bold={false} />,
  },
  { title: t('Description'), dataIndex: 'description', key: 'description', render: (v) => v || '-' },
  { title: t('Expires At'), dataIndex: 'expires_at', key: 'expires_at', render: (v) => formatTime(v) },
  {
    title: (
      <span>
        {t('Restriction')}{' '}
        <Tooltip
          title={t(
            'Used to restrict whether the application credential may be used for the creation or destruction of other application credentials or trusts.'
          )}
        >
          <QuestionCircleOutlined />
        </Tooltip>
      </span>
    ),
    dataIndex: 'unrestricted',
    key: 'unrestricted',
    render: (v) => (!v ? t('Restricted') : t('Unrestricted')),
  },
  {
    title: t('Roles'),
    dataIndex: 'roles',
    key: 'roles',
    render: (roles) => ((roles || []).length ? roles.map((r) => <div key={r.id}>{r.name}</div>) : '-'),
  },
];

export const deleteCredentialAction = () => ({
  ...deleteAction({
    name: t('Application Credential'),
    onDelete: (it) => keystoneApi.deleteApplicationCredential(it.user_id, it.id),
  }),
  policy: 'identity:delete_application_credential',
  title: t('Delete Application Credential'),
  actionName: t('delete application credential'),
});

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** legacy Credentials/actions/Create: creates then downloads <name>.json */
export const createCredentialAction = () => ({
  id: 'create-application_credentials',
  type: 'modal',
  policy: 'identity:create_application_credential',
  title: t('Create Application Credentials'),
  width: 640,
  getFormItems: async () => {
    const profile = await getProfile();
    const roleOptions = (profile?.roles || []).map((r) => ({ label: r.name || r, value: r.id || r }));
    return [
      { name: 'name', label: t('Name'), type: 'input', required: true },
      {
        name: 'expires_at',
        label: t('Expires At'),
        render: () => (
          <DatePicker
            style={{ width: '100%' }}
            showToday={false}
            disabledDate={(current) => current && current.valueOf() < startOfToday()}
          />
        ),
      },
      {
        name: 'roles',
        label: t('Roles'),
        tip: t(
          'If not provided, the roles assigned to the application credential will be the same as the roles in the current token.'
        ),
        render: () => <Checkbox.Group options={roleOptions} />,
      },
      {
        name: 'unrestricted',
        label: t('Restriction'),
        type: 'checkbox',
        render: () => <Checkbox>{t('Unrestricted')}</Checkbox>,
        tip: t(
          'By default, for security reasons, application credentials are forbidden from being used for creating or destructing additional application credentials or keystone trusts. If your application credential needs to be able to perform these actions, check unrestricted.'
        ),
      },
      { name: 'description', label: t('Description'), type: 'textarea' },
    ];
  },
  onSubmit: async (values) => {
    const body = { ...values };
    if (body.expires_at && typeof body.expires_at.endOf === 'function') {
      body.expires_at = body.expires_at.endOf('day').toISOString();
    } else {
      delete body.expires_at;
    }
    if (Array.isArray(body.roles) && body.roles.length) {
      body.roles = body.roles.map((id) => ({ id }));
    } else {
      delete body.roles;
    }
    body.unrestricted = Boolean(body.unrestricted);
    const uid = await currentUserId();
    const res = await keystoneApi.createApplicationCredential(uid, body);
    const { links, roles, system, unrestricted, user_id, name, ...rest } = res?.application_credential || {};
    downloadJson(rest, `${name || 'application_credential'}.json`);
    return res;
  },
});

/**
 * Application credentials list.
 *  - user center: current user, create + delete
 *  - user detail tab (userId given): delete only (legacy detailConfigs)
 */
export function CredentialsTable({ userId, embedded = false }) {
  const inDetail = Boolean(userId);
  return (
    <ResourcePage
      embedded={embedded}
      title={t('Application Credentials')}
      breadcrumb={[t('User Center'), t('Application Credentials')]}
      deps={[userId]}
      fetch={() => fetchCredentials(userId)}
      columns={credentialColumns}
      filterParams={[{ name: 'name', label: t('Name') }]}
      primaryActions={inDetail ? [] : [createCredentialAction()]}
      batchActions={[deleteCredentialAction()]}
      rowActions={{ firstAction: deleteCredentialAction(), moreActions: [] }}
    />
  );
}

export default function Credentials() {
  return <CredentialsTable />;
}
