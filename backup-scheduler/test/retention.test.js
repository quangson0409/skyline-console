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
