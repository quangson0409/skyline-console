import React from 'react';
import { zunApi } from '@/api/zun';
import ResourcePage, { statusColumn, boolColumn, formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { serviceState } from '../common';

const sinceTime = (value) => {
  if (!value) return '-';
  const str = String(value);
  const date = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(str) ? str : `${str}Z`);
  const diff = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (Number.isNaN(diff)) return formatTime(value);
  if (diff < 60) return t('{n} seconds ago', { n: diff });
  if (diff < 3600) return t('{n} minutes ago', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('{n} hours ago', { n: Math.floor(diff / 3600) });
  return t('{n} days ago', { n: Math.floor(diff / 86400) });
};

export default function ServiceList() {
  return (
    <ResourcePage
      title={t('Zun Services')}
      breadcrumb={[t('Container Service'), t('Zun Services')]}
      description={t('State of the Zun compute services.')}
      fetch={async () => {
        const res = await zunApi.listServices();
        return (res?.services || []).map((it, idx) => ({ ...it, id: it.uuid || it.id || `${it.host}-${it.binary}-${idx}` }));
      }}
      columns={[
        { title: t('Name'), dataIndex: 'binary', key: 'binary', render: (v) => v || '-' },
        { title: t('Hosts'), dataIndex: 'host', key: 'host', render: (v) => v || '-' },
        { title: t('Availability Zone'), dataIndex: 'availability_zone', key: 'availability_zone', render: (v) => v || '-' },
        { title: t('Report Count'), dataIndex: 'report_count', key: 'report_count', render: (v) => v ?? '-' },
        boolColumn(t('Forced Down'), 'forced_down'),
        boolColumn(t('Disabled'), 'disabled'),
        { title: t('Disabled Reason'), dataIndex: 'disabled_reason', key: 'disabled_reason', render: (v) => v || '-' },
        statusColumn({ title: t('Service State'), dataIndex: 'state', textMap: serviceState() }),
        {
          title: t('Last Updated'),
          dataIndex: 'updated_at',
          key: 'updated_at',
          render: (v) => <span title={formatTime(v)}>{sinceTime(v)}</span>,
        },
      ]}
      filterParams={[
        { name: 'binary', label: t('Name') },
        { name: 'state', label: t('Service State'), options: Object.entries(serviceState()).map(([key, label]) => ({ key, label })) },
      ]}
    />
  );
}
