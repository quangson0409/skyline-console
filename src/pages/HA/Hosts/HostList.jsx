import React from 'react';
import { masakariApi } from '@/api/masakari';
import ResourcePage, { textColumn, boolColumn, deleteAction, nameColumn, IdNameCell } from '@/components/ResourcePage';
import { t } from '@/core/i18n';

/** Legacy pages/ha/containers/Hosts (also the "Hosts" tab of the segment detail) */

export const hostDetailPath = (r) =>
  `/ha/hosts-admin/detail/${r.failover_segment_id}?uuid=${encodeURIComponent(r.uuid)}`;

export const mapHost = (h) => ({ ...h, db_id: h.id, id: h.uuid });

const sortByUpdated = (list) =>
  [...list].sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

/** Legacy HostStore.listFetchByClient: hosts of one segment, or of every segment */
export const fetchHosts = async ({ segmentId } = {}) => {
  if (segmentId) {
    const res = await masakariApi.listHosts(segmentId);
    return sortByUpdated((res?.hosts || []).map(mapHost));
  }
  const segments = (await masakariApi.listSegments())?.segments || [];
  const lists = await Promise.all(segments.map((s) => masakariApi.listHosts(s.uuid).then((r) => r?.hosts || [])));
  return sortByUpdated(lists.flat().map(mapHost));
};

export const updateHostAction = () => ({
  id: 'UpdateHost',
  type: 'modal',
  title: t('Update'),
  adminOnly: true,
  getDefaultValues: (item) => ({
    name: item.name,
    reserved: !!item.reserved,
    type: item.type,
    control_attributes: item.control_attributes,
    on_maintenance: !!item.on_maintenance,
  }),
  formItems: [
    { name: 'name', label: t('Host Name'), type: 'input', disabled: true, required: true },
    { name: 'reserved', label: t('Reserved'), type: 'switch' },
    { name: 'type', label: t('Type'), type: 'input', required: true },
    { name: 'control_attributes', label: t('Control Attribute'), type: 'input', required: true },
    { name: 'on_maintenance', label: t('On Maintenance'), type: 'switch' },
  ],
  onSubmit: (values, item) =>
    masakariApi.updateHost(item.failover_segment_id, item.uuid, {
      host: { ...values, reserved: !!values.reserved, on_maintenance: !!values.on_maintenance },
    }),
});

export const deleteHostAction = () => ({
  ...deleteAction({
    name: t('Host'),
    title: t('Delete'),
    onDelete: (it) => masakariApi.deleteHost(it.failover_segment_id, it.uuid),
  }),
  actionName: t('delete host'),
  adminOnly: true,
});

export const hostColumns = () => [
  nameColumn({ idIndex: 'uuid', linkTo: (r) => hostDetailPath(r) }),
  boolColumn(t('Reserved'), 'reserved'),
  textColumn(t('Type'), 'type'),
  textColumn(t('Control Attribute'), 'control_attributes'),
  boolColumn(t('On Maintenance'), 'on_maintenance'),
  {
    title: t('Failover Segment'),
    dataIndex: 'failover_segment',
    key: 'failover_segment',
    render: (v, r) =>
      r.failover_segment_id ? (
        <IdNameCell
          id={r.failover_segment_id}
          name={v?.name}
          href={`/ha/segments-admin/detail/${r.failover_segment_id}`}
          bold={false}
        />
      ) : (
        '-'
      ),
  },
];

export const hostFilterParams = () => [
  { name: 'name', label: t('Name') },
  { name: 'failover_segment_id', label: t('Segment ID') },
  { name: 'type', label: t('Type') },
  {
    name: 'on_maintenance',
    label: t('On Maintenance'),
    options: [
      { key: 'true', label: t('Yes') },
      { key: 'false', label: t('No') },
    ],
  },
  {
    name: 'reserved',
    label: t('Reserved'),
    options: [
      { key: 'true', label: t('Yes') },
      { key: 'false', label: t('No') },
    ],
  },
  { name: 'project_name', label: t('Project Name') },
];

export const hostRowActions = () => ({
  firstAction: updateHostAction(),
  moreActions: [{ action: deleteHostAction() }],
});

/** Hosts of one segment, used by the segment detail */
export function SegmentHostTable({ segmentId }) {
  return (
    <ResourcePage
      embedded
      fetch={() => fetchHosts({ segmentId })}
      deps={[segmentId]}
      rowKey="uuid"
      columns={hostColumns}
      filterParams={hostFilterParams()}
      batchActions={[deleteHostAction()]}
      rowActions={hostRowActions}
    />
  );
}

export default function HostList() {
  return (
    <ResourcePage
      title={t('Hosts')}
      breadcrumb={[t('Instance-HA'), t('Hosts')]}
      description={t('Compute hosts registered in Instance-HA failover segments.')}
      fetch={() => fetchHosts()}
      rowKey="uuid"
      columns={hostColumns}
      filterParams={hostFilterParams()}
      batchActions={[deleteHostAction()]}
      rowActions={hostRowActions}
    />
  );
}
