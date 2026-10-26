import { randomUUID } from 'node:crypto';
import { nextRun, parseCron } from './cron.js';
import { decrypt } from './crypto.js';
import { authenticateAppCredential, cinderClient, HttpError } from './openstack.js';
import { schedulerTag, selectBackupsToDelete } from './retention.js';
import { itemEvent, reportEvents, runEvent } from './audit.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');

export function backupTimestamp(d = new Date()) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

const newItem = (vm, volume, extra = {}) => ({
  vm_id: vm?.id || null,
  vm_name: vm?.name || null,
  volume_id: volume?.id || null,
  volume_name: volume?.name || null,
  status: 'pending',
  backup_id: null,
  backup_name: null,
  error: null,
  deleted_backups: [],
  ...extra,
});

export class Runner {
  constructor({ cfg, store, key, log }) {
    this.cfg = cfg;
    this.store = store;
    this.key = key;
    this.log = log;
    this.running = new Map(); // schedule id -> Promise
    this.timer = null;
    this.stopped = false;
  }

  start() {
    // runs left "running" by a crash can never finish
    for (const run of this.store.allRuns()) {
      if (run.status === 'running') {
        run.status = 'error';
        run.error = 'interrupted by service restart';
        run.finished_at = new Date().toISOString();
        for (const it of run.items || []) {
          if (it.status === 'running' || it.status === 'pending') {
            it.status = 'error';
            it.error = 'interrupted by service restart';
          }
        }
        this.store.putRun(run);
        const s = this.store.getSchedule(run.schedule_id);
        if (s?.last_run?.id === run.id) {
          s.last_run = this.summary(run);
          this.store.putSchedule(s);
        }
      }
    }
    // schedules without next_run (e.g. enabled by edit while stopped)
    for (const s of this.store.listSchedules()) this.refreshNextRun(s);
    this.log('info', `runner started, tick every ${this.cfg.tickSeconds}s`);
    this.timer = setInterval(() => this.tick().catch((e) => this.log('error', `tick failed: ${e.message}`)), this.cfg.tickSeconds * 1000);
    this.tick().catch((e) => this.log('error', `tick failed: ${e.message}`));
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    await Promise.allSettled([...this.running.values()]);
  }

  /** (Re)compute next_run for an enabled schedule; clear it when disabled. Persists. */
  refreshNextRun(s, fromMs = Date.now()) {
    if (!s.enabled) s.next_run = null;
    else if (!s.next_run) {
      const n = nextRun(parseCron(s.cron), fromMs, this.cfg.timezone);
      s.next_run = n ? new Date(n).toISOString() : null;
    }
    this.store.putSchedule(s);
  }

  async tick() {
    if (this.stopped) return;
    const now = Date.now();
    for (const s of this.store.listSchedules()) {
      if (!s.enabled || !s.next_run || this.running.has(s.id)) continue;
      // backups of different schedules also run one after another: a due schedule waits for a free slot
      if (this.running.size >= this.cfg.maxConcurrentRuns) break;
      if (Date.parse(s.next_run) <= now) {
        // advance next_run first so a restart or slow run never double fires
        const n = nextRun(parseCron(s.cron), now, this.cfg.timezone);
        s.next_run = n ? new Date(n).toISOString() : null;
        this.store.putSchedule(s);
        this.launch(s, 'schedule');
      }
    }
  }

