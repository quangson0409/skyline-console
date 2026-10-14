import { useState, useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';

export const getErrorMessage = (err, fallback = 'Request failed') => {
  const data = err?.response?.data;
  if (data) {
    if (typeof data === 'string') return data;
    // OpenStack style: { badRequest: { message } }, { NeutronError: { message } }, { error: { message } }
    const first = Object.values(data).find((v) => v && typeof v === 'object' && v.message);
    if (first) return first.message;
    if (typeof data.message === 'string') return data.message;
    if (typeof data.detail === 'string') return data.detail;
    if (typeof data.faultstring === 'string') return data.faultstring;
  }
  return err?.message || fallback;
};

/** Toast a loader failure (deduplicated by key) so empty fallback data is not mistaken for real data */
export const notifyLoadError = (err, fallback, key) => {
  message.error({ key: key || fallback, content: getErrorMessage(err, fallback) });
};

/**
 * Generic async resource loader.
 * fetcher: async () => any   (re-created when deps change)
 */
export function useResource(fetcher, deps = [], { initial = [], silent = false, interval = 0 } = {}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await fetcherRef.current();
      setData(result ?? initial);
      setError(null);
      return result;
    } catch (err) {
      setError(err);
      if (!silent && !quiet) message.error(getErrorMessage(err));
      return undefined;
    } finally {
      if (!quiet) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!interval) return undefined;
    const timer = setInterval(() => load({ quiet: true }), interval);
    return () => clearInterval(timer);
  }, [interval, load]);

  return { data, setData, loading, error, refetch: load };
}

export default useResource;
