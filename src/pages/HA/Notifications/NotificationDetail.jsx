import React from 'react';
import { masakariApi } from '@/api/masakari';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { JsonBlock } from '@/components/CodeBlock';
import { mapNotification, notificationStatus } from './NotificationList';

/** Legacy pages/ha/containers/Notifications/Detail */
export default function NotificationDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Instance-HA'), { title: t('Notifications'), path: '/ha/notifications-admin' }]}
      backPath="/ha/notifications-admin"
      nameField="notification_uuid"
      fetch={async (id) => mapNotification({ notification_uuid: id, ...((await masakariApi.getNotification(id))?.notification || {}) })}
      info={(d) => [
        { label: t('ID'), value: d.db_id },
        { label: t('UUID'), value: d.notification_uuid, copyable: true },
        { label: t('Type'), value: d.type },
        { label: t('Status'), value: d.status, render: () => notificationStatus()[String(d.status).toLowerCase()] || d.status || '-' },
        { label: t('Host'), value: d.source_host_uuid, copyable: true },
        { label: t('Generated Time'), value: formatTime(d.generated_time) },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
      ]}
      tabs={(d) => [
        {
          key: 'baseDetail',
          label: t('Detail'),
          render: () => {
            const payload = d.payload || {};
            return (
              <>
                <DetailCard
                  title={t('Payload')}
                  items={[
                    { label: t('Event'), value: payload.event },
                    { label: t('Instance UUID'), value: payload.instance_uuid, copyable: true },
                    { label: t('VIR Domain Event'), value: payload.vir_domain_event },
                    { label: t('Process Name'), value: payload.process_name },
                    { label: t('Host Status'), value: payload.host_status },
                    { label: t('Cluster Status'), value: payload.cluster_status },
                  ]}
                />
                <DetailCard title={t('Content')} items={[{ label: '', render: () => <JsonBlock value={payload} /> }]} column={1} />
              </>
            );
          },
        },
      ]}
    />
  );
}
