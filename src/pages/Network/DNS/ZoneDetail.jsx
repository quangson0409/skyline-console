import React from 'react';
import { Row, Col } from 'antd';
import { useParams } from 'react-router-dom';
import { designateApi } from '@/api/designate';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import ResourcePage, { nameColumn, statusColumn, timeColumn, formatTime } from '@/components/ResourcePage';
import { sortParams, pageParams } from '@/api/paging';
import { t } from '@/core/i18n';
import {
  zoneTypes,
  zoneStatus,
  recordStatus,
  toFilterOptions,
  dnsRRTypeFilterOptions,
  getRecordSetType,
  renderRecords,
  renderJson,
  zoneListPath,
  recordSetDetailPath,
} from './common';
import { createRecordSetAction, editRecordSetAction, deleteRecordSetAction } from './actions';
import { zoneRowActions } from './ZoneList';
import { policyTabs } from '@/pages/Network/common';

export const recordSetRowActions = () => ({
  firstAction: editRecordSetAction(),
  moreActions: [{ action: deleteRecordSetAction() }],
});

function ZoneOverview({ zone }) {
  return (
    <Row gutter={16}>
      <Col xs={24} lg={12}>
        <DetailCard
          title={t('Base Info')}
          column={1}
          items={[
            { label: t('Action'), value: zone.action },
            { label: t('Serial'), value: zone.serial },
            { label: t('TTL'), value: zone.ttl },
            { label: t('Version'), value: zone.version },
          ]}
        />
        <DetailCard
          title={t('Modification Times')}
          column={1}
          items={[
            { label: t('Created At'), value: formatTime(zone.created_at) },
            { label: t('Updated At'), value: formatTime(zone.updated_at) },
            { label: t('Transferred'), value: formatTime(zone.transferred_at) },
          ]}
        />
      </Col>
      <Col xs={24} lg={12}>
        <DetailCard
          title={t('Attributes')}
          column={1}
          items={[{ label: t('Attributes'), value: zone.attributes, render: renderJson }]}
        />
        <DetailCard
          title={t('Associations')}
          column={1}
          items={[
            { label: t('Pool ID'), value: zone.pool_id, copyable: true },
            { label: t('Project ID'), value: zone.project_id, copyable: true },
            { label: t('Masters'), value: zone.masters, render: renderJson },
          ]}
        />
      </Col>
    </Row>
  );
}

function RecordSets({ zone, isAdmin }) {
  return (
    <ResourcePage
      policy="get_recordsets"
      embedded
      deps={[zone.id]}
      fetch={() => designateApi.listRecordsets(zone.id, {}, { allProjects: isAdmin })}
      // legacy RecordSets isFilterByBackend / isSortByBackend: designate limit / marker / sort_key / sort_dir
      serverSide={{
        fetchPage: ({ limit, marker, filters = {}, sortKey, sortDir }) =>
          designateApi.listRecordsetsPage(
            zone.id,
            { ...pageParams({ limit, marker }), ...filters, ...sortParams('designate', sortKey, sortDir) },
            { allProjects: isAdmin }
          ),
      }}
      columns={[
        { ...nameColumn({ linkTo: (r) => recordSetDetailPath(r.zone_id || zone.id, r.id, isAdmin) }), sortKey: 'id' },
        { title: t('Type'), dataIndex: 'type', key: 'type', sortKey: 'type', render: (v) => getRecordSetType(v) },
        { title: t('Records'), dataIndex: 'records', key: 'records', render: renderRecords },
        statusColumn({ textMap: recordStatus() }),
        { ...timeColumn(), sortKey: 'created_at' },
      ]}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'type', label: t('Type'), options: dnsRRTypeFilterOptions() },
        { name: 'status', label: t('Status'), options: toFilterOptions(recordStatus()) },
      ]}
      primaryActions={[createRecordSetAction(zone)]}
      batchActions={[deleteRecordSetAction()]}
      rowActions={recordSetRowActions()}
    />
  );
}

export default function ZoneDetail() {
  const { id: routeId } = useParams();
  return (
    <ResourceDetail
      policy="get_zone"
      title={(d) => d.name || d.id || routeId}
      breadcrumb={[t('Network'), { title: t('DNS Zones'), path: '/network/dns/zones' }]}
      backPath={({ isAdmin }) => zoneListPath(isAdmin)}
      fetch={(id, { isAdmin }) => designateApi.getZone(id, { allProjects: isAdmin })}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Description'), value: d.description },
        { label: t('Type'), value: d.type, render: () => zoneTypes()[d.type] || d.type || '-' },
        { label: t('Status'), value: d.status, render: () => zoneStatus()[d.status] || d.status || '-' },
        { label: t('Email'), value: d.email },
      ]}
      tabs={(d, { isAdmin }) =>
        policyTabs([
          { key: 'overview', label: t('Overview'), render: () => <ZoneOverview zone={d} /> },
          {
            key: 'record_sets',
            label: t('Record Sets'),
            policy: 'get_recordsets', // legacy DNS/Zones/Detail/RecordSets
            render: () => <RecordSets zone={d} isAdmin={isAdmin} />,
          },
        ])
      }
      actions={zoneRowActions()}
    />
  );
}
