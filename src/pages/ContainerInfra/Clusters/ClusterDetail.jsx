import React from 'react';
import { Link } from 'react-router-dom';
import { Row, Col } from 'antd';
import { magnumApi } from '@/api/magnum';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  clusterStatus,
  healthStatus,
  renderKeyValueList,
  refLink,
  keypairLink,
  fetchKeypairs,
  resolveFlavor,
  resolveNetwork,
  resolveSubnet,
  settled,
} from '../common';
import { clusterRowActions } from './actions';
import { resolveNodeServers, resolveClusterNetwork } from './nodeServers';

const adm = (isAdmin, path) => (isAdmin ? path.replace(/^(\/[^/]+\/[^/]+)/, '$1-admin') : path);

/** Legacy ClustersStore.fetchDetail + detailDidFetch */
export const fetchClusterDetail = async (id, { isAdmin } = {}) => {
  const raw = await magnumApi.getCluster(id);
  const item = { ...raw, uuid: raw.uuid || id, id: raw.uuid || id };
  let template = {};
  if (item.cluster_template_id) {
    template = (await magnumApi.getClusterTemplate(item.cluster_template_id).catch(() => ({}))) || {};
  }
  item.template = template;
  ['flavor_id', 'master_flavor_id', 'fixed_network', 'fixed_subnet'].forEach((key) => {
    if (!item[key] && template[key]) item[key] = template[key];
  });

  const [kp, fr, mfr, fx, sub, stack] = await settled([
    fetchKeypairs(),
    resolveFlavor(item.flavor_id),
    resolveFlavor(item.master_flavor_id),
    resolveNetwork(item.fixed_network),
    resolveSubnet(item.fixed_subnet),
    item.stack_id ? magnumApi.listStacks({ id: item.stack_id }) : Promise.resolve({}),
  ]);
  if (kp.status === 'fulfilled' && item.keypair && !kp.value.some((k) => k.name === item.keypair)) {
    item.original_keypair = item.keypair;
    item.keypair = null;
  }
  const apply = (result, key, target) => {
    if (!item[key]) return;
    if (result.status === 'fulfilled' && result.value) item[target] = result.value;
    else {
      item[`original_${key}`] = item[key];
      item[key] = null;
    }
  };
  apply(fr, 'flavor_id', 'flavor');
  apply(mfr, 'master_flavor_id', 'masterFlavor');
  apply(fx, 'fixed_network', 'fixedNetwork');
  apply(sub, 'fixed_subnet', 'fixedSubnet');
  if (stack.status === 'fulfilled' && stack.value?.stacks?.[0]) item.stack = stack.value.stacks[0];

  try {
    const { nodeServers, servers } = await resolveNodeServers(item, isAdmin);
    item.nodeServers = nodeServers;
    if ((!item.fixed_network || !item.fixed_subnet) && servers.length) {
      const { networkId, subnetId } = await resolveClusterNetwork(item, servers, isAdmin);
      if (networkId && !item.fixed_network) item.fixed_network = networkId;
      if (subnetId && !item.fixed_subnet) item.fixed_subnet = subnetId;
      const [net, snet] = await settled([
        networkId && !item.fixedNetwork ? resolveNetwork(networkId) : null,
        subnetId && !item.fixedSubnet ? resolveSubnet(subnetId) : null,
      ]);
      if (net.status === 'fulfilled' && net.value) item.fixedNetwork = net.value;
      if (snet.status === 'fulfilled' && snet.value) item.fixedSubnet = snet.value;
    }
  } catch {
    item.nodeServers = {};
  }
  return item;
};

