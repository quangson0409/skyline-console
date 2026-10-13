import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Col, Row, Skeleton, Space, Tooltip, Typography, message } from 'antd';
import { CopyOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { heatApi } from '@/api/heat';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { formatTime, statusColumn, timeColumn } from '@/components/ResourcePage';
import DetailCard from '@/components/DetailCard';
import { getErrorMessage } from '@/hooks/useResource';
import { t } from '@/core/i18n';
import {
  stackStatus,
  rollbackTip,
  mapStack,
  stackRef,
  stackListPath,
  adminSuffix,
  isStackInProgress,
} from './resources';
import { stackRowActions } from './actions';
import { dumpYaml } from './yaml';

const MONO =
  '"Menlo", "Liberation Mono", "Consolas", "DejaVu Sans Mono", "Ubuntu Mono", "Courier New", "andale mono", "lucida console", monospace';

const projectFromQuery = () => {
  try {
    return new URLSearchParams(window.location.search).get('project') || undefined;
  } catch {
    return undefined;
  }
};

/**
 * Resolves the stack name when the route has none (links from resources of type OS::Heat::Stack
 * only know the nested stack id). Nested stacks are hidden from the list unless show_nested is set.
 */
const resolveStackName = async (id, isAdmin) => {
  const params = { id, show_nested: true };
  if (isAdmin) params.global_tenant = true;
  const res = await heatApi.listStacks(params);
  const found = (res?.stacks || []).find((s) => s.id === id);
  return found ? { name: found.stack_name, tenant: found.project } : null;
};

/** legacy StackStore.detailFetchByClient */
export const fetchStackDetail = async (id, { params = {}, isAdmin }) => {
  let name = params.name && params.name !== '-' ? decodeURIComponent(params.name) : '';
  let tenant = projectFromQuery();
  if (!name) {
    const found = await resolveStackName(id, isAdmin);
    if (!found) throw new Error(t('Resource not found or failed to load'));
    name = found.name;
    tenant = tenant || found.tenant;
  }
  const res = await heatApi.getStack({ id, name, tenant });
  return mapStack(res?.stack || {});
};

const valueToText = (value) => {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
};

const breakStyle = { wordWrap: 'break-word', wordBreak: 'break-word', whiteSpace: 'pre-wrap' };

/** legacy Detail/BaseDetail: Startup Parameters + Outputs (left), Deployment Parameters (right) */
function StackBaseDetail({ stack }) {
  const outputs = Array.isArray(stack.outputs) ? stack.outputs : [];
  const parameters = stack.parameters || {};
  const startItems = [
    { label: t('Timeout (Minute)'), value: stack.timeout_mins },
    {
      label: (
        <Space size={4}>
          {t('Fail Rollback')}
          <Tooltip title={rollbackTip()}>
            <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
          </Tooltip>
        </Space>
      ),
      value: stack.disable_rollback,
      render: () => (stack.disable_rollback ? t('Disable') : t('Enable')),
    },
  ];
  const outputItems = outputs.map((it) => ({
    label: it.output_key,
    value: it.output_value,
    render: () => (
      <div style={breakStyle}>
        <div>{valueToText(it.output_value)}</div>
        {it.description ? <div style={{ color: '#64748b', fontSize: 12 }}>{it.description}</div> : null}
        {it.output_error ? <div style={{ color: '#ef4444', fontSize: 12 }}>{it.output_error}</div> : null}
      </div>
    ),
  }));
  const paramItems = Object.keys(parameters).map((key) => ({
    label: key,
    value: parameters[key],
    render: () => <span style={breakStyle}>{valueToText(parameters[key])}</span>,
  }));
  const empty = [{ label: t('No Data'), value: '', render: () => '-' }];
  return (
    <Row gutter={16}>
      <Col xs={24} lg={12}>
        <DetailCard title={t('Startup Parameters')} items={startItems} column={1} />
        <DetailCard title={t('Outputs')} items={outputItems.length ? outputItems : empty} column={1} />
      </Col>
      <Col xs={24} lg={12}>
        <DetailCard title={t('Deployment Parameters')} items={paramItems.length ? paramItems : empty} column={1} />
      </Col>
    </Row>
  );
}

/**
 * legacy Detail/Resource resourceMap: physical resources linked to their console page.
 * isAdmin entries are only linked on the administrator page (like legacy).
 */
const RESOURCE_LINKS = {
  'OS::Cinder::EncryptedVolumeType': { admin: true, path: () => '/storage/volume-type-admin/detail/' },
  'OS::Cinder::QoSAssociation': { admin: true, path: () => '/storage/volume-type-admin/qos/detail/' },
  'OS::Cinder::QoSSpecs': { admin: true, path: () => '/storage/volume-type-admin/qos/detail/' },
  'OS::Cinder::Volume': { path: (a) => `/storage/volume${adminSuffix(a)}/detail/` },
  'OS::Cinder::VolumeType': { admin: true, path: () => '/storage/volume-type-admin/detail/' },
  'OS::Glance::WebImage': { path: (a) => `/compute/image${adminSuffix(a)}/detail/` },
  'OS::Heat::Stack': { path: (a) => `/heat/stack${adminSuffix(a)}/detail/`, suffix: '/-' },
  'OS::Ironic::Port': { path: (a) => `/network/port${adminSuffix(a)}/detail/` },
  'OS::Keystone::Domain': { admin: true, path: () => '/identity/domain-admin/detail/' },
  'OS::Keystone::Group': { admin: true, path: () => '/identity/user-group-admin/detail/' },
  'OS::Keystone::Project': { admin: true, path: () => '/identity/project-admin/detail/' },
  'OS::Keystone::Role': { admin: true, path: () => '/identity/role-admin/detail/' },
  'OS::Keystone::User': { admin: true, path: () => '/identity/user-admin/detail/' },
  'OS::Neutron::FloatingIP': { path: (a) => `/network/floatingip${adminSuffix(a)}/detail/` },
  'OS::Neutron::LBaaS::LoadBalancer': { path: (a) => `/network/load-balancers${adminSuffix(a)}/detail/` },
  'OS::Neutron::Net': { path: (a) => `/network/networks${adminSuffix(a)}/detail/` },
  'OS::Neutron::Port': { path: (a) => `/network/port${adminSuffix(a)}/detail/` },
  'OS::Neutron::QoSPolicy': { path: (a) => `/network/qos-policy${adminSuffix(a)}/detail/` },
  'OS::Neutron::Router': { path: (a) => `/network/router${adminSuffix(a)}/detail/` },
  'OS::Neutron::SecurityGroup': { path: (a) => `/network/security-group${adminSuffix(a)}/detail/` },
  'OS::Nova::Flavor': { admin: true, path: () => '/compute/flavor-admin/detail/' },
  'OS::Nova::KeyPair': { path: () => '/compute/keypair/detail/' },
  'OS::Nova::Server': { path: (a) => `/compute/instance${adminSuffix(a)}/detail/` },
  'OS::Nova::ServerGroup': { path: (a) => `/compute/server-group${adminSuffix(a)}/detail/` },
  'OS::Octavia::LoadBalancer': { path: (a) => `/network/load-balancers${adminSuffix(a)}/detail/` },
};

export const renderResourceLink = (value, record, isAdmin) => {
  if (!value) return '-';
  const item = RESOURCE_LINKS[record.resource_type];
  const text = <span style={breakStyle}>{value}</span>;
  if (!item || (item.admin && !isAdmin)) return text;
  return <Link to={`${item.path(isAdmin)}${encodeURIComponent(value)}${item.suffix || ''}`}>{text}</Link>;
};

/** legacy Detail/Resource */
function StackResources({ stack, isAdmin }) {
  return (
    <ResourcePage
      embedded
      deps={[stack.id]}
      rowKey="logical_resource_id"
      fetch={async () => {
        const res = await heatApi.listResources(stackRef(stack));
        return (res?.resources || []).map((r) => ({ ...r, id: r.physical_resource_id, name: r.logical_resource_id }));
      }}
      isTransition={isStackInProgress}
      columns={[
        {
          title: t('Stack Resource'),
          dataIndex: 'logical_resource_id',
          key: 'logical_resource_id',
          render: (v) => <span style={breakStyle}>{v || '-'}</span>,
        },
        {
          title: t('Resource'),
          dataIndex: 'physical_resource_id',
          key: 'physical_resource_id',
          render: (v, r) => renderResourceLink(v, r, isAdmin),
        },
        { title: t('Stack Resource Type'), dataIndex: 'resource_type', key: 'resource_type' },
        timeColumn({ dataIndex: 'creation_time' }),
        statusColumn({ title: t('Resource Status'), dataIndex: 'resource_status', textMap: stackStatus() }),
        {
          title: t('Resource Status Reason'),
          dataIndex: 'resource_status_reason',
          key: 'resource_status_reason',
          width: 300,
          render: (v) => <span style={breakStyle}>{v || '-'}</span>,
        },
      ]}
      filterParams={[
        { name: 'logical_resource_id', label: t('Stack Resource') },
        { name: 'resource_type', label: t('Stack Resource Type') },
      ]}
    />
  );
}

/** legacy Detail/Event */
function StackEvents({ stack }) {
  return (
    <ResourcePage
      embedded
      deps={[stack.id]}
      fetch={async () => {
        const res = await heatApi.listEvents(stackRef(stack));
        return (res?.events || [])
          .map((e) => ({ ...e, name: e.logical_resource_id }))
          .sort((a, b) => new Date(b.event_time || 0) - new Date(a.event_time || 0));
      }}
      isTransition={() => isStackInProgress(stack)}
      columns={[
        {
          title: t('Event Time'),
          dataIndex: 'event_time',
          key: 'event_time',
          sorter: (a, b) => new Date(a.event_time || 0) - new Date(b.event_time || 0),
          render: (v) => formatTime(v),
        },
        {
          title: t('Stack Resource'),
          dataIndex: 'logical_resource_id',
          key: 'logical_resource_id',
          render: (v) => <div style={breakStyle}>{v || '-'}</div>,
        },
        {
          title: t('Resource'),
          dataIndex: 'physical_resource_id',
          key: 'physical_resource_id',
          render: (v) => <div style={breakStyle}>{v || '-'}</div>,
        },
        statusColumn({ title: t('Resource Status'), dataIndex: 'resource_status', textMap: stackStatus() }),
        {
          title: t('Resource Status Reason'),
          dataIndex: 'resource_status_reason',
          key: 'resource_status_reason',
          width: 300,
          render: (v) => <span style={breakStyle}>{v || '-'}</span>,
        },
      ]}
      filterParams={[{ name: 'logical_resource_id', label: t('Stack Resource') }]}
    />
  );
}

/** legacy Detail/Template: read-only YAML of the stack template */
function StackTemplate({ stack }) {
  const [state, setState] = useState({ loading: true, content: '' });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, content: '' });
    heatApi
      .getTemplate(stackRef(stack))
      .then((tpl) => alive && setState({ loading: false, content: dumpYaml(tpl) }))
      .catch((err) => {
        if (!alive) return;
        message.error(getErrorMessage(err));
        setState({ loading: false, content: '' });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack.id, stack.stack_name]);

  return (
    <Card
      variant="borderless"
      styles={{ body: { padding: 0 } }}
      extra={
        <Button
          size="small"
          icon={<CopyOutlined />}
          disabled={!state.content}
          onClick={() => {
            navigator.clipboard?.writeText(state.content);
            message.success(t('Copied'));
          }}
        >
          {t('Copy')}
        </Button>
      }
      title={<Typography.Text type="secondary">{t('YAML File')}</Typography.Text>}
    >
      {state.loading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <pre
          className="heat-template-view"
          style={{
            fontFamily: MONO,
            fontSize: 12.5,
            lineHeight: 1.6,
            margin: 0,
            padding: 16,
            maxHeight: 640,
            overflow: 'auto',
            background: 'var(--ant-color-fill-quaternary, rgba(0,0,0,0.02))',
            borderRadius: 8,
          }}
        >
          {state.content || '-'}
        </pre>
      )}
    </Card>
  );
}

