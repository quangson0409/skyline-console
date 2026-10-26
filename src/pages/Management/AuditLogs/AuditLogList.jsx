/**
 * Audit logs: every POST / PUT / PATCH / DELETE that went through the console, recorded by audit-proxy.
 * Administrators see all users (route management/audit-logs-admin); everybody else sees their own
 * activity (management/audit-logs). Newest first, keyset paged by event id.
 */
import React, { useState } from 'react';
import { Button, Result, Tag, Tooltip, Typography } from 'antd';
import ResourcePage, { formatTime, useIsAdminPage } from '@/components/ResourcePage';
import { auditApi, isAuditUnavailable } from '@/api/audit';
import { t } from '@/core/i18n';

const { Text } = Typography;

const outcomeColor = { success: 'green', accepted: 'blue', failed: 'red', aborted: 'orange', partial: 'orange', skipped: 'default' };
const outcomeText = () => ({
  success: t('Success'),
  accepted: t('Accepted'),
  failed: t('Failed'),
  aborted: t('Aborted'),
  partial: t('Partially failed'),
  skipped: t('Skipped'),
});
const sourceText = () => ({ ui: t('Console'), api: t('API'), scheduler: t('Scheduler') });

const SERVICES = ['nova', 'neutron', 'cinder', 'glance', 'keystone', 'heat', 'octavia', 'manilav2', 'barbican', 'designate', 'swift', 'masakari', 'magnum', 'zun', 'trove', 'zaqar', 'ironic', 'backup-scheduler', 'skyline'];

const mono = { fontFamily: 'monospace', fontSize: 12 };

export const auditColumns = ({ isAdmin }) =>
  [
    {
      title: t('Time'),
      dataIndex: 'ts',
      key: 'ts',
      width: 170,
      exportRender: (v) => formatTime(v),
      render: (v) => <span style={{ color: '#64748b', fontSize: 12 }}>{formatTime(v)}</span>,
    },
    isAdmin && {
      title: t('User'),
      dataIndex: 'user_name',
      key: 'user_name',
      exportRender: (v, r) => [v, r.actor && r.actor !== 'user' ? `(${r.actor})` : ''].filter(Boolean).join(' ') || r.user_id || '',
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v || r.user_id || '-'}</div>
          {r.actor && r.actor !== 'user' ? <Tag style={{ marginTop: 2 }}>{r.actor}</Tag> : null}
        </div>
      ),
    },
    isAdmin && {
      title: t('Project'),
      dataIndex: 'project_name',
      key: 'project_name',
      exportRender: (v, r) => v || r.project_id || '',
      render: (v, r) => v || r.project_id || '-',
    },
    {
      title: t('Action'),
      // not 'action' / key 'action': the table treats that as the row-action column (hidden, left out of CSV)
      dataIndex: ['action'],
      key: 'audit_action',
      render: (v, r) => (
        <Tooltip title={`${r.method} ${r.path}`}>
          <span style={{ fontWeight: 600 }}>{v}</span>
        </Tooltip>
      ),
      exportRender: (v) => v,
    },
    {
      title: t('Resource'),
      dataIndex: 'resource_name',
      key: 'resource',
      exportRender: (v, r) => [r.resource_type, v, r.resource_id].filter(Boolean).join(' / '),
      render: (v, r) => (
        <div>
          <div>{[r.resource_type, v].filter(Boolean).join(': ') || '-'}</div>
          {r.resource_id ? (
            <Text type="secondary" style={mono}>
              {r.resource_id}
            </Text>
          ) : null}
        </div>
      ),
    },
    {
      title: t('Service'),
      dataIndex: 'service',
      key: 'service',
      render: (v) => v || '-',
    },
    {
      title: t('Result'),
      dataIndex: 'outcome',
      key: 'outcome',
      exportRender: (v, r) => [outcomeText()[v] || v, r.http_status].filter(Boolean).join(' '),
      render: (v, r) => (
        <Tooltip title={r.error || ''}>
          <Tag color={outcomeColor[v] || 'default'}>
            {outcomeText()[v] || v}
            {r.http_status ? ` ${r.http_status}` : ''}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: t('Error'),
      dataIndex: 'error',
      key: 'error',
      defaultHidden: true,
      render: (v) => v || '-',
    },
    {
      title: t('Source'),
      dataIndex: 'source',
      key: 'source',
      exportRender: (v) => sourceText()[v] || v,
      render: (v) => <Tag>{sourceText()[v] || v}</Tag>,
    },
    {
      title: t('Request ID'),
      dataIndex: 'request_id',
      key: 'request_id',
      defaultHidden: true,
      render: (v) => (v ? <span style={mono}>{v}</span> : '-'),
    },
    { title: t('Changed Fields'), dataIndex: 'fields', key: 'fields', defaultHidden: true, exportRender: (v) => (v || []).join(', '), render: (v) => (v || []).join(', ') || '-' },
    { title: t('Duration (ms)'), dataIndex: 'duration_ms', key: 'duration_ms', defaultHidden: true, render: (v) => v ?? '-' },
    { title: t('Client IP'), dataIndex: 'client_ip', key: 'client_ip', defaultHidden: true, render: (v) => v || '-' },
  ].filter(Boolean);

