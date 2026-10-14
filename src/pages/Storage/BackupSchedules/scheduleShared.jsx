import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, DatePicker, Input, Result, Select, Space, Tag, Typography, message } from 'antd';
import { Link } from 'react-router-dom';
import { cinderApi } from '@/api/cinder';
import { keystoneApi } from '@/api/keystone';
import { schedulerApi, isSchedulerUnavailable } from '@/api/scheduler';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/core/i18n';
import { deleteAction, formatTime, IdNameCell } from '@/components/ResourcePage';
import { nameRule } from '@/components/form/rules';

const { Text } = Typography;

/* ------------------------------------------------------------------ cron helpers */

export const CRON_PRESETS = () => [
  { value: 'hourly', label: t('Hourly'), cron: '0 * * * *' },
  { value: 'daily', label: t('Daily'), cron: '0 2 * * *' },
  { value: 'weekly', label: t('Weekly'), cron: '0 2 * * 0' },
  { value: 'monthly', label: t('Monthly'), cron: '0 2 1 * *' },
  { value: 'custom', label: t('Custom') },
];

export const presetOfCron = (cron) => {
  const found = CRON_PRESETS().find((p) => p.cron === String(cron || '').trim());
  return found ? found.value : 'custom';
};

const pad2 = (n) => String(n).padStart(2, '0');
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

export function CronField({ value, onChange }) {
  const [preset, setPreset] = useState(() => presetOfCron(value));
  const [preview, setPreview] = useState({ loading: false, runs: [], error: '', tz: '' });
  const seq = useRef(0);

  useEffect(() => {
    const problem = cronProblem(value);
    if (problem) {
      setPreview({ loading: false, runs: [], error: value ? problem : '', tz: '' });
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
        setPreview({ loading: false, runs: [], error: isSchedulerUnavailable(e) ? t('Backup scheduler service is not available') : '', tz: '' });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  const choose = (v) => {
    setPreset(v);
    const p = CRON_PRESETS().find((x) => x.value === v);
    if (p?.cron) onChange?.(p.cron);
  };

  return (
    <div>
      <Space.Compact style={{ width: '100%' }}>
        <Select style={{ width: 150 }} value={preset} onChange={choose} options={CRON_PRESETS().map(({ value: v, label }) => ({ value: v, label }))} />
        <Input
          value={value}
          placeholder="0 2 * * *"
          onChange={(e) => {
            setPreset(presetOfCron(e.target.value));
            onChange?.(e.target.value);
          }}
          disabled={preset !== 'custom'}
        />
      </Space.Compact>
      <div style={{ marginTop: 6, fontSize: 12.5 }}>
        {preview.error ? (
          <Text type="danger">{preview.error}</Text>
        ) : (
          <>
            <Text type="secondary">{describeCron(value)}</Text>
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

const volumeLabel = (v) => `${v.name || v.id.slice(0, 8)} (${v.size} GiB, ${v.status})`;

const loadVolumeOptions = async () => {
  const res = await cinderApi.listVolumes({});
  const list = Array.isArray(res?.volumes) ? res.volumes : [];
  const volumes = list.filter((v) => ['available', 'in-use'].includes(v.status));
  return volumes;
};

const modeOptions = () => [
  { value: 'full', label: t('Full Backup') },
  { value: 'incremental', label: t('Incremental Backup') },
];

const forceField = (statusOf) => ({
  name: 'force_in_use',
  label: t('Back up attached volumes'),
  type: 'switch',
  tip: t('Required for volumes that are in-use (attached to an instance); the backup is taken with force.'),
  visible: (values) => !statusOf || statusOf(values.volume_id) === 'in-use' || values.force_in_use === true,
});

export const createScheduleAction = () => {
  let statuses = {};
  return {
    id: 'create',
    type: 'modal',
    policy: 'backup:create',
    aliasPolicy: 'cinder:backup:create',
    title: t('Create Backup Schedule'),
    width: 760,
    description: t(
      'The backup scheduler service creates a backup of the volume on the given schedule and keeps only the newest backups it created.'
    ),
    getDefaultValues: () => ({
      mode: 'full',
      cron: '0 2 * * *',
      keep_last: 7,
      enabled: true,
      force_in_use: false,
      credential: {},
    }),
    getFormItems: async () => {
      let volumes = [];
      try {
        volumes = await loadVolumeOptions();
      } catch {
        volumes = [];
      }
      statuses = Object.fromEntries(volumes.map((v) => [v.id, v.status]));
      return [
        { name: 'name', label: t('Name'), type: 'input', required: true, rules: [nameRule()] },
        {
          name: 'volume_id',
          label: t('Volume'),
          type: 'select',
          required: true,
          options: volumes.map((v) => ({ value: v.id, label: volumeLabel(v) })),
        },
        { name: 'mode', label: t('Backup Mode'), type: 'radio', options: modeOptions() },
        {
          name: 'cron',
          label: t('Schedule'),
          required: true,
          rules: [cronRule],
          render: () => <CronField />,
        },
        {
          name: 'keep_last',
          label: t('Keep last backups'),
          type: 'number',
          min: 1,
          max: 1000,
          required: true,
          tip: t('Older backups created by this schedule are deleted. Backups not created by the schedule are never deleted.'),
        },
        forceField((id) => statuses[id]),
        {
          name: 'credential',
          label: t('Application Credential'),
          required: true,
          rules: [credentialRule(false)],
          render: ({ form }) => <CredentialField getName={() => form.getFieldValue('name')} />,
        },
        { name: 'enabled', label: t('Enabled'), type: 'switch' },
      ];
    },
    onSubmit: ({ name, volume_id, mode, cron, keep_last, force_in_use, credential, enabled }) =>
      schedulerApi.createSchedule({
        name,
        volume_id,
        mode,
        cron: String(cron).trim(),
        retention: { keep_last },
        enabled: enabled !== false,
        force_in_use: Boolean(force_in_use),
        credential: {
          application_credential_id: credential?.application_credential_id,
          secret: credential?.secret,
        },
      }),
  };
};

export const editScheduleAction = () => ({
  id: 'edit',
  type: 'modal',
  policy: 'backup:update',
  aliasPolicy: 'cinder:backup:update',
  title: t('Edit Backup Schedule'),
  buttonText: t('Edit'),
  width: 760,
  getDefaultValues: (item) => ({
    name: item.name,
    mode: item.mode,
    cron: item.cron,
    keep_last: item.retention?.keep_last,
    force_in_use: Boolean(item.force_in_use),
    credential: {},
  }),
  getFormItems: () => [
    { name: 'name', label: t('Name'), type: 'input', required: true, rules: [nameRule()] },
    { name: 'mode', label: t('Backup Mode'), type: 'radio', options: modeOptions() },
    { name: 'cron', label: t('Schedule'), required: true, rules: [cronRule], render: () => <CronField /> },
    { name: 'keep_last', label: t('Keep last backups'), type: 'number', min: 1, max: 1000, required: true },
    forceField(null),
    {
      name: 'credential',
      label: t('Application Credential'),
      tip: t('Leave empty to keep the stored credential, or provide a new one to rotate it.'),
      rules: [credentialRule(true)],
      render: ({ form }) => <CredentialField optional getName={() => form.getFieldValue('name')} />,
    },
  ],
  onSubmit: ({ name, mode, cron, keep_last, force_in_use, credential }, item) => {
    const body = { name, mode, cron: String(cron).trim(), retention: { keep_last }, force_in_use: Boolean(force_in_use) };
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
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await schedulerApi.runSchedule(it.id, { allProjects: isAdmin });
    }
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
