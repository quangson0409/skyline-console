import React from 'react';
import { Link } from 'react-router-dom';
import { novaApi } from '@/api/nova';
import ResourcePage, { nameColumn, statusColumn, timeColumn, projectColumn } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { serverIps, serverStatusMap } from './index';

/**
 * Embedded instance table.
 *   fetchServers(ctx) -> raw nova servers (2.79 payload)
 */
export default function InstanceTable({ fetchServers, isAdmin, deps = [] }) {
  const projectMap = useProjectMap();
  const base = isAdmin ? 'instance-admin' : 'instance';
  return (
    <ResourcePage
      embedded
      deps={deps}
      fetch={async (ctx) => {
        const servers = await fetchServers(ctx);
        return (servers || []).map((s) => ({
          ...s,
          status: String(s.status || '').toLowerCase(),
          host: s['OS-EXT-SRV-ATTR:host'],
          flavor_name: s.flavor?.original_name || s.flavor?.id,
          project_id: s.tenant_id || s.project_id,
        }));
      }}
      columns={() =>
        [
          nameColumn({ linkTo: (r) => `/compute/${base}/detail/${r.id}` }),
          isAdmin && projectColumn(projectMap),
          isAdmin && { title: t('Host'), dataIndex: 'host', key: 'host', render: (v) => v || '-' },
          {
            title: t('Image'),
            dataIndex: 'image',
            key: 'image',
            render: (image) =>
              image && image.id ? (
                <Link to={`/compute/${isAdmin ? 'image-admin' : 'image'}/detail/${image.id}`}>{image.id}</Link>
              ) : (
                '-'
              ),
          },
          {
            title: t('Flavor'),
            dataIndex: 'flavor_name',
            key: 'flavor_name',
            render: (v, r) =>
              v ? (
                <div>
                  <div>{v}</div>
                  {r.flavor?.vcpus !== undefined ? (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {r.flavor.vcpus} vCPU / {r.flavor.ram} MiB / {r.flavor.disk} GiB
                    </div>
                  ) : null}
                </div>
              ) : (
                '-'
              ),
          },
          {
            title: t('IP Address'),
            key: 'ips',
            render: (_, r) => {
              const ips = serverIps(r);
              if (!ips.length) return '-';
              return ips.map((ip) => (
                <div key={`${ip.net}-${ip.addr}`} style={{ fontSize: 12 }}>
                  {ip.addr}
                  {ip.type === 'floating' ? <span style={{ color: '#94a3b8' }}> ({t('Floating IP')})</span> : null}
                </div>
              ));
            },
          },
          statusColumn({ textMap: serverStatusMap() }),
          timeColumn({ dataIndex: 'created' }),
        ].filter(Boolean)
      }
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'status', label: t('Status'), options: Object.entries(serverStatusMap()).map(([key, label]) => ({ key, label })) },
      ]}
    />
  );
}

/** Loads servers then keeps only the given ids (server group members) */
export const fetchServersByIds = async (ids = [], { isAdmin } = {}) => {
  if (!ids.length) return [];
  const res = await novaApi.listServersV(isAdmin ? { all_tenants: true } : {});
  const set = new Set(ids);
  return (res?.servers || []).filter((s) => set.has(s.id));
};
