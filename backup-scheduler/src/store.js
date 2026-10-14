import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';

const MAX_RUNS = 50;

/** JSON file state with atomic writes (tmp + rename). Single process only. */
export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = join(dir, 'state.json');
    mkdirSync(dir, { recursive: true });
    this.state = { schedules: {}, runs: {} };
    if (existsSync(this.file)) {
      this.state = { schedules: {}, runs: {}, ...JSON.parse(readFileSync(this.file, 'utf8')) };
    }
  }

  save() {
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state), { mode: 0o600 });
    const fd = openSync(tmp, 'r+');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.file);
  }

  listSchedules() {
    return Object.values(this.state.schedules);
  }

  getSchedule(id) {
    return this.state.schedules[id] || null;
  }

  putSchedule(s) {
    this.state.schedules[s.id] = s;
    this.save();
    return s;
  }

  deleteSchedule(id) {
    delete this.state.schedules[id];
    delete this.state.runs[id];
    this.save();
  }

  /** newest first */
  listRuns(scheduleId) {
    return [...(this.state.runs[scheduleId] || [])].reverse();
  }

  /** Insert or replace a run (by id); keeps the last MAX_RUNS. */
  putRun(run) {
    const list = (this.state.runs[run.schedule_id] ||= []);
    const i = list.findIndex((r) => r.id === run.id);
    if (i >= 0) list[i] = run;
    else list.push(run);
    if (list.length > MAX_RUNS) list.splice(0, list.length - MAX_RUNS);
    this.save();
  }

  allRuns() {
    return Object.values(this.state.runs).flat();
  }
}
