import React from 'react';
import { Link } from 'react-router-dom';
import { keystoneApi } from '@/api/keystone';
import ResourcePage, { CopyText, deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { detailPath, descriptionColumn, editableRole } from '../common';

export const fetchRoles = async () => (await keystoneApi.listRoles())?.roles || [];

/** legacy RoleStore.detailDidFetch: role + implied roles */
export const fetchRoleDetail = async (id) => {
  const res = await keystoneApi.getRole(id);
  const role = { id, ...(res?.role || {}) };
  let implies = [];
  try {
    implies = (await keystoneApi.listRoleImplies(id))?.role_inference?.implies || [];
  } catch {
    implies = [];
  }
  return { ...role, implies };
};

export const createRoleAction = () => ({
  id: 'role-create',
  type: 'modal',
  title: t('Create Role'),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', placeholder: t('Please input name'), required: true },
    { name: 'description', label: t('Description'), type: 'textarea' },
  ],
  onSubmit: (values) => keystoneApi.createRole(values),
});

export const editRoleAction = () => ({
  id: 'role-edit',
  type: 'modal',
  title: t('Edit Role'),
  buttonText: t('Edit'),
  allowed: (item) => editableRole(item),
  getDefaultValues: (item) => ({ name: item.name, description: item.description }),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', required: true },
    { name: 'description', label: t('Description'), type: 'textarea' },
  ],
  onSubmit: (values, item) => keystoneApi.updateRole(item.id, values),
});

export const deleteRoleAction = () => ({
  ...deleteAction({
    name: t('Role'),
    allowed: (item) => editableRole(item),
    onDelete: (it) => keystoneApi.deleteRole(it.id),
  }),
  title: t('Delete Role'),
  actionName: t('delete role'),
});

export const roleRowActions = () => ({
  firstAction: editRoleAction(),
  moreActions: [{ action: deleteRoleAction() }],
});

export const roleColumns = () => [
  {
    title: t('Role Name'),
    dataIndex: 'name',
    key: 'name',
    sorter: (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
    render: (v, r) => (
      <Link to={detailPath.role(r.id)} style={{ fontWeight: 600 }}>
        {v || r.id}
      </Link>
    ),
  },
  { title: t('ID'), dataIndex: 'id', key: 'id', render: (v) => <CopyText value={v} /> },
  descriptionColumn(),
];

export default function RoleList() {
  return (
    <ResourcePage
      title={t('Roles')}
      breadcrumb={[t('Identity'), t('Roles')]}
      description={t('Keystone roles granted to users and user groups on projects, domains or the system.')}
      fetch={fetchRoles}
      columns={roleColumns}
      filterParams={[{ name: 'name', label: t('Role Name') }]}
      primaryActions={[createRoleAction()]}
      batchActions={[deleteRoleAction()]}
      rowActions={roleRowActions()}
    />
  );
}
