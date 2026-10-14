import React from 'react';
import { Link } from 'react-router-dom';
import { masakariApi } from '@/api/masakari';
import ResourcePage, { textColumn, statusColumn, timeColumn, CopyText } from '@/components/ResourcePage';
import { t } from '@/core/i18n';

/** Legacy pages/ha/containers/Notifications */

export const notificationStatus = () => ({
  new: t('New'),
  running: t('Running'),
  error: t('Error'),
  failed: t('Failed'),
  ignored: t('Ignored'),
  finished: t('Finished'),
});

export const mapNotification = (n) => ({ ...n, db_id: n.id, id: n.notification_uuid });

export const fetchNotifications = async () => {
  const res = await masakariApi.listNotifications();
  return (res?.notifications || [])
    .map(mapNotification)
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
};

export const renderPayload = (value) => {
  if (!value || typeof value !== 'object') return value ? String(value) : '-';
  const keys = Object.keys(value);
  if (!keys.length) return '-';
  return keys.map((k) => (
    <div key={k} style={{ fontSize: 12 }}>
      {k}: {typeof value[k] === 'object' ? JSON.stringify(value[k]) : String(value[k])}
    </div>
  ));
};

const isTransition = (item) => ['new', 'running'].includes(String(item?.status || '').toLowerCase());

export default function NotificationList() {
  return (
    <ResourcePage
      policy="os_compute_api:servers:index:get_all_tenants"
      title={t('Notifications')}
      breadcrumb={[t('Instance-HA'), t('Notifications')]}
      description={t('Host, process and instance failure notifications received by Masakari.')}
      fetch={fetchNotifications}
      rowKey="notification_uuid"
      isTransition={isTransition}
      columns={() => [
        {
          title: t('UUID'),
          dataIndex: 'notification_uuid',
          key: 'notification_uuid',
          render: (v) => (
            <CopyText value={v}>
              <Link to={`/ha/notifications-admin/detail/${v}`} style={{ fontWeight: 600 }}>
                {v}
              </Link>
            </CopyText>
          ),
        },
        textColumn(t('Host'), 'source_host_uuid'),
        textColumn(t('Type'), 'type'),
        statusColumn({ textMap: notificationStatus() }),
        { title: t('Payload'), dataIndex: 'payload', key: 'payload', render: renderPayload },
        timeColumn({ title: t('Generated Time'), dataIndex: 'generated_time' }),
      ]}
      filterParams={[
        { name: 'source_host_uuid', label: t('Host') },
        { name: 'notification_uuid', label: t('UUID') },
        { name: 'type', label: t('Type') },
        {
          name: 'status',
          label: t('Status'),
          options: Object.entries(notificationStatus()).map(([key, label]) => ({ key, label })),
        },
      ]}
    />
  );
}