const filterParams = (isAdmin) =>
  [
    { name: 'action', label: t('Action') },
    isAdmin && { name: 'user', label: t('User') },
    isAdmin && { name: 'project', label: t('Project') },
    { name: 'service', label: t('Service'), options: SERVICES.map((s) => ({ key: s, label: s })) },
    {
      name: 'outcome',
      label: t('Result'),
      options: Object.entries(outcomeText()).map(([key, label]) => ({ key, label })),
    },
    {
      name: 'source',
      label: t('Source'),
      options: Object.entries(sourceText()).map(([key, label]) => ({ key, label })),
    },
    { name: 'resource_id', label: t('Resource ID') },
    { name: 'keyword', label: t('Search by action, resource, user...') },
  ].filter(Boolean);

/** audit-proxy keyset page -> ResourcePage serverSide result */
export const fetchAuditPage = async ({ limit, marker, filters = {} }) => {
  const { keyword, ...rest } = filters;
  const params = { ...rest, limit };
  if (keyword) params.q = keyword;
  if (marker) params.before_id = marker;
  const res = await auditApi.listEvents(params);
  return { items: res.events, hasNext: Boolean(res.has_more), marker: res.next_before_id ?? undefined };
};

function AuditUnavailable({ onRetry }) {
  return (
    <Result
      status="warning"
      title={t('Audit log service is not available')}
      subTitle={t('The console could not reach the audit log service (/audit-api). Check that audit-proxy is running and that the reverse proxy forwards /audit-api to it.')}
      extra={onRetry ? <Button onClick={onRetry}>{t('Retry')}</Button> : null}
    />
  );
}

export default function AuditLogList() {
  const isAdmin = useIsAdminPage();
  const [unavailable, setUnavailable] = useState(false);

  const fetchPage = async (args) => {
    try {
      const res = await fetchAuditPage(args);
      setUnavailable(false);
      return res;
    } catch (e) {
      if (isAuditUnavailable(e)) {
        setUnavailable(true);
        return { items: [], hasNext: false };
      }
      throw e;
    }
  };

  return (
    <ResourcePage
      title={isAdmin ? t('Audit Logs') : t('My Activity')}
      breadcrumb={[t('Maintenance'), isAdmin ? t('Audit Logs') : t('My Activity')]}
      description={t('Who changed what, and when: every create, update and delete made through the console.')}
      fetch={() => Promise.resolve([])} // unused: the list is server-side paged
      serverSide={{ fetchPage, pageSizeOptions: [20, 50, 100], downloadPageSize: 100, downloadMax: 10000 }}
      header={unavailable ? <AuditUnavailable /> : null}
      columns={(ctx) => auditColumns({ isAdmin: ctx.isAdmin })}
      filterParams={filterParams(isAdmin)}
    />
  );
}
