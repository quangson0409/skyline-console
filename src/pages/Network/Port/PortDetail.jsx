import React, { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Button, Collapse, Divider, Empty, Space, Spin, Table } from 'antd';
import { neutronApi } from '@/api/neutron';
import ResourceDetail from '@/components/ResourceDetail';
import ResourcePage, { formatTime, yesNo, IdNameCell } from '@/components/ResourcePage';
import DetailCard from '@/components/DetailCard';
import useActionRunner from '@/components/Action/useActionRunner';
import { useResource } from '@/hooks/useResource';
import { t } from '@/core/i18n';
import { adminSuffix, detailPath, networkStatus } from '../common';
import { fetchPortDetail, fetchFixedIps, qosEnabled } from './helpers';
import {
  editPortAction,
  attachInstanceAction,
  detachInstanceAction,
  associateFipAction,
  disassociateFipAction,
  modifyQosAction,
  manageSecurityGroupAction,
  deletePortAction,
  allocateIpAction,
  releaseIpAction,
  createAllowedAddressPairAction,
  deleteAllowedAddressPairAction,
  detachSecurityGroupAction,
} from './actions';

/** Wraps an action so the port detail is reloaded after it succeeds */
const withRefetch = (action, refetch) =>
  action && action.onSubmit
    ? {
        ...action,
        onSubmit: async (...args) => {
          const res = await action.onSubmit(...args);
          refetch?.();
          return res;
        },
      }
    : action;

/* ---------------- context (parent resource from route params) ---------------- */
const useParentContext = () => {
  const { networkId, subnetId, instanceId } = useParams();
  const { pathname } = useLocation();
  const isAdmin = /-admin(\/|$)/.test(pathname);
  const sfx = adminSuffix(isAdmin);
  return useMemo(() => {
    if (subnetId) {
      const back = `/network/networks${sfx}/detail/${networkId}/subnet/${subnetId}?tab=ports`;
      return {
        back,
        breadcrumb: [
          t('Network'),
          { title: t('Networks'), path: `/network/networks${sfx}` },
          { title: networkId, path: `/network/networks${sfx}/detail/${networkId}?tab=subnets` },
          { title: subnetId, path: back },
        ],
      };
    }
    if (networkId) {
      const back = `/network/networks${sfx}/detail/${networkId}?tab=ports`;
      return {
        back,
        breadcrumb: [
          t('Network'),
          { title: t('Networks'), path: `/network/networks${sfx}` },
          { title: networkId, path: back },
        ],
      };
    }
    if (instanceId) {
      const back = `/compute/instance${sfx}/detail/${instanceId}?tab=interface`;
      return {
        back,
        breadcrumb: [
          t('Compute'),
          { title: t('Instances'), path: `/compute/instance${sfx}` },
          { title: instanceId, path: back },
        ],
      };
    }
    const back = `/network/port${sfx}`;
    return { back, breadcrumb: [t('Network'), { title: t('Ports'), path: back }] };
  }, [networkId, subnetId, instanceId, sfx]);
};

/* ---------------- Detail tab (legacy BaseDetail) ---------------- */
const BaseDetailTab = ({ detail, isAdmin }) => {
  const items = [
    { label: t('Device Owner'), value: detail.device_owner },
    {
      label: t('Device ID'),
      value: detail.device_id,
      render: () => {
        const { device_id, device_owner } = detail;
        const serverName = detail.itemInList?.server_name || detail.server_name;
        if (device_id && device_owner === 'compute:nova') {
          const value = serverName ? `${device_id} (${serverName})` : device_id;
          return <Link to={`/compute/instance${adminSuffix(isAdmin)}/detail/${device_id}?tab=interface`}>{value}</Link>;
        }
        return device_id || '-';
      },
    },
    { label: t('vNIC Type'), value: detail['binding:vnic_type'] || detail.binding_vnic_type },
  ];
  if (qosEnabled()) {
    items.push({
      label: t('QoS Policy'),
      value: detail.qos_policy_id,
      render: () => {
        const data = detail.qos_policy_id;
        if (!data) return '-';
        const name = detail.qosPolicy?.name;
        return <Link to={detailPath('qos-policy', data, isAdmin)}>{name ? `${data}(${name})` : data}</Link>;
      },
    });
  }
  items.push(
    { label: t('Host'), value: detail['binding:host_id'] },
    { label: t('Binding Profile'), value: detail['binding:profile'] ? JSON.stringify(detail['binding:profile']) : undefined },
    { label: t('Admin State'), value: detail.admin_state_up === undefined ? undefined : detail.admin_state_up ? t('Up') : t('Down') },
    { label: t('Updated At'), value: formatTime(detail.updated_at) }
  );
  return <DetailCard title={t('Base Info')} items={items} />;
};

