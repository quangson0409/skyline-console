import { randomUUID } from 'node:crypto';
import { nextRun, parseCron } from './cron.js';
import { decrypt } from './crypto.js';
import { authenticateAppCredential, cinderClient, HttpError } from './openstack.js';
import { schedulerTag, selectBackupsToDelete } from './retention.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');

export function backupTimestamp(d = new Date()) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

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
      });
    this.running.set(schedule.id, p);
    return run;
  }

  summary(run) {
    return {
      id: run.id,
      status: run.status,
      trigger: run.trigger,
      backup_id: run.backup_id,
      error: run.error,
      started_at: run.started_at,
      finished_at: run.finished_at,
    };
  }

  async execute(schedule, run) {
    const credential = JSON.parse(decrypt(this.key, schedule.credential_enc));
    const session = await authenticateAppCredential(this.cfg, credential);
    if (session.projectId !== schedule.project_id) {
      throw new Error('application credential belongs to a different project than the schedule');
    }
    const cinder = cinderClient(this.cfg, session);

    const volume = await cinder.getVolume(schedule.volume_id);
    if (!volume) throw new Error('volume not found');
    if (volume.status === 'in-use' && !schedule.force_in_use) {
      throw new Error('volume is in-use and force_in_use is disabled');
    }
    if (!['available', 'in-use'].includes(volume.status)) {
      throw new Error(`volume status is "${volume.status}", cannot back up`);
    }

    const name = `${schedule.name}-${backupTimestamp()}`;
    const created = await cinder.createBackup({
      volume_id: schedule.volume_id,
      name,
      description: schedulerTag(schedule.id),
      incremental: schedule.mode === 'incremental',
      force: volume.status === 'in-use',
    });
    run.backup_id = created.id;
    run.backup_name = name;
    this.store.putRun(run);

    // retention must only run once the new backup is safely available
    const deadline = Date.now() + this.cfg.backupWaitSeconds * 1000;
    for (;;) {
      const b = await cinder.getBackup(created.id);
      if (b.status === 'available') break;
      if (b.status === 'error') throw new Error(`backup ${created.id} ended in error${b.fail_reason ? `: ${b.fail_reason}` : ''}`);
      if (Date.now() > deadline) throw new Error(`timed out waiting for backup ${created.id} (status ${b.status})`);
      await sleep(this.cfg.pollMs);
    }

    await this.applyRetention(cinder, schedule, run);
    run.status = 'success';
  }

  async applyRetention(cinder, schedule, run) {
    for (let pass = 0; pass < 5; pass++) {
      const all = await cinder.listBackups(schedule.volume_id);
      const victims = selectBackupsToDelete(all, schedule.id, schedule.retention.keep_last);
      if (!victims.length) return;
      for (const b of victims) {
        this.log('info', `retention: deleting backup ${b.id} (${b.name}) of schedule ${schedule.id}`);
        await cinder.deleteBackup(b.id);
        await this.waitDeleted(cinder, b.id);
        run.deleted_backups.push(b.id);
        this.store.putRun(run);
      }
    }
  }

  async waitDeleted(cinder, id) {
    const deadline = Date.now() + this.cfg.deleteWaitSeconds * 1000;
    while (Date.now() < deadline) {
      try {
        const b = await cinder.getBackup(id);
        if (b?.status === 'error_deleting') throw new Error(`backup ${id} failed to delete`);
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return;
        throw e;
      }
      await sleep(this.cfg.pollMs);
    }
    throw new Error(`timed out waiting for backup ${id} to be deleted`);
  }
}
