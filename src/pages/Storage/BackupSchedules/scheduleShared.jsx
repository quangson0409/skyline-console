import React, { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Alert, Button, Checkbox, DatePicker, Input, InputNumber, Result, Select, Space, Tag, TimePicker, Typography, message } from 'antd';
import { Link } from 'react-router-dom';
import { cinderApi } from '@/api/cinder';
import { keystoneApi } from '@/api/keystone';
import { schedulerApi, isSchedulerUnavailable } from '@/api/scheduler';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import { deleteAction, formatTime, IdNameCell } from '@/components/ResourcePage';
import { nameRule } from '@/components/form/rules';
import VmPicker, { MAX_VMS } from './VmPicker';

const { Text } = Typography;

/* ------------------------------------------------------------------ cron helpers */

export const CRON_PRESETS = () => [
  { value: 'hourly', label: t('Hourly'), cron: '0 * * * *' },
  { value: 'daily', label: t('Daily'), cron: '0 2 * * *' },
  { value: 'weekly', label: t('Weekly'), cron: '0 2 * * 1' },
  { value: 'monthly', label: t('Monthly'), cron: '0 2 1 * *' },
  { value: 'custom', label: t('Custom') },
];

export const presetOfCron = (cron) => parseSchedule(cron).mode;

const pad2 = (n) => String(n).padStart(2, '0');

/** hours between runs offered for "Hourly" (every N hours at minute M) */
export const HOUR_STEPS = [1, 2, 3, 4, 6, 8, 12];

/**
 * cron <-> structured schedule (the time of day is chosen by the user, nothing is fixed):
 *  hourly: minute + every N hours, daily: minute hour, weekly: minute hour + weekdays, monthly: minute hour + day of month
 * anything else stays "custom" (raw expression).
 */
export const parseSchedule = (cron) => {
  const p = String(cron || '').trim().split(/\s+/);
  if (p.length !== 5) return { mode: 'custom' };
  const [mi, h, dom, mon, dow] = p;
  const num = (v) => /^\d+$/.test(v);
  if (mon !== '*' || !num(mi) || Number(mi) > 59) return { mode: 'custom' };
  const minute = Number(mi);
  const step = /^\*\/(\d+)$/.exec(h);
  if (dom === '*' && dow === '*') {
    if (h === '*') return { mode: 'hourly', minute, every: 1 };
    if (step && HOUR_STEPS.includes(Number(step[1]))) return { mode: 'hourly', minute, every: Number(step[1]) };
  }
  if (num(h) && Number(h) < 24) {
    const hour = Number(h);
    if (dom === '*' && dow === '*') return { mode: 'daily', hour, minute };
    if (dom === '*' && /^[0-7](,[0-7])*$/.test(dow)) {
      return { mode: 'weekly', hour, minute, dows: [...new Set(dow.split(',').map((d) => Number(d) % 7))].sort((x, y) => x - y) };
    }
    if (dow === '*' && num(dom) && Number(dom) >= 1 && Number(dom) <= 31) return { mode: 'monthly', hour, minute, dom: Number(dom) };
  }
  return { mode: 'custom' };
};

