import React from 'react';
import { Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import ResourcePage, { nameColumn, statusColumn, timeColumn, textColumn, yesNo } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { powerState, provisioningState, fetchNodes } from './helpers';
import { createNodeAction, deleteNodeAction, nodeRowActions } from './actions';

const toOptions = (map) => Object.entries(map).map(([key, label]) => ({ key, label }));

/** Port of legacy pages/compute/containers/BareMetalNode (List) */
export const nodeColumns = () => [
  nameColumn({
    title: t('Node ID/Name'),
    idIndex: 'uuid',
    linkTo: (r) => `/compute/baremetal-node-admin/detail/${r.uuid}`,
  }),
  {
    title: t('Ironic Instance Name'),
    dataIndex: 'instance_info',
    key: 'instance_info',
    render: (value) => value?.display_name || '-',
  },
  statusColumn({ title: t('Power State'), dataIndex: 'power_state', textMap: powerState() }),
  statusColumn({ title: t('Provision State'), dataIndex: 'provision_state', textMap: provisioningState() }),
  {
    title: t('Maintained'),
    dataIndex: 'maintenance',
    key: 'maintenance',
    render: (value, record) =>
      record.maintenance_reason ? <Tooltip title={record.maintenance_reason}>{yesNo(value)}</Tooltip> : yesNo(value),
  },
  textColumn(t('Number of Ports'), 'portCount'),
  textColumn(t('Driver'), 'driver'),
  textColumn(t('Resource Class'), 'resource_class'),
  timeColumn(),
];

export default function NodeList() {
  const navigate = useNavigate();
  return (
    <ResourcePage
      title={t('Bare Metal Nodes')}
      breadcrumb={[t('Compute'), t('Bare Metal Nodes')]}
      fetch={() => fetchNodes()}
      rowKey="uuid"
      columns={nodeColumns}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'power_state', label: t('Power State'), options: toOptions(powerState()) },
        { name: 'provision_state', label: t('Provision State'), options: toOptions(provisioningState()) },
      ]}
      primaryActions={[createNodeAction(navigate)]}
      batchActions={[deleteNodeAction()]}
      rowActions={nodeRowActions(navigate)}
      interval={15000}
    />
  );
}
