import React from 'react';
import { useNavigate } from 'react-router-dom';
import { zunApi } from '@/api/zun';
import { neutronApi } from '@/api/neutron';
import ResourcePage, { nameColumn, statusColumn, projectColumn, IdNameCell } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { containerStatus, containerTaskStatus, imageDrivers, isContainerTransition, listRender } from '../common';
import { createContainerAction, deleteContainerAction, containerRowActions } from './actions';

const toOptions = (map) => Object.entries(map).map(([key, label]) => ({ key, label }));

/** Legacy ContainersStore.listDidFetch / detailDidFetch address mapping */
export const mapAddresses = (item, allNetworks = [], allSubnets = []) => {
  const networks = [];
  const addrs = [];
  const subnets = [];
  Object.entries(item.addresses || {}).forEach(([key, val]) => {
    (val || []).forEach((v) => {
      const network = allNetworks.find((net) => net.id === key) || { id: key, name: key };
      const subnet = allSubnets.find((sub) => sub.id === v.subnet_id);
      addrs.push({ network, addr: v.addr, port: v.port });
      networks.push(network);
      if (subnet) subnets.push(subnet);
    });
  });
  const uniq = (list) => Array.from(new Map(list.map((it) => [it.id, it])).values());
  return { addrs, networks: uniq(networks), subnets: uniq(subnets) };
};

export const mapContainer = (it) => ({
  ...it,
  id: it.uuid,
  // legacy mapper shows "No Task" for a null task_state; kept as a separate filter key so that
  // auto refresh still treats null as "idle"
  task_state_key: it.task_state === null || it.task_state === undefined ? 'free' : it.task_state,
});

export const fetchContainers = async ({ isAdmin } = {}) => {
  const res = await zunApi.listContainers(isAdmin ? { all_projects: true } : {});
  const items = (res?.containers || []).map(mapContainer);
  if (!items.length) return items;
  const [nets, subs] = await Promise.all([
    neutronApi.listNetworks().catch(() => ({})),
    neutronApi.listSubnets().catch(() => ({})),
  ]);
  return items.map((it) => ({ ...it, ...mapAddresses(it, nets?.networks || [], subs?.subnets || []) }));
};

export const containerPath = (isAdmin, id) =>
  `/container-service/${isAdmin ? 'containers-admin' : 'containers'}/detail/${id}`;

export default function ContainerList() {
  const projectMap = useProjectMap();
  const navigate = useNavigate();
  return (
    <ResourcePage
      title={t('Zun Containers')}
      breadcrumb={[t('Container Service'), t('Zun Containers')]}
      description={t('Application containers managed by Zun.')}
      rowKey="uuid"
      fetch={fetchContainers}
      isTransition={isContainerTransition}
      columns={({ isAdmin }) =>
        [
          nameColumn({ idIndex: 'uuid', linkTo: (r) => containerPath(isAdmin, r.uuid) }),
          isAdmin && projectColumn(projectMap),
          {
            title: t('Image Driver'),
            dataIndex: 'image_driver',
            key: 'image_driver',
            render: (v) => imageDrivers()[v] || v || '-',
          },
          {
            title: t('IP Address'),
            dataIndex: 'addrs',
            key: 'addrs',
            render: (v = []) => listRender(v, (it) => it.addr, (it) => `${it.addr}-${it.port}`),
          },
          {
            title: t('Ports'),
            dataIndex: 'ports',
            key: 'ports',
            render: (v = []) => listRender(Array.isArray(v) ? v : [], (it) => String(it), (it) => String(it)),
          },
          {
            title: t('Networks'),
            dataIndex: 'networks',
            key: 'networks',
            render: (v = []) =>
              listRender(
                v,
                (it) => (
                  <IdNameCell
                    id={it.id}
                    name={it.name !== it.id ? it.name : undefined}
                    href={`/network/${isAdmin ? 'networks-admin' : 'networks'}/detail/${it.id}`}
                    bold={false}
                  />
                ),
                (it) => it.id
              ),
          },
          statusColumn({ title: t('Container Status'), textMap: containerStatus() }),
          {
            title: t('Task State'),
            dataIndex: 'task_state_key',
            key: 'task_state_key',
            render: (v) => containerTaskStatus()[v] || v || '-',
          },
        ].filter(Boolean)
      }
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'image_driver', label: t('Image Driver'), options: toOptions(imageDrivers()) },
        { name: 'status', label: t('Container Status'), options: toOptions(containerStatus()) },
        { name: 'task_state_key', label: t('Task State'), options: toOptions(containerTaskStatus()) },
      ]}
      primaryActions={({ isAdmin }) => (isAdmin ? [] : [createContainerAction(navigate)])}
      batchActions={[deleteContainerAction()]}
      rowActions={({ isAdmin }) => containerRowActions(isAdmin)}
    />
  );
}
