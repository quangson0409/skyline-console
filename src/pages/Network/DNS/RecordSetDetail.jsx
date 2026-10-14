import React from 'react';
import { Row, Col } from 'antd';
import { Link, useParams } from 'react-router-dom';
import { designateApi } from '@/api/designate';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { recordStatus, getRecordSetType, zoneDetailPath } from './common';
import { recordSetRowActions } from './ZoneDetail';

function RecordSetOverview({ record, isAdmin }) {
  return (
    <Row gutter={16}>
      <Col xs={24} lg={12}>
        <DetailCard
          title={t('Base Info')}
          column={1}
          items={[
            { label: t('Action'), value: record.action },
            {
              label: t('Records'),
              value: record.records,
              render: (v) => (Array.isArray(v) && v.length ? v.map((it) => <div key={it}>{it}</div>) : '-'),
            },
            { label: t('TTL'), value: record.ttl },
            { label: t('Version'), value: record.version },
          ]}
        />
        <DetailCard
          title={t('Modification Times')}
          column={1}
          items={[
            { label: t('Created At'), value: formatTime(record.created_at) },
            { label: t('Updated At'), value: formatTime(record.updated_at) },
          ]}
        />
      </Col>
      <Col xs={24} lg={12}>
        <DetailCard
          title={t('Associations')}
          column={1}
          items={[
            {
              label: t('Zone ID'),
              value: record.zone_id,
              render: (v) => (v ? <Link to={zoneDetailPath(v, isAdmin)}>{v}</Link> : '-'),
            },
            { label: t('Zone Name'), value: record.zone_name },
            { label: t('Project ID'), value: record.project_id, copyable: true },
          ]}
        />
      </Col>
    </Row>
  );
}

export default function RecordSetDetail() {
  const { zoneId, id: routeId } = useParams();
  return (
    <ResourceDetail
      policy="get_recordset"
      breadcrumb={[t('Network'), { title: t('DNS Zones'), path: '/network/dns/zones' }, t('Record Sets')]}
      backPath={({ isAdmin }) => `${zoneDetailPath(zoneId, isAdmin)}?tab=record_sets`}
      title={(d) => d.name || d.id || routeId}
      fetch={(id, { isAdmin }) => designateApi.getRecordset(zoneId, id, { allProjects: isAdmin })}
      info={(d) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Description'), value: d.description },
        { label: t('Type'), value: d.type, render: () => getRecordSetType(d.type) },
        { label: t('Status'), value: d.status, render: () => recordStatus()[d.status] || d.status || '-' },
      ]}
      tabs={(d, { isAdmin }) => [
        { key: 'overview', label: t('Overview'), render: () => <RecordSetOverview record={d} isAdmin={isAdmin} /> },
      ]}
      actions={recordSetRowActions()}
    />
  );
}