  /** Start a run; returns the (running) run record. Throws when one is already running. */
  launch(schedule, trigger) {
    if (this.running.has(schedule.id)) {
      const err = new Error('a run of this schedule is already in progress');
      err.code = 'conflict';
      throw err;
    }
    const run = {
      id: randomUUID(),
      schedule_id: schedule.id,
      trigger,
      status: 'running',
      backup_id: null,
      backup_name: null,
      deleted_backups: [],
      items: [], // per volume results
      error: null,
      started_at: new Date().toISOString(),
      finished_at: null,
    };
    this.store.putRun(run);
    schedule.last_run = this.summary(run);
    this.store.putSchedule(schedule);
    this.log('info', `run ${run.id} started for schedule ${schedule.id} (${schedule.name}) trigger=${trigger}`);
    const p = this.execute(schedule, run)
      .catch((e) => {
        run.status = 'error';
        run.error = e.message || String(e);
        this.log('error', `run ${run.id} failed: ${run.error}`);
      })
      .finally(() => {
        run.finished_at = new Date().toISOString();
        this.store.putRun(run);
        const fresh = this.store.getSchedule(schedule.id);
        if (fresh) {
          fresh.last_run = this.summary(run);
          this.store.putSchedule(fresh);
        }
        this.running.delete(schedule.id);
        this.log('info', `run ${run.id} finished status=${run.status}${run.error ? ` error=${run.error}` : ''}`);
        reportEvents(this.cfg, [runEvent(schedule, { ...run, counts: this.counts(run) })], this.log);
      });
    this.running.set(schedule.id, p);
    return run;
  }

  counts(run) {
    const items = run.items || [];
    const count = (st) => items.filter((i) => i.status === st).length;
    return { total: items.length, success: count('success'), error: count('error'), skipped: count('skipped') };
  }

  summary(run) {
    return {
      id: run.id,
      status: run.status,
      trigger: run.trigger,
      backup_id: run.backup_id,
      counts: this.counts(run),
      error: run.error,
      started_at: run.started_at,
      finished_at: run.finished_at,
    };
  }

  /** Work list of a run: every volume attached to the scheduled instances, or the single volume of an older schedule. */
  async buildItems(cinder, schedule) {
    if (!schedule.vms?.length) return [newItem(null, { id: schedule.volume_id })];
    const volumes = await cinder.listVolumes();
    const items = [];
    for (const vm of schedule.vms) {
      const attached = volumes.filter((v) => (v.attachments || []).some((a) => a.server_id === vm.id));
      if (!attached.length) {
        items.push(newItem(vm, null, { status: 'skipped', error: 'no attached volumes (an instance on a local / ephemeral disk cannot be backed up with Cinder)' }));
      } else {
        for (const v of attached) items.push(newItem(vm, v));
      }
    }
    return items;
  }

  async execute(schedule, run) {
    const credential = JSON.parse(decrypt(this.key, schedule.credential_enc));
    const session = await authenticateAppCredential(this.cfg, credential);
    if (session.projectId !== schedule.project_id) {
      throw new Error('application credential belongs to a different project than the schedule');
    }
    const cinder = cinderClient(this.cfg, session, { onBehalfOf: `schedule ${schedule.id} (${schedule.name || ''})` });

    run.items = await this.buildItems(cinder, schedule);
    if (!run.items.length) throw new Error('nothing to back up');
    this.store.putRun(run);

    // volumes are backed up one after another; a failed volume is recorded and the next one still runs
    const runDeadline = Date.now() + this.cfg.runMaxHours * 3600 * 1000;
    for (const item of run.items) {
      if (item.status !== 'pending') {
        reportEvents(this.cfg, [itemEvent(schedule, run, item)], this.log); // skipped while building the list
        continue;
      }
      item.started_at = new Date().toISOString();
      if (this.stopped) {
        item.status = 'skipped';
        item.error = 'service is stopping';
      } else if (Date.now() > runDeadline) {
        item.status = 'skipped';
        item.error = `run time limit of ${this.cfg.runMaxHours} h reached`;
      } else {
        item.status = 'running';
        this.store.putRun(run);
        try {
          // eslint-disable-next-line no-await-in-loop
          await this.backupVolume(cinder, schedule, run, item);
          item.status = 'success';
        } catch (e) {
          item.status = 'error';
          item.error = e.message || String(e);
          this.log('error', `run ${run.id}: volume ${item.volume_id} failed: ${item.error}`);
        }
      }
      item.finished_at = new Date().toISOString();
      this.store.putRun(run);
      reportEvents(this.cfg, [itemEvent(schedule, run, item)], this.log);
    }

    const c = this.counts(run);
    run.deleted_backups = run.items.flatMap((i) => i.deleted_backups);
    const first = run.items.find((i) => i.backup_id);
    run.backup_id = first?.backup_id || null;
    run.backup_name = first?.backup_name || null;
    if (c.error === 0 && c.success > 0) {
      run.status = 'success';
    } else if (c.success > 0) {
      run.status = 'partial';
      run.error = `${c.error} of ${c.total} volume(s) failed`;
    } else {
      run.status = 'error';
      run.error = run.items.find((i) => i.error)?.error || 'nothing was backed up';
    }
  }

