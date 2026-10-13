import React from 'react';
import { Breadcrumb, Card, Tabs, Tag, Tooltip } from 'antd';
import { useSearchParams } from 'react-router-dom';
import apiClient from '@/api/client';
import { serviceBase, versionHeaders, currentProjectId, hasEndpoint } from '@/api/endpoints';
import { keystoneApi } from '@/api/keystone';
import { novaApi } from '@/api/nova';
import { cinderApi } from '@/api/cinder';
import { neutronApi } from '@/api/neutron';
import ResourcePage, { nameColumn, textColumn } from '@/components/ResourcePage';
import Status from '@/components/Status';
import { useTranslation, t } from '@/core/i18n';
import { sinceTime } from '../shared';

/** Legacy pages/configuration/containers/SystemInfo (TabList) */

export const serviceStatus = () => ({ enabled: t('Enabled'), disabled: t('Disabled') });
export const serviceState = () => ({ up: t('Up'), down: t('Down') });
export const agentStatusText = (v) => (v ? serviceStatus().enabled : serviceStatus().disabled);
export const agentStateText = (v) => (v ? serviceState().up : serviceState().down);

const toOptions = (map) => Object.entries(map).map(([key, label]) => ({ key, label }));

/* ----------------------------- API calls not covered by the shared api files ----------------------------- */
const cinderP = () => `${serviceBase('cinder')}/${currentProjectId()}`;
export const extraApi = {
  enableCinderService: (body) => apiClient.put(`${cinderP()}/os-services/enable`, body, versionHeaders('cinder')),
  disableCinderService: (body) =>
    apiClient.put(`${cinderP()}/os-services/disable-log-reason`, body, versionHeaders('cinder')),
  listHeatServices: () => apiClient.get(`${serviceBase('heat')}/${currentProjectId()}/services`),
};

/* ----------------------------------------- columns helpers ----------------------------------------- */
const statusWithReason = (title, dataIndex, map, showReasonWhenEnabled = true) => ({
  title,
  dataIndex,
  key: dataIndex,
  render: (value, r) => {
    const tip = r.disabled_reason && (showReasonWhenEnabled || value !== 'enabled') ? `${t('Reason: ')} ${r.disabled_reason}` : '';
    return (
      <Tooltip title={tip}>
        <Tag color={value === 'enabled' ? 'blue' : 'warning'} style={{ borderRadius: 10 }}>
          {map[value] || value || '-'}
        </Tag>
      </Tooltip>
    );
  },
});

const stateColumn = (title, dataIndex, map) => ({
  title,
  dataIndex,
  key: dataIndex,
  render: (v) => (v === undefined || v === null || v === '' ? '-' : <Status status={String(v)} text={map[v] || v} />),
});

const lastUpdated = (dataIndex = 'updated_at') => ({
  title: t('Last Updated'),
  dataIndex,
  key: dataIndex,
  render: (v) => <span style={{ color: '#64748b', fontSize: 12 }}>{sinceTime(v)}</span>,
});

/* --------------------------------------------- Catalog --------------------------------------------- */
export const fetchCatalog = async () => {
  const res = await keystoneApi.getCatalog();
  return (res?.catalog || []).map((it, idx) => ({
    ...it,
    id: it.id || `${it.type}-${idx}`,
    region: (it.endpoints && it.endpoints[0]?.region) || '',
  }));
};

function CatalogTab() {
  return (
    <ResourcePage
      embedded
      fetch={fetchCatalog}
      searchFields={['name', 'type', 'region']}
      columns={() => [
        { ...textColumn(t('Name'), 'name'), width: 150 },
        { ...textColumn(t('Service'), 'type'), width: 150 },
        { ...textColumn(t('Region'), 'region'), width: 150 },
        {
          title: t('Endpoints'),
          dataIndex: 'endpoints',
          key: 'endpoints',
          render: (v) =>
            v && v.length
              ? v.map((it, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <div key={`${it.interface}-${i}`} style={{ fontSize: 12 }}>
                    <b>{it.interface}: </b>
                    <span>{it.url}</span>
                  </div>
                ))
              : '-',
        },
      ]}
    />
  );
}

/* ------------------------------------------ Compute services ------------------------------------------ */
export const fetchComputeServices = async () => {
  let res;
  try {
    res = await novaApi.listComputeServicesExt();
  } catch {
    res = await novaApi.listServicesV();
  }
  return (res?.services || []).map((s) => ({ ...s, name: s.binary }));
};

export const enableComputeServiceAction = () => ({
  id: 'enable-service',
  type: 'confirm',
  title: t('Enable Compute Service'),
  buttonText: t('Enable'),
  actionName: t('enable compute service'),
  adminOnly: true,
  allowed: (item) => item.status === 'disabled',
  onSubmit: (item) => novaApi.updateServiceV(item.id, { status: 'enabled' }),
});