export const buildCron = (sch) => {
  const minute = Number.isInteger(sch.minute) ? sch.minute : 0;
  const hour = Number.isInteger(sch.hour) ? sch.hour : 2;
  switch (sch.mode) {
    case 'hourly':
      return sch.every > 1 ? `${minute} */${sch.every} * * *` : `${minute} * * * *`;
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${(sch.dows?.length ? sch.dows : [1]).join(',')}`;
    case 'monthly':
      return `${minute} ${hour} ${sch.dom || 1} * *`;
    default:
      return sch.raw || '';
  }
};
const isNum = (v) => /^\d+$/.test(String(v));
const WEEKDAYS = () => [t('Sunday'), t('Monday'), t('Tuesday'), t('Wednesday'), t('Thursday'), t('Friday'), t('Saturday')];

/** Client-side structural check (the service does the full validation). Returns an error text or ''. */
export const cronProblem = (cron) => {
  const text = String(cron || '').trim();
  if (!text) return t('Please enter a cron expression');
  if (/^@(hourly|daily|midnight|weekly|monthly|yearly|annually)$/i.test(text)) return '';
  const parts = text.split(/\s+/);
  if (parts.length !== 5) return t('A cron expression needs exactly 5 fields: minute hour day-of-month month day-of-week');
  if (!parts.every((p) => /^[\w*,/\-]+$/.test(p))) return t('Invalid characters in the cron expression');
  return '';
};

/** Human readable description of the common cron shapes; falls back to the raw expression. */
export const describeCron = (cron) => {
  const text = String(cron || '').trim();
  const macros = { '@hourly': '0 * * * *', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@weekly': '0 0 * * 0', '@monthly': '0 0 1 * *' };
  const expr = macros[text.toLowerCase()] || text;
  const p = expr.split(/\s+/);
  if (p.length !== 5) return expr || '-';
  const [mi, h, dom, mon, dow] = p;
  const time = isNum(h) && isNum(mi) ? `${pad2(h)}:${pad2(mi)}` : null;
  if (mon === '*') {
    if (dom === '*' && dow === '*') {
      if (h === '*' && isNum(mi)) return mi === '0' ? t('Every hour') : t('Every hour at minute {minute}', { minute: mi });
      if (h === '*' && /^\*\/\d+$/.test(mi)) return t('Every {n} minutes', { n: mi.slice(2) });
      if (/^\*\/\d+$/.test(h) && isNum(mi)) return t('Every {n} hours at minute {minute}', { n: h.slice(2), minute: mi });
      if (time) return t('Every day at {time}', { time });
    }
    if (dom === '*' && time && /^[0-7](,[0-7])*$/.test(dow)) {
      const names = dow.split(',').map((d) => WEEKDAYS()[Number(d) % 7]);
      return t('Every {days} at {time}', { days: names.join(', '), time });
    }
    if (dow === '*' && time && isNum(dom)) return t('Monthly on day {day} at {time}', { day: dom, time });
  }
  return `${t('Cron')}: ${expr}`;
};

export const modeText = (mode) => (mode === 'incremental' ? t('Incremental Backup') : t('Full Backup'));

export const runStatusTag = (status) => {
  const map = {
    running: { color: 'processing', text: t('Running') },
    success: { color: 'success', text: t('Success') },
    error: { color: 'error', text: t('Failed') },
    partial: { color: 'warning', text: t('Partially failed') },
  };
  if (!status) return <Text type="secondary">{t('Never run')}</Text>;
  const m = map[status] || { color: 'default', text: String(status) };
  return <Tag color={m.color}>{m.text}</Tag>;
};

export const SCHEDULE_LIST_POLICY = 'backup:get_all';

/* ------------------------------------------------------------------ unavailable state */

export function SchedulerUnavailable({ onRetry, withTitle = true }) {
  return (
    <div>
      {withTitle ? <h1 className="page-title">{t('Backup Schedules')}</h1> : null}
      <Result
        status="warning"
        title={t('Backup scheduler service is not available')}
        subTitle={t(
          'The console could not reach the backup scheduler service (/scheduler-api). Check that the service is running and that the reverse proxy forwards /scheduler-api to it.'
        )}
        extra={onRetry ? <Button onClick={onRetry}>{t('Retry')}</Button> : null}
      />
    </div>
  );
}

export const schedulerErrorNotice = (err) => (isSchedulerUnavailable(err) ? t('Backup scheduler service is not available') : null);

/* ------------------------------------------------------------------ cron field */

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first, cron value 0 = Sunday

export function CronField({ value, onChange }) {
  const sch = parseSchedule(value);
  const [custom, setCustom] = useState(sch.mode === 'custom');
  const mode = custom ? 'custom' : sch.mode;
  const [preview, setPreview] = useState({ loading: false, runs: [], error: '', tz: '' });
  const seq = useRef(0);

  useEffect(() => {
    const problem = cronProblem(value);
    if (problem) {
      setPreview((p) => ({ ...p, loading: false, runs: [], error: value ? problem : '' }));
      return undefined;
    }
    const mine = ++seq.current;
    setPreview((p) => ({ ...p, loading: true, error: '' }));
    const timer = setTimeout(async () => {
      try {
        const res = await schedulerApi.previewCron(String(value).trim(), 3);
        if (mine !== seq.current) return;
        setPreview({
          loading: false,
          runs: Array.isArray(res?.next_runs) ? res.next_runs : [],
          error: res?.valid === false ? String(res.error || '') : '',
          tz: res?.timezone || '',
        });
      } catch (e) {
        if (mine !== seq.current) return;
        setPreview((p) => ({ ...p, loading: false, runs: [], error: isSchedulerUnavailable(e) ? t('Backup scheduler service is not available') : '' }));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  const emit = (patch) => onChange?.(buildCron({ ...sch, ...patch }));

  const chooseMode = (m) => {
    if (m === 'custom') {
      setCustom(true);
      return;
    }
    setCustom(false);
    // keep the time of day already chosen when switching between the structured frequencies
    const keep = { hour: sch.hour, minute: sch.minute };
    const base = { hourly: { every: 1, minute: sch.minute ?? 0 }, daily: keep, weekly: { ...keep, dows: [1] }, monthly: { ...keep, dom: 1 } }[m];
    onChange?.(buildCron({ mode: m, ...base }));
  };

  const timeValue = Number.isInteger(sch.hour) ? dayjs().hour(sch.hour).minute(Number.isInteger(sch.minute) ? sch.minute : 0) : null;
  const timePicker = (
    <TimePicker
      format="HH:mm"
      allowClear={false}
      needConfirm={false}
      minuteStep={1}
      value={timeValue}
      onChange={(d) => d && emit({ hour: d.hour(), minute: d.minute() })}
      style={{ width: 110 }}
    />
  );
  const weekdayNames = WEEKDAYS();

  return (
    <div>
      <Space wrap align="center">
        <Select
          style={{ width: 130 }}
          value={mode}
          onChange={chooseMode}
          options={CRON_PRESETS().map(({ value: v, label }) => ({ value: v, label }))}
        />
        {mode === 'hourly' ? (
          <>
            <span>{t('every')}</span>
            <Select style={{ width: 70 }} value={sch.every} onChange={(every) => emit({ every })} options={HOUR_STEPS.map((n) => ({ value: n, label: String(n) }))} />
            <span>{t('hour(s) at minute')}</span>
            <InputNumber min={0} max={59} value={sch.minute} onChange={(minute) => Number.isInteger(minute) && emit({ minute })} style={{ width: 70 }} />
          </>
        ) : null}
        {mode === 'daily' ? (
          <>
            <span>{t('at')}</span>
            {timePicker}
          </>
        ) : null}
        {mode === 'weekly' ? (
          <>
            <Checkbox.Group
              value={sch.dows}
              onChange={(dows) => emit({ dows: [...dows].sort((x, y) => x - y) })}
              options={WEEK_ORDER.map((d) => ({ value: d, label: weekdayNames[d] }))}
            />
            <span>{t('at')}</span>
            {timePicker}
          </>
        ) : null}
        {mode === 'monthly' ? (
          <>
            <span>{t('on day')}</span>
            <InputNumber min={1} max={31} value={sch.dom} onChange={(dom) => Number.isInteger(dom) && emit({ dom })} style={{ width: 70 }} />
            <span>{t('at')}</span>
            {timePicker}
          </>
        ) : null}
        {mode === 'custom' ? (
          <Input
            value={value}
            placeholder="0 2 * * *"
            onChange={(e) => onChange?.(e.target.value)}
            style={{ width: 240, fontFamily: 'monospace' }}
          />
        ) : null}
        {preview.tz ? <Text type="secondary">{t('Time zone')}: {preview.tz}</Text> : null}
      </Space>
      <div style={{ marginTop: 6, fontSize: 12.5 }}>
        {preview.error ? (
          <Text type="danger">{preview.error}</Text>
        ) : (
          <>
            <Text type="secondary">{describeCron(value)}</Text> <Text type="secondary" code style={{ fontSize: 11 }}>{String(value || '')}</Text>
            {preview.runs.length ? (
              <div style={{ color: '#64748b', marginTop: 2 }}>
                {t('Next runs')}
                {preview.tz ? ` (${preview.tz})` : ''}: {preview.runs.map((r) => formatTime(r)).join(' | ')}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ credential field */

export function CredentialField({ value, onChange, getName, optional }) {
  const [busy, setBusy] = useState(false);
  const [expires, setExpires] = useState(null);
  const cred = value || {};
  const set = (patch) => onChange?.({ ...cred, ...patch });

  const create = async () => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      message.error(t('Cannot determine the current user; paste an application credential manually.'));
      return;
    }
    const base = `backup-scheduler-${getName?.() || 'schedule'}`;
    setBusy(true);
    try {
      // roles omitted => the credential gets the roles of the current (project scoped) token
      const body = { unrestricted: false, description: t('Created by the Backup Schedules page') };
      if (expires && typeof expires.endOf === 'function') body.expires_at = expires.endOf('day').toISOString();
      let res;
      try {
        res = await keystoneApi.createApplicationCredential(userId, { ...body, name: base });
      } catch (e) {
        if (e?.response?.status !== 409) throw e;
        res = await keystoneApi.createApplicationCredential(userId, { ...body, name: `${base}-${Date.now()}` });
      }
      const ac = res?.application_credential;
      if (!ac?.id || !ac?.secret) throw new Error(t('Unexpected response while creating the application credential'));
      onChange?.({ application_credential_id: ac.id, secret: ac.secret });
      message.success(t('Application credential created'));
    } catch (e) {
      message.error(e?.response?.data?.error?.message || e?.message || t('Operation failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 8 }}>
        <Button onClick={create} loading={busy}>
          {t('Create application credential automatically')}
        </Button>
        <DatePicker value={expires} onChange={setExpires} placeholder={t('Expires (optional)')} />
      </Space>
      <Input
        style={{ marginBottom: 8 }}
        placeholder={t('Application credential ID')}
        value={cred.application_credential_id}
        onChange={(e) => set({ application_credential_id: e.target.value })}
        autoComplete="off"
      />
      <Input.Password
        placeholder={optional ? t('Application credential secret (leave empty to keep the current one)') : t('Application credential secret')}
        value={cred.secret}
        onChange={(e) => set({ secret: e.target.value })}
        autoComplete="new-password"
      />
      <Alert
        style={{ marginTop: 8 }}
        type="info"
        showIcon
        message={t(
          'The secret is sent once to the backup scheduler and stored there encrypted. It is never shown again; the scheduler uses it to create backups on your behalf.'
        )}
      />
    </div>
  );
}

const credentialRule = (optional) => ({
  validator: (_, v) => {
    const id = v?.application_credential_id;
    const secret = v?.secret;
    if (optional && !id && !secret) return Promise.resolve();
    if (id && secret) return Promise.resolve();
    return Promise.reject(new Error(t('Application credential ID and secret are required')));
  },
});

const cronRule = {
  validator: (_, v) => {
    const p = cronProblem(v);
    return p ? Promise.reject(new Error(p)) : Promise.resolve();
  },
};

/* ------------------------------------------------------------------ actions */

const modeOptions = () => [
  { value: 'full', label: t('Full Backup') },
  { value: 'incremental', label: t('Incremental Backup') },
];

/** only older schedules of a single volume: instances are always backed up while attached (forced) */
const forceField = () => ({
  name: 'force_in_use',
  label: t('Back up attached volumes'),
  type: 'switch',
  tip: t('Required for volumes that are in-use (attached to an instance); the backup is taken with force.'),
});

/* ------------------------------------------------------------------ retention (Proxmox prune-backups style) */

export const KEEP_FIELDS = ['keep_last', 'keep_hourly', 'keep_daily', 'keep_weekly', 'keep_monthly', 'keep_yearly'];
const keepLabel = (key) =>
  ({
    keep_last: t('Keep last'),
    keep_hourly: t('Keep hourly'),
    keep_daily: t('Keep daily'),
    keep_weekly: t('Keep weekly'),
    keep_monthly: t('Keep monthly'),
    keep_yearly: t('Keep yearly'),
  })[key];

/** form values -> retention body; throws when nothing is kept */
export const retentionFromValues = (values = {}) => {
  if (values.keep_all) return { keep_all: true };
  const out = {};
  KEEP_FIELDS.forEach((k) => {
    const n = Number(values[k]);
    if (Number.isInteger(n) && n > 0) out[k] = n;
  });
  if (!Object.keys(out).length) throw new Error(t('Set at least one keep option, or choose Keep all backups'));
  return out;
};

export const retentionToValues = (retention = {}) => ({
  keep_all: Boolean(retention.keep_all),
  ...Object.fromEntries(KEEP_FIELDS.map((k) => [k, retention[k]])),
});

/** short text for lists: "Keep all", or "Keep last 3 · daily 7 · weekly 4" */
export const describeRetention = (retention) => {
  if (!retention) return '-';
  if (retention.keep_all) return t('Keep all backups');
  const parts = KEEP_FIELDS.filter((k) => retention[k]).map((k) => `${keepLabel(k)} ${retention[k]}`);
  return parts.length ? parts.join(' · ') : '-';
};

/** max minutes to wait for a backup to become available; the run fails afterwards instead of waiting forever */
export const DEFAULT_TIMEOUT_MINUTES = 360;
export const timeoutFormItem = () => ({
  name: 'timeout_minutes',
  label: t('Timeout (minutes)'),
  type: 'number',
  min: 5,
  max: 2880,
  tip: t('How long to wait for the backup to finish. If it is not available in time the run is marked as failed and the next run can start. 5 to 2880 minutes, empty = service default (360).'),
});

export const retentionFormItems = () => [
  {
    name: 'keep_all',
    label: t('Keep all backups'),
    type: 'switch',
    tip: t('Nothing is deleted by retention (failed backups of the schedule are still removed). Cannot be combined with the options below.'),
  },
  ...KEEP_FIELDS.map((key, i) => ({
    name: key,
    label: keepLabel(key),
    type: 'number',
    min: 1,
    max: 1000,
    visible: (v) => !v.keep_all,
    tip:
      i === 0
        ? t('Keep the newest backups. Like Proxmox, a backup kept by any option is kept; older backups created by this schedule are deleted, backups not created by the schedule are never deleted.')
        : t('Keep the newest backup of each of the last N periods (time zone of the scheduler).'),
  })),
];

/** instances to back up (table picker); every Cinder volume attached to them is included */
const vmsField = () => ({
  name: 'vms',
  label: t('Instances'),
  required: true,
  rules: [
    {
      validator: (_, value) => {
        const n = Array.isArray(value) ? value.length : 0;
        if (!n) return Promise.reject(new Error(t('Select at least one instance')));
        if (n > MAX_VMS) return Promise.reject(new Error(t('At most {max} instances per schedule', { max: MAX_VMS })));
        return Promise.resolve();
      },
    },
  ],
  render: () => <VmPicker />,
});

export const createScheduleAction = () => ({
  id: 'create',
  type: 'modal',
  policy: 'backup:create',
  aliasPolicy: 'cinder:backup:create',
  title: t('Create Backup Schedule'),
  width: 860,
  description: t(
    'The backup scheduler service backs up every volume attached to the selected instances on the given schedule, one volume after another, and keeps only the backups allowed by the retention options.'
  ),
  getDefaultValues: () => ({
    vms: [],
    mode: 'full',
    cron: '0 2 * * *',
    keep_last: 7,
    keep_all: false,
    timeout_minutes: DEFAULT_TIMEOUT_MINUTES,
    enabled: true,
    credential: {},
  }),
  getFormItems: () => [
    { name: 'name', label: t('Name'), type: 'input', required: true, rules: [nameRule()] },
    vmsField(),
    { name: 'mode', label: t('Backup Mode'), type: 'radio', options: modeOptions() },
    {
      name: 'cron',
      label: t('Schedule'),
      required: true,
      rules: [cronRule],
      render: () => <CronField />,
    },
    ...retentionFormItems(),
    timeoutFormItem(),
    {
      name: 'credential',
      label: t('Application Credential'),
      required: true,
      rules: [credentialRule(false)],
      render: ({ form }) => <CredentialField getName={() => form.getFieldValue('name')} />,
    },
    { name: 'enabled', label: t('Enabled'), type: 'switch' },
  ],
  onSubmit: ({ name, vms, mode, cron, credential, enabled, timeout_minutes, ...keep }) =>
    schedulerApi.createSchedule({
      name,
      vms: (vms || []).map((v) => ({ id: v.id, name: v.name })),
      mode,
      cron: String(cron).trim(),
      retention: retentionFromValues(keep),
      timeout_minutes: timeout_minutes || null,
      enabled: enabled !== false,
      credential: {
        application_credential_id: credential?.application_credential_id,
        secret: credential?.secret,
      },
    }),
});

export const editScheduleAction = () => ({
  id: 'edit',
  type: 'modal',
  policy: 'backup:update',
  aliasPolicy: 'cinder:backup:update',
  title: t('Edit Backup Schedule'),
  buttonText: t('Edit'),
  width: 860,
  getDefaultValues: (item) => ({
    name: item.name,
    vms: item.vms || [],
    mode: item.mode,
    cron: item.cron,
    ...retentionToValues(item.retention),
    timeout_minutes: item.timeout_minutes || undefined,
    force_in_use: Boolean(item.force_in_use),
    credential: {},
  }),
  getFormItems: (item) => [
    { name: 'name', label: t('Name'), type: 'input', required: true, rules: [nameRule()] },
    ...(item?.vms ? [vmsField()] : []),
    { name: 'mode', label: t('Backup Mode'), type: 'radio', options: modeOptions() },
    { name: 'cron', label: t('Schedule'), required: true, rules: [cronRule], render: () => <CronField /> },
    ...retentionFormItems(),
    timeoutFormItem(),
    ...(item?.vms ? [] : [forceField()]),
    {
      name: 'credential',
      label: t('Application Credential'),
      tip: t('Leave empty to keep the stored credential, or provide a new one to rotate it.'),
      rules: [credentialRule(true)],
      render: ({ form }) => <CredentialField optional getName={() => form.getFieldValue('name')} />,
    },
  ],
  onSubmit: ({ name, vms, mode, cron, force_in_use, credential, timeout_minutes, ...keep }, item) => {
    const body = {
      name,
      mode,
      cron: String(cron).trim(),
      retention: retentionFromValues(keep),
      timeout_minutes: timeout_minutes || null,
    };
    if (item.vms) body.vms = (vms || []).map((v) => ({ id: v.id, name: v.name }));
    else body.force_in_use = Boolean(force_in_use);
    if (credential?.application_credential_id && credential?.secret) {
      body.credential = { application_credential_id: credential.application_credential_id, secret: credential.secret };
    }
    return schedulerApi.updateSchedule(item.id, body);
  },
});

const toggleAction = (enable, { isAdmin } = {}) => ({
  id: enable ? 'enable' : 'disable',
  type: 'confirm',
  policy: 'backup:update',
  aliasPolicy: 'cinder:backup:update',
  title: enable ? t('Enable Backup Schedule') : t('Disable Backup Schedule'),
  actionName: enable ? t('Enable') : t('Disable'),
  allowed: (item) => Boolean(item.enabled) !== enable,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await schedulerApi.updateSchedule(it.id, { enabled: enable }, { allProjects: isAdmin });
    }
  },
});
export const enableScheduleAction = (o) => toggleAction(true, o);
export const disableScheduleAction = (o) => toggleAction(false, o);

/** polls the schedule until its last run is no longer running (max ~20 s); returns last_run */
const waitRunResult = async (id, { isAdmin, timeoutMs = 20000 } = {}) => {
  const end = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < end) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1000));
    try {
      // eslint-disable-next-line no-await-in-loop
      last = (await schedulerApi.getSchedule(id, { allProjects: isAdmin }))?.last_run || null;
    } catch {
      return null;
    }
    if (last && last.status !== 'running') return last;
  }
  return last;
};

/** "2 ok · 1 failed · 1 skipped" from last_run.counts */
export const describeCounts = (counts) => {
  if (!counts || !counts.total) return '';
  const parts = [`${counts.success} ${t('OK')}`];
  if (counts.error) parts.push(`${counts.error} ${t('failed')}`);
  if (counts.skipped) parts.push(`${counts.skipped} ${t('skipped')}`);
  return parts.join(' · ');
};

export const runScheduleAction = ({ isAdmin } = {}) => ({
  id: 'run-now',
  type: 'confirm',
  policy: 'backup:create',
  aliasPolicy: 'cinder:backup:create',
  title: t('Run Backup Now'),
  actionName: t('Run Now'),
  allowed: (item) => item.last_run?.status !== 'running',
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    const problems = [];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await schedulerApi.runSchedule(it.id, { allProjects: isAdmin });
      // the run is asynchronous (202): wait a few seconds so an immediate failure is shown instead of a false "success"
      // eslint-disable-next-line no-await-in-loop
      const last = await waitRunResult(it.id, { isAdmin });
      if (last && ['error', 'partial'].includes(last.status)) {
        problems.push(`${it.name || it.id}: ${last.error || t('Failed')}`);
      }
    }
    if (problems.length) throw new Error(`${t('The run finished with errors')}: ${problems.join('; ')}`);
  },
});

export const deleteScheduleAction = ({ isAdmin } = {}) => ({
  ...deleteAction({
    name: t('Backup Schedule'),
    onDelete: (it) => schedulerApi.deleteSchedule(it.id, { allProjects: isAdmin }),
    allowed: (item) => item.last_run?.status !== 'running',
  }),
  policy: 'backup:delete',
  aliasPolicy: 'cinder:backup:delete',
});

export const scheduleRowActions = ({ isAdmin } = {}) =>
  isAdmin
    ? { firstAction: deleteScheduleAction({ isAdmin }), moreActions: [] }
    : {
        firstAction: editScheduleAction(),
        moreActions: [
          { action: runScheduleAction() },
          { action: enableScheduleAction() },
          { action: disableScheduleAction() },
          { action: deleteScheduleAction() },
        ],
      };

/* ------------------------------------------------------------------ shared cells */

export const VolumeCell = ({ id, name, isAdmin }) => (
  <IdNameCell id={id} name={name} href={id ? `/storage/${isAdmin ? 'volume-admin' : 'volume'}/detail/${id}` : undefined} bold={false} />
);

export const BackupLink = ({ id, isAdmin }) =>
  id ? <Link to={`/storage/${isAdmin ? 'backup-admin' : 'backup'}/detail/${id}`}>{String(id).slice(0, 8)}</Link> : '-';
