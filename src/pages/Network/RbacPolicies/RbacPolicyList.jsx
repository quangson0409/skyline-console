import React from 'react';
import { Link } from 'react-router-dom';
import { neutronApi } from '@/api/neutron';
import { keystoneApi } from '@/api/keystone';
import ResourcePage, { CopyText, deleteAction } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { detailPath, listAll } from '../common';

/* ---------------- legacy resources/neutron/rbac-policy.js ---------------- */
export const objectTypes = () => ({
  network: t('Network'),
  qos_policy: t('QoS Policy'),
});

export const anyProject = { id: '*', name: '*' };

export const projectDetailPath = (id) => `/identity/project-admin/detail/${id}`;

export const rbacObjectPath = (objectType, objectId) => {
  if (!objectId) return null;
  if (objectType === 'network') return detailPath('networks', objectId, true);
  if (objectType === 'qos_policy') return detailPath('qos-policy', objectId, true);
  return null;
};

const safeList = async (p, key) => {
  try {
    return (await p)?.[key] || [];
  } catch {
    return [];
  }
};

const loadProjects = () => safeList(keystoneApi.listProjects(), 'projects');

/** QoS is an optional neutron extension: legacy hides QoS objects when qosEndpoint() is off */
const loadQosPolicies = async () => {
  try {
    const res = await neutronApi.listQosPolicies();
    return { enabled: true, policies: res?.policies || [] };
  } catch {
    return { enabled: false, policies: [] };
  }
};

/* ---------------- fetch (legacy RbacPoliciesStore.listDidFetch / detailDidFetch) ---------------- */
export const fetchRbacPolicies = async ({ params = {} } = {}) => {
  const [res, networks, qos, projects] = await Promise.all([
    neutronApi.listRbacPolicies(params),
    listAll.networks(),
    loadQosPolicies(),
    loadProjects(),
  ]);
  const netMap = Object.fromEntries(networks.map((n) => [n.id, n]));
  const qosMap = Object.fromEntries(qos.policies.map((n) => [n.id, n]));
  const projMap = Object.fromEntries(projects.map((n) => [n.id, n]));
  return (res?.rbac_policies || []).map((item) => {
    const { object_id, target_tenant } = item;
    const project_id = item.project_id || item.tenant_id;
    return {
      ...item,
      project_id,
      project_name: projMap[project_id]?.name || '',
      object_name: netMap[object_id]?.name || qosMap[object_id]?.name || '-',
      target_tenant_name: projMap[target_tenant]?.name || '*',
      target_tenant_id: target_tenant === '*' ? '' : target_tenant,
    };
  });
};

export const fetchRbacPolicyDetail = async (id) => {
  const item = (await neutronApi.getRbacPolicy(id))?.rbac_policy;
  if (!item) return item;
  const { object_type, object_id, target_tenant } = item;
  let objectRequest = null;
  if (object_type === 'network') objectRequest = neutronApi.getNetwork(object_id);
  else if (object_type === 'qos_policy') objectRequest = neutronApi.getQosPolicy(object_id);
  const projectRequest = target_tenant && target_tenant !== '*' ? keystoneApi.getProject(target_tenant) : null;
  const [objectResult, projectResult] = await Promise.allSettled([objectRequest, projectRequest]);
  const { network, policy, qos_policy } = (objectResult.status === 'fulfilled' && objectResult.value) || {};
  return {
    ...item,
    object: network || qos_policy || policy,
    targetProject: projectResult.status === 'fulfilled' ? projectResult.value?.project : undefined,
  };
};

/* ---------------- actions (legacy RbacPolicies/actions) ---------------- */
const projectOptions = (projects) =>
  [anyProject, ...projects].map((it) => ({ value: it.id, label: it.name || it.id }));

export const createRbacPolicyAction = () => ({
  id: 'create-policy',
  type: 'modal',
  title: t('Create RBAC Policy'),
  buttonText: t('Create'),
  getFormItems: async () => {
    const [projects, networks, qos] = await Promise.all([loadProjects(), listAll.networks(), loadQosPolicies()]);
    const toOpts = (list) => list.map((it) => ({ value: it.id, label: it.name || it.id }));
    const objectList = [
      { value: 'network', label: t('Shared Network') },
      { value: 'external-network', label: t('External Network') },
      ...(qos.enabled ? [{ value: 'qos_policy', label: t('Shared QoS Policy') }] : []),
    ];
    return [
      {
        name: 'target_tenant',
        label: t('Target Project'),
        placeholder: t('Select a project'),
        type: 'select',
        options: projectOptions(projects),
        required: true,
      },
      {
        name: 'object_type',
        label: t('Object Type'),
        placeholder: t('Select an object type'),
        type: 'select',
        options: objectList,
        required: true,
      },
      {
        name: 'object_id_network',
        label: t('Shared Network'),
        placeholder: t('Select a network'),
        type: 'select',
        options: toOpts(networks.filter((it) => it.shared === true)),
        required: true,
        visible: (v) => v.object_type === 'network',
      },
      {
        name: 'object_id_external',
        label: t('External Network'),
        placeholder: t('Select a network'),
        type: 'select',
        options: toOpts(networks.filter((it) => it['router:external'] === true)),
        required: true,
        visible: (v) => v.object_type === 'external-network',
      },
      {
        name: 'object_id_qos',
        label: t('QoS Policy'),
        placeholder: t('Select a QoS Policy'),
        type: 'select',
        options: toOpts(qos.policies),
        required: true,
        visible: (v) => v.object_type === 'qos_policy',
      },
    ];
  },
  onSubmit: (values) => {
    const { object_type, target_tenant } = values;
    // one select per object type (legacy shows/hides three `object_id` selects)
    const object_id = {
      network: values.object_id_network,
      'external-network': values.object_id_external,
      qos_policy: values.object_id_qos,
    }[object_type];
    const action = object_type === 'network' || object_type === 'qos_policy' ? 'access_as_shared' : 'access_as_external';
    const updatedType = object_type === 'external-network' ? 'network' : object_type;
    return neutronApi.createRbacPolicy({
      target_tenant,
      object_id,
      object_type: updatedType,
      action,
    });
  },
});

