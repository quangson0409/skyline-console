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
