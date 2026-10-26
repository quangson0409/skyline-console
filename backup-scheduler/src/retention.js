// Pure retention selection (no I/O). Same model as the Proxmox "prune-backups" options:
//   keep_last, keep_hourly, keep_daily, keep_weekly, keep_monthly, keep_yearly  (and keep_all)
//
// Proxmox rule (PVE::Storage prune_mark_backup_group), applied to the backups of one schedule:
//   - newest first; each rule below marks backups to KEEP, a backup kept by any rule is kept
//   - keep_last N     : the N most recent backups
//   - keep_hourly N   : the newest backup of each of the last N distinct hours that have a backup
//   - keep_daily / keep_weekly (ISO week) / keep_monthly / keep_yearly: same with days / weeks / months / years
//   - periods are evaluated in the scheduler time zone (TZ)
//   - keep_all        : nothing is removed (cannot be combined with the other options)

export const schedulerTag = (scheduleId) => `scheduler:${scheduleId}`;

export const KEEP_KEYS = ['keep_last', 'keep_hourly', 'keep_daily', 'keep_weekly', 'keep_monthly', 'keep_yearly'];
export const MAX_KEEP = 1000;

/**
 * Validate / normalize a retention object from the API. Stores only the options in use.
 * Legacy `{ keep_last: n }` stays valid. Throws Error(message) on bad input.
 */
export function normalizeRetention(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('retention is required');
  const out = {};
  for (const key of Object.keys(r)) {
    if (key !== 'keep_all' && !KEEP_KEYS.includes(key)) throw new Error(`unknown retention option "${key}"`);
  }
  if (r.keep_all !== undefined && typeof r.keep_all !== 'boolean') throw new Error('retention.keep_all must be true or false');
  for (const key of KEEP_KEYS) {
    const n = r[key];
    if (n === undefined || n === null || n === 0) continue;
    if (!Number.isInteger(n) || n < 1 || n > MAX_KEEP) throw new Error(`retention.${key} must be an integer between 1 and ${MAX_KEEP}`);
    out[key] = n;
  }
  if (r.keep_all === true) {
    if (Object.keys(out).length) throw new Error('retention.keep_all cannot be combined with other keep options');
    return { keep_all: true };
  }
  if (!Object.keys(out).length) {
    throw new Error('retention needs at least one keep option (keep_last, keep_hourly, keep_daily, keep_weekly, keep_monthly, keep_yearly) or keep_all');
  }
  return out;
}

const byAge = (a, b) =>
  String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id));

/** Cinder returns UTC timestamps without a zone suffix */
const toDate = (s) => {
  const str = String(s);
  return new Date(/(Z|[+-]\d\d:?\d\d)$/.test(str) ? str : `${str}Z`);
};

const fmtCache = new Map();
function localParts(date, timeZone) {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
    fmtCache.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) };
}

/** ISO 8601 week id (year of the week's Thursday + week number) */
function isoWeek(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - yearStart) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

const pad = (n) => String(n).padStart(2, '0');
const PERIODS = {
  keep_hourly: (p) => `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.h)}`,
  keep_daily: (p) => `${p.y}-${pad(p.m)}-${pad(p.d)}`,
  keep_weekly: (p) => isoWeek(p.y, p.m, p.d),
  keep_monthly: (p) => `${p.y}-${pad(p.m)}`,
  keep_yearly: (p) => `${p.y}`,
};

/**
 * Decide, per available backup (newest first), whether retention keeps it.
 * @returns {Array<{ backup, keep: boolean, reasons: string[] }>} newest first
 */
export function evaluateRetention(availableBackups, retention, timeZone = 'UTC') {
  const list = [...availableBackups].sort(byAge).reverse();
  const reasons = new Map(list.map((b) => [b.id, []]));
  if (retention.keep_all === true) list.forEach((b) => reasons.get(b.id).push('keep_all'));

  if (retention.keep_last) {
    list.slice(0, retention.keep_last).forEach((b) => reasons.get(b.id).push('keep_last'));
  }
  for (const [rule, periodId] of Object.entries(PERIODS)) {
    let left = retention[rule];
    if (!left) continue;
    const seen = new Set();
    for (const b of list) {
      if (left <= 0) break;
      const id = periodId(localParts(toDate(b.created_at), timeZone));
      if (seen.has(id)) continue; // only the newest backup of a period counts
      seen.add(id);
      reasons.get(b.id).push(rule);
      left -= 1;
    }
  }
  return list.map((backup) => ({ backup, reasons: reasons.get(backup.id), keep: reasons.get(backup.id).length > 0 }));
}

/**
 * Pick the backups to delete for a schedule.
 *  - only backups whose description is exactly `scheduler:<id>` are ever considered
 *  - only `available` backups are evaluated by the keep rules and can be deleted
 *    (an `error` backup created by the schedule is removed once it has no dependents)
 *  - a backup with dependent (incremental) backups is never selected
 * @param retention object from normalizeRetention (a bare number is read as keep_last)
 * @returns {Array<object>} backups to delete, oldest first
 */
export function selectBackupsToDelete(backups, scheduleId, retention, timeZone = 'UTC') {
  const rules =
    typeof retention === 'number' || typeof retention === 'string'
      ? { keep_last: Math.max(1, Number.parseInt(retention, 10) || 1) }
      : retention || { keep_last: 1 };
  const tag = schedulerTag(scheduleId);
  const owned = (Array.isArray(backups) ? backups : [])
    .filter((b) => b && typeof b === 'object' && b.description === tag)
    .sort(byAge);
  const available = owned.filter((b) => b.status === 'available');
  const excess = evaluateRetention(available, rules, timeZone)
    .filter((e) => !e.keep)
    .map((e) => e.backup);
  const errored = owned.filter((b) => b.status === 'error');
  return [...errored, ...excess].filter((b) => !b.has_dependent_backups).sort(byAge);
}
