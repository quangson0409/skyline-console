/**
 * Only the NAMES of the changed fields are ever stored, never values (no passwords, tokens,
 * user_data, keys). This module also strips query strings and short-cuts for error messages.
 */
const MAX_FIELDS = 40;

export function fieldNames(body, depth = 1) {
  const out = new Set();
  const walk = (node, prefix, level) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    for (const key of Object.keys(node)) {
      if (out.size >= MAX_FIELDS) return;
      const full = prefix ? `${prefix}.${key}` : key;
      if (level > 0 && node[key] && typeof node[key] === 'object' && !Array.isArray(node[key])) walk(node[key], full, level - 1);
      else out.add(full);
    }
  };
  walk(body, '', depth);
  return [...out].sort();
}

/** path without query string / fragment, bounded */
export const cleanPath = (url) => String(url).split(/[?#]/)[0].slice(0, 500);

/** short upstream error message (no stack traces, bounded) */
export function errorMessage(json, text = '') {
  let msg = '';
  if (json && typeof json === 'object') {
    const pick = (o) => o && (o.message || o.faultstring || o.error_message || o.detail || (typeof o.error === 'string' ? o.error : ''));
    msg = pick(json) || pick(json.error) || pick(json.NeutronError) || pick(Object.values(json)[0]);
  }
  if (!msg && text) msg = String(text);
  return String(msg || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}
