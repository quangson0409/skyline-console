import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col } from 'antd';
import { magnumApi } from '@/api/magnum';
import ResourceDetail from '@/components/ResourceDetail';
import DetailCard from '@/components/DetailCard';
import { formatTime } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  renderKeyValueList,
  refLink,
  keypairLink,
  fetchKeypairs,
  resolveFlavor,
  resolveNetwork,
  resolveSubnet,
  resolveImage,
  settled,
} from '../common';
import { templateRowActions } from './TemplateList';

const adm = (isAdmin, path) => (isAdmin ? path.replace(/^(\/[^/]+\/[^/]+)/, '$1-admin') : path);
const yn = (v) => (v === undefined || v === null ? undefined : v ? t('Yes') : t('No'));

/** Legacy ClusterTemplatesStore.detailDidFetch (refs that cannot be found are shown as deleted) */
export const fetchTemplateDetail = async (id) => {
  const raw = await magnumApi.getClusterTemplate(id);
  const item = { ...raw, uuid: raw.uuid || id, id: raw.uuid || id };
  const [kp, fr, mfr, ext, fx, sub, img] = await settled([
    fetchKeypairs(),
    resolveFlavor(item.flavor_id),
    resolveFlavor(item.master_flavor_id),
    resolveNetwork(item.external_network_id),
    resolveNetwork(item.fixed_network),
    resolveSubnet(item.fixed_subnet),
    resolveImage(item.image_id),
  ]);
  if (kp.status === 'fulfilled' && item.keypair_id && !kp.value.some((k) => k.name === item.keypair_id)) {
    item.original_keypair_id = item.keypair_id;
    item.keypair_id = null;
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
  apply(ext, 'external_network_id', 'externalNetwork');
  apply(fx, 'fixed_network', 'fixedNetwork');
  apply(sub, 'fixed_subnet', 'fixedSubnet');
  apply(img, 'image_id', 'image');
  return item;
};

function TemplateInfoTab({ d, isAdmin }) {
  const one = { xs: 1, sm: 1, md: 1 };
  const netId = d.fixedNetwork?.id || d.fixed_network;
  const subId = d.fixedSubnet?.id || d.fixed_subnet;
  const extId = d.externalNetwork?.id || d.external_network_id;
  return (
    <Row gutter={16}>
      <Col xs={24} xl={12}>
        <DetailCard
          title={t('Cluster Type')}
          column={one}
          items={[
            { label: t('COE'), value: d.coe },
            { label: t('Cluster Distro'), value: d.cluster_distro },
            { label: t('Server Type'), value: d.server_type },
            { label: t('Public'), value: yn(d.public) },
            { label: t('Hidden'), value: yn(d.hidden) },
            { label: t('Registry Enabled'), value: yn(d.registry_enabled) },
            { label: t('TLS Disabled'), value: yn(d.tls_disabled) },
            { label: t('API Server Port'), value: d.apiserver_port },
          ]}
        />
        <DetailCard
          title={t('Network')}
          column={one}
          items={[
            { label: t('Network Driver'), value: d.network_driver },
            { label: t('HTTP Proxy'), value: d.http_proxy },
            { label: t('HTTPS Proxy'), value: d.https_proxy },
            { label: t('No Proxy'), value: d.no_proxy },
            {
              label: t('External Network'),
              render: () =>
                refLink({
                  id: extId,
                  original: d.original_external_network_id,
                  name: d.externalNetwork?.name,
                  to: adm(isAdmin, `/network/networks/detail/${extId}`),
                }),
            },
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
            { label: t('DNS'), value: d.dns_nameserver },
            { label: t('Master Node LB Enabled'), value: yn(d.master_lb_enabled) },
            { label: t('Floating IP Enabled'), value: yn(d.floating_ip_enabled) },
          ]}
        />
      </Col>
      <Col xs={24} xl={12}>
        <DetailCard
          title={t('Node Spec')}
          column={one}
          items={[
            {
              label: t('Image'),
              render: () =>
                refLink({
                  id: d.image_id,
                  original: d.original_image_id,
                  name: d.image?.name,
                  to: adm(isAdmin, `/compute/image/detail/${d.image?.id || d.image_id}`),
                }),
            },
            !isAdmin && {
              label: t('Keypair'),
              render: () => (d.original_keypair_id ? refLink({ original: d.original_keypair_id }) : keypairLink(d.keypair_id)),
            },
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
            { label: t('Volume Driver'), value: d.volume_driver },
            { label: t('Docker Storage Driver'), value: d.docker_storage_driver },
            { label: t('Docker Volume Size (GiB)'), value: d.docker_volume_size },
            { label: t('Insecure Registry'), value: d.insecure_registry },
          ].filter(Boolean)}
        />
        <DetailCard title={t('Additional Labels')} column={one} items={[{ label: t('labels'), render: () => renderKeyValueList(d.labels) }]} />
      </Col>
    </Row>
  );
}

export default function TemplateDetail() {
  const navigate = useNavigate();
  return (
    <ResourceDetail
      policy="clustertemplate:detail"
      breadcrumb={[t('Container Infra'), { title: t('Cluster Templates'), path: '/container-infra/cluster-template' }]}
      backPath={({ isAdmin }) => (isAdmin ? '/container-infra/cluster-template-admin' : '/container-infra/cluster-template')}
      fetch={fetchTemplateDetail}
      info={(d, { isAdmin }) =>
        [
          { label: t('ID'), value: d.uuid, copyable: true },
          { label: t('Name'), value: d.name },
          { label: t('Created At'), value: formatTime(d.created_at) },
          { label: t('Updated At'), value: formatTime(d.updated_at) },
          isAdmin && { label: t('Project ID'), value: d.project_id },
        ].filter(Boolean)
      }
      tabs={(d, { isAdmin }) => [
        { key: 'general_info', label: t('Detail'), render: () => <TemplateInfoTab d={d} isAdmin={isAdmin} /> },
      ]}
      actions={({ isAdmin }) => templateRowActions(isAdmin, navigate)}
    />
  );
}
