import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { magnumApi } from '@/api/magnum';
import ResourcePage, { nameColumn, projectColumn, deleteAction } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { fetchKeypairs } from '../common';

/** Legacy stores/magnum/clusterTemplates listDidFetch (keypair existence check) */
export const fetchTemplates = async ({ isAdmin } = {}) => {
  const [res, keypairs] = await Promise.all([
    magnumApi.listClusterTemplates({}, { detail: !isAdmin }),
    isAdmin ? Promise.resolve([]) : fetchKeypairs().catch(() => []),
  ]);
  return (res?.clustertemplates || []).map((it) => {
    const row = { ...it, id: it.uuid };
    if (!isAdmin && row.keypair_id && !keypairs.some((k) => k.name === row.keypair_id)) {
      row.original_keypair_id = row.keypair_id;
      row.keypair_id = null;
    }
    return row;
  });
};

const templatePath = (isAdmin, id) => `/container-infra/${isAdmin ? 'cluster-template-admin' : 'cluster-template'}/detail/${id}`;

/** Legacy getBaseTemplateColumns */
export const templateColumns = ({ isAdmin, projectMap, inSelect } = {}) =>
  [
    inSelect
      ? {
          title: t('ID/Name'),
          dataIndex: 'name',
          key: 'name',
          render: (v, r) => (
            <div>
              <div style={{ fontWeight: 600 }}>{v || r.uuid}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.uuid}</div>
            </div>
          ),
        }
      : nameColumn({ idIndex: 'uuid', linkTo: (r) => templatePath(isAdmin, r.uuid) }),
    isAdmin && projectColumn(projectMap),
    { title: t('COE'), dataIndex: 'coe', key: 'coe', render: (v) => v || '-' },
    { title: t('Network Driver'), dataIndex: 'network_driver', key: 'network_driver', render: (v) => v || '-' },
    !isAdmin && {
      title: t('Keypair'),
      dataIndex: 'keypair_id',
      key: 'keypair_id',
      render: (v, r) => {
        if (v) {
          return inSelect ? v : <Link to={`/compute/keypair/detail/${encodeURIComponent(v)}`}>{v}</Link>;
        }
        return r.original_keypair_id || '-';
      },
    },
    inSelect && { title: t('Public'), dataIndex: 'public', key: 'public', render: (v) => (v ? t('Yes') : t('No')) },
  ].filter(Boolean);

export const createTemplateAction = (navigate) => ({
  id: 'create-cluster-template',
  type: 'custom',
  title: t('Create Cluster Template'),
  onExecute: () => navigate('/container-infra/cluster-template/create'),
});

export const editTemplateAction = (navigate) => ({
  id: 'update-cluster-template',
  type: 'custom',
  title: t('Edit'),
  onExecute: (item) => navigate(`/container-infra/cluster-template/update/${item.uuid || item.id}`),
});

export const createClusterFromTemplateAction = (navigate) => ({
  id: 'create-cluster',
  type: 'custom',
  title: t('Create Cluster'),
  onExecute: (item) => navigate(`/container-infra/clusters/create?template=${item.uuid || item.id}`),
});

export const deleteTemplateAction = () =>
  deleteAction({
    name: t('Cluster Template'),
    title: t('Delete Cluster Template'),
    onDelete: (it) => magnumApi.deleteClusterTemplate(it.uuid || it.id),
  });

export const templateRowActions = (isAdmin, navigate) =>
  isAdmin
    ? { firstAction: deleteTemplateAction(), moreActions: [] }
    : {
        firstAction: deleteTemplateAction(),
        moreActions: [{ action: editTemplateAction(navigate) }, { action: createClusterFromTemplateAction(navigate) }],
      };

export default function TemplateList() {
  const projectMap = useProjectMap();
  const navigate = useNavigate();
  return (
    <ResourcePage
      title={t('Cluster Templates')}
      breadcrumb={[t('Container Infra'), t('Cluster Templates')]}
      description={t('Magnum cluster templates define the image, flavors, network and labels of Kubernetes clusters.')}
      rowKey="uuid"
      fetch={fetchTemplates}
      columns={({ isAdmin }) => templateColumns({ isAdmin, projectMap })}
      filterParams={[{ name: 'name', label: t('Name') }]}
      primaryActions={({ isAdmin }) => (isAdmin ? [] : [createTemplateAction(navigate)])}
      batchActions={[deleteTemplateAction()]}
      rowActions={({ isAdmin }) => templateRowActions(isAdmin, navigate)}
    />
  );
}
