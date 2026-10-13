import { useState, useCallback, useEffect } from 'react';
import { novaApi } from '@/api/nova';
import apiClient from '@/api/client';

const DEMO_SERVICES = [
  { key: '1', service: 'Nova (Compute API)', status: 'active', version: '28.0.0', latency: '12ms' },
  { key: '2', service: 'Neutron (SDN Network)', status: 'active', version: '23.1.0', latency: '18ms' },
  { key: '3', service: 'Cinder (Block Storage)', status: 'active', version: '23.0.0', latency: '15ms' },
  { key: '4', service: 'Keystone (Identity v3)', status: 'active', version: '24.0.0', latency: '8ms' },
  { key: '5', service: 'Glance (Image Registry)', status: 'active', version: '27.0.0', latency: '14ms' },
];

export function useOverview() {
  const [services, setServices] = useState(DEMO_SERVICES);
  const [loading, setLoading] = useState(false);
  const [isLiveApi, setIsLiveApi] = useState(false);
  const [stats, setStats] = useState({
    instances: { current: 24, max: 28, trend: '+4' },
    vcpus: { current: 48, max: 64, percent: 75 },
    ram: { current: 184, max: 256, percent: 72 },
    storage: { current: 3.4, max: 10, percent: 34 },
  });

  const fetchOverviewData = useCallback(async () => {
    setLoading(true);
    const start = performance.now();
    try {
      // Check Nova hypervisors or servers
      const [serversRes] = await Promise.allSettled([novaApi.listServers({ limit: 50 })]);

      const roundLatency = Math.round(performance.now() - start);

      if (serversRes.status === 'fulfilled' && serversRes.value?.servers) {
        setIsLiveApi(true);
        const serversCount = serversRes.value.servers.length;
        setStats((prev) => ({
          ...prev,
          instances: { current: serversCount, max: 50, trend: 'Live' },
        }));

        setServices((prev) =>
          prev.map((s) => ({
            ...s,
            latency: `${roundLatency}ms`,
            status: 'active',
          }))
        );
      } else {
        setIsLiveApi(false);
      }
    } catch {
      setIsLiveApi(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  return {
    services,
    stats,
    loading,
    isLiveApi,
    refetch: fetchOverviewData,
  };
}
