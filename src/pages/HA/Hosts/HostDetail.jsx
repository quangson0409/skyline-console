import React from 'react';
import { Link } from 'react-router-dom';
import { masakariApi } from '@/api/masakari';
import ResourceDetail from '@/components/ResourceDetail';
import { formatTime, yesNo } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { mapHost, updateHostAction, deleteHostAction } from './HostList';

/** Legacy pages/ha/containers/Hosts/Detail: /ha/hosts-admin/detail/:segmentId?uuid=<host uuid> */
const hostUuid = () => new URLSearchParams(window.location.search).get('uuid') || '';

export default function HostDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Instance-HA'), { title: t('Hosts'), path: '/ha/hosts-admin' }]}
      backPath="/ha/hosts-admin"
      title={(d) => d.uuid || hostUuid()}
      fetch={async (segmentId) => mapHost((await masakariApi.getHost(segmentId, hostUuid()))?.host || {})}
      info={(d) => [
        { label: t('Name'), value: d.name },
        { label: t('UUID'), value: d.uuid, copyable: true },
        {
          label: t('Failover Segment'),
          value: d.failover_segment_id,
          render: () => (
            <Link to={`/ha/segments-admin/detail/${d.failover_segment_id}`}>
              {d.failover_segment?.name || d.failover_segment_id}
            </Link>
          ),
        },
        { label: t('Reserved'), value: d.reserved, render: () => yesNo(d.reserved) },
        { label: t('On Maintenance'), value: d.on_maintenance, render: () => yesNo(d.on_maintenance) },
        { label: t('Type'), value: d.type },
        { label: t('Control Attribute'), value: d.control_attributes },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
      ]}
      actions={() => ({ firstAction: updateHostAction(), moreActions: [{ action: deleteHostAction() }] })}
    />
  );
}
