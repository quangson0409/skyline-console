import React from 'react';
import { Link } from 'react-router-dom';
import { Space, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { nameColumn, statusColumn, formatTime } from '@/components/ResourcePage';
import DetailCard from '@/components/DetailCard';
import { t } from '@/core/i18n';
import {
  operatingStatus,
  provisioningStatus,
  isLbTransition,
  statusOptions,
  lbDetailPath,
  protocolText,
  algorithmText,
  onOff,
  INSERT_HEADER_KEYS,
  insertHeaderTips,
  insertHeaderDesc,
  certificateContainerLink,
  certificateSecretLink,
  fetchListenerDetail,
  fetchMembers,
} from './helpers';
import { listenerRowActions, memberRowActions, memberPrimaryActions } from './actions';
import { withAfterSubmit, wrapRowActions } from './LoadBalancerDetail';

const Help = ({ title, tip }) => (
  <Space size={4}>
    <span>{title}</span>
    <Tooltip title={tip}>
      <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
    </Tooltip>
  </Space>
);

function ListenerBaseDetail({ listener, isAdmin }) {
  const pool = listener.default_pool || {};
  const hm = listener.healthMonitor;
  const insertHeaders = listener.insert_headers || {};
  const headerKeys = INSERT_HEADER_KEYS.filter((k) => insertHeaders[k]);
  const tips = insertHeaderTips();
  return (
    <div>
      <DetailCard
        title={t('Pool Info')}
        column={{ xs: 1, sm: 2 }}
        items={
          !listener.default_pool_id
            ? [{ label: t('Default Pool'), value: t('No default pool set') }]
            : [
                { label: t('ID'), value: listener.default_pool_id, copyable: true },
                { label: t('Name'), value: pool.name || '-' },
                { label: t('Protocol'), value: pool.protocol || '-' },
                { label: t('Algorithm'), value: algorithmText(pool.lb_algorithm) },
                { label: t('Admin State'), value: onOff(pool.admin_state_up) },
                {
                  label: t('Operating Status'),
                  value: operatingStatus()[pool.operating_status] || pool.operating_status || '-',
                },
                { label: t('Description'), value: pool.description || '-' },
              ]
        }
      />
      {listener.default_pool_id ? (
        <DetailCard
          title={t('Health Monitor')}
          column={{ xs: 1, sm: 2 }}
          items={[
            { label: t('Health Monitor Enabled'), value: hm ? t('Yes') : t('No') },
            ...(hm
              ? [
                  { label: t('Name'), value: hm.name || '-' },
                  { label: t('Health Monitor Type'), value: hm.type },
                  { label: t('Delay Interval (s)'), value: hm.delay },
                  { label: t('Timeout (s)'), value: hm.timeout },
                  { label: t('Max Retries'), value: hm.max_retries },
                  { label: t('Admin State'), value: onOff(hm.admin_state_up) },
                  { label: t('Monitoring URL'), value: hm.url_path || '/' },
                ]
              : []),
          ]}
        />
      ) : null}
      {headerKeys.length ? (
        <DetailCard
          title={<Help title={t('Custom Headers')} tip={insertHeaderDesc()} />}
          column={{ xs: 1, sm: 2 }}
          items={headerKeys.map((key) => ({
            label: <Help title={key} tip={tips[key]} />,
            value: insertHeaders[key],
          }))}
        />
      ) : null}
      {listener.protocol === 'TERMINATED_HTTPS' && !isAdmin ? (
        <DetailCard
          title={t('certificate')}
          column={{ xs: 1 }}
          items={[
            {
              label: t('Server Certificate'),
              value: listener.serverCertificateId,
              render: () => certificateContainerLink(listener.serverCertificateId),
            },
            {
              label: t('CA Certificate'),
              value: listener.caCertificateId,
              render: () => certificateSecretLink(listener.caCertificateId),
            },
            {
              label: t('SNI Certificate'),
              value: listener.sniCertificateId,
              render: () =>
                (listener.sniCertificateId || []).length
                  ? listener.sniCertificateId.map((id, idx) => (
                      <span key={id}>
                        {certificateContainerLink(id)}
                        {idx === listener.sniCertificateId.length - 1 ? '' : ' , '}
                      </span>
                    ))
                  : '-',
            },
          ]}
        />
      ) : null}
    </div>
  );
}

export const memberColumns = () => [
  nameColumn(),
  statusColumn({ title: t('Provisioning Status'), dataIndex: 'provisioning_status', textMap: provisioningStatus() }),
  statusColumn({ title: t('Operating Status'), dataIndex: 'operating_status', textMap: operatingStatus() }),
  { title: t('Admin State Up'), dataIndex: 'admin_state_up', key: 'admin_state_up', render: (v) => onOff(v) },
  { title: t('IP Address'), dataIndex: 'address', key: 'address', render: (v) => v || '-' },
  { title: t('Port'), dataIndex: 'protocol_port', key: 'protocol_port', render: (v) => v ?? '-' },
  { title: t('Weight'), dataIndex: 'weight', key: 'weight', render: (v) => v ?? '-' },
  { title: t('Subnet ID'), dataIndex: 'subnet_id', key: 'subnet_id', render: (v) => v || '-' },
];

function Members({ listener, isAdmin, projectId, refetchDetail }) {
  const after = () => refetchDetail?.({ quiet: true });
  const ctx = { listener, isAdmin, projectId };
  return (
    <ResourcePage
      embedded
      deps={[listener.id, listener.default_pool_id]}
      fetch={() => fetchMembers(listener.default_pool_id)}
      isTransition={isLbTransition}
      columns={memberColumns()}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'address', label: t('IP Address') },
      ]}
      primaryActions={memberPrimaryActions(ctx).map((a) => withAfterSubmit(a, after))}
      rowActions={wrapRowActions(memberRowActions(ctx), after)}
    />
  );
}

