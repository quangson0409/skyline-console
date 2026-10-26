import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBackupsToDelete, schedulerTag } from '../src/retention.js';

const b = (id, day, extra = {}) => ({
  id,
  description: schedulerTag('S1'),
  status: 'available',
  has_dependent_backups: false,
  created_at: `2026-03-${String(day).padStart(2, '0')}T00:00:00.000000`,
  ...extra,
});
const ids = (l) => l.map((x) => x.id);

test('keeps newest keep_last, deletes oldest first', () => {
  const list = [b('c', 3), b('a', 1), b('d', 4), b('b', 2)];
  assert.deepEqual(ids(selectBackupsToDelete(list, 'S1', 2)), ['a', 'b']);
});

test('nothing to delete within keep_last', () => {
  assert.deepEqual(selectBackupsToDelete([b('a', 1), b('b', 2)], 'S1', 2), []);
  assert.deepEqual(selectBackupsToDelete([], 'S1', 1), []);
  assert.deepEqual(selectBackupsToDelete(null, 'S1', 1), []);
});

test('never touches backups it did not create', () => {
  const list = [b('a', 1), b('manual', 0, { description: '' }), b('other', 0, { description: schedulerTag('S2') }), b('b', 2), b('c', 3)];
  assert.deepEqual(ids(selectBackupsToDelete(list, 'S1', 1)), ['a', 'b']);
});

test('skips backups with dependent backups (incremental chain)', () => {
  const list = [b('a', 1, { has_dependent_backups: true }), b('b', 2, { has_dependent_backups: true }), b('c', 3)];
  assert.deepEqual(selectBackupsToDelete(list, 'S1', 1), []);
  const list2 = [b('a', 1, { has_dependent_backups: true }), b('b', 2), b('c', 3)];
  assert.deepEqual(ids(selectBackupsToDelete(list2, 'S1', 1)), ['b']);
});

test('only available backups count; creating/deleting are ignored', () => {
  const list = [b('a', 1), b('b', 2, { status: 'creating' }), b('c', 3, { status: 'deleting' }), b('d', 4)];
  assert.deepEqual(ids(selectBackupsToDelete(list, 'S1', 1)), ['a']);
});

test('errored backups of the schedule are cleaned up', () => {
  const list = [b('e', 1, { status: 'error' }), b('a', 2), b('b', 3)];
  assert.deepEqual(ids(selectBackupsToDelete(list, 'S1', 2)), ['e']);
});

test('keep_last is at least 1', () => {
  assert.deepEqual(ids(selectBackupsToDelete([b('a', 1), b('b', 2)], 'S1', 0)), ['a']);
});

/* ---- Proxmox style prune options ---- */
import { normalizeRetention, evaluateRetention } from '../src/retention.js';

const at = (id, iso, extra = {}) => ({ id, description: schedulerTag('S1'), status: 'available', has_dependent_backups: false, created_at: iso, ...extra });
const del = (list, retention, tz = 'UTC') => ids(selectBackupsToDelete(list, 'S1', retention, tz));

test('keep_daily keeps the newest backup of each of the last N days', () => {
  const list = [
    at('d1a', '2026-03-01T01:00:00'), at('d1b', '2026-03-01T13:00:00'),
    at('d2a', '2026-03-02T01:00:00'), at('d2b', '2026-03-02T13:00:00'),
    at('d3a', '2026-03-03T01:00:00'), at('d3b', '2026-03-03T13:00:00'),
  ];
  // 2 days: 03-03 (d3b) and 03-02 (d2b) survive, everything else goes
  assert.deepEqual(del(list, { keep_daily: 2 }).sort(), ['d1a', 'd1b', 'd2a', 'd3a']);
});

