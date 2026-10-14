import React from 'react';
import { Card, Col, Row, Table, Tooltip } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import ResourcePage, { formatTime, timeColumn, textColumn, yesNo, CopyText, IdNameCell } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { filterTabsByPolicy } from '../_shared';
import { powerState, provisioningState, fetchNodeDetail, fetchNodePorts, fetchNodePortGroups, yesNoText } from './helpers';
import {
  nodeRowActions,
  createPortAction,
  editPortAction,
  deletePortAction,
  createPortGroupAction,
  editPortGroupAction,
  deletePortGroupAction,
} from './actions';

const show = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

const objItems = (obj) =>
  isObj(obj) ? Object.keys(obj).map((key) => ({ label: key, value: show(obj[key]) })) : [];

/** legacy Detail/BaseDetail: left cards + validate (Interface Info) card */
const BaseInfoTab = ({ detail }) => {
  const bootDevice = isObj(detail.bootDevice) ? detail.bootDevice : {};
  const traits = Array.isArray(detail.traits) ? detail.traits : null;
  const validate = isObj(detail.validate) ? detail.validate : {};
  const validateData = Object.keys(validate)
    .filter((key) => isObj(validate[key]))
    .map((key) => ({
      value: detail[`${key}_interface`],
      name: key,
      ...validate[key],
    }));
  const states = isObj(detail.states) ? detail.states : null;
  const column = { xs: 1, sm: 1, md: 2 };
  return (
    <Row gutter={16}>
      <Col xs={24} xl={12}>
        <DetailCard
          title={t('Base Info')}
          column={column}
          items={[
            { label: t('Chassis ID'), value: detail.chassis_uuid },
            { label: t('Resource Class'), value: detail.resource_class },
            { label: t('Management'), value: detail.maintenance, render: (v) => yesNoText(v) },
            { label: t('Management Reason'), value: detail.maintenance_reason },
          ]}
        />
        <DetailCard title={t('Driver Info')} column={column} items={objItems(detail.driver_info)} />
        <DetailCard
          title={t('Boot Device')}
          column={column}
          items={[
            { label: t('Boot Device'), value: bootDevice.boot_device },
            { label: t('Persistent'), value: bootDevice.persistent, render: (v) => yesNoText(v) },
          ]}
        />
        <DetailCard title={t('Properties')} column={column} items={objItems(detail.properties)} />
        <DetailCard
          title={t('Traits')}
          column={column}
          items={[
            {
              label: t('Traits'),
              value: traits,
              render: (v) => (v && v.length ? v.map((it) => <div key={it}>{it}</div>) : '-'),
            },
          ]}
        />
        <DetailCard
          title={t('Resource Class')}
          column={column}
          items={[{ label: t('Resource Class'), value: detail.resource_class }]}
        />
      </Col>
      <Col xs={24} xl={12}>
        <Card title={t('Interface Info')} variant="borderless" style={{ marginBottom: 16, borderRadius: 8 }}>
          <Table
            size="small"
            rowKey="name"
            pagination={false}
            dataSource={validateData}
            scroll={{ x: true }}
            columns={[
              { title: t('Name'), dataIndex: 'name' },
              { title: t('Valid'), dataIndex: 'result', render: (v) => yesNo(v) },
              { title: t('Current Interface'), dataIndex: 'value', render: (v) => v || '-' },
              { title: t('Reason'), dataIndex: 'reason', width: 300, render: (v) => v || '-' },
            ]}
          />
        </Card>
        {states ? <DetailCard title={t('States')} column={column} items={objItems(states)} /> : null}
      </Col>
    </Row>
  );
};

/** legacy Detail/Port */
const PortTab = ({ detail }) => (
  <ResourcePage
    embedded
    rowKey="uuid"
    deps={[detail]}
    fetch={() => fetchNodePorts(detail.uuid)}
    columns={[
      { title: t('ID'), dataIndex: 'uuid', key: 'uuid', render: (v) => <CopyText value={v} /> },
      textColumn(t('MAC Address'), 'address'),
      { title: t('PXE Enabled'), dataIndex: 'pxe_enabled', key: 'pxe_enabled', render: (v) => yesNo(v) },
      {
        title: t('Port Group'),
        dataIndex: 'portgroup_uuid',
        key: 'portgroup_uuid',
        render: (v) => (v ? <IdNameCell id={v} bold={false} /> : '-'),
      },
      timeColumn(),
    ]}
    primaryActions={[createPortAction(detail)]}
    batchActions={[deletePortAction()]}
    rowActions={{ firstAction: editPortAction(detail), moreActions: [{ action: deletePortAction() }] }}
  />
);

/** legacy Detail/PortGroup */
const PortGroupTab = ({ detail }) => (
  <ResourcePage
    embedded
    rowKey="uuid"
    deps={[detail]}
    fetch={() => fetchNodePortGroups(detail.uuid)}
    columns={[
      {
        title: t('ID/Name'),
        dataIndex: 'name',
        key: 'name',
        sorter: (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
        render: (v, r) => <IdNameCell id={r.uuid} name={v} />,
      },
      textColumn(t('MAC Address'), 'address'),
      {
        title: t('Stand Alone Ports Supported'),
        dataIndex: 'standalone_ports_supported',
        key: 'standalone_ports_supported',
        render: (v) => yesNo(v),
      },
      timeColumn(),
    ]}
    primaryActions={[createPortGroupAction(detail)]}
    batchActions={[deletePortGroupAction()]}
    rowActions={{ firstAction: editPortGroupAction(detail), moreActions: [{ action: deletePortGroupAction() }] }}
  />
);

export default function NodeDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  return (
    <ResourceDetail
      policy="baremetal:node:get"
      breadcrumb={[t('Compute'), { title: t('Bare Metal Nodes'), path: '/compute/baremetal-node-admin' }]}
      backPath="/compute/baremetal-node-admin"
      fetch={(nodeId) => fetchNodeDetail(nodeId)}
      title={(d) => d.name || d.uuid || id}
      statusField="provision_state"
      info={(d) => [
        { label: t('ID'), value: d.uuid, copyable: true },
        { label: t('Node Name'), value: d.name },
        { label: t('Ironic Instance Name'), value: d.instance_info?.display_name },
        {
          label: t('Power State'),
          value: d.power_state,
          render: (v) => (v ? powerState()[v] || v : '-'),
        },
        {
          label: t('Provision State'),
          value: d.provision_state,
          render: (v) => (v ? provisioningState()[v] || v : '-'),
        },
        {
          label: t('Maintained'),
          value: d.maintenance,
          render: (v) =>
            d.maintenance_reason ? <Tooltip title={d.maintenance_reason}>{yesNoText(v)}</Tooltip> : yesNoText(v),
        },
        { label: t('Number of Ports'), value: (d.portsNew && d.portsNew.length) || '-' },
        { label: t('Driver'), value: d.driver },
        { label: t('Created At'), value: formatTime(d.created_at) },
      ]}
      tabs={(d) => filterTabsByPolicy([
        { key: 'base', label: t('Base Info'), render: () => <BaseInfoTab detail={d} /> },
        { key: 'ports', label: t('Ports'), policy: 'baremetal:port:get', render: () => <PortTab detail={d} /> },
        {
          key: 'portGroups',
          label: t('Port Groups'),
          policy: 'baremetal:portgroup:get',
          render: () => <PortGroupTab detail={d} />,
        },
      ])}
      actions={() => nodeRowActions(navigate)}
    />
  );
}
