import React, { useEffect, useState } from 'react';
import { Popover, List, Tag } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { neutronApi, neutronResources } from '@/api/neutron';
import { novaApi } from '@/api/nova';
import ResourcePage, {
  statusColumn,
  timeColumn,
  projectColumn,
  IdNameCell,
  useIsAdminPage,
} from '@/components/ResourcePage';
import { useProjectMap } from '@/hooks/useProjectMap';
import { t } from '@/core/i18n';
import { detailPath, listAll } from '@/pages/Network/common';
import { floatingIpStatus, getLoadBalancer, getPortForwardingName, qosEnabled, fetchPfwEnabled } from './helpers';
import {
  allocateAction,
  associateAction,
  createPortForwardingAction,
  disassociateAction,
  editFloatingIpAction,
  releaseAction,
} from './actions';

/* ---------------- fetch (legacy FloatingIpStore.fetchListWithResourceName) ---------------- */
const resolveResourceName = async (fip) => {
  const pd = fip.port_details;
  if (!pd) return '-';
  try {
    let name;
    if (pd.device_owner === 'network:router_gateway') {
      name = (await neutronApi.getRouter(pd.device_id))?.router?.name;
    } else if (pd.device_owner === 'compute:nova') {
      name = (await novaApi.getServer(pd.device_id))?.server?.name;
    } else if (pd.device_owner === 'Octavia') {
      name = (await getLoadBalancer(String(pd.device_id || '').replace('lb-', '')))?.name;
    } else if (pd.device_owner === '') {
      name = pd.name;
    } else {
      return '-';
    }
    return `${name}: ${fip.fixed_ip_address}`;
  } catch {
    // resources from other projects
    return `${t('Resource ID')}: ${pd.device_id} `;
  }
};

export const fetchFloatingIps = async ({ isAdmin, projectId, params = {} } = {}) => {
  const query = { ...params };
  if (!isAdmin && projectId) query.project_id = projectId;
  const res = await neutronResources.floatingips.list(query);
  let items = (res?.floatingips || []).filter(
    (it) => isAdmin || !projectId || !it.project_id || it.project_id === projectId
  );
  if (qosEnabled() && items.some((it) => it.qos_policy_id)) {
    const policies = await listAll.qosPolicies();
    const map = Object.fromEntries(policies.map((p) => [p.id, p.name]));
    items = items.map((it) => (it.qos_policy_id ? { ...it, qos_policy_name: map[it.qos_policy_id] } : it));
  }
  const names = await Promise.all(items.map(resolveResourceName));
  return items.map((it, idx) => ({
    ...it,
    name: it.floating_ip_address,
    project_id: it.project_id || it.tenant_id,
    resource_name: names[idx],
  }));
};

/* ---------------- columns ---------------- */
const sortedPfs = (record) =>
  [...(record?.port_forwardings || [])].sort((a, b) => (a.external_port || 0) - (b.external_port || 0));

export const PortForwardingPopover = ({ record }) => {
  const data = sortedPfs(record);
  if (!data.length) return '-';
  const content = (
    <List
      size="small"
      pagination={data.length > 10 ? { pageSize: 10, size: 'small', showSizeChanger: false } : false}
      dataSource={data}
      renderItem={(item) => (
        <div style={{ height: 30, lineHeight: '30px' }}>{getPortForwardingName(item, record.floating_ip_address)}</div>
      )}
    />
  );
  return (
    <Popover content={content} title={t('Port Forwardings')} destroyTooltipOnHide placement="right">
      <span style={{ cursor: 'pointer' }}>
        {t('{number} {resource}', { number: data.length, resource: t('Port Forwardings') })}&nbsp;
        <FileTextOutlined />
      </span>
    </Popover>
  );
};

export const floatingIpColumns = ({ isAdmin, projectMap, hideQos } = {}) =>
  [
    {
      title: t('ID/Floating IP'),
      dataIndex: 'floating_ip_address',
      key: 'floating_ip_address',
      sorter: (a, b) => String(a.floating_ip_address || '').localeCompare(String(b.floating_ip_address || '')),
      render: (ip, r) => <IdNameCell id={r.id} name={ip} href={detailPath('floatingip', r.id, isAdmin)} />,
    },
    qosEnabled() &&
      !hideQos && {
        title: t('QoS Policy ID/Name'),
        dataIndex: 'qos_policy_name',
        key: 'qos_policy_name',
        render: (v, r) =>
          r.qos_policy_id ? (
            <IdNameCell
              id={r.qos_policy_id}
              name={v && v !== r.qos_policy_id ? v : undefined}
              href={detailPath('qos-policy', r.qos_policy_id, isAdmin)}
              bold={false}
            />
          ) : (
            '-'
          ),
      },
    isAdmin && projectColumn(projectMap),
    { title: t('Description'), dataIndex: 'description', key: 'description', render: (v) => v || '-' },
    {
      title: t('Fixed IP (Mapped)'),
      dataIndex: 'fixed_ip_address',
      key: 'fixed_ip_address',
      render: (v) =>
        v ? <Tag color="cyan">{v}</Tag> : <span style={{ color: '#94a3b8', fontSize: 12 }}>{t('Unassociated')}</span>,
    },
    {
      title: t('Associated Resource'),
      dataIndex: 'resource_name',
      key: 'resource_name',
      render: (v, r) => (v && v !== '-' ? v : <PortForwardingPopover record={r} />),
    },
    statusColumn({ textMap: floatingIpStatus() }),
    timeColumn(),
  ].filter(Boolean);

export const floatingIpFilters = ({ isAdmin } = {}) =>
  [
    { name: 'floating_ip_address', label: t('Floating IP') },
    { name: 'fixed_ip_address', label: t('Fixed IP') },
    {
      name: 'status',
      label: t('Status'),
      options: Object.entries(floatingIpStatus()).map(([key, label]) => ({ key, label })),
    },
    isAdmin && { name: 'project_id', label: t('Project ID') },
  ].filter(Boolean);

export const floatingIpRowActions = ({ isAdmin, pfwEnabled }) =>
  isAdmin
    ? { firstAction: releaseAction(), moreActions: [] }
    : {
        firstAction: editFloatingIpAction(),
        moreActions: [
          { action: associateAction() },
          { action: disassociateAction() },
          { action: createPortForwardingAction({ enabled: pfwEnabled }) },
          { action: releaseAction() },
        ],
      };

export default function FloatingIpList() {
  const projectMap = useProjectMap();
  const isAdminPage = useIsAdminPage();
  const [pfwEnabled, setPfwEnabled] = useState(false);
  useEffect(() => {
    fetchPfwEnabled().then(setPfwEnabled);
  }, []);

  return (
    <ResourcePage
      title={t('Floating IPs')}
      breadcrumb={[t('Network'), t('Floating IPs')]}
      description={t('Public IP addresses routed from external networks to cloud compute instances.')}
      fetch={fetchFloatingIps}
      columns={({ isAdmin }) => floatingIpColumns({ isAdmin, projectMap })}
      filterParams={floatingIpFilters({ isAdmin: isAdminPage })}
      primaryActions={[allocateAction()]}
      batchActions={[releaseAction()]}
      rowActions={({ isAdmin }) => floatingIpRowActions({ isAdmin, pfwEnabled })}
      interval={15000}
    />
  );
}
