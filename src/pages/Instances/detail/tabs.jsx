/**
 * Instance detail tabs ported from legacy Instance/Detail/index.jsx:
 * Volumes (embedded Volume list), Snapshots (embedded InstanceSnapshot list), Interfaces
 * (embedded Port list), Floating IPs (embedded FloatingIp list), Action Logs, Logs and the
 * Console tab (os-remote-consoles; target of the Console action fallback).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Empty,
  InputNumber,
  Modal,
  Popover,
  Select,
  Space,
  Spin,
  Table,
  Tag,
} from 'antd';
import {
  ExportOutlined,
  FullscreenOutlined,
  PlusOutlined,
  ReloadOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import ResourcePage, { formatTime, IdNameCell } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { useAuthStore } from '@/store/authStore';
import { novaApi } from '@/api/nova';
import { cinderApi } from '@/api/cinder';
import { t } from '@/core/i18n';
import { volumeColumns, volumeActionConfigs, updateVolume } from '@/pages/Storage/Volumes/volumeShared';
import { fetchInstanceSnapshots, snapshotColumns, snapshotRowActions } from '@/pages/Compute/InstanceSnapshots/SnapshotList';
import { PortsEmbedded } from '@/pages/Network/Port/PortList';
import { fetchFloatingIps, floatingIpColumns } from '@/pages/Networks/FloatingIps/FloatingIpList';
import { disassociateAction } from '@/pages/Networks/FloatingIps/actions';
import { getRemoteConsoleUrl, consoleErrorMessage } from '../actions';
import { loadServerVolumes } from '../actions/common';
import { actionMap, actionEvent, isActiveOrRescue, isIronicInstance } from '../resources';

const TabHeader = ({ title, count, description, children }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 16,
      background: '#f8fafc',
      padding: '12px 16px',
      borderRadius: 8,
      border: '1px solid #e2e8f0',
    }}
  >
    <div>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{title}</span>
        {count !== undefined ? (
          <Tag color="blue" style={{ margin: 0, fontWeight: 600 }}>
            {count}
          </Tag>
        ) : null}
      </div>
      {description ? <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{description}</div> : null}
    </div>
    <Space wrap>{children}</Space>
  </div>
);

/* ------------------------------------------------------------------ */
/* Volumes (legacy Volume container, instanceDetailConfig actions)     */
/* ------------------------------------------------------------------ */
export function VolumesTab({ item, isAdminPage, attachButton }) {
  const projectMap = useProjectMap();
  const navigate = useNavigate();
  const [count, setCount] = useState();
  const deleteOnTermination = Object.fromEntries((item.volumes_attached || []).map((v) => [v.id, v.delete_on_termination]));
  const configs = volumeActionConfigs({ isAdmin: isAdminPage, navigate });
  return (
    <div>
      <TabHeader
        title={t('Attached Volumes')}
        count={count}
        description={t('Manage block storage volumes attached to this compute instance.')}
      >
        {attachButton}
      </TabHeader>
      <ResourcePage
        embedded
        deps={[item.id]}
        fetch={async () => {
          const vols = await loadServerVolumes(item);
          setCount(vols.length);
          return vols.map((v) => ({ ...updateVolume(v), device: v.__attachment?.device }));
        }}
        columns={({ isAdmin }) => [
          ...volumeColumns({ isAdmin, projectMap, hideAttachments: true }),
          {
            title: t('Device'),
            dataIndex: 'device',
            key: 'device',
            render: (v) => <code>{v || '-'}</code>,
          },
          {
            title: t('Delete on Termination'),
            dataIndex: 'id',
            key: 'delete_on_termination',
            render: (id) => (deleteOnTermination[id] ? <Tag color="orange">{t('Yes')}</Tag> : <Tag>{t('No')}</Tag>),
          },
        ]}
        filterParams={[{ name: 'name', label: t('Name') }]}
        rowActions={configs.rowActions}
        autoRefreshEnabled={false}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Snapshots (legacy InstanceSnapshotStore.listDidFetch with id)       */
/* ------------------------------------------------------------------ */
export const fetchServerSnapshots = async (item, { isAdmin, projectId } = {}) => {
  const snapshots = await fetchInstanceSnapshots({ isAdmin, projectId, owner: item.tenant_id || item.project_id });
  if (!snapshots.length) return [];
  const [snapRes, attRes] = await Promise.all([
    cinderApi.listSnapshots(isAdmin ? { all_tenants: true } : {}).catch(() => ({})),
    novaApi.listVolumeAttachmentsV(item.id).catch(() => ({})),
  ]);
  const volumeSnapshots = snapRes?.snapshots || [];
  const attachments = attRes?.volumeAttachments || [];
  return snapshots.filter((snap) => {
    if (snap.instance_id === item.id) return true;
    let bdm = [];
    try {
      bdm = JSON.parse(snap.block_device_mapping || '[]') || [];
    } catch {
      bdm = [];
    }
    const boot = bdm.find((it) => it.boot_index === 0);
    if (boot) {
      const detail = volumeSnapshots.find((it) => it.id === boot.snapshot_id);
      return !!detail && attachments.some((a) => a.volumeId === detail.volume_id);
    }
    return snap.instance_uuid === item.id;
  });
};

export function SnapshotsTab({ item }) {
  const projectMap = useProjectMap();
  const navigate = useNavigate();
  return (
    <ResourcePage
      embedded
      deps={[item.id]}
      fetch={(ctx) => fetchServerSnapshots(item, ctx)}
      columns={({ isAdmin }) => snapshotColumns({ isAdmin, projectMap })}
      filterParams={[{ name: 'name', label: t('Name') }]}
      rowActions={({ isAdmin }) => snapshotRowActions({ isAdmin, navigate })}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Interfaces (legacy Port container in the instance detail)           */
/* ------------------------------------------------------------------ */
export function InterfacesTab({ item, count, attachButton }) {
  return (
    <div>
      <TabHeader
        title={t('Network Interfaces')}
        count={count}
        description={t('Manage virtual NIC ports and network attachments connected to this compute instance.')}
      >
        {attachButton}
      </TabHeader>
      <PortsEmbedded instanceId={item.id} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Floating IPs (legacy FloatingIp container filtered by fixed IPs)    */
/* ------------------------------------------------------------------ */
export function FloatingIpsTab({ item, isAdminPage, associateButton }) {
  const projectMap = useProjectMap();
  const ips = item.fixed_addresses || [];
  return (
    <div>
      <TabHeader title={t('Floating IPs')} count={(item.floating_addresses || []).length}>
        {associateButton}
      </TabHeader>
      <ResourcePage
        embedded
        deps={[item.id, ips.join(',')]}
        fetch={async (ctx) => {
          if (!ips.length) return [];
          const list = await fetchFloatingIps(ctx);
          return list.filter(
            (fip) =>
              fip.fixed_ip_address &&
              ips.includes(fip.fixed_ip_address) &&
              (!fip.port_details?.device_id || fip.port_details.device_id === item.id)
          );
        }}
        columns={({ isAdmin }) => floatingIpColumns({ isAdmin, projectMap })}
        filterParams={[{ name: 'floating_ip_address', label: t('Floating IP') }]}
        // legacy instanceDetailConfigs: Disassociate (no action on the administrator page)
        rowActions={isAdminPage ? undefined : { firstAction: disassociateAction(), moreActions: [] }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Action Logs (legacy actionColumn + PopActionEvent)                  */
/* ------------------------------------------------------------------ */
function ActionEventsPopover({ serverId, requestId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const events = actionEvent();
  const load = async () => {
    if (data) return;
    setLoading(true);
    try {
      const res = await novaApi.getInstanceActionV(serverId, requestId);
      setData((res?.instanceAction?.events || []).slice().reverse());
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };
  const content = (
    <Table
      size="small"
      rowKey={(r, i) => `${r.event}-${i}`}
      loading={loading}
      dataSource={data || []}
      pagination={false}
      style={{ width: 640 }}
      columns={[
        { title: t('Operation Name'), dataIndex: 'event', key: 'event', render: (v) => events[v] || v },
        { title: t('Start Time'), dataIndex: 'start_time', key: 'start_time', render: (v) => formatTime(v) },
        { title: t('End Time'), dataIndex: 'finish_time', key: 'finish_time', render: (v) => (v ? formatTime(v) : '-') },
        {
          title: t('Execution Result'),
          dataIndex: 'result',
          key: 'result',
          render: (v) => (v === 'Success' ? t('Success') : v || '-'),
        },
      ]}
    />
  );
  return (
    <Popover content={content} trigger="click" onOpenChange={(open) => open && load()} placement="left">
      <Button type="link" size="small" icon={<UnorderedListOutlined />} style={{ padding: '0 4px' }} />
    </Popover>
  );
}

export function ActionLogTab({ item, isAdminPage }) {
  const projectMap = useProjectMap();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const map = actionMap();
  return (
    <ResourcePage
      embedded
      rowKey="request_id"
      deps={[item.id]}
      fetch={async () => {
        const res = await novaApi.listInstanceActionsV(item.id);
        return (res?.instanceActions || []).map((it) => ({ ...it, project_name: projectMap[it.project_id] }));
      }}
      columns={[
        { title: t('Operation Name'), dataIndex: 'action', key: 'action', render: (v) => <Tag color="blue">{map[v] || v}</Tag> },
        isAdminPage && {
          title: t('Project ID/Name'),
          dataIndex: 'project_id',
          key: 'project_id',
          render: (v, r) => <IdNameCell id={v} name={r.project_name} bold={false} />,
        },
        {
          title: t('Operation Time'),
          dataIndex: 'start_time',
          key: 'start_time',
          sorter: (a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')),
          render: (v) => formatTime(v),
        },
        {
          title: t('Request ID'),
          dataIndex: 'request_id',
          key: 'request_id',
          render: (v, r) => (
            <span style={{ whiteSpace: 'nowrap' }}>
              <code style={{ fontSize: 11 }}>{v}</code>
              <ActionEventsPopover serverId={r.instance_uuid || item.id} requestId={v} />
            </span>
          ),
        },
        {
          title: t('User ID'),
          dataIndex: 'user_id',
          key: 'user_id',
          render: (v) => {
            if (!v) return '-';
            if (isAdminPage) return <Link to={`/identity/user-admin/detail/${v}`}>{v}</Link>;
            return v === currentUserId ? `${v} (${t('Current User')})` : v;
          },
        },
        {
          title: t('Result'),
          dataIndex: 'message',
          key: 'message',
          render: (msg) => (msg ? <Tag color="error">{msg}</Tag> : <Tag color="success">{t('Success')}</Tag>),
        },
      ].filter(Boolean)}
      filterParams={[{ name: 'action', label: t('Operation Name') }]}
      autoRefreshEnabled={false}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Logs (legacy Detail/Log: console output with a length)              */
/* ------------------------------------------------------------------ */
export function LogsTab({ item }) {
  const [length, setLength] = useState(35);
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [full, setFull] = useState(null);

  const load = useCallback(
    async (len) => {
      setLoading(true);
      try {
        const res = await novaApi.serverActionV(item.id, { 'os-getConsoleOutput': { length: len } });
        setLogs(res?.output || '');
      } catch {
        setLogs('');
      } finally {
        setLoading(false);
      }
    },
    [item.id]
  );

  useEffect(() => {
    load(35);
  }, [load]);

  const openFull = async () => {
    setFull({ loading: true, text: '' });
    try {
      const res = await novaApi.serverActionV(item.id, { 'os-getConsoleOutput': { length: null } });
      setFull({ loading: false, text: res?.output || '' });
    } catch {
      setFull({ loading: false, text: '' });
    }
  };

  const preStyle = {
    background: '#0f172a',
    color: '#38bdf8',
    padding: 16,
    borderRadius: 8,
    fontFamily: 'Consolas, Monaco, monospace',
    fontSize: 12,
    lineHeight: 1.5,
    maxHeight: 520,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{t('Instance Console Log')}</h3>
        <Space wrap>
          <span>{t('Log Length')}:</span>
          <InputNumber id="instance-log-length" min={1} max={100000} value={length} onChange={(v) => setLength(v || 1)} />
          <Select
            value={null}
            placeholder={t('Last log lines')}
            style={{ width: 130 }}
            onChange={(v) => {
              setLength(v);
              load(v);
            }}
            options={[50, 100, 200, 500].map((v) => ({ value: v, label: String(v) }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load(length)} loading={loading}>
            {t('Refresh')}
          </Button>
          <Button type="primary" icon={<FullscreenOutlined />} onClick={openFull}>
            {t('View Full Log')}
          </Button>
        </Space>
      </div>
      <Spin spinning={loading}>
        <pre style={preStyle}>{logs || t('No Logs...')}</pre>
      </Spin>
      <Modal
        open={Boolean(full)}
        title={t('Instance Console Log')}
        width="90vw"
        footer={null}
        onCancel={() => setFull(null)}
        destroyOnHidden
      >
        <Spin spinning={Boolean(full?.loading)}>
          <pre style={{ ...preStyle, maxHeight: '75vh' }}>{full?.text || t('No Logs...')}</pre>
        </Spin>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Console (os-remote-consoles; target of the Console fallback)        */
/* ------------------------------------------------------------------ */
export function ConsoleTab({ item }) {
  const ironic = isIronicInstance(item);
  const [kind, setKind] = useState(ironic ? 'serial' : 'auto');
  const [state, setState] = useState({ loading: false, url: '', error: '', kind: '' });
  const canConnect = isActiveOrRescue(item);

  const connect = useCallback(
    async (k = kind) => {
      setState({ loading: true, url: '', error: '', kind: '' });
      try {
        const res = await getRemoteConsoleUrl(item, k === 'auto' ? undefined : k);
        setState({ loading: false, url: res.url, error: '', kind: res.kind });
      } catch (err) {
        setState({ loading: false, url: '', error: consoleErrorMessage(err) || t('Failed to open console'), kind: '' });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item.id, kind]
  );

  useEffect(() => {
    if (canConnect) connect(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, canConnect]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <span>{t('Console Type')}:</span>
          <Select
            id="instance-console-type"
            value={kind}
            onChange={(v) => {
              setKind(v);
              connect(v);
            }}
            style={{ width: 180 }}
            options={[
              { value: 'auto', label: t('Automatic') },
              { value: 'novnc', label: 'noVNC' },
              { value: 'spice', label: 'SPICE (HTML5)' },
              { value: 'serial', label: t('Serial Console') },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => connect(kind)} loading={state.loading} disabled={!canConnect}>
            {t('Reconnect')}
          </Button>
        </Space>
        {state.url ? (
          <Button type="primary" icon={<ExportOutlined />} onClick={() => window.open(state.url, '_blank')}>
            {t('Open in a new window')}
          </Button>
        ) : null}
      </div>
      {!canConnect ? (
        <Alert type="info" showIcon message={t('The console is only available when the instance is active or in rescue mode.')} />
      ) : null}
      {state.error ? <Alert type="error" showIcon message={t('Failed to open console')} description={state.error} /> : null}
      <Spin spinning={state.loading}>
        {state.url ? (
          state.kind === 'serial' ? (
            <Alert
              type="info"
              showIcon
              message={t('The serial console uses a websocket; open it in a new window.')}
              description={<code style={{ wordBreak: 'break-all' }}>{state.url}</code>}
            />
          ) : (
            <iframe
              title="instance-console"
              src={state.url}
              style={{ width: '100%', height: 620, border: '1px solid #e2e8f0', borderRadius: 8, background: '#000' }}
            />
          )
        ) : !state.loading && canConnect && !state.error ? (
          <Empty description={t('No console')} />
        ) : null}
      </Spin>
    </div>
  );
}

export const AddButton = ({ children, ...props }) => (
  <Button type="primary" icon={<PlusOutlined />} style={{ backgroundColor: '#0068ff', fontWeight: 600 }} {...props}>
    {children}
  </Button>
);
