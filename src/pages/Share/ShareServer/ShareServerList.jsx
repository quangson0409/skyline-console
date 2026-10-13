import React from 'react';
import { Link } from 'react-router-dom';
import { manilaApi } from '@/api/manila';
import ResourcePage, {
  statusColumn,
  textColumn,
  timeColumn,
  projectColumn,
  deleteAction,
  CopyText,
} from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { shareServerStatus, filterOptions, manilaIsTransition, shareNetworkLink } from '../shareShared';

/* ------------------------------------------------------------------ stores/manila/share-server */
export const fetchShareServers = async () => (await manilaApi.listShareServers())?.share_servers || [];

export const fetchShareServerDetail = async (id) => (await manilaApi.getShareServer(id))?.share_server;

export const deleteShareServerAction = () => ({
  ...deleteAction({
    name: t('Share Server'),
    title: t('Delete Share Server'),
    onDelete: (it) => manilaApi.deleteShareServer(it.id),
  }),
  actionName: t('Delete Share Server'),
});

export const shareServerActionConfigs = () => {
  const del = deleteShareServerAction();
  return { primaryActions: [], batchActions: [del], rowActions: { firstAction: del, moreActions: [] } };
};

export const shareServerColumns = ({ projectMap } = {}) => [
  {
    title: t('ID'),
    dataIndex: 'id',
    key: 'id',
    render: (v) => (
      <CopyText value={v}>
        <Link to={`/share/share-server-admin/detail/${v}`} style={{ fontWeight: 600 }}>
          {v}
        </Link>
      </CopyText>
    ),
  },
  textColumn(t('Host'), 'host'),
  projectColumn(projectMap),
  statusColumn({ textMap: shareServerStatus() }),
  {
    title: t('Share Network'),
    dataIndex: 'share_network_name',
    key: 'share_network_name',
    render: (v, r) => shareNetworkLink(r.share_network_id, v || r.share_network_id, true),
  },
  timeColumn(),
];

/** Legacy pages/share/containers/ShareServer (share-server-admin) */
export default function ShareServerList() {
  const projectMap = useProjectMap();
  return (
    <ResourcePage
      title={t('Share Servers')}
      breadcrumb={[t('Share File Storage'), t('Share Servers')]}
      description={t('Share servers created by drivers that handle share servers.')}
      fetch={fetchShareServers}
      columns={() => shareServerColumns({ projectMap })}
      filterParams={[
        { name: 'host', label: t('Host') },
        { name: 'status', label: t('Status'), options: filterOptions(shareServerStatus()) },
      ]}
      searchFields={['id', 'host', 'share_network_name']}
      isTransition={manilaIsTransition}
      batchActions={shareServerActionConfigs().batchActions}
      rowActions={shareServerActionConfigs().rowActions}
    />
  );
}
