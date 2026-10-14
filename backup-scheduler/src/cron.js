// Minimal 5-field cron parser and next-run calculator (timezone aware, no dependencies).
// Fields: minute hour day-of-month month day-of-week. Supports * , - / lists, month/day names,
// day-of-week 0-7 (0 and 7 = Sunday) and @hourly @daily @weekly @monthly @yearly.
// Day-of-month and day-of-week follow the classic rule: when both are restricted, either may match.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MACROS = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
};

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: MONTHS, offset: 1 },
  { name: 'day-of-week', min: 0, max: 7, names: DAYS, offset: 0 },
];

function parseValue(raw, field) {
  const lower = raw.toLowerCase();
  if (field.names) {
    const i = field.names.indexOf(lower);
    if (i >= 0) return i + field.offset;
  }
  if (!/^\d+$/.test(raw)) throw new Error(`invalid value "${raw}" in ${field.name}`);
  const n = Number(raw);
  if (n < field.min || n > field.max) throw new Error(`${field.name} value ${n} out of range ${field.min}-${field.max}`);
  return n;
}

function parseField(text, field) {
  const set = new Set();
  let star = false;
  const topMax = field.name === 'day-of-week' ? 6 : field.max;
  for (const part of text.split(',')) {
    if (!part) throw new Error(`empty list item in ${field.name}`);
    const [rangePart, stepPart, extra] = part.split('/');
    if (extra !== undefined) throw new Error(`invalid step in ${field.name}`);
    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart) || Number(stepPart) < 1) throw new Error(`invalid step "${stepPart}" in ${field.name}`);
      step = Number(stepPart);
    }
    let lo;
    let hi;
    if (rangePart === '*') {
      lo = field.min;
      hi = topMax;
      if (stepPart === undefined) star = true;
    } else if (rangePart.includes('-')) {
      const [a, b, more] = rangePart.split('-');
      if (more !== undefined) throw new Error(`invalid range in ${field.name}`);
      lo = parseValue(a, field);
      hi = parseValue(b, field);
      if (lo > hi) throw new Error(`range ${rangePart} is reversed in ${field.name}`);
    } else {
      lo = parseValue(rangePart, field);
      hi = stepPart !== undefined ? topMax : lo;
    }
    for (let v = lo; v <= hi; v += step) set.add(field.name === 'day-of-week' && v === 7 ? 0 : v);
  }
  return { set, star };
}

/** Parse a cron expression. Throws Error with a readable message when invalid. */
export function parseCron(expr) {
  if (typeof expr !== 'string') throw new Error('cron must be a string');
  let text = expr.trim().replace(/\s+/g, ' ');
  if (MACROS[text.toLowerCase()]) text = MACROS[text.toLowerCase()];
  const parts = text.split(' ');
  if (parts.length !== 5) throw new Error('cron must have exactly 5 fields (minute hour day-of-month month day-of-week)');
  const parsed = parts.map((p, i) => parseField(p, FIELDS[i]));
  return {
    expr: text,
    minute: parsed[0].set,
    hour: parsed[1].set,
    dom: parsed[2].set,
    month: parsed[3].set,
    dow: parsed[4].set,
    domStar: parsed[2].star,
    dowStar: parsed[4].star,
  };
}

const formatters = new Map();
function formatter(tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function assertTimezone(tz) {
  try {
    formatter(tz);
  } catch {
    throw new Error(`invalid timezone "${tz}"`);
  }
}

const isUtc = (tz) => !tz || tz === 'UTC' || tz === 'Etc/UTC';

/** Wall-clock fields of an instant in tz, encoded as a UTC-based timestamp. */
function wallOf(ts, tz) {
  if (isUtc(tz)) return ts;
  const p = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(ts))) p[type] = Number(value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

function offsetAt(ts, tz) {
  return wallOf(ts, tz) - Math.floor(ts / 1000) * 1000;
}

function wallToInstant(wall, tz) {
  if (isUtc(tz)) return wall;
  const off1 = offsetAt(wall, tz);
  let t = wall - off1;
  const off2 = offsetAt(t, tz);
  if (off2 !== off1) t = wall - off2;
  return t;
}

function dayMatches(spec, y, mo, d) {
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const domOk = spec.dom.has(d);
  const dowOk = spec.dow.has(dow);
  if (spec.domStar && spec.dowStar) return true;
  if (spec.domStar) return dowOk;
  if (spec.dowStar) return domOk;
  return domOk || dowOk;
}

/** Next matching instant (ms) strictly after `afterMs` in tz, or null when none within ~8 years. */
export function nextRun(specOrExpr, afterMs, tz = 'UTC') {
  const spec = typeof specOrExpr === 'string' ? parseCron(specOrExpr) : specOrExpr;
  const start = Math.floor(afterMs / 60000) * 60000 + 60000;
  let wall = Math.floor(wallOf(start, tz) / 60000) * 60000;
  const limitYear = new Date(wall).getUTCFullYear() + 8;
  for (let guard = 0; guard < 200000; guard++) {
    const dt = new Date(wall);
    const y = dt.getUTCFullYear();
    if (y > limitYear) return null;
    const mo = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    const h = dt.getUTCHours();
    const mi = dt.getUTCMinutes();
    if (!spec.month.has(mo)) {
      wall = Date.UTC(y, mo, 1, 0, 0);
    } else if (!dayMatches(spec, y, mo, d)) {
      wall = Date.UTC(y, mo - 1, d + 1, 0, 0);
    } else if (!spec.hour.has(h)) {
      wall = Date.UTC(y, mo - 1, d, h + 1, 0);
    } else if (!spec.minute.has(mi)) {
      wall += 60000;
    } else {
      const instant = wallToInstant(wall, tz);
      if (instant > afterMs) return instant;
      wall += 60000;
    }
  }
  return null;
}

/** The next `count` run instants after `afterMs`. */
export function nextRuns(expr, afterMs, count = 3, tz = 'UTC') {
  const spec = parseCron(expr);
  const out = [];
  let cur = afterMs;
  while (out.length < count) {
    const n = nextRun(spec, cur, tz);
    if (n === null) break;
    out.push(n);
    cur = n;
  }
  return out;
}
