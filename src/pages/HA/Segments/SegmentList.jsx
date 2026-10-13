import React from 'react';
import { useNavigate } from 'react-router-dom';
import { masakariApi } from '@/api/masakari';
import { novaApi } from '@/api/nova';
import ResourcePage, { nameColumn, textColumn, deleteAction, CopyText } from '@/components/ResourcePage';
import { t } from '@/core/i18n';

/** Legacy pages/ha/containers/Segments */

export const recoveryMethodOptions = () => [
  { label: t('auto'), value: 'auto' },
  { label: t('auto_priority'), value: 'auto_priority' },
  { label: t('reserved_host'), value: 'reserved_host' },
  { label: t('rh_priority'), value: 'rh_priority' },
];

export const recoveryMethodText = (v) => recoveryMethodOptions().find((o) => o.value === v)?.label || v || '-';

const sortByUpdated = (list) =>
  [...list].sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

/** masakari ids are integers; the console works with uuids (legacy rowKey 'uuid') */
export const mapSegment = (s) => ({ ...s, db_id: s.id, id: s.uuid });

export const fetchSegments = async () => {
  const res = await masakariApi.listSegments();
  return sortByUpdated((res?.segments || []).map(mapSegment));
};

/** Compute hosts (nova-compute services) not yet registered in any segment (legacy AddHost.getHostList) */
export const fetchAvailableComputeHosts = async () => {
  let services = [];
  try {
    services = (await novaApi.listComputeServicesExt({ binary: 'nova-compute' }))?.services || [];
  } catch {
    services = (await novaApi.listServicesV({ binary: 'nova-compute' }))?.services || [];
  }
  services = services.filter((s) => !s.binary || s.binary === 'nova-compute');
  let used = [];
  try {
    const segments = (await masakariApi.listSegments())?.segments || [];
    const lists = await Promise.all(
      segments.map((s) => masakariApi.listHosts(s.uuid).then((r) => r?.hosts || []).catch(() => []))
    );
    used = lists.flat().map((h) => h.name);
  } catch {
    used = [];
  }
  return services.filter((s) => !used.includes(s.host));
};

export const updateSegmentAction = () => ({
  id: 'UpdateSegment',
  type: 'modal',
  title: t('Update Segment'),
  buttonText: t('Update'),
  adminOnly: true,
  getDefaultValues: (item) => ({
    name: item.name,
    recovery_method: item.recovery_method,
    description: item.description,
  }),
  getFormItems: () => [
    { name: 'name', label: t('Segment Name'), type: 'input', required: true },
    {
      name: 'recovery_method',
      label: t('Recovery Method'),
      type: 'select',
      required: true,
      options: recoveryMethodOptions(),
    },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 4 },
  ],
  onSubmit: (values, item) => masakariApi.updateSegment(item.uuid, { segment: values }),
});

export const addHostAction = () => ({
  id: 'AddHost',
  type: 'modal',
  title: t('Add Host'),
  adminOnly: true,
  getDefaultValues: (item) => ({ segment_name: item.name, reserved: false, on_maintenance: false }),
  getFormItems: async () => {
    const hosts = await fetchAvailableComputeHosts();
    return [
      { name: 'segment_name', label: t('Segment Name'), type: 'input', disabled: true },
      {
        name: 'name',
        label: t('Host Name'),
        type: 'select',
        required: true,
        options: hosts.map((h) => ({ value: h.host, label: h.host })),
      },
      { name: 'reserved', label: t('Reserved'), type: 'switch' },
      { name: 'type', label: t('Type'), type: 'input', required: true },
      { name: 'control_attributes', label: t('Control Attributes'), type: 'input', required: true },
      { name: 'on_maintenance', label: t('On Maintenance'), type: 'switch' },
    ];
  },
  onSubmit: ({ segment_name, ...host }, item) =>
    masakariApi.createHost(item.uuid, { host: { ...host, reserved: !!host.reserved, on_maintenance: !!host.on_maintenance } }),
});

export const deleteSegmentAction = () => ({
  ...deleteAction({
    name: t('Segment'),
    title: t('Delete'),
    onDelete: (it) => masakariApi.deleteSegment(it.uuid),
  }),
  actionName: t('delete segments'),
  adminOnly: true,
});

export const createSegmentAction = (navigate) => ({
  id: 'instance-ha-create',
  type: 'custom',
  title: t('Create Segment'),
  onExecute: () => navigate('/ha/segments-admin/create-step-admin'),
});

export const segmentColumns = () => [
  nameColumn({ title: t('Name'), idIndex: '__none', linkTo: (r) => `/ha/segments-admin/detail/${r.uuid}` }),
  {
    title: t('UUID'),
    dataIndex: 'uuid',
    key: 'uuid',
    render: (v) => (v ? <CopyText value={v} /> : '-'),
  },
  { title: t('Recovery Method'), dataIndex: 'recovery_method', key: 'recovery_method', render: recoveryMethodText },
  textColumn(t('Service Type'), 'service_type'),
  textColumn(t('Description'), 'description'),
];

export const segmentRowActions = () => ({
  firstAction: updateSegmentAction(),
  moreActions: [{ action: addHostAction() }, { action: deleteSegmentAction() }],
});

export default function SegmentList() {
  const navigate = useNavigate();
  return (
    <ResourcePage
      title={t('Segments')}
      breadcrumb={[t('Instance-HA'), t('Segments')]}
      description={t('Failover segments group compute hosts that protect each other (Masakari Instance-HA).')}
      fetch={fetchSegments}
      columns={segmentColumns}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'recovery_method', label: t('Recovery Method'), options: recoveryMethodOptions().map((o) => ({ key: o.value, label: o.label })) },
        { name: 'service_type', label: t('Service Type') },
        { name: 'project_name', label: t('Project Name') },
      ]}
      primaryActions={[createSegmentAction(navigate)]}
      batchActions={[deleteSegmentAction()]}
      rowActions={segmentRowActions}
    />
  );
}