/* ---------------- Fixed IPs tab ---------------- */
const FixedIpsTab = ({ detail, isAdmin, refetch }) => {
  const getPort = () => detail;
  const release = withRefetch(releaseIpAction(), refetch);
  const allocate = withRefetch(allocateIpAction({ getPort }), refetch);
  return (
    <ResourcePage
      embedded
      rowKey="id"
      deps={[detail]}
      fetch={() => fetchFixedIps(detail)}
      columns={[
        { title: t('IP Address'), dataIndex: 'ip_address', key: 'ip_address' },
        {
          title: t('Floating IP'),
          dataIndex: 'fip',
          key: 'fip',
          render: (fip) => (Array.isArray(fip) && fip.length ? fip[0].floating_ip_address : '-'),
        },
        {
          title: t('Subnet'),
          dataIndex: 'subnet_name',
          key: 'subnet_name',
          render: (v, r) => (r.subnet_id ? <IdNameCell id={r.subnet_id} name={v} bold={false} /> : v || '-'),
        },
      ]}
      filterParams={[
        { name: 'ip_address', label: t('IP Address') },
        { name: 'subnet_name', label: t('Subnet') },
      ]}
      primaryActions={isAdmin ? [] : [allocate]}
      batchActions={isAdmin ? [] : [release]}
      rowActions={{ firstAction: release, moreActions: [] }}
    />
  );
};

/* ---------------- Allowed Address Pairs tab ---------------- */
const AllowedAddressPairTab = ({ detail, isAdmin, refetch }) => {
  const getPort = () => detail;
  const del = withRefetch(deleteAllowedAddressPairAction({ getPort }), refetch);
  const create = withRefetch(createAllowedAddressPairAction({ getPort }), refetch);
  return (
    <ResourcePage
      embedded
      deps={[detail]}
      fetch={async () =>
        (Array.isArray(detail.allowed_address_pairs) ? detail.allowed_address_pairs : []).map((item, index) => ({
          ...item,
          name: item.ip_address,
          id: `port_detail_allowed_address_pair_${index}`,
        }))
      }
      columns={[
        { title: t('IP Address'), dataIndex: 'ip_address', key: 'ip_address', render: (v) => v || '-' },
        { title: t('MAC Address'), dataIndex: 'mac_address', key: 'mac_address', render: (v) => v || '-' },
      ]}
      filterParams={[
        { name: 'ip_address', label: t('IP Address') },
        { name: 'mac_address', label: t('MAC Address') },
      ]}
      primaryActions={isAdmin ? [] : [create]}
      rowActions={{ firstAction: del, moreActions: [] }}
    />
  );
};

/* ---------------- Security Groups tab ---------------- */
const directions = () => ({ ingress: t('Ingress'), egress: t('Egress') });

const protocolText = (protocol) => {
  if (typeof protocol === 'number') return protocol;
  if (!protocol || protocol === 'any') return t('Any');
  return String(protocol).toUpperCase();
};

const mapRule = (rule) => {
  let icmpTypeCode = '';
  let portRange = t('Any');
  const min = parseInt(rule.port_range_min, 10);
  const max = parseInt(rule.port_range_max, 10);
  if (min && max) portRange = min !== max ? `${min} : ${max}` : min;
  if (rule.protocol === 'icmp' && max) {
    icmpTypeCode = `${min} / ${max}`;
    portRange = '-';
  }
  return { ...rule, protocol: rule.protocol || 'any', port_range: portRange, icmpTypeCode };
};

const ruleColumns = (isAdmin) => [
  { title: t('Direction'), dataIndex: 'direction', key: 'direction', render: (v) => directions()[v] || v || '-' },
  { title: t('Ether Type'), dataIndex: 'ethertype', key: 'ethertype' },
  { title: t('IP Protocol'), dataIndex: 'protocol', key: 'protocol', render: protocolText },
  { title: t('Port Range'), dataIndex: 'port_range', key: 'port_range' },
  { title: t('Description'), dataIndex: 'description', key: 'description', render: (v) => v || '-' },
  {
    title: t('Remote IP Prefix'),
    dataIndex: 'remote_ip_prefix',
    key: 'remote_ip_prefix',
    render: (v, r) => (r.remote_group_id ? '-' : v || (r.ethertype === 'IPv4' ? '0.0.0.0/0' : '::/0')),
  },
  {
    title: t('Remote Group ID'),
    dataIndex: 'remote_group_id',
    key: 'remote_group_id',
    render: (v) => (v ? <Link to={detailPath('security-group', v, isAdmin)}>{v}</Link> : '-'),
  },
  { title: t('ICMP Type/ICMP Code'), dataIndex: 'icmpTypeCode', key: 'icmpTypeCode', render: (v) => v || '-' },
];

