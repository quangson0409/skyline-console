import React from 'react';
import { designateApi } from '@/api/designate';
import ResourcePage, { nameColumn, statusColumn, timeColumn, projectColumn } from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { zoneTypes, zoneStatus, toFilterOptions, zoneDetailPath } from './common';
import { createZoneAction, editZoneAction, deleteZoneAction, createRecordSetAction } from './actions';

export const fetchZones = ({ isAdmin } = {}) => designateApi.listZones({}, { allProjects: isAdmin });

export const zoneRowActions = () => ({
  firstAction: editZoneAction(),
  moreActions: [{ action: createRecordSetAction() }, { action: deleteZoneAction() }],
});

export const zoneColumns = ({ isAdmin, projectMap }) =>
  [
    nameColumn({ title: t('Zone ID/Name'), linkTo: (r) => zoneDetailPath(r.id, isAdmin) }),
    isAdmin && projectColumn(projectMap),
    {
      title: t('Type'),
      dataIndex: 'type',
      key: 'type',
      render: (v) => zoneTypes()[v] || v || '-',
    },
    statusColumn({ textMap: zoneStatus() }),
    timeColumn(),
  ].filter(Boolean);

export default function ZoneList() {
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      title={t('DNS Zones')}
      breadcrumb={[t('Network'), t('DNS Zones')]}
      description={t('Manage DNS zones and their record sets (Designate).')}
      fetch={fetchZones}
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
