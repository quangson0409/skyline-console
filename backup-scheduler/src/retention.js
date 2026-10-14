// Pure retention selection (no I/O).

export const schedulerTag = (scheduleId) => `scheduler:${scheduleId}`;

const byAge = (a, b) =>
  String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id));

/**
 * Pick the backups to delete for a schedule.
 *  - only backups whose description is exactly `scheduler:<id>` are ever considered
 *  - only `available` backups count towards keep_last and can be deleted
 *    (an `error` backup created by the schedule is removed once it has no dependents)
 *  - the newest keep_last available backups are kept; older ones are deleted oldest first
 *  - a backup with dependent (incremental) backups is never selected
 * @returns {Array<object>} backups to delete, oldest first
 */
export function selectBackupsToDelete(backups, scheduleId, keepLast) {
  const keep = Math.max(1, Number.parseInt(keepLast, 10) || 1);
  const tag = schedulerTag(scheduleId);
  const owned = (Array.isArray(backups) ? backups : [])
    .filter((b) => b && typeof b === 'object' && b.description === tag)
    .sort(byAge);
  const available = owned.filter((b) => b.status === 'available');
  const excess = available.slice(0, Math.max(0, available.length - keep));
  const errored = owned.filter((b) => b.status === 'error');
  return [...errored, ...excess].filter((b) => !b.has_dependent_backups).sort(byAge);
}
