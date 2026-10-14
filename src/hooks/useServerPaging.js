import { useState, useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';
import { getErrorMessage } from './useResource';

/**
 * Server-side pagination / filtering / sorting (port of legacy containers/List
 * isFilterByBackend + isSortByBackend + stores/base fetchListByPage).
 *
 * serverSide = {
 *   fetchPage: async ({ ctx, page, pageSize, limit, marker, offset, filters, sortKey, sortOrder, sortDir })
 *     => array | { items, total?|count?, hasNext?, marker? }
 *   defaultSortKey, defaultSortOrder ('descend' when a default key is set, like legacy),
 *   markerKey = 'id'            // legacy store markerKey: next page marker = last item[markerKey]
 *   pageSizeOptions = [10, 20, 50, 100], downloadPageSize = 100, downloadMax = 10000,
 *   maxWalk = 50                // pages fetched at most to resolve the marker of a jumped-to page
 * }
 *
 * - total comes from `total`/`count` when the backend returns it (skyline extension count);
 *   otherwise "has next" paging like legacy (next page enabled while a full page came back,
 *   or when the API tells `hasNext`, e.g. a `*_links` rel=next).
 * - markers[i] holds the marker used to fetch page i + 1 (markers[0] = none). Jumping to an
 *   unknown page walks the intermediate pages to collect their markers.
 * - refetch({ quiet }) reloads the current page with the same marker / filters / sort
 *   (manual refresh and the auto refresh watcher keep the page).
 */
export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const getPath = (obj, path) =>
  String(path || 'id')
    .split('.')
    .reduce((acc, k) => (acc === undefined || acc === null ? undefined : acc[k]), obj);

const toSortDir = (order) => {
  if (order === 'descend') return 'desc';
  if (order === 'ascend') return 'asc';
  return undefined;
};

/** drop empty values, trim strings (legacy trimFilters) */
export const cleanFilters = (filters = {}) => {
  const out = {};
  Object.entries(filters || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const value = typeof v === 'string' ? v.trim() : v;
    if (value === '' || (Array.isArray(value) && !value.length)) return;
    out[k] = value;
  });
  return out;
};

export const normalizePageResult = (res, { limit, offset = 0, markerKey = 'id' } = {}) => {
  const isArr = Array.isArray(res);
  const items = isArr ? res : Array.isArray(res?.items) ? res.items : [];
  let total;
  if (!isArr) {
    if (typeof res?.total === 'number') total = res.total;
    else if (typeof res?.count === 'number') total = res.count;
  }
  let hasNext;
  if (!isArr && typeof res?.hasNext === 'boolean') hasNext = res.hasNext;
  else if (total !== undefined) hasNext = offset + items.length < total;
  else hasNext = items.length >= limit;
  if (!items.length) hasNext = false;
  const last = items[items.length - 1];
  const nextMarker = !isArr && res?.marker !== undefined && res?.marker !== null ? res.marker : last ? getPath(last, markerKey) : undefined;
  return { items, total, hasNext, nextMarker };
};