function ClusterInfoTab({ d, isAdmin }) {
  const nodeServers = d.nodeServers || {};
  const renderNodes = (list) =>
    list && list.length
      ? list.map((name) => (
          <div key={name}>
            {nodeServers[name] ? <Link to={adm(isAdmin, `/compute/instance/detail/${nodeServers[name]}`)}>{name}</Link> : name}
          </div>
        ))
      : '-';
  const netId = d.fixedNetwork?.id || d.fixed_network;
  const subId = d.fixedSubnet?.id || d.fixed_subnet;
  const one = { xs: 1, sm: 1, md: 1 };
  const two = { xs: 1, sm: 1, md: 2 };

  return (
    <Row gutter={16}>
      <Col xs={24} xl={12}>
        <DetailCard
          title={t('Cluster Template')}
          column={one}
          items={[
            {
              label: t('Name'),
              render: () =>
                d.template?.name ? (
                  <Link to={`/container-infra/${isAdmin ? 'cluster-template-admin' : 'cluster-template'}/detail/${d.template.uuid}`}>
                    {d.template.name}
                  </Link>
                ) : (
                  d.cluster_template_id || '-'
                ),
            },
            { label: t('ID'), value: d.cluster_template_id, copyable: true },
            { label: t('COE'), value: d.template?.coe },
          ]}
        />
        <DetailCard
          title={t('Network')}
          column={one}
          items={[
            {
              label: t('Fixed Network'),
              render: () =>
                refLink({
                  id: netId,
                  original: d.original_fixed_network,
                  name: d.fixedNetwork?.name,
                  to: adm(isAdmin, `/network/networks/detail/${netId}`),
                }),
            },
            {
              label: t('Fixed Subnet'),
              render: () =>
                refLink({
                  id: netId && subId ? subId : null,
                  original: d.original_fixed_subnet,
                  name: d.fixedSubnet?.name,
                  to: adm(isAdmin, `/network/networks/detail/${netId}/subnet/${subId}`),
                }),
            },
            { label: t('Floating IP Enabled'), value: d.floating_ip_enabled === undefined ? undefined : d.floating_ip_enabled ? t('Yes') : t('No') },
            { label: t('Master Node LB Enabled'), value: d.master_lb_enabled === undefined ? undefined : d.master_lb_enabled ? t('Yes') : t('No') },
          ]}
        />
        <DetailCard
          title={t('Miscellaneous')}
          column={one}
          items={[
            {
              label: t('Discovery URL'),
              render: () =>
                d.discovery_url ? (
                  <a href={d.discovery_url} target="_blank" rel="noreferrer">
                    {d.discovery_url}
                  </a>
                ) : (
                  '-'
                ),
            },
            { label: t('Timeout (Minute)'), value: d.create_timeout },
            !isAdmin && {
              label: t('Keypair'),
              render: () => (d.original_keypair ? refLink({ original: d.original_keypair }) : keypairLink(d.keypair)),
            },
            { label: t('Docker Volume Size (GiB)'), value: d.docker_volume_size },
            { label: t('Kubernetes Version'), value: d.coe_version },
            { label: t('Container Version'), value: d.container_version },
          ].filter(Boolean)}
        />
      </Col>
      <Col xs={24} xl={12}>
        <DetailCard
          title={t('Nodes')}
          column={two}
          items={[
            {
              label: t('Master Node Flavor'),
              render: () =>
                refLink({
                  id: d.master_flavor_id,
                  original: d.original_master_flavor_id,
                  name: d.masterFlavor?.name,
                  to: adm(isAdmin, `/compute/flavor/detail/${d.masterFlavor?.id || d.master_flavor_id}`),
                }),
            },
            { label: t('Number of Master Nodes'), value: d.master_count },
            {
              label: t('Node Flavor'),
              render: () =>
                refLink({
                  id: d.flavor_id,
                  original: d.original_flavor_id,
                  name: d.flavor?.name,
                  to: adm(isAdmin, `/compute/flavor/detail/${d.flavor?.id || d.flavor_id}`),
                }),
            },
            { label: t('Number of Nodes'), value: d.node_count },
            { label: t('API Address'), value: d.api_address, copyable: true },
            { label: t('Master Node Addresses'), render: () => renderNodes(d.master_addresses) },
            { label: t('Node Addresses'), render: () => renderNodes(d.node_addresses) },
          ]}
        />
        <DetailCard title={t('Additional Labels')} column={one} items={[{ label: t('Labels'), render: () => renderKeyValueList(d.labels) }]} />
        <DetailCard
          title={t('Stack')}
          column={one}
          items={[
            {
              label: t('Stack ID'),
              render: () =>
                d.stack?.id ? (
                  <Link to={`/heat/stack/detail/${d.stack.id}/${encodeURIComponent(d.stack.stack_name || '')}`}>{d.stack.id}</Link>
                ) : (
                  d.stack_id || '-'
                ),
            },
            { label: t('Stack Faults'), render: () => renderKeyValueList(d.faults) },
          ]}
        />
        <DetailCard
          title={t('Health Checking Log')}
          column={one}
          items={[{ label: t('Log'), render: () => renderKeyValueList(d.health_status_reason) }]}
        />
      </Col>
    </Row>
  );
}

export default function ClusterDetail() {
  return (
    <ResourceDetail
      breadcrumb={[t('Container Infra'), { title: t('Clusters'), path: '/container-infra/clusters' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/container-infra/clusters-admin' : '/container-infra/clusters')}
      fetch={fetchClusterDetail}
      info={(d) => [
        { label: t('ID'), value: d.uuid, copyable: true },
        { label: t('Name'), value: d.name },
        { label: t('Status'), value: d.status, render: () => clusterStatus()[d.status] || d.status || '-' },
        { label: t('Status Reason'), value: d.status_reason },
        { label: t('Health Status'), value: d.health_status, render: () => healthStatus()[d.health_status] || d.health_status || '-' },
        { label: t('Project ID'), value: d.project_id },
        { label: t('Created At'), value: formatTime(d.created_at) },
        { label: t('Updated At'), value: formatTime(d.updated_at) },
      ]}
      tabs={(d, { isAdmin }) => [
        { key: 'general_info', label: t('Detail'), render: () => <ClusterInfoTab d={d} isAdmin={isAdmin} /> },
      ]}
      actions={({ isAdmin }) => clusterRowActions(isAdmin)}
    />
  );
}
