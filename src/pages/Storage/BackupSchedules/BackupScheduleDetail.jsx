import React, { useState } from 'react';
import { Tag, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { schedulerApi, isSchedulerUnavailable } from '@/api/scheduler';
import { cinderApi } from '@/api/cinder';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { formatTime, CopyText } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  SchedulerUnavailable,
  BackupLink,
  describeCron,
  modeText,
  runStatusTag,
  scheduleRowActions,
} from './scheduleShared';

const { Text } = Typography;

const fetchScheduleDetail = async (id, { isAdmin } = {}) => {
  const s = await schedulerApi.getSchedule(id, { allProjects: isAdmin });
  try {
    const v = (await cinderApi.getVolume(s.volume_id))?.volume;
    s.volume_name = v?.name || '';
  } catch {
    s.volume_name = '';
  }
  return s;
};

export const runColumns = ({ isAdmin }) => [
  { title: t('Started At'), dataIndex: 'started_at', key: 'started_at', render: (v) => formatTime(v) },
  { title: t('Finished At'), dataIndex: 'finished_at', key: 'finished_at', render: (v) => formatTime(v) },
  { title: t('Trigger'), dataIndex: 'trigger', key: 'trigger', render: (v) => (v === 'manual' ? t('Manual') : t('Scheduled')) },
  { title: t('Status'), dataIndex: 'status', key: 'status', render: (v) => runStatusTag(v) },
  {
    title: t('Backup'),
    dataIndex: 'backup_id',
    key: 'backup_id',
    render: (v, r) => (
      <div>
        <BackupLink id={v} isAdmin={isAdmin} />
        {r.backup_name ? <div style={{ fontSize: 12, color: '#64748b' }}>{r.backup_name}</div> : null}
      </div>
    ),
  },
  {
    title: t('Deleted by retention'),
    dataIndex: 'deleted_backups',
    key: 'deleted_backups',
    render: (v) => (Array.isArray(v) ? v.length : 0),
  },
  {
    title: t('Error'),
    dataIndex: 'error',
    key: 'error',
    render: (v) =>
      v ? (
        <Tooltip title={v}>
          <Text type="danger" ellipsis style={{ maxWidth: 320, display: 'inline-block' }}>
            {v}
          </Text>
        </Tooltip>
      ) : (
        '-'
      ),
  },
];

function RunsTab({ id, isAdmin }) {
  return (
    <ResourcePage
      embedded
      title={t('Runs')}
      fetch={async () => (await schedulerApi.listRuns(id, { allProjects: isAdmin })).filter((r) => r && typeof r === 'object')}
      deps={[id, isAdmin]}
      columns={() => runColumns({ isAdmin })}
      interval={10000}
      pageSize={10}
    />
  );
}

export default function BackupScheduleDetail() {
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable) return <SchedulerUnavailable onRetry={() => setUnavailable(false)} />;
  return (
    <ResourceDetail
      breadcrumb={[t('Storage'), { title: t('Backup Schedules'), path: '/storage/backup-schedule' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/storage/backup-schedule-admin' : '/storage/backup-schedule')}
      title={t('Backup Schedule')}
      policy="backup:get"
      fetch={async (id, ctx) => {
        try {
          return await fetchScheduleDetail(id, ctx);
        } catch (e) {
          if (isSchedulerUnavailable(e)) setUnavailable(true);
          throw e;
        }
      }}
      isTransition={(d) => d?.last_run?.status === 'running'}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Name'), value: d.name },
          {
            label: t('Volume'),
            value: d.volume_id,
            render: () => (
              <Link to={`/storage/${isAdmin ? 'volume-admin' : 'volume'}/detail/${d.volume_id}`}>
                {d.volume_name ? `${d.volume_name} (${String(d.volume_id).slice(0, 8)})` : d.volume_id}
              </Link>
            ),
          },
          { label: t('Backup Mode'), value: modeText(d.mode) },
          {
            label: t('Schedule'),
            value: d.cron,
            render: () => (
              <span>
                {describeCron(d.cron)} <Text code>{d.cron}</Text>
              </span>
            ),
          },
          { label: t('Retention'), value: d.retention?.keep_last ? t('Keep last {n}', { n: d.retention.keep_last }) : '-' },
          { label: t('Enabled'), value: d.enabled ? t('Enabled') : t('Disabled'), render: () => <Tag color={d.enabled ? 'green' : 'default'}>{d.enabled ? t('Enabled') : t('Disabled')}</Tag> },
          { label: t('Back up attached volumes'), value: d.force_in_use ? t('Yes') : t('No') },
          {
            label: t('Application Credential'),
            value: d.application_credential_id,
            render: () => (d.application_credential_id ? <CopyText value={d.application_credential_id}>{d.application_credential_id}</CopyText> : '-'),
          },
          { label: t('Last Run'), value: d.last_run?.status, render: () => runStatusTag(d.last_run?.status) },
          { label: t('Next Run'), value: d.enabled ? formatTime(d.next_run) : '-' },
          isAdmin && { label: t('Project ID'), value: d.project_id },
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) => [
        { key: 'runs', label: t('Runs History'), render: () => <RunsTab id={d.id} isAdmin={isAdmin} /> },
      ]}
      actions={({ isAdmin }) => scheduleRowActions({ isAdmin })}
    />
  );
}
