import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCron, nextRun, nextRuns, assertTimezone } from '../src/cron.js';

const iso = (ms) => new Date(ms).toISOString();
const at = (s) => Date.parse(s);

test('parse: basic fields, lists, ranges, steps, names', () => {
  const c = parseCron('*/15 0-2,22 1 jan,mar mon-fri');
  assert.deepEqual([...c.minute], [0, 15, 30, 45]);
  assert.deepEqual([...c.hour], [0, 1, 2, 22]);
  assert.deepEqual([...c.month], [1, 3]);
  assert.deepEqual([...c.dow], [1, 2, 3, 4, 5]);
  assert.equal(c.domStar, false);
});

test('parse: 7 means sunday, macros expand', () => {
  assert.deepEqual([...parseCron('0 0 * * 7').dow], [0]);
  assert.equal(parseCron('@daily').expr, '0 0 * * *');
  assert.equal(parseCron('@hourly').expr, '0 * * * *');
});

test('parse: rejects invalid expressions', () => {
  for (const bad of ['', '* * * *', '* * * * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '*/0 * * * *', '5-1 * * * *', 'a * * * *', '1,,2 * * * *', '*/x * * * *']) {
    assert.throws(() => parseCron(bad), Error, bad);
  }
  assert.throws(() => parseCron(null));
});

test('next: every minute and strictly after', () => {
  assert.equal(iso(nextRun('* * * * *', at('2026-03-10T10:00:00Z'))), '2026-03-10T10:01:00.000Z');
  assert.equal(iso(nextRun('* * * * *', at('2026-03-10T10:00:30Z'))), '2026-03-10T10:01:00.000Z');
});

test('next: hourly, daily, weekly, monthly presets', () => {
  const from = at('2026-03-10T10:20:00Z'); // Tuesday
  assert.equal(iso(nextRun('0 * * * *', from)), '2026-03-10T11:00:00.000Z');
  assert.equal(iso(nextRun('30 2 * * *', from)), '2026-03-11T02:30:00.000Z');
  assert.equal(iso(nextRun('0 3 * * 0', from)), '2026-03-15T03:00:00.000Z');
  assert.equal(iso(nextRun('0 0 1 * *', from)), '2026-04-01T00:00:00.000Z');
});

test('next: month/year rollover and leap day', () => {
  assert.equal(iso(nextRun('0 0 1 1 *', at('2026-12-31T23:59:00Z'))), '2027-01-01T00:00:00.000Z');
  assert.equal(iso(nextRun('0 0 29 2 *', at('2026-03-01T00:00:00Z'))), '2028-02-29T00:00:00.000Z');
  assert.equal(nextRun('0 0 31 2 *', at('2026-01-01T00:00:00Z')), null);
});

test('next: dom and dow both restricted match either', () => {
  // 2026-03-10 is a Tuesday; the 15th (Sunday) comes before the next Monday (16th)... but the 11th is not dom 15 nor Monday
  const r = nextRuns('0 0 15 * 1', at('2026-03-10T00:00:00Z'), 3);
  assert.deepEqual(r.map(iso), ['2026-03-15T00:00:00.000Z', '2026-03-16T00:00:00.000Z', '2026-03-23T00:00:00.000Z']);
});

test('next: step with ranges', () => {
  assert.equal(iso(nextRun('10-50/20 * * * *', at('2026-03-10T10:11:00Z'))), '2026-03-10T10:30:00.000Z');
  assert.equal(iso(nextRun('0 */6 * * *', at('2026-03-10T10:00:00Z'))), '2026-03-10T12:00:00.000Z');
});

test('timezone: Asia/Ho_Chi_Minh (UTC+7)', () => {
  assertTimezone('Asia/Ho_Chi_Minh');
  assert.equal(iso(nextRun('0 2 * * *', at('2026-03-10T10:00:00Z'), 'Asia/Ho_Chi_Minh')), '2026-03-10T19:00:00.000Z');
  assert.throws(() => assertTimezone('Not/AZone'));
});

test('timezone: DST spring forward and fall back (America/New_York)', () => {
  const tz = 'America/New_York';
  // before 2026-03-08 EST (-5): 09:00 local = 14:00Z ; after EDT (-4): 09:00 local = 13:00Z
  assert.equal(iso(nextRun('0 9 * * *', at('2026-03-07T20:00:00Z'), tz)), '2026-03-08T13:00:00.000Z');
  assert.equal(iso(nextRun('0 9 * * *', at('2026-03-06T20:00:00Z'), tz)), '2026-03-07T14:00:00.000Z');
  // fall back 2026-11-01: 09:00 EST = 14:00Z
  assert.equal(iso(nextRun('0 9 * * *', at('2026-10-31T20:00:00Z'), tz)), '2026-11-01T14:00:00.000Z');
  // results are strictly increasing across the transition
  const list = nextRuns('30 1 * * *', at('2026-10-30T00:00:00Z'), 5, tz);
  for (let i = 1; i < list.length; i++) assert.ok(list[i] > list[i - 1]);
});

test('nextRuns returns count ascending', () => {
  const r = nextRuns('*/30 * * * *', at('2026-01-01T00:00:00Z'), 4);
  assert.deepEqual(r.map(iso), ['2026-01-01T00:30:00.000Z', '2026-01-01T01:00:00.000Z', '2026-01-01T01:30:00.000Z', '2026-01-01T02:00:00.000Z']);
});
