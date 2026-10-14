import React from 'react';
import { masakariApi } from '@/api/masakari';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime, yesNo } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { SegmentHostTable } from '../Hosts/HostList';
import { mapSegment, recoveryMethodText, segmentRowActions } from './SegmentList';

/** Legacy pages/ha/containers/Segments/Detail */
export default function SegmentDetail() {
  return (
    <ResourceDetail
      policy="capsule:get_one_all_projects"
      breadcrumb={[t('Instance-HA'), { title: t('Segments'), path: '/ha/segments-admin' }]}
      backPath="/ha/segments-admin"
      fetch={async (id) => mapSegment({ uuid: id, ...((await masakariApi.getSegment(id))?.segment || {}) })}
      info={(d) => [
        { label: t('Name'), value: d.name },
        { label: t('UUID'), value: d.uuid, copyable: true },
        { label: t('Description'), value: d.description },
      ]}
      tabs={(d) => [
        {
          key: 'general_info',
          label: t('Detail'),
          render: () => (
            <DetailCard
              title={t('Capsule Type')}
              items={[
                { label: t('Recovery Method'), value: d.recovery_method, render: () => recoveryMethodText(d.recovery_method) },
                { label: t('Service Type'), value: d.service_type },
                { label: t('Enabled'), value: d.enabled, render: () => yesNo(d.enabled !== false) },
                { label: t('Created At'), value: formatTime(d.created_at) },
                { label: t('Updated At'), value: formatTime(d.updated_at) },
              ]}
            />
          ),
        },
        { key: 'host', label: t('Hosts'), render: () => <SegmentHostTable segmentId={d.uuid} /> },
      ]}
      actions={segmentRowActions}
    />
  );
}
