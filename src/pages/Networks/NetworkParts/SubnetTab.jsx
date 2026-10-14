/**
 * Subnets tab of the network detail (port of legacy pages/network/containers/Subnet/index.jsx).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { neutronApi } from '@/api/neutron';
import ResourcePage, { nameColumn, textColumn, timeColumn } from '@/components/ResourcePage';
import { adminSuffix } from '@/pages/Network/common';
import { t } from '@/core/i18n';
import { createSubnetAction, editSubnetAction, deleteSubnetAction } from './actions';

export const subnetDetailPath = (networkId, subnetId, isAdmin) =>
  `/network/networks${adminSuffix(isAdmin)}/detail/${networkId}/subnet/${subnetId}`;

export const fetchNetworkSubnets = async (network, { isAdmin, projectId }) => {
  const networkId = network?.id;
  const res = await neutronApi.listSubnets({ network_id: networkId });
  const items = res?.subnets || [];
  if (!items.length) return items;
  const portParams = { network_id: networkId };
  if (!isAdmin && projectId) portParams.tenant_id = projectId;
  const ports = (await neutronApi.listPorts(portParams).catch(() => ({})))?.ports || [];
  const ipUsage = network?.subnet_ip_availability || [];
  return items.map((it) => {
    const ipInfo = ipUsage.find((u) => u.subnet_id === it.id) || {};
    const subnetPorts = ports.filter((p) => (p.fixed_ips || []).some((ip) => ip.subnet_id === it.id));
    return { ...it, total_ips: ipInfo.total_ips, used_ips: ipInfo.used_ips, subnetPorts };
  });
};

export const subnetColumns = ({ isAdmin, hasAdminRole }) =>
  [
    nameColumn({
      title: t('Subnet ID/Name'),
      linkTo: (r) => subnetDetailPath(r.network_id, r.id, isAdmin),
    }),
    textColumn(t('CIDR'), 'cidr'),
    textColumn(t('Gateway IP'), 'gateway_ip'),
    textColumn(t('IP Version'), 'ip_version'),
    {
      title: t('Port Count'),
      dataIndex: 'subnetPorts',
      key: 'subnetPorts',
      render: (value, r) => {
        const count = (value || []).length;
        if (!count) return '-';
        return <Link to={`${subnetDetailPath(r.network_id, r.id, isAdmin)}?tab=ports`}>{count}</Link>;
      },
    },
    hasAdminRole && textColumn(t('Total IPs'), 'total_ips'),
    hasAdminRole && {
      ...textColumn(t('Used IPs'), 'used_ips'),
      title: isAdmin ? (
        t('Used IPs')
      ) : (
        <span>
          {t('Used IPs')}{' '}
          <Tooltip title={t('Number of IPs used by all projects')}>
            <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
          </Tooltip>
        </span>
      ),
    },
    timeColumn(),
  ].filter(Boolean);

export function SubnetsEmbedded({ network }) {
  return (
    <ResourcePage
      embedded
      policy="get_subnet"
      fetch={(ctx) => fetchNetworkSubnets(network, ctx)}
      deps={[network?.id, network?.subnet_ip_availability]}
      columns={(ctx) => subnetColumns(ctx)}
      filterParams={[{ name: 'name', label: t('Name') }]}
      primaryActions={(ctx) => [createSubnetAction(ctx, network)].filter((a) => a.allowed(network))}
      batchActions={(ctx) => [deleteSubnetAction(ctx)]}
      rowActions={(ctx) => ({
        firstAction: editSubnetAction(ctx),
        moreActions: [{ action: deleteSubnetAction(ctx) }],
      })}
    />
  );
}

export default SubnetsEmbedded;