test('keep_hourly / keep_weekly / keep_monthly / keep_yearly use distinct periods', () => {
  const hourly = [at('a', '2026-03-01T10:05:00'), at('b', '2026-03-01T10:45:00'), at('c', '2026-03-01T11:10:00'), at('d', '2026-03-01T12:10:00')];
  assert.deepEqual(del(hourly, { keep_hourly: 2 }).sort(), ['a', 'b']); // d (12h) and c (11h)
  const weekly = [at('w1', '2026-03-02T00:00:00'), at('w1b', '2026-03-04T00:00:00'), at('w2', '2026-03-09T00:00:00'), at('w3', '2026-03-16T00:00:00')];
  assert.deepEqual(del(weekly, { keep_weekly: 2 }).sort(), ['w1', 'w1b']); // ISO weeks of 03-16 and 03-09
  const monthly = [at('m1', '2026-01-31T00:00:00'), at('m2', '2026-02-10T00:00:00'), at('m2b', '2026-02-20T00:00:00'), at('m3', '2026-03-05T00:00:00')];
  assert.deepEqual(del(monthly, { keep_monthly: 2 }).sort(), ['m1', 'm2']);
  const yearly = [at('y1', '2024-12-31T00:00:00'), at('y2', '2025-06-01T00:00:00'), at('y3', '2026-01-01T00:00:00'), at('y3b', '2026-02-01T00:00:00')];
  assert.deepEqual(del(yearly, { keep_yearly: 2 }).sort(), ['y1', 'y3']);
});

test('rules combine like Proxmox: a backup kept by any rule is kept', () => {
  const list = [];
  for (let day = 1; day <= 28; day += 1) list.push(at(`b${day}`, `2026-02-${String(day).padStart(2, '0')}T02:00:00`));
  const r = { keep_last: 3, keep_weekly: 2, keep_monthly: 1 };
  const kept = evaluateRetention(list, r).filter((e) => e.keep).map((e) => e.backup.id);
  // last 3: b28 b27 b26 ; weekly: newest of the last 2 ISO weeks = b28 (W09), b22 (W08, Feb 22 is Sunday); monthly: b28
  assert.deepEqual(kept.sort(), ['b22', 'b26', 'b27', 'b28']);
  assert.equal(evaluateRetention(list, r).find((e) => e.backup.id === 'b28').reasons.join(','), 'keep_last,keep_weekly,keep_monthly');
  assert.equal(del(list, r).length, 24);
});

test('periods follow the scheduler time zone', () => {
  // 18:30 UTC on 03-01 is 01:30 on 03-02 in Asia/Ho_Chi_Minh (UTC+7)
  const list = [at('x', '2026-03-01T18:30:00'), at('y', '2026-03-01T10:00:00')];
  assert.deepEqual(del(list, { keep_daily: 2 }, 'UTC'), ['y']); // same UTC day: one bucket, newest (x) kept
  assert.deepEqual(del(list, { keep_daily: 2 }, 'Asia/Ho_Chi_Minh'), []); // local days 03-02 and 03-01: both kept
});

test('keep_all removes nothing but failed backups of the schedule', () => {
  const list = [at('a', '2026-03-01T00:00:00'), at('b', '2026-03-02T00:00:00'), at('e', '2026-03-03T00:00:00', { status: 'error' })];
  assert.deepEqual(del(list, { keep_all: true }), ['e']);
});

test('incremental chains are still protected with sparse retention', () => {
  const list = [at('a', '2026-03-01T00:00:00', { has_dependent_backups: true }), at('b', '2026-03-02T00:00:00'), at('c', '2026-03-03T00:00:00')];
  assert.deepEqual(del(list, { keep_daily: 1 }), ['b']); // a is excess but has dependents
});

test('normalizeRetention validates like the API', () => {
  assert.deepEqual(normalizeRetention({ keep_last: 7 }), { keep_last: 7 });
  assert.deepEqual(normalizeRetention({ keep_last: 3, keep_daily: 7, keep_weekly: 4, keep_monthly: 6, keep_yearly: 1 }), { keep_last: 3, keep_daily: 7, keep_weekly: 4, keep_monthly: 6, keep_yearly: 1 });
  assert.deepEqual(normalizeRetention({ keep_last: 0, keep_daily: 5 }), { keep_daily: 5 });
  assert.deepEqual(normalizeRetention({ keep_all: true }), { keep_all: true });
  assert.throws(() => normalizeRetention({}), /at least one/);
  assert.throws(() => normalizeRetention({ keep_last: 0 }), /at least one/);
  assert.throws(() => normalizeRetention({ keep_all: true, keep_last: 2 }), /cannot be combined/);
  assert.throws(() => normalizeRetention({ keep_daily: 1.5 }), /integer/);
  assert.throws(() => normalizeRetention({ keep_daily: 5000 }), /between 1 and 1000/);
  assert.throws(() => normalizeRetention({ keep_foo: 1 }), /unknown retention option/);
});
