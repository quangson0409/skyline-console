import { useEffect, useState } from 'react';
import { keystoneApi } from '@/api/keystone';
import { useAuthStore } from '@/store/authStore';

let cache = null;
let pending = null;

const loadProjects = () => {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = keystoneApi
      .listProjects()
      .then((res) => {
        cache = Object.fromEntries((res?.projects || []).map((p) => [p.id, p.name]));
        return cache;
      })
      .catch(() => {
        // non-admin users cannot list projects: fall back to the projects in the session
        const { projects = [] } = useAuthStore.getState();
        cache = Object.fromEntries(projects.map((p) => [p.id, p.name]));
        return cache;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
};

export const invalidateProjectMap = () => {
  cache = null;
};

/** { [projectId]: projectName } - used by admin list pages for the "Project" column */
export function useProjectMap() {
  const [map, setMap] = useState(cache || {});
  useEffect(() => {
    let alive = true;
    loadProjects().then((m) => alive && setMap(m));
    return () => {
      alive = false;
    };
  }, []);
  return map;
}

export default useProjectMap;
