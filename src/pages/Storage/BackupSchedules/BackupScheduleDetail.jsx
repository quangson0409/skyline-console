import React, { useEffect, useState } from 'react';
import { Select, Table, Tag, Tooltip, Typography } from 'antd';
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
  DEFAULT_TIMEOUT_MINUTES,
  describeRetention,
  describeCounts,
  modeText,
  runStatusTag,
  scheduleRowActions,
} from './scheduleShared';

const { Text } = Typography;

const fetchScheduleDetail = async (id, { isAdmin } = {}) => {
  const s = await schedulerApi.getSchedule(id, { allProjects: isAdmin });
  try {
    const v = s.volume_id ? (await cinderApi.getVolume(s.volume_id))?.volume : null;
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
    title: t('Volumes'),
    dataIndex: 'items',
    key: 'items',
    render: (items) => {
      const list = Array.isArray(items) ? items : [];
      if (!list.length) return '-';
      const n = (st) => list.filter((i) => i.status === st).length;
      return (
        <span>
          {n('success')} {t('OK')}
          {n('error') ? <Text type="danger"> · {n('error')} {t('failed')}</Text> : null}
          {n('skipped') ? <Text type="secondary"> · {n('skipped')} {t('skipped')}</Text> : null}
        </span>
      );
    },
  },
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

const itemStatusTag = (status) => {
  const map = {
    success: { color: 'success', text: t('Success') },
    error: { color: 'error', text: t('Failed') },
    skipped: { color: 'default', text: t('Skipped') },
    running: { color: 'processing', text: t('Running') },
    pending: { color: 'default', text: t('Pending') },
  };
  const m = map[status] || { color: 'default', text: String(status) };
  return <Tag color={m.color}>{m.text}</Tag>;
};

/** results of one run per instance / volume: what was backed up, what failed and why */
function RunDetailsTab({ id, isAdmin }) {
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const list = (await schedulerApi.listRuns(id, { allProjects: isAdmin })).filter((r) => r && typeof r === 'object');
        if (!alive) return;
        setRuns(list);
        setRunId((cur) => cur || list[0]?.id || null);
      } catch {
        if (alive) setRuns([]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, isAdmin]);

  const run = runs.find((r) => r.id === runId) || runs[0];
  const items = Array.isArray(run?.items) ? run.items : [];
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Select
          style={{ minWidth: 320 }}
          value={run?.id}
          onChange={setRunId}
          loading={loading}
          options={runs.map((r) => ({ value: r.id, label: `${formatTime(r.started_at)} · ${r.status}` }))}
          placeholder={t('Select a run')}
        />
      </div>
      <Table
        size="small"
        rowKey={(r, i) => `${r.vm_id}-${r.volume_id}-${i}`}
        loading={loading}
        dataSource={items}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{ emptyText: t('No per-volume results for this run') }}
        columns={[
          { title: t('Instance'), dataIndex: 'vm_name', key: 'vm', render: (v, r) => v || (r.vm_id ? String(r.vm_id).slice(0, 8) : '-') },
          {
            title: t('Volume'),
            dataIndex: 'volume_name',
            key: 'volume',
            render: (v, r) =>
              r.volume_id ? (
                <Link to={`/storage/${isAdmin ? 'volume-admin' : 'volume'}/detail/${r.volume_id}`}>{v || String(r.volume_id).slice(0, 8)}</Link>
              ) : (
                '-'
              ),
          },
          { title: t('Status'), dataIndex: 'status', key: 'status', render: (v) => itemStatusTag(v) },
          { title: t('Backup'), dataIndex: 'backup_id', key: 'backup', render: (v, r) => (v ? <BackupLink id={v} isAdmin={isAdmin} /> : '-') },
          { title: t('Deleted by retention'), dataIndex: 'deleted_backups', key: 'deleted', render: (v) => (Array.isArray(v) ? v.length : 0) },
          {
            title: t('Error'),
            dataIndex: 'error',
            key: 'error',
            render: (v) => (v ? <Text type="danger">{v}</Text> : '-'),
          },
        ]}
      />
    </div>
  );
}

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
          d.vms?.length
            ? {
                label: t('Instances'),
                value: d.vms.map((x) => x.name || x.id).join(', '),
                render: () => (
                  <div>
                    {d.vms.map((x) => (
                      <div key={x.id}>
                        <Link to={`/compute/instance${isAdmin ? '-admin' : ''}/detail/${x.id}`}>{x.name || String(x.id).slice(0, 8)}</Link>
                      </div>
                    ))}
                  </div>
                ),
              }
            : {
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
          { label: t('Retention'), value: describeRetention(d.retention) },
          { label: t('Timeout (minutes)'), value: d.timeout_minutes ? String(d.timeout_minutes) : `${DEFAULT_TIMEOUT_MINUTES} (${t('default')})` },
          { label: t('Enabled'), value: d.enabled ? t('Enabled') : t('Disabled'), render: () => <Tag color={d.enabled ? 'green' : 'default'}>{d.enabled ? t('Enabled') : t('Disabled')}</Tag> },
          !d.vms?.length && { label: t('Back up attached volumes'), value: d.force_in_use ? t('Yes') : t('No') },
          {
            label: t('Application Credential'),
            value: d.application_credential_id,
            render: () => (d.application_credential_id ? <CopyText value={d.application_credential_id}>{d.application_credential_id}</CopyText> : '-'),
          },
          {
            label: t('Last Run'),
            value: d.last_run?.status,
            render: () => (
              <div>
                {runStatusTag(d.last_run?.status)}
                {describeCounts(d.last_run?.counts) ? <span style={{ marginLeft: 8, color: '#64748b' }}>{describeCounts(d.last_run?.counts)}</span> : null}
                {d.last_run?.error ? <div><Text type="danger">{d.last_run.error}</Text></div> : null}
              </div>
            ),
          },
          { label: t('Next Run'), value: d.enabled ? formatTime(d.next_run) : '-' },
          isAdmin && { label: t('Project ID'), value: d.project_id },
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) => [
        { key: 'runs', label: t('Runs History'), render: () => <RunsTab id={d.id} isAdmin={isAdmin} /> },
        { key: 'run-details', label: t('Run Details'), render: () => <RunDetailsTab id={d.id} isAdmin={isAdmin} /> },
      ]}
      actions={({ isAdmin }) => scheduleRowActions({ isAdmin })}
    />
  );
}