const SecurityGroupsTab = ({ detail, isAdmin, refetch }) => {
  const { data, loading, refetch: reload } = useResource(
    async () => {
      const port = (await neutronApi.getPort(detail.id))?.port || detail;
      const ids = Array.isArray(port.security_groups) ? port.security_groups : [];
      const groups = await Promise.all(
        ids.map((id) =>
          neutronApi
            .getSecurityGroup(id)
            .then((r) => r?.security_group || { id })
            .catch(() => ({ id }))
        )
      );
      return { port, groups };
    },
    [detail],
    { initial: { port: detail, groups: [] } }
  );
  const onRefresh = () => {
    reload();
    refetch?.();
  };
  const { handleAction, actionModal } = useActionRunner({ onRefresh });
  const port = data?.port || detail;
  const groups = data?.groups || [];
  const getPort = () => port;

  return (
    <div>
      {isAdmin ? null : (
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" onClick={() => handleAction(manageSecurityGroupAction(), port)}>
            {t('Manage Security Group')}
          </Button>
        </div>
      )}
      <Spin spinning={loading}>
        {groups.length ? (
          <Collapse
            accordion
            items={groups.map((sg) => ({
              key: sg.id,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span>
                    {t('Security Group')}
                    <Divider type="vertical" />
                    <Link to={detailPath('security-group', sg.id, isAdmin)} onClick={(e) => e.stopPropagation()}>
                      {sg.name || sg.id}
                    </Link>
                  </span>
                  {!isAdmin ? (
                    <Space size={12} onClick={(e) => e.stopPropagation()}>
                      <Link style={{ fontSize: 12 }} to={detailPath('security-group', sg.id, false)}>
                        {t('Edit Rule')}
                      </Link>
                      {groups.length !== 1 ? (
                        <Button size="small" danger type="link" onClick={() => handleAction(detachSecurityGroupAction({ getPort }), sg)}>
                          {t('Detach')}
                        </Button>
                      ) : null}
                    </Space>
                  ) : null}
                </div>
              ),
              children: (
                <div style={{ overflowX: 'auto' }}>
                  <Table
                    size="middle"
                    rowKey="id"
                    pagination={false}
                    columns={ruleColumns(isAdmin)}
                    dataSource={(Array.isArray(sg.security_group_rules) ? sg.security_group_rules : []).map(mapRule)}
                  />
                </div>
              ),
            }))}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '32px 0' }} />
        )}
      </Spin>
      {actionModal}
    </div>
  );
};

/* ---------------- detail page ---------------- */
export const portDetailActions = ({ isAdmin }) =>
  isAdmin
    ? { firstAction: deletePortAction(), moreActions: [] }
    : {
        firstAction: editPortAction(),
        moreActions: [
          { action: attachInstanceAction() },
          { action: associateFipAction({ isAdmin }) },
          { action: disassociateFipAction({ isAdmin }) },
          { action: detachInstanceAction() },
          { action: modifyQosAction() },
          { action: manageSecurityGroupAction() },
          { action: deletePortAction() },
        ],
      };

export default function PortDetail() {
  const { back, breadcrumb } = useParentContext();
  return (
    <ResourceDetail
      breadcrumb={breadcrumb}
      backPath={back}
      fetch={(id, ctx) => fetchPortDetail(id, ctx)}
      info={(d, { isAdmin }) => [
        { label: t('ID'), value: d.id, copyable: true },
        { label: t('Port Name'), value: d.name },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Status'), value: d.status, render: () => networkStatus()[d.status] || d.status || '-' },
        {
          label: t('Network'),
          value: d.network_name,
          render: () =>
            d.network_id ? <Link to={detailPath('networks', d.network_id, isAdmin)}>{d.network_name || d.network_id}</Link> : '-',
        },
        { label: t('Network ID'), value: d.network_id, copyable: true },
        { label: t('Port Security'), value: d.port_security_enabled, render: () => yesNo(d.port_security_enabled) },
        { label: t('MAC Address'), value: d.mac_address },
        { label: t('Description'), value: d.description },
        isAdmin && { label: t('Project ID'), value: d.project_id || d.tenant_id },
      ].filter(Boolean)}
      tabs={(d, { isAdmin, refetch }) => {
        const tabs = [
          { key: 'detail', label: t('Detail'), render: () => <BaseDetailTab detail={d} isAdmin={isAdmin} /> },
          {
            key: 'fixed_ips',
            label: t('Fixed IPs'),
            render: () => <FixedIpsTab detail={d} isAdmin={isAdmin} refetch={refetch} />,
          },
          {
            key: 'security_groups',
            label: t('Security Groups'),
            render: () => <SecurityGroupsTab detail={d} isAdmin={isAdmin} refetch={refetch} />,
          },
          {
            key: 'allowed_address_pair',
            label: t('Allowed Address Pairs'),
            render: () => <AllowedAddressPairTab detail={d} isAdmin={isAdmin} refetch={refetch} />,
          },
        ];
        return d.port_security_enabled ? tabs : tabs.filter((it) => it.key !== 'security_groups');
      }}
      actions={portDetailActions}
    />
  );
}