  async backupVolume(cinder, schedule, run, item) {
    const volume = await cinder.getVolume(item.volume_id);
    if (!volume) throw new Error('volume not found');
    // schedules of instances always back up attached (in-use) volumes with force; older volume schedules keep their switch
    const force = volume.status === 'in-use';
    if (force && !schedule.force_in_use) throw new Error('volume is in-use and force_in_use is disabled');
    if (!['available', 'in-use'].includes(volume.status)) throw new Error(`volume status is "${volume.status}", cannot back up`);

    const clean = (v, fallback) => String(v || fallback).replace(/[^\w.-]+/g, '-').slice(0, 60);
    const stamp = backupTimestamp();
    const name = schedule.vms?.length
      ? `${schedule.name}-${clean(item.vm_name, String(item.vm_id).slice(0, 8))}-${clean(volume.name, String(volume.id).slice(0, 8))}-${stamp}`.slice(0, 255)
      : `${schedule.name}-${stamp}`;
    const created = await cinder.createBackup({
      volume_id: item.volume_id,
      name,
      description: schedulerTag(schedule.id),
      incremental: schedule.mode === 'incremental',
      force,
    });
    item.backup_id = created.id;
    item.backup_name = name;
    this.store.putRun(run);

    // retention must only run once the new backup is safely available
    // per-schedule timeout (minutes) when set, else the service default: a stuck backup never blocks the schedule forever
    const waitSeconds = schedule.timeout_minutes ? schedule.timeout_minutes * 60 : this.cfg.backupWaitSeconds;
    const deadline = Date.now() + waitSeconds * 1000;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const b = await cinder.getBackup(created.id);
      if (b.status === 'available') break;
      if (b.status === 'error') throw new Error(`backup ${created.id} ended in error${b.fail_reason ? `: ${b.fail_reason}` : ''}`);
      if (Date.now() > deadline) throw new Error(`timed out after ${Math.round(waitSeconds / 60)} min waiting for backup ${created.id} (status ${b.status})`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(this.cfg.pollMs);
    }

    try {
      await this.applyRetention(cinder, schedule, run, item);
    } catch (e) {
      throw new Error(`backup ${created.id} is available but retention failed: ${e.message}`);
    }
  }

  async applyRetention(cinder, schedule, run, item) {
    for (let pass = 0; pass < 5; pass++) {
      // eslint-disable-next-line no-await-in-loop
      const all = await cinder.listBackups(item.volume_id);
      const victims = selectBackupsToDelete(all, schedule.id, schedule.retention, this.cfg.timezone);
      if (!victims.length) return;
      for (const b of victims) {
        this.log('info', `retention: deleting backup ${b.id} (${b.name}) of schedule ${schedule.id}`);
        // eslint-disable-next-line no-await-in-loop
        await cinder.deleteBackup(b.id);
        // eslint-disable-next-line no-await-in-loop
        await this.waitDeleted(cinder, b.id);
        item.deleted_backups.push(b.id);
        run.deleted_backups.push(b.id);
        this.store.putRun(run);
      }
    }
  }

  async waitDeleted(cinder, id) {
    const deadline = Date.now() + this.cfg.deleteWaitSeconds * 1000;
    while (Date.now() < deadline) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const b = await cinder.getBackup(id);
        if (b?.status === 'error_deleting') throw new Error(`backup ${id} failed to delete`);
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return;
        throw e;
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(this.cfg.pollMs);
    }
    throw new Error(`timed out waiting for backup ${id} to be deleted`);
  }
}
