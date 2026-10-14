import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Popover, Space, Spin, Table, Typography } from 'antd';
import { InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { zunApi } from '@/api/zun';
import ResourcePage, { formatTime, projectColumn } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { getErrorMessage } from '@/hooks/useResource';
import { t } from '@/core/i18n';
import { actionEvent, actionMap } from '../common';

/** Legacy components/Popover/PopActionEvent */
function ActionEvents({ id, requestId }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    zunApi
      .getContainerAction(id, requestId)
      .then((res) => alive && setEvents((res?.events || []).slice().reverse()))
      .catch(() => alive && setEvents([]))
      .finally(() => alive && setLoading(false));
    // eslint-disable-next-line consistent-return
    return () => {
      alive = false;
    };
  }, [open, id, requestId]);
  const events_ = actionEvent();
  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      content={
        <Table
          size="small"
          rowKey={(r, i) => `${r.event}-${i}`}
          loading={loading}
          dataSource={events}
          pagination={false}
          style={{ maxWidth: 640 }}
          columns={[
            { title: t('Operation Name'), dataIndex: 'event', render: (v) => events_[v] || v },
            { title: t('Start Time'), dataIndex: 'start_time', render: (v) => formatTime(v) },
            { title: t('End Time'), dataIndex: 'finish_time', render: (v) => (v ? formatTime(v) : '-') },
            { title: t('Execution Result'), dataIndex: 'result', render: (v) => (v === 'Success' ? t('Success') : v || '-') },
          ]}
        />
      }
    >
      <InfoCircleOutlined style={{ marginLeft: 6, color: '#0068ff', cursor: 'pointer' }} />
    </Popover>
  );
}

/** Legacy Containers/Detail/ActionLogs */
export function ActionLogs({ detail, isAdmin }) {
  const projectMap = useProjectMap();
  const map = actionMap();
  return (
    <ResourcePage
      policy="container:actions"
      embedded
      rowKey="request_id"
      autoRefreshEnabled={false}
      fetch={async () => {
        const res = await zunApi.listContainerActions(detail.uuid);
        return (res?.containerActions || res?.container_actions || []).map((it) => ({ ...it, id: it.request_id }));
      }}
      deps={[detail.uuid]}
      columns={[
        { title: t('Operation Name'), dataIndex: 'action', key: 'action', render: (v) => map[v] || v || '-' },
        isAdmin && projectColumn(projectMap),
        { title: t('Operation Time'), dataIndex: 'start_time', key: 'start_time', render: (v) => formatTime(v) },
        {
          title: t('Request ID'),
          dataIndex: 'request_id',
          key: 'request_id',
          render: (v, r) => (
            <span>
              {v}
              <ActionEvents id={r.container_uuid || detail.uuid} requestId={v} />
            </span>
          ),
        },
        isAdmin && {
          title: t('User ID'),
          dataIndex: 'user_id',
          key: 'user_id',
          render: (v) => (v ? <Link to={`/identity/user-admin/detail/${v}`}>{v}</Link> : '-'),
        },
        { title: t('Message'), dataIndex: 'message', key: 'message', render: (v) => v || '-' },
      ].filter(Boolean)}
      filterParams={[{ name: 'action', label: t('Operation Name'), options: Object.entries(map).map(([key, label]) => ({ key, label })) }]}
    />
  );
}

/** Legacy Containers/Detail/Logs */
export function Logs({ detail }) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await zunApi.getContainerLogs(detail.uuid);
      setLogs(typeof res === 'string' ? res : res ? JSON.stringify(res, null, 2) : '');
    } catch (err) {
      setError(getErrorMessage(err, t('Operation failed')));
    } finally {
      setLoading(false);
    }
  }, [detail.uuid]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          {t('Refresh')}
        </Button>
      </Space>
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
      <Spin spinning={loading}>
        <div
          style={{
            padding: 16,
            background: '#0f172a',
            borderRadius: 8,
            color: '#e2e8f0',
            fontSize: 13,
            minHeight: 120,
            maxHeight: 560,
            overflow: 'auto',
          }}
        >
          {logs || loading ? (
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'JetBrains Mono, monospace' }}>{logs}</pre>
          ) : (
            t('No Logs...')
          )}
        </div>
      </Spin>
    </div>
  );
}

// xterm is bundled (lazy chunk) instead of the legacy CDN script, so the console works offline
const loadXterm = async () => {
  const [{ Terminal }] = await Promise.all([import('@xterm/xterm'), import('@xterm/xterm/css/xterm.css')]);
  return Terminal;
};

const str2ab = (str) => {
  const buf = new ArrayBuffer(str.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < str.length; i += 1) view[i] = str.charCodeAt(i);
  return buf;
};

/** Legacy Containers/Detail/Console (websocket from containers/{id}/attach + xterm) */
export function Console({ detail }) {
  const ref = useRef(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('connecting');
  useEffect(() => {
    let socket;
    let term;
    let disposed = false;
    (async () => {
      try {
        const url = await zunApi.attachContainer(detail.uuid);
        const Terminal = await loadXterm();
        if (disposed) return;
        term = new Terminal({ cursorBlink: true });
        term.open(ref.current);
        term.write(' >$ ');
        socket = new WebSocket(typeof url === 'string' ? url.replace(/^"|"$/g, '') : String(url), ['binary', 'base64']);
        socket.onopen = () => setStatus('open');
        socket.onclose = () => setStatus('closed');
        socket.onerror = () => setError(t('Unable to connect to the container console'));
        const onData = (data) => socket.readyState === 1 && socket.send(str2ab(data));
        if (typeof term.onData === 'function') term.onData(onData);
        else term.on('data', onData);
        socket.onmessage = (e) => {
          if (e.data instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => term.write(reader.result);
            reader.readAsText(e.data);
          } else {
            term.write(e.data);
          }
        };
      } catch (err) {
        setError(getErrorMessage(err, t('Unable to connect to the container console')));
      }
    })();
    return () => {
      disposed = true;
      try {
        socket?.close();
        term?.dispose();
      } catch {
        // ignore
      }
    };
  }, [detail.uuid]);
  return (
    <div>
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} /> : null}
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        {status === 'open' ? t('Connected') : status === 'closed' ? t('Disconnected') : t('Connecting...')}
      </Typography.Text>
      <div ref={ref} style={{ background: '#000', padding: 8, borderRadius: 8, minHeight: 360 }} />
    </div>
  );
}