export default function StackDetail() {
  const navigate = useNavigate();
  return (
    <ResourceDetail
      breadcrumb={[t('Orchestration'), { title: t('Stacks'), path: '/heat/stack' }]}
      backPath={({ isAdmin }) => stackListPath(isAdmin)}
      fetch={fetchStackDetail}
      statusField="stack_status"
      title={(d) => d.stack_name || d.id}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.stack_name },
        {
          label: t('Stack Status'),
          value: d.stack_status,
          render: () => stackStatus()[d.stack_status] || d.stack_status || '-',
        },
        { label: t('Stack Status Reason'), value: d.stack_status_reason },
        { label: t('Description'), value: d.description },
        { label: t('Created At'), value: formatTime(d.creation_time) },
        { label: t('Updated At'), value: formatTime(d.updated_time) },
        d.parent && { label: t('Parent Stack'), value: d.parent },
      ].filter(Boolean)}
      tabs={(d, ctx) => [
        { key: 'detail', label: t('Detail'), render: () => <StackBaseDetail stack={d} /> },
        { key: 'resource', label: t('Stack Resources'), render: () => <StackResources stack={d} isAdmin={ctx.isAdmin} /> },
        { key: 'event', label: t('Stack Events'), render: () => <StackEvents stack={d} /> },
        { key: 'template', label: t('YAML File'), render: () => <StackTemplate stack={d} /> },
      ]}
      actions={({ isAdmin }) => stackRowActions({ navigate, isAdmin })}
    />
  );
}
