import apiClient from './client';

/**
 * Follows OpenStack "<key>_links" (rel=next) pagination so lists are never cut at the
 * service max page size (nova/cinder osapi_max_limit = 1000 by default).
 * Returns the first response with `<key>` holding every item.
 */
export const getAllPages = async (url, { key, params = {}, config = {}, maxPages = 50 } = {}) => {
  const first = await apiClient.get(url, { ...config, params });
  if (!first || !Array.isArray(first[key])) return first;
  const items = [...first[key]];
  let links = first[`${key}_links`];
  let page = 1;
  while (page < maxPages) {
    const next = Array.isArray(links) ? links.find((l) => l.rel === 'next') : null;
    if (!next?.href) break;
    const marker = new URLSearchParams(String(next.href).split('?')[1] || '').get('marker');
    if (!marker) break;
    // eslint-disable-next-line no-await-in-loop
    const res = await apiClient.get(url, { ...config, params: { ...params, marker } });
    const chunk = res?.[key] || [];
    if (!chunk.length) break;
    items.push(...chunk);
    links = res?.[`${key}_links`];
    page += 1;
  }
  return { ...first, [key]: items, [`${key}_links`]: undefined };
};

export default getAllPages;

/* ------------------------------------------------------------------------------------------
 * Single page helpers for server-side lists (legacy stores/base fetchListByPage).
 * ---------------------------------------------------------------------------------------- */

const markerFromHref = (href) => {
  if (!href) return undefined;
  const value = new URLSearchParams(String(href).split('?')[1] || '').get('marker');
  return value || undefined;
};

/**
 * GET one page and normalize it to { items, total, hasNext, marker, raw }.
 *  - total: `count` / `total` / designate `metadata.total_count`
 *  - hasNext / marker: OpenStack `<key>_links` rel=next (nova, cinder, neutron, manila) or
 *    designate `links.next`; left undefined when the API gives no links (page-size rule applies)
 */
export const getPage = async (url, { key, params = {}, config = {} } = {}) => {
  const res = await apiClient.get(url, { ...config, params });
  const items = Array.isArray(res?.[key]) ? res[key] : [];
  let total;
  if (typeof res?.count === 'number') total = res.count;
  else if (typeof res?.total === 'number') total = res.total;
  else if (typeof res?.metadata?.total_count === 'number') total = res.metadata.total_count;
  let hasNext;
  let marker;
  const links = res?.[`${key}_links`];
  if (Array.isArray(links)) {
    const next = links.find((l) => l.rel === 'next');
    hasNext = Boolean(next) && items.length > 0;
    marker = markerFromHref(next?.href);
  } else if (res?.links && typeof res.links === 'object' && !Array.isArray(res.links) && 'self' in res.links) {
    hasNext = Boolean(res.links.next) && items.length > 0;
    marker = markerFromHref(res.links.next);
  }
  return { items, total, hasNext, marker, raw: res };
};

/** sort params per API flavour (legacy store updateParamsSortPage) */
export const sortParams = (style, sortKey, sortDir) => {
  if (!sortKey || !sortDir) return {};
  switch (style) {
    case 'skyline': // skyline extension: sort_keys / sort_dirs
      return { sort_keys: sortKey, sort_dirs: sortDir };
    case 'heat':
      return { sort_keys: sortKey, sort_dir: sortDir };
    case 'cinder':
      return { sort: `${sortKey}:${sortDir}` };
    default: // nova, neutron, designate, manila, glance
      return { sort_key: sortKey, sort_dir: sortDir };
  }
};

/** limit + marker (omitted on page 1) */
export const pageParams = ({ limit, marker } = {}) => {
  const out = {};
  if (limit) out.limit = limit;
  if (marker) out.marker = marker;
  return out;
};
