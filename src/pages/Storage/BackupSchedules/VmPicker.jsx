import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Input, Table, Tag, Typography } from 'antd';
import { cinderApi } from '@/api/cinder';
import { novaApi } from '@/api/nova';
import { t } from '@/core/i18n';

const { Text } = Typography;

/** a schedule backs up at most this many instances (service limit MAX_VMS_PER_SCHEDULE, default 30) */
export const MAX_VMS = 30;

/** instances of the project with the Cinder volumes attached to each of them */
export const loadVmOptions = async () => {
  const [serversRes, volumes] = await Promise.all([novaApi.listServersV({}), cinderApi.listVolumes({})]);
  const volumeById = Object.fromEntries((Array.isArray(volumes?.volumes) ? volumes.volumes : []).map((v) => [v.id, v]));
  const servers = Array.isArray(serversRes?.servers) ? serversRes.servers : [];
  return servers
    .map((sv) => {
      const attached = (sv['os-extended-volumes:volumes_attached'] || []).map((a) => volumeById[a.id] || { id: a.id, name: '', size: 0 });
      return {
        id: sv.id,
        name: sv.name || sv.id.slice(0, 8),
        status: sv.status,
        volumes: attached,
        totalGiB: attached.reduce((n, v) => n + (Number(v.size) || 0), 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Table to pick the instances to back up (Proxmox style: choose guests, every attached disk is included).
 * value / onChange: [{ id, name }]
 */
export default function VmPicker({ value, onChange }) {
  const selected = Array.isArray(value) ? value : [];
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    loadVmOptions()
      .then((rows) => alive && setState({ loading: false, rows, error: '' }))
      .catch((e) => alive && setState({ loading: false, rows: [], error: e?.message || t('Operation failed') }));
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.rows;
    return state.rows.filter((r) => `${r.name} ${r.id} ${r.volumes.map((v) => v.name).join(' ')}`.toLowerCase().includes(q));
  }, [state.rows, search]);

  const byId = useMemo(() => Object.fromEntries(state.rows.map((r) => [r.id, r])), [state.rows]);
  const selectedIds = selected.map((x) => x.id);
  const full = selected.length >= MAX_VMS;

  const toVm = (r) => ({ id: r.id, name: r.name });
  const setSelection = (ids) => onChange?.(ids.map((id) => toVm(byId[id] || selected.find((x) => x.id === id) || { id, name: '' })));

  const summary = useMemo(() => {
    const chosen = selectedIds.map((id) => byId[id]).filter(Boolean);
    return { volumes: chosen.reduce((n, r) => n + r.volumes.length, 0), gib: chosen.reduce((n, r) => n + r.totalGiB, 0) };
  }, [selectedIds, byId]);

  return (
    <div>
      {state.error ? <Alert type="error" showIcon message={state.error} style={{ marginBottom: 8 }} /> : null}
      <Input.Search
        allowClear
        placeholder={t('Search by instance name, ID or volume name')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <Table
        size="small"
        rowKey="id"
        loading={state.loading}
        dataSource={rows}
        pagination={{ pageSize: 8, size: 'small', showSizeChanger: false, hideOnSinglePage: true }}
        scroll={{ y: 280 }}
        rowSelection={{
          selectedRowKeys: selectedIds,
          preserveSelectedRowKeys: true,
          getCheckboxProps: (r) => ({ disabled: !r.volumes.length || (full && !selectedIds.includes(r.id)) }),
          onSelect: (r, checked) => setSelection(checked ? [...selectedIds, r.id] : selectedIds.filter((id) => id !== r.id)),
          onSelectAll: (checked, _sel, changed) => {
            const ids = changed.filter((r) => r.volumes.length).map((r) => r.id);
            if (!checked) return setSelection(selectedIds.filter((id) => !ids.includes(id)));
            const next = [...selectedIds];
            ids.forEach((id) => next.length < MAX_VMS && !next.includes(id) && next.push(id));
            return setSelection(next);
          },
        }}
        columns={[
          {
            title: t('Instance'),
            dataIndex: 'name',
            key: 'name',
            render: (v, r) => (
              <div>
                <div style={{ fontWeight: 600 }}>{v}</div>
                <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {r.id.slice(0, 8)}
                </Text>
              </div>
            ),
          },
          {
            title: t('Status'),
            dataIndex: 'status',
            key: 'status',
            width: 90,
            render: (v) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v}</Tag>,
          },
          {
            title: t('Volumes'),
            dataIndex: 'volumes',
            key: 'volumes',
            render: (vols) =>
              vols.length ? (
                vols.map((v) => (
                  <div key={v.id} style={{ fontSize: 12 }}>
                    {v.name || v.id.slice(0, 8)} {v.size ? <Text type="secondary">({v.size} GiB)</Text> : null}
                  </div>
                ))
              ) : (
                <Tag>{t('No volumes (local disk)')}</Tag>
              ),
          },
          { title: t('Total (GiB)'), dataIndex: 'totalGiB', key: 'totalGiB', width: 90, align: 'right', render: (v) => v || '-' },
        ]}
      />
      <div style={{ marginTop: 8, fontSize: 12 }}>
        <Text type={full ? 'warning' : 'secondary'}>
          {t('{n} of {max} instances selected', { n: selected.length, max: MAX_VMS })} · {t('{v} volumes, {g} GiB in total', { v: summary.volumes, g: summary.gib })}
        </Text>
        <div>
          <Text type="secondary">
            {t('Volumes are backed up one after another; a volume that fails is skipped and the next one still runs. Instances without Cinder volumes cannot be backed up.')}
          </Text>
        </div>
      </div>
    </div>
  );
}