export const editRbacPolicyAction = () => ({
  id: 'edit-policy',
  type: 'modal',
  title: t('Edit'),
  buttonText: t('Edit'),
  description: t('You may update the editable properties of the RBAC policy here.'),
  getDefaultValues: (item) => ({ target_tenant: item.target_tenant }),
  getFormItems: async () => {
    const projects = await loadProjects();
    return [
      {
        name: 'target_tenant',
        label: t('Target Project'),
        placeholder: t('Select a project'),
        type: 'select',
        options: projectOptions(projects),
        required: true,
      },
    ];
  },
  onSubmit: (values, item) => neutronApi.updateRbacPolicy(item.id, { target_tenant: values.target_tenant }),
});

export const deleteRbacPolicyAction = () =>
  deleteAction({
    name: t('RBAC Policy'),
    title: t('Delete RBAC Policy'),
    onDelete: (it) => neutronApi.deleteRbacPolicy(it.id),
  });

export const rbacRowActions = () => ({
  firstAction: editRbacPolicyAction(),
  moreActions: [{ action: deleteRbacPolicyAction() }],
});

/* ---------------- columns ---------------- */
const idName = (name, id, to) => (
  <div>
    {to ? <Link to={to}>{name || '-'}</Link> : <span>{name || '-'}</span>}
    {id ? (
      <div style={{ fontSize: 11, color: '#94a3b8' }}>
        <CopyText value={id} />
      </div>
    ) : null}
  </div>
);

export const rbacPolicyColumns = ({ projectMap = {} } = {}) => [
  {
    title: t('ID'),
    dataIndex: 'id',
    key: 'id',
    render: (id) => (
      <div>
        <Link to={`/network/rbac-policies-admin/detail/${id}`} style={{ fontWeight: 600 }}>
          {id}
        </Link>
      </div>
    ),
  },
  {
    title: t('Project ID/Name'),
    dataIndex: 'project_name',
    key: 'project_name',
    render: (v, r) => (r.project_id ? idName(v || projectMap[r.project_id], r.project_id) : '-'),
  },
  {
    title: t('Object Type'),
    dataIndex: 'object_type',
    key: 'object_type',
    render: (v) => objectTypes()[v] || v || '-',
  },
  {
    title: t('Object ID/Name'),
    dataIndex: 'object_name',
    key: 'object_name',
    render: (v, r) => idName(v, r.object_id, rbacObjectPath(r.object_type, r.object_id)),
  },
  {
    title: t('Target Project ID/Name'),
    dataIndex: 'target_tenant_name',
    key: 'target_tenant_name',
    render: (v, r) =>
      r.target_tenant_id ? idName(v, r.target_tenant_id, projectDetailPath(r.target_tenant_id)) : '*',
  },
];

export const rbacPolicyFilters = () => [
  { name: 'id', label: t('ID') },
  { name: 'target_tenant', label: t('Target Project ID') },
  { name: 'target_tenant_name', label: t('Target Project Name') },
  {
    name: 'object_type',
    label: t('Object Type'),
    options: Object.entries(objectTypes()).map(([key, label]) => ({ key, label })),
  },
  { name: 'object_name', label: t('Object') },
  { name: 'project_id', label: t('Project ID') },
  { name: 'project_name', label: t('Project Name') },
];

export default function RbacPolicyList() {
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      title={t('RBAC Policies')}
      breadcrumb={[t('Network'), t('RBAC Policies')]}
      description={t('Share networks and QoS policies with other projects through role-based access control.')}
      fetch={fetchRbacPolicies}
      columns={rbacPolicyColumns({ projectMap })}
      filterParams={rbacPolicyFilters()}
      primaryActions={[createRbacPolicyAction()]}
      batchActions={[deleteRbacPolicyAction()]}
      rowActions={rbacRowActions()}
    />
  );
}
