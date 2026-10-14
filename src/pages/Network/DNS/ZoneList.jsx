import React from 'react';
import { designateApi } from '@/api/designate';
import ResourcePage, { nameColumn, statusColumn, timeColumn, projectColumn } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { sortParams, pageParams } from '@/api/paging';
import { zoneTypes, zoneStatus, toFilterOptions, zoneDetailPath } from './common';
import { createZoneAction, editZoneAction, deleteZoneAction, createRecordSetAction } from './actions';

export const fetchZones = ({ isAdmin } = {}) => designateApi.listZones({}, { allProjects: isAdmin });

/**
 * Server-side list (legacy DNS Zones container isFilterByBackend / isSortByBackend, DNSZonesStore):
 * designate /v2/zones?limit&marker&sort_key&sort_dir + name / type / status filters, all projects via
 * the x-auth-all-projects header on the admin page; total from metadata.total_count.
 */
export const fetchZonesPage = ({ ctx = {}, limit, marker, filters = {}, sortKey, sortDir } = {}) =>
  designateApi.listZonesPage(
    { ...pageParams({ limit, marker }), ...filters, ...sortParams('designate', sortKey, sortDir) },
    { allProjects: ctx.isAdmin }
  );

export const zoneServerSide = { fetchPage: fetchZonesPage };

export const zoneRowActions = () => ({
  firstAction: editZoneAction(),
  moreActions: [{ action: createRecordSetAction() }, { action: deleteZoneAction() }],
});

export const zoneColumns = ({ isAdmin, projectMap }) =>
  [
    // sortKey: legacy backend sort keys (designate sort_key; the name column sorted by id in legacy)
    { ...nameColumn({ title: t('Zone ID/Name'), linkTo: (r) => zoneDetailPath(r.id, isAdmin) }), sortKey: 'id' },
    isAdmin && { ...projectColumn(projectMap), sortKey: 'tenant_id' },
    {
      title: t('Type'),
      dataIndex: 'type',
      key: 'type',
      render: (v) => zoneTypes()[v] || v || '-',
    },
    { ...statusColumn({ textMap: zoneStatus() }), sortKey: 'status' },
    { ...timeColumn(), sortKey: 'created_at' },
  ].filter(Boolean);

export default function ZoneList() {
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      title={t('DNS Zones')}
      breadcrumb={[t('Network'), t('DNS Zones')]}
      description={t('Manage DNS zones and their record sets (Designate).')}
      fetch={fetchZones}
      serverSide={zoneServerSide}
      columns={({ isAdmin }) => zoneColumns({ isAdmin, projectMap })}
      filterParams={[
        { name: 'name', label: t('Name') },
        { name: 'type', label: t('Type'), options: toFilterOptions(zoneTypes()) },
        { name: 'status', label: t('Status'), options: toFilterOptions(zoneStatus()) },
      ]}
      primaryActions={[createZoneAction()]}
      batchActions={[deleteZoneAction()]}
      rowActions={zoneRowActions()}
    />
  );
}
