import React from 'react';
import { Link } from 'react-router-dom';
import { manilaApi } from '@/api/manila';
import ResourcePage, { statusColumn, textColumn, timeColumn, deleteAction, CopyText, IdNameCell } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { shareStatus, filterOptions, manilaIsTransition } from '../shareShared';
import { resetShareStatusAction } from '../Share/shareActions';

/* ------------------------------------------------------------------ stores/manila/share-instance */
export const fetchShareInstances = async () => (await manilaApi.listShareInstances())?.share_instances || [];

export const fetchShareInstanceDetail = async (id) => {
  const item = (await manilaApi.getShareInstance(id))?.share_instance;
  if (!item) return item;
  const res = await manilaApi.listShareInstanceExportLocations(id).catch(() => ({}));
  return { ...item, exportLocations: res?.export_locations || [] };
};

/* ------------------------------------------------------------------ actions */
export const forceDeleteShareInstanceAction = () => ({
  ...deleteAction({
    name: t('Share Instance'),
    title: t('Force Delete Share Instance'),
    onDelete: (it) => manilaApi.shareInstanceAction(it.id, { force_delete: null }),
  }),
  policy: 'share_instance:force_delete',
  actionName: t('Force Delete Share Instance'),
  buttonText: t('Force Delete'),
});

export const shareInstanceActionConfigs = () => {
  const del = forceDeleteShareInstanceAction();
  return {
    primaryActions: [],
    batchActions: [del],
    rowActions: { firstAction: del, moreActions: [{ action: resetShareStatusAction({ instance: true }) }] },
  };
};

export const shareInstanceColumns = () => [
  {
    title: t('ID'),
    dataIndex: 'id',
    key: 'id',
    render: (v) => (
      <CopyText value={v}>
        <Link to={`/share/share-instance-admin/detail/${v}`} style={{ fontWeight: 600 }}>
          {v}
        </Link>
      </CopyText>
    ),
  },
  textColumn(t('Host'), 'host'),
  statusColumn({ textMap: shareStatus() }),
  textColumn(t('Availability Zone'), 'availability_zone'),
  {
    title: t('Share Network'),
    dataIndex: 'share_network_id',
    key: 'share_network_id',
    render: (v) => <IdNameCell id={v} href={v ? `/share/share-network-admin/detail/${v}` : undefined} bold={false} />,
  },
  {
    title: t('Share Server'),
    dataIndex: 'share_server_id',
    key: 'share_server_id',
    render: (v) => <IdNameCell id={v} href={v ? `/share/share-server-admin/detail/${v}` : undefined} bold={false} />,
  },
  { title: t('Share ID'), dataIndex: 'share_id', key: 'share_id', render: (v) => <IdNameCell id={v} href={v ? `/share/share-admin/detail/${v}` : undefined} bold={false} /> },
  timeColumn(),
];

/** Legacy pages/share/containers/ShareInstance (share-instance-admin) */
export default function ShareInstanceList() {
  return (
    <ResourcePage
      policy="share_instance:index"
      title={t('Share Instances')}
      breadcrumb={[t('Share File Storage'), t('Share Instances')]}
      description={t('Backend instances (replicas) of every share, visible to administrators.')}
      fetch={fetchShareInstances}
      columns={shareInstanceColumns}
      filterParams={[
        { name: 'id', label: t('ID') },
        { name: 'status', label: t('Status'), options: filterOptions(shareStatus()) },
      ]}
      searchFields={['id', 'host', 'share_id']}
      isTransition={manilaIsTransition}
      primaryActions={[]}
      batchActions={shareInstanceActionConfigs().batchActions}
      rowActions={shareInstanceActionConfigs().rowActions}
    />
  );
}