export const disableComputeServiceAction = () => ({
  id: 'disable-host',
  type: 'modal',
  title: t('Disable Compute Service'),
  buttonText: t('Disable'),
  isDanger: true,
  adminOnly: true,
  allowed: (item) => item.status === 'enabled' && item.binary === 'nova-compute',
  getDefaultValues: (item) => ({ binary: item.binary, host: item.host }),
  formItems: [
    { name: 'binary', label: t('Compute Service'), type: 'label' },
    { name: 'host', label: t('Current Host'), type: 'label' },
    { name: 'disabled_reason', label: t('Reason'), type: 'textarea', rows: 3, rules: [{ max: 64 }] },
  ],
  onSubmit: ({ disabled_reason }, item) => {
    const body = { status: 'disabled' };
    if (disabled_reason) body.disabled_reason = disabled_reason;
    return novaApi.updateServiceV(item.id, body);
  },
});

function ComputeServiceTab() {
  return (
    <ResourcePage
      embedded
      fetch={fetchComputeServices}
      searchFields={['binary', 'host', 'zone']}
      columns={() => [
        { ...textColumn(t('Name'), 'binary'), render: (v) => <b>{v || '-'}</b> },
        textColumn(t('Host'), 'host'),
        textColumn(t('Availability Zone'), 'zone'),
        statusWithReason(t('Service Status'), 'status', serviceStatus()),
        stateColumn(t('Service State'), 'state', serviceState()),
        lastUpdated(),
      ]}
      filterParams={[
        { name: 'binary', label: t('Name') },
        { name: 'status', label: t('Service Status'), options: toOptions(serviceStatus()) },
        { name: 'state', label: t('Service State'), options: toOptions(serviceState()) },
      ]}
      rowActions={() => ({
        firstAction: null,
        moreActions: [{ action: disableComputeServiceAction() }, { action: enableComputeServiceAction() }],
      })}
    />
  );
}

/* ------------------------------------------- Neutron agents ------------------------------------------- */
export const fetchNeutronAgents = async () => {
  const res = await neutronApi.listAgents();
  return (res?.agents || []).map((a) => ({
    ...a,
    name: a.binary,
    admin_state_text: String(!!a.admin_state_up),
    alive_text: String(!!a.alive),
  }));
};

export const enableAgentAction = () => ({
  id: 'enable',
  type: 'confirm',
  title: t('Enable Neutron Agent'),
  buttonText: t('Enable'),
  actionName: t('enable neutron agent'),
  adminOnly: true,
  allowed: (item) => item.admin_state_up === false,
  onSubmit: (item) => neutronApi.update('agents', 'agent', item.id, { admin_state_up: true }),
});

export const disableAgentAction = () => ({
  id: 'disable',
  type: 'confirm',
  title: t('Disable Neutron Agent'),
  buttonText: t('Disable'),
  actionName: t('disable neutron agent'),
  isDanger: true,
  adminOnly: true,
  allowed: (item) => item.admin_state_up === true,
  onSubmit: (item) => neutronApi.update('agents', 'agent', item.id, { admin_state_up: false }),
});

export const agentRowActions = () => ({
  firstAction: null,
  moreActions: [{ action: enableAgentAction() }, { action: disableAgentAction() }],
});

function NeutronAgentTab() {
  return (
    <ResourcePage
      embedded
      fetch={fetchNeutronAgents}
      searchFields={['binary', 'host', 'agent_type']}
      columns={() => [
        nameColumn({ dataIndex: 'binary', linkTo: (r) => `/configuration-admin/neutron/detail/${r.id}` }),
        textColumn(t('Type'), 'agent_type'),
        textColumn(t('Host'), 'host'),
        textColumn(t('Availability Zone'), 'availability_zone'),
        {
          title: t('Service Status'),
          dataIndex: 'admin_state_up',
          key: 'admin_state_up',
          render: (v) => (
            <Tag color={v ? 'blue' : 'warning'} style={{ borderRadius: 10 }}>
              {agentStatusText(v)}
            </Tag>
          ),
        },
        {
          title: t('Service State'),
          dataIndex: 'alive',
          key: 'alive',
          render: (v) => <Status status={v ? 'up' : 'down'} text={agentStateText(v)} />,
        },
        lastUpdated('heartbeat_timestamp'),
      ]}
      filterParams={[
        { name: 'binary', label: t('Name') },
        {
          name: 'admin_state_text',
          label: t('Service Status'),
          options: [
            { key: 'true', label: agentStatusText(true) },
            { key: 'false', label: agentStatusText(false) },
          ],
        },
        {
          name: 'alive_text',
          label: t('Service State'),
          options: [
            { key: 'true', label: agentStateText(true) },
            { key: 'false', label: agentStateText(false) },
          ],
        },
      ]}
      rowActions={agentRowActions}
    />
  );
}