export default function ListenerDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Network'), { title: t('Load Balancers'), path: '/network/load-balancers' }]}
      backPath={({ isAdmin, params }) => lbDetailPath(params.loadBalancerId, isAdmin)}
      fetch={fetchListenerDetail}
      statusField="provisioning_status"
      info={(d, { isAdmin }) => {
        const lbId = d.lbIds?.[0];
        return [
          { label: t('ID'), value: d.id, copyable: true },
          { label: t('Listener Name'), value: d.name },
          { label: t('Protocol Type'), value: protocolText(d.protocol) },
          { label: t('Port'), value: d.protocol_port },
          {
            label: t('Status'),
            value: d.provisioning_status,
            render: () => provisioningStatus()[d.provisioning_status] || d.provisioning_status || '-',
          },
          {
            label: t('Operating Status'),
            value: d.operating_status,
            render: () => operatingStatus()[d.operating_status] || d.operating_status || '-',
          },
          { label: t('Connection Limit'), value: d.connection_limit },
          { label: t('Admin Status'), value: onOff(d.admin_state_up) },
          {
            label: t('Load Balancer'),
            value: lbId,
            render: () =>
              lbId ? <Link to={lbDetailPath(lbId, isAdmin)}>{d.loadBalancer?.name || lbId}</Link> : '-',
          },
          { label: t('Description'), value: d.description },
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
        ];
      }}
      tabs={(d, { isAdmin, projectId, refetch }) => [
        { key: 'detail', label: t('Detail'), render: () => <ListenerBaseDetail listener={d} isAdmin={isAdmin} /> },
        {
          key: 'members',
          label: t('Members'),
          render: () => <Members listener={d} isAdmin={isAdmin} projectId={projectId} refetchDetail={refetch} />,
        },
      ]}
      actions={({ isAdmin, detail }) => listenerRowActions({ isAdmin, lb: detail?.loadBalancer || undefined, inDetail: true })}
    />
  );
}