export function useServerPaging({ serverSide, ctx, deps = [], initialFilters, enabled = true }) {
  const cfgRef = useRef(serverSide);
  cfgRef.current = serverSide;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const defaultSortKey = serverSide?.defaultSortKey;
  const defaultSortOrder = defaultSortKey ? serverSide?.defaultSortOrder || 'descend' : undefined;
  const pageSizeOptions = serverSide?.pageSizeOptions || DEFAULT_PAGE_SIZE_OPTIONS;
  const initialPageSize = pageSizeOptions.includes(serverSide?.pageSize) ? serverSide.pageSize : pageSizeOptions[0];

  const queryRef = useRef({
    page: 1,
    pageSize: initialPageSize,
    filters: cleanFilters(initialFilters),
    sortKey: defaultSortKey,
    sortOrder: defaultSortOrder,
  });
  const [query, setQueryState] = useState(queryRef.current);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState({ items: [], total: undefined, hasNext: false });
  const [loading, setLoading] = useState(false);
  const markersRef = useRef([null]);
  const reqRef = useRef(0);

  const callFetch = useCallback(async (q, page, marker, pageSize = q.pageSize) => {
    const cfg = cfgRef.current || {};
    const offset = (page - 1) * pageSize;
    const res = await cfg.fetchPage({
      ctx: ctxRef.current,
      page,
      pageSize,
      limit: pageSize,
      marker: marker === null ? undefined : marker,
      offset,
      filters: q.filters,
      sortKey: q.sortOrder ? q.sortKey : undefined,
      sortOrder: q.sortKey ? q.sortOrder : undefined,
      sortDir: q.sortKey ? toSortDir(q.sortOrder) : undefined,
    });
    return normalizePageResult(res, { limit: pageSize, offset, markerKey: cfg.markerKey });
  }, []);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!enabled || !cfgRef.current?.fetchPage) return undefined;
      const q = queryRef.current;
      const id = ++reqRef.current;
      if (!quiet) setLoading(true);
      try {
        const markers = markersRef.current;
        let target = q.page;
        // resolve the marker of a page that was not reached page by page yet
        const maxWalk = cfgRef.current.maxWalk ?? 50;
        let walked = 0;
        while (target > 1 && markers.length < target && walked < maxWalk) {
          const k = markers.length;
          // eslint-disable-next-line no-await-in-loop
          const step = await callFetch(q, k, markers[k - 1]);
          if (id !== reqRef.current) return undefined;
          walked += 1;
          if (!step.hasNext || step.nextMarker === undefined) {
            target = k;
            break;
          }
          markers[k] = step.nextMarker;
        }
        if (markers.length < target) target = markers.length;
        let res = await callFetch(q, target, markers[target - 1]);
        if (id !== reqRef.current) return undefined;
        // the page became empty (last rows deleted): step back like a user would
        let steppedBack = false;
        while (!res.items.length && target > 1) {
          steppedBack = true;
          target -= 1;
          // eslint-disable-next-line no-await-in-loop
          res = await callFetch(q, target, markers[target - 1]);
          if (id !== reqRef.current) return undefined;
        }
        // an empty page after a full one (neutron / nova give a next link on every full page)
        if (steppedBack) res = { ...res, hasNext: false };
        markers.length = target;
        if (res.hasNext && res.nextMarker !== undefined) markers[target] = res.nextMarker;
        if (target !== q.page) {
          queryRef.current = { ...q, page: target };
          setQueryState(queryRef.current);
        }
        setResult({ items: res.items, total: res.total, hasNext: res.hasNext });
        return res.items;
      } catch (err) {
        if (id === reqRef.current && !quiet) message.error(getErrorMessage(err));
        return undefined;
      } finally {
        if (id === reqRef.current && !quiet) setLoading(false);
      }
    },
    [enabled, callFetch]
  );

  // user driven query change -> reload (markers reset unless only the page moves)
  const update = useCallback((patch, { resetMarkers = true } = {}) => {
    queryRef.current = { ...queryRef.current, ...patch };
    if (resetMarkers) markersRef.current = [null];
    setQueryState(queryRef.current);
    setReloadKey((k) => k + 1);
  }, []);

  // context (project / admin page / parent deps) changed -> back to page 1
  const prevDepsRef = useRef([ctx, ...deps]);
  useEffect(() => {
    const next = [ctx, ...deps];
    const prev = prevDepsRef.current;
    if (prev.length === next.length && prev.every((v, i) => Object.is(v, next[i]))) return;
    prevDepsRef.current = next;
    update({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, ...deps]);

  useEffect(() => {
    load();
  }, [reloadKey, load]);

  const setPage = useCallback(
    (page, pageSize) => {
      const q = queryRef.current;
      if (pageSize && pageSize !== q.pageSize) update({ page: 1, pageSize });
      else if (page !== q.page) update({ page }, { resetMarkers: false });
    },
    [update]
  );
  const setFilters = useCallback((filters) => update({ page: 1, filters: cleanFilters(filters) }), [update]);
  const setSorter = useCallback(({ sortKey, sortOrder }) => update({ page: 1, sortKey, sortOrder }), [update]);

  /** every page with the current filters / sort (legacy Download "all data": 100 per page, max 10000) */
  const fetchAll = useCallback(
    async (onProgress) => {
      const cfg = cfgRef.current || {};
      const size = cfg.downloadPageSize || 100;
      const max = cfg.downloadMax || 10000;
      const q = queryRef.current;
      const all = [];
      let marker = null;
      let page = 1;
      let total;
      let more = false;
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const res = await callFetch(q, page, marker, size);
        if (total === undefined) total = res.total;
        all.push(...res.items);
        if (onProgress) onProgress({ loaded: all.length, total });
        const hasMore = res.hasNext && res.nextMarker !== undefined;
        if (!hasMore) break;
        if (all.length >= max) {
          more = true;
          break;
        }
        marker = res.nextMarker;
        page += 1;
      }
      return { items: all.slice(0, max), total, max, truncated: more || all.length > max };
    },
    [callFetch]
  );

  /** count of the items matching `filters` (needs a backend that returns `count`) */
  const countBy = useCallback(
    async (filters = {}) => {
      const q = { ...queryRef.current, filters: cleanFilters(filters) };
      const res = await callFetch(q, 1, null, 1);
      return res.total;
    },
    [callFetch]
  );

  const setItems = useCallback(
    (updater) => setResult((r) => ({ ...r, items: typeof updater === 'function' ? updater(r.items) : updater })),
    []
  );

  return {
    items: result.items,
    total: result.total,
    hasNext: result.hasNext,
    loading,
    refetch: load,
    page: query.page,
    pageSize: query.pageSize,
    pageSizeOptions,
    filters: query.filters,
    sortKey: query.sortKey,
    sortOrder: query.sortOrder,
    setPage,
    setFilters,
    setSorter,
    setItems,
    fetchAll,
    countBy,
  };
}

export default useServerPaging;

/**
 * Backend counts for KPI cards of server-side lists (the page only holds one page of rows).
 * specs: { key: filters | async () => number }. Values stay undefined until known
 * (callers fall back to the current page); re-evaluated when `refreshKey` changes.
 */
export function useRemoteCounts(countBy, specs, refreshKey) {
  const [counts, setCounts] = useState({});
  const specsRef = useRef(specs);
  specsRef.current = specs;
  useEffect(() => {
    if (!countBy) return undefined;
    let alive = true;
    const entries = Object.entries(specsRef.current || {});
    Promise.all(
      entries.map(async ([key, spec]) => {
        try {
          const value = typeof spec === 'function' ? await spec() : await countBy(spec);
          return [key, typeof value === 'number' ? value : undefined];
        } catch {
          return [key, undefined];
        }
      })
    ).then((pairs) => {
      if (alive) setCounts(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [countBy, refreshKey]);
  return counts;
}
