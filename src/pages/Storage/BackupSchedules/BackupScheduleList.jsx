import React, { useState } from 'react';
import { Switch, Tag, Tooltip, Typography } from 'antd';
import { cinderApi } from '@/api/cinder';
import { schedulerApi, isSchedulerUnavailable } from '@/api/scheduler';
import ResourcePage, { nameColumn, projectColumn, formatTime } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import {
  SCHEDULE_LIST_POLICY,
  SchedulerUnavailable,
  VolumeCell,
  createScheduleAction,
  deleteScheduleAction,
  describeCron,
  disableScheduleAction,
  enableScheduleAction,
  modeText,
  runScheduleAction,
  runStatusTag,
  scheduleRowActions,
} from './scheduleShared';

const { Text } = Typography;

/** schedules of the project (or of every project on the admin page) + volume names */
export const fetchSchedules = async ({ isAdmin } = {}) => {
  const { schedules } = await schedulerApi.listSchedules({ allProjects: isAdmin });
  let volumeMap = {};
  try {
    const res = await cinderApi.listVolumes(isAdmin ? { all_tenants: 1 } : {});
    volumeMap = Object.fromEntries((Array.isArray(res?.volumes) ? res.volumes : []).map((v) => [v.id, v.name]));
  } catch {
    volumeMap = {};
  }
  return schedules
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({ ...s, id: String(s.id), volume_name: volumeMap[s.volume_id] || '' }));
};

export const scheduleColumns = ({ isAdmin, projectMap, onToggle }) =>
  [
    nameColumn({ linkTo: (r) => `/storage/${isAdmin ? 'backup-schedule-admin' : 'backup-schedule'}/detail/${r.id}` }),
    isAdmin && projectColumn(projectMap),
    {
      title: t('Volume ID/Name'),
      dataIndex: 'volume_name',
      key: 'volume_name',
      render: (value, r) => <VolumeCell id={r.volume_id} name={value} isAdmin={isAdmin} />,
    },
    { title: t('Backup Mode'), dataIndex: 'mode', key: 'mode', render: (v) => modeText(v) },
    {
      title: t('Schedule'),
      dataIndex: 'cron',
      key: 'cron',
      render: (v) => (
        <Tooltip title={v}>
          <div>{describeCron(v)}</div>
          <Text type="secondary" code style={{ fontSize: 11 }}>
            {v}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: t('Retention'),
      dataIndex: 'retention',
      key: 'retention',
      render: (v) => (v?.keep_last ? t('Keep last {n}', { n: v.keep_last }) : '-'),
    },
    {
      title: t('Enabled'),
      dataIndex: 'enabled',
      key: 'enabled',
      render: (v, r) => (isAdmin ? <Tag color={v ? 'green' : 'default'}>{v ? t('Enabled') : t('Disabled')}</Tag> : <Switch size="small" checked={Boolean(v)} onChange={(c) => onToggle(r, c)} />),
    },
    {
      title: t('Last Run'),
      dataIndex: 'last_run',
      key: 'last_run',
      render: (v) =>
        v ? (
          <div>
            {runStatusTag(v.status)}
            <div style={{ fontSize: 12, color: '#64748b' }}>{formatTime(v.started_at)}</div>
          </div>
        ) : (
          runStatusTag(null)
        ),
    },
    {
      title: t('Next Run'),
      dataIndex: 'next_run',
      key: 'next_run',
      render: (v, r) => (r.enabled && v ? formatTime(v) : '-'),
    },
  ].filter(Boolean);

export default function BackupScheduleList() {
  const projectMap = useProjectMap();
  const [unavailable, setUnavailable] = useState(false);
  const [toggleError, setToggleError] = useState('');

  const fetch = async (ctx) => {
    try {
      const rows = await fetchSchedules({ isAdmin: ctx.isAdmin });
      setUnavailable(false);
      return rows;
    } catch (e) {
      if (isSchedulerUnavailable(e)) {
        setUnavailable(true);
        return [];
      }
      throw e;
    }
  };

  return (
    <ResourcePage
      title={t('Backup Schedules')}
      breadcrumb={[t('Storage'), t('Backup Schedules')]}
      description={t('Scheduled full and incremental backups of block storage volumes with automatic retention.')}
      policy={SCHEDULE_LIST_POLICY}
      fetch={fetch}
      notice={toggleError || null}
      header={unavailable ? <SchedulerUnavailable withTitle={false} /> : null}
      columns={({ isAdmin, refetch }) =>
        scheduleColumns({
          isAdmin,
          projectMap,
          onToggle: async (r, enabled) => {
            try {
              setToggleError('');
              await schedulerApi.updateSchedule(r.id, { enabled });
              refetch?.();
            } catch (e) {
              setToggleError(e?.message || t('Operation failed'));
            }
          },
        })
      }
      filterParams={[{ name: 'name', label: t('Name') }]}
      primaryActions={({ isAdmin }) => (isAdmin || unavailable ? [] : [createScheduleAction()])}
      batchActions={({ isAdmin }) =>
        isAdmin
          ? [deleteScheduleAction({ isAdmin })]
          : [runScheduleAction(), enableScheduleAction(), disableScheduleAction(), deleteScheduleAction()]
      }
      rowActions={({ isAdmin }) => scheduleRowActions({ isAdmin })}
      interval={15000}
    />
  );
}