/* ---------------------------------------- Block storage services ---------------------------------------- */
export const fetchCinderServices = async () => {
  const res = await cinderApi.listServices();
  return (res?.services || []).map((s, idx) => ({ ...s, id: idx, name: s.binary }));
};

export const enableCinderServiceAction = () => ({
  id: 'enable',
  type: 'confirm',
  title: t('Enable Service'),
  buttonText: t('Enable'),
  actionName: t('enable cinder service'),
  adminOnly: true,
  allowed: (item) => item.status === 'disabled',
  onSubmit: (item) => extraApi.enableCinderService({ host: item.host, binary: item.binary }),
});

export const disableCinderServiceAction = () => ({
  id: 'disable-service',
  type: 'modal',
  title: t('Disable Cinder Service'),
  buttonText: t('Disable'),
  isDanger: true,
  adminOnly: true,
  allowed: (item) => item.status === 'enabled',
  getDefaultValues: (item) => ({ binary: item.binary, host: item.host }),
  formItems: [
    { name: 'binary', label: t('Cinder Service'), type: 'label' },
    { name: 'host', label: t('Host'), type: 'label' },
    { name: 'disabled_reason', label: t('Reason'), type: 'textarea', rows: 3, required: true, rules: [{ max: 200 }] },
  ],
  onSubmit: ({ disabled_reason }, item) =>
    extraApi.disableCinderService({ disabled_reason, binary: item.binary, host: item.host }),
});

function CinderServiceTab() {
  return (
    <ResourcePage
      embedded
      fetch={fetchCinderServices}
      searchFields={['binary', 'host', 'zone']}
      columns={() => [
        { ...textColumn(t('Name'), 'binary'), render: (v) => <b>{v || '-'}</b> },
        textColumn(t('Host'), 'host'),
        textColumn(t('Availability Zone'), 'zone'),
        statusWithReason(t('Service Status'), 'status', serviceStatus(), false),
        stateColumn(t('Service State'), 'state', serviceState()),
        lastUpdated(),
      ]}
      filterParams={[
        { name: 'binary', label: t('Name') },
        { name: 'status', label: t('Service Status'), options: toOptions(serviceStatus()) },
        { name: 'state', label: t('Service State'), options: toOptions(serviceState()) },
      ]}
      rowActions={() => ({
        firstAction: null,
        moreActions: [{ action: enableCinderServiceAction() }, { action: disableCinderServiceAction() }],
      })}
    />
  );
}

/* ---------------------------------------- Orchestration services ---------------------------------------- */
export const fetchHeatServices = async () => {
  const res = await extraApi.listHeatServices();
  return (res?.services || []).map((s, idx) => ({ ...s, id: s.id || idx, name: s.binary }));
};

function HeatServiceTab() {
  return (
    <ResourcePage
      embedded
      fetch={fetchHeatServices}
      searchFields={['binary', 'host', 'engine_id']}
      columns={() => [
        { ...textColumn(t('Name'), 'binary'), render: (v) => <b>{v || '-'}</b> },
        textColumn(t('Engine ID'), 'engine_id'),
        textColumn(t('Host'), 'host'),
        stateColumn(t('Status'), 'status', serviceState()),
        lastUpdated(),
      ]}
      filterParams={[
        { name: 'binary', label: t('Name') },
        { name: 'status', label: t('Status'), options: toOptions(serviceState()) },
      ]}
    />
  );
}

export default function SystemInfo() {
  const { t: tr } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = [
    { key: 'catalog', label: tr('Services'), children: <CatalogTab /> },
    { key: 'computeServices', label: tr('Compute Services'), children: <ComputeServiceTab /> },
    { key: 'neutronAgent', label: tr('Neutron Agents'), children: <NeutronAgentTab /> },
    hasEndpoint('cinder') && { key: 'cinderService', label: tr('Block Storage Services'), children: <CinderServiceTab /> },
    hasEndpoint('heat') && { key: 'heatService', label: tr('Orchestration Services'), children: <HeatServiceTab /> },
  ].filter(Boolean);
  const requested = searchParams.get('tab');
  const activeKey = tabs.some((it) => it.key === requested) ? requested : tabs[0].key;

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      <Breadcrumb items={[{ title: tr('Global Settings') }, { title: tr('System Info') }]} style={{ marginBottom: 16, fontSize: 13 }} />
      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {tr('System Info')}
        </h1>
        <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
          {tr('Service catalog, compute / block storage / orchestration services and network agents of the cloud.')}
        </p>
      </div>
      <Card variant="borderless" style={{ borderRadius: 8 }}>
        <Tabs
          destroyInactiveTabPane
          activeKey={activeKey}
          onChange={(key) => {
            const next = new URLSearchParams(searchParams);
            next.set('tab', key);
            setSearchParams(next, { replace: true });
          }}
          items={tabs}
        />
      </Card>
    </div>
  );
}
