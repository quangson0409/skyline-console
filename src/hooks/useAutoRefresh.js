import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Port of the legacy list "watcher" (containers/List: dataDurationTransition / dataDurationAuto):
 * - while any item is in a transition status, refresh every 10s;
 * - otherwise, when auto refresh is on, refresh every 30s for at most 10 minutes;
 *   user operations (actions, refresh, selection, paging) reset that budget.
 */
export const TRANSITION_DURATION = 10 * 1000;
export const AUTO_DURATION = 30 * 1000;
export const AUTO_TOTAL = 10 * 60 * 1000;

const TRANSITION_RE =
  /(ing|^build|^pending|^queued|^reboot|^hard_reboot|^resize|^verify_resize|^migrat|^rescue$|^shelved$|in[-_]progress|^saving|^uploading|^attaching|^detaching|^backing-up|^restoring|^retyping|^extending|^maintenance$)/i;

// task_state / OS-EXT-STS:task_state set means nova is still working on the server
export const defaultIsTransition = (item = {}) => {
  if (!item || typeof item !== 'object') return false;
  if (item['OS-EXT-STS:task_state'] || item.task_state) return true;
  const status = item.status ?? item.provisioning_status ?? item.provision_state;
  if (typeof status !== 'string' || !status) return false;
  if (/^(error|active|available|in-use|down|up|shutoff|stopped|paused|suspended)$/i.test(status)) return false;
  return TRANSITION_RE.test(status);
};

export function useAutoRefresh({
  data,
  refetch,
  isTransition = defaultIsTransition,
  enabled = true,
  initialAuto = true,
}) {
  const [autoRefresh, setAutoRefresh] = useState(initialAuto);
  const countRef = useRef(0);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  const list = Array.isArray(data) ? data : data ? [data] : [];
  const hasTransition = enabled && list.some((it) => {
    try {
      return isTransition(it);
    } catch {
      return false;
    }
  });

  const resetAutoRefresh = useCallback(() => {
    countRef.current = 0;
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (hasTransition) {
      const timer = setTimeout(() => refetchRef.current({ quiet: true }), TRANSITION_DURATION);
      return () => clearTimeout(timer);
    }
    if (!autoRefresh || countRef.current * AUTO_DURATION >= AUTO_TOTAL) return undefined;
    const timer = setTimeout(() => {
      countRef.current += 1;
      refetchRef.current({ quiet: true });
    }, AUTO_DURATION);
    return () => clearTimeout(timer);
    // data identity changes after every load, which re-arms the next tick
  }, [data, hasTransition, autoRefresh, enabled]);

  const toggleAutoRefresh = useCallback((value) => {
    countRef.current = 0;
    setAutoRefresh(value);
  }, []);

  return { autoRefresh, setAutoRefresh: toggleAutoRefresh, resetAutoRefresh, hasTransition };
}

export default useAutoRefresh;
