import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Checkbox, Form, Input, InputNumber, Select } from 'antd';
import { magnumApi } from '@/api/magnum';
import { neutronApi } from '@/api/neutron';
import { glanceApi } from '@/api/glance';
import { currentProjectId } from '@/api/endpoints';
import { useAuthStore } from '@/store/authStore';
import SelectTable from '@/components/SelectTable';
import { t } from '@/core/i18n';
import StepWizard, { selectRequired, selection, firstKey } from '@/components/Wizard/StepWizard';
import { fetchFlavors, fetchKeypairs, findRef, flavorColumns, keypairColumns, networkColumns, subnetColumns, imageColumns, labelsToList, listToLabels, settled } from '../common';
import KeyValueList from '@/components/form/KeyValueList';
import { fetchTemplateDetail } from './TemplateDetail';

const ACCEPTED_IMAGE_OS = ['ubuntu'];
const NETWORK_DRIVERS = [
  { value: 'calico', label: 'Calico' },
  { value: 'cilium', label: 'Cilium' },
  { value: 'flannel', label: 'Flannel' },
];
const VOLUME_DRIVERS = [{ value: 'cinder', label: 'Cinder' }];

/** Fields submitted by the legacy step forms (in step order) */
const PLAIN_FIELDS = [
  'name',
  'public',
  'hidden',
  'registry_enabled',
  'tls_disabled',
  'volume_driver',
  'docker_storage_driver',
  'docker_volume_size',
  'network_driver',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'dns_nameserver',
  'master_lb_enabled',
  'floating_ip_enabled',
];

/** Legacy ClusterTemplatesStore.update: JSON patch built from the form body */
export const buildTemplatePatch = (body) =>
  Object.keys(body)
    .filter((key) => !(['network_driver', 'external_network_id'].includes(key) && !body[key]))
    .map((key) => ({
      path: `/${key}`,
      value: key === 'labels' ? JSON.stringify(body[key] || {}) : typeof body[key] === 'boolean' ? `${body[key]}` : body[key],
      op: [null, undefined, ''].includes(body[key]) ? 'remove' : 'replace',
    }));

export default function TemplateForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form] = Form.useForm();
  const hasAdminRole = useAuthStore((s) => s.hasAdminRole);
  const projectId = currentProjectId();

  const [images, setImages] = useState([]);
  const [keypairs, setKeypairs] = useState([]);
  const [flavors, setFlavors] = useState([]);
  const [externalNetworks, setExternalNetworks] = useState([]);
  const [privateNetworks, setPrivateNetworks] = useState([]);
  const [subnets, setSubnets] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const values = Form.useWatch([], form) || {};

  useEffect(() => {
    let alive = true;
    (async () => {
      const [img, kp, fl, ext, priv, sub, det] = await settled([
        glanceApi.listAllImages(hasAdminRole ? { all_projects: true } : {}),
        fetchKeypairs(),
        fetchFlavors(),
        neutronApi.listNetworks({ 'router:external': true }),
        neutronApi.listNetworks({ 'router:external': false, project_id: projectId }),
        neutronApi.listSubnets(),
        isEdit ? fetchTemplateDetail(id) : null,
      ]);
      if (!alive) return;
      const imageList = (img.status === 'fulfilled' ? img.value?.images || [] : []).filter((it) =>
        ACCEPTED_IMAGE_OS.includes(it.os_distro)
      );
      const kps = kp.status === 'fulfilled' ? kp.value : [];
      const fls = fl.status === 'fulfilled' ? fl.value : [];
      const nameIt = (list) => list.map((n) => ({ ...n, name: n.name || n.id }));
      const exts = nameIt(ext.status === 'fulfilled' ? ext.value?.networks || [] : []);
      const privs = nameIt(priv.status === 'fulfilled' ? priv.value?.networks || [] : []);
      const subs = sub.status === 'fulfilled' ? sub.value?.subnets || [] : [];
      setImages(imageList);
      setKeypairs(kps);
      setFlavors(fls);
      setExternalNetworks(exts);
      setPrivateNetworks(privs);
      setSubnets(subs);
      if (isEdit && det.status === 'fulfilled' && det.value) {
        const d = det.value;
        setDetail(d);
        // references that cannot be resolved are kept as they are (not silently removed on save)
        const keep = (row, ref) => row || (ref ? { id: ref, name: ref } : null);
        const imageRow = keep(d.image || findRef(imageList, d.image_id || d.original_image_id), d.image_id || d.original_image_id);
        const extRow = keep(
          d.externalNetwork || findRef(exts, d.external_network_id || d.original_external_network_id),
          d.external_network_id || d.original_external_network_id
        );
        const netRow = keep(d.fixedNetwork || findRef(privs, d.fixed_network || d.original_fixed_network), d.fixed_network || d.original_fixed_network);
        const subRow = keep(d.fixedSubnet || findRef(subs, d.fixed_subnet || d.original_fixed_subnet), d.fixed_subnet || d.original_fixed_subnet);
        const flavorRow = keep(d.flavor || findRef(fls, d.flavor_id || d.original_flavor_id), d.flavor_id || d.original_flavor_id);
        const masterRow = keep(
          d.masterFlavor || findRef(fls, d.master_flavor_id || d.original_master_flavor_id),
          d.master_flavor_id || d.original_master_flavor_id
        );
        const keypairRef = d.keypair_id || d.original_keypair_id;
        form.setFieldsValue({
          name: d.name,
          coe: d.coe || 'kubernetes',
          public: d.public,
          hidden: d.hidden,
          registry_enabled: d.registry_enabled,
          tls_disabled: d.tls_disabled,
          volume_driver: d.volume_driver,
          docker_storage_driver: d.docker_storage_driver,
          docker_volume_size: d.docker_volume_size,
          network_driver: d.network_driver,
          http_proxy: d.http_proxy,
          https_proxy: d.https_proxy,
          no_proxy: d.no_proxy,
          dns_nameserver: d.dns_nameserver,
          master_lb_enabled: d.master_lb_enabled,
          floating_ip_enabled: d.floating_ip_enabled,
          images: selection(imageRow ? { ...imageRow, name: imageRow.name || imageRow.id } : null),
          keypair: keypairRef ? selection(findRef(kps, keypairRef) || { id: keypairRef, name: keypairRef }, 'name') : selection(null),
          flavor: selection(flavorRow),
          masterFlavor: selection(masterRow),
          externalNetwork: selection(extRow),
          fixedNetwork: selection(netRow),
          fixedSubnet: selection(subRow),
          additionalLabels: labelsToList(d.labels),
        });
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit, projectId, hasAdminRole]);

  const minVolumeSize = values.docker_storage_driver === 'devicemapper' ? 3 : 1;
  const subnetList = subnets.filter((s) => s.network_id === firstKey(values.fixedNetwork));

  /** Legacy StepCreate.onSubmit */
  const onSubmit = (all) => {
    const rest = {};
    PLAIN_FIELDS.forEach((key) => {
      if (all[key] !== undefined) rest[key] = all[key];
    });
    if (!isEdit) rest.coe = all.coe || 'kubernetes';
    const body = {
      ...rest,
      labels: listToLabels(all.additionalLabels),
      external_network_id: firstKey(all.externalNetwork),
      fixed_network: firstKey(all.fixedNetwork) || null,
      fixed_subnet: firstKey(all.fixedSubnet) || null,
      flavor_id: firstKey(all.flavor) || null,
      master_flavor_id: firstKey(all.masterFlavor) || null,
      image_id: firstKey(all.images) || null,
      keypair_id: firstKey(all.keypair) || null,
    };
    if (isEdit) return magnumApi.updateClusterTemplate(id, buildTemplatePatch(body));
    return magnumApi.createClusterTemplate(body);
  };

  const networkHeader = (
    <span>
      {t('You can go to the console to')}{' '}
      <Link to="/network/networks" target="_blank">
        {t('create a new network/subnet')} &gt;
      </Link>
    </span>
  );

  const steps = [
    {
      title: t('Cluster Info'),
      fields: ['name'],
      content: (
        <>
          <Form.Item name="name" label={t('Cluster Template Name')} rules={[{ required: true, message: t('Please input cluster template name') }]}>
            <Input placeholder={t('Please input cluster template name')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="coe" label={t('COE')} extra={t('Container Orchestration Engine of the clusters created from this template.')}>
            <Select disabled={isEdit} options={[{ value: 'kubernetes', label: 'Kubernetes' }]} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="public" label={t('Public')} valuePropName="checked">
            <Checkbox />
          </Form.Item>
          <Form.Item name="hidden" label={t('Hidden')} valuePropName="checked">
            <Checkbox />
          </Form.Item>
          <Form.Item name="registry_enabled" label={t('Enable Registry')} valuePropName="checked">
            <Checkbox />
          </Form.Item>
          <Form.Item name="tls_disabled" label={t('Disable TLS')} valuePropName="checked">
            <Checkbox />
          </Form.Item>
        </>
      ),
    },
    {
      title: t('Node Spec'),
      fields: ['images', 'docker_volume_size'],
      content: (
        <>
          <Form.Item name="images" label={t('Image')} required rules={[selectRequired(t('Image'))]}>
            <SelectTable data={images} isLoading={loading} columns={imageColumns()} filterParams={[{ label: t('Name'), name: 'name' }]} />
          </Form.Item>
          <Form.Item
            name="keypair"
            label={t('Keypair')}
            extra={t(
              'The SSH key is a way to remotely log in to the cluster instance. The cloud platform only helps to keep the public key. Please keep your private key properly.'
            )}
          >
            <SelectTable
              data={keypairs}
              rowKey="name"
              isLoading={loading}
              columns={keypairColumns()}
              filterParams={[{ label: t('Name'), name: 'name' }]}
              header={
                <span>
                  {t('You can go to the console to')}{' '}
                  <Link to="/compute/keypair" target="_blank">
                    {t('create a new keypair')} &gt;
                  </Link>
                </span>
              }
            />
          </Form.Item>
          <Form.Item name="flavor" label={t('Flavor of Nodes')}>
            <SelectTable data={flavors} isLoading={loading} columns={flavorColumns()} filterParams={[{ label: t('Name'), name: 'name' }]} />
          </Form.Item>
          <Form.Item name="masterFlavor" label={t('Flavor of Master Nodes')}>
            <SelectTable data={flavors} isLoading={loading} columns={flavorColumns()} filterParams={[{ label: t('Name'), name: 'name' }]} />
          </Form.Item>
          <Form.Item name="volume_driver" label={t('Volume Driver')}>
            <Select allowClear options={VOLUME_DRIVERS} style={{ maxWidth: 520 }} placeholder={t('Please select')} />
          </Form.Item>
          <Form.Item name="docker_storage_driver" label={t('Docker Storage Driver')}>
            <Select
              allowClear
              options={[{ value: 'overlay2', label: t('Overlay2') }]}
              style={{ maxWidth: 520 }}
              placeholder={t('Please select')}
              onChange={() => form.setFieldsValue({ docker_volume_size: undefined })}
            />
          </Form.Item>
          <Form.Item
            name="docker_volume_size"
            label={t('Docker Volume Size (GiB)')}
            required={minVolumeSize === 3}
            rules={[
              {
                validator: (_, v) =>
                  minVolumeSize === 3 && (!v || v < minVolumeSize)
                    ? Promise.reject(new Error(t('The min size is {size} GiB', { size: minVolumeSize })))
                    : Promise.resolve(),
              },
            ]}
          >
            <InputNumber min={minVolumeSize} precision={0} placeholder={t('Spec')} style={{ width: 160 }} />
          </Form.Item>
        </>
      ),
    },
    {
      title: t('Network Setting'),
      fields: ['externalNetwork'],
      content: (
        <>
          <Form.Item name="network_driver" label={t('Network Driver')}>
            <Select
              allowClear
              options={NETWORK_DRIVERS}
              placeholder={t('Choose a Network Driver')}
              disabled={isEdit && Boolean(detail?.network_driver)}
              style={{ maxWidth: 520 }}
            />
          </Form.Item>
          <Form.Item name="http_proxy" label={t('HTTP Proxy')}>
            <Input placeholder={t('The HTTP Proxy address to use for nodes in cluster')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="https_proxy" label={t('HTTPS Proxy')}>
            <Input placeholder={t('The HTTPS Proxy address to use for nodes in cluster')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="no_proxy" label={t('No Proxy')}>
            <Input placeholder={t('The No Proxy address to use for nodes in cluster')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="externalNetwork" label={t('External Network')} required rules={[selectRequired(t('External Network'))]}>
            <SelectTable data={externalNetworks} isLoading={loading} columns={networkColumns()} filterParams={[{ label: t('Name'), name: 'name' }]} />
          </Form.Item>
          <Form.Item name="fixedNetwork" label={t('Fixed Network')}>
            <SelectTable
              data={privateNetworks}
              isLoading={loading}
              columns={networkColumns()}
              filterParams={[{ label: t('Name'), name: 'name' }]}
              header={networkHeader}
              onChange={(v) => form.setFieldsValue({ fixedNetwork: v, fixedSubnet: selection(null) })}
            />
          </Form.Item>
          <Form.Item name="fixedSubnet" label={t('Fixed Subnet')}>
            <SelectTable data={subnetList} columns={subnetColumns()} filterParams={[{ label: t('Name'), name: 'name' }]} />
          </Form.Item>
          <Form.Item name="dns_nameserver" label={t('DNS')}>
            <Input placeholder={t('The DNS nameserver to use for this cluster template')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="master_lb_enabled" label={t('Enable Load Balancer')} valuePropName="checked">
            <Checkbox>{t('Enabled Load Balancer for Master Nodes')}</Checkbox>
          </Form.Item>
          <Form.Item
            name="floating_ip_enabled"
            label={t('Enable Floating IP')}
            valuePropName="checked"
            extra={t('Whether enable or not using the floating IP of cloud provider.')}
          >
            <Checkbox />
          </Form.Item>
        </>
      ),
    },
    {
      title: t('Additional Labels'),
      fields: [],
      content: (
        <Form.Item name="additionalLabels" label={t('Additional Labels')}>
          <KeyValueList addText={t('Add Label')} />
        </Form.Item>
      ),
    },
  ];

  const title = isEdit ? t('Update Cluster Template') : t('Create Cluster Template');
  return (
    <StepWizard
      title={title}
      listPath="/container-infra/cluster-template"
      listTitle={t('Cluster Templates')}
      form={form}
      loading={loading}
      initialValues={{ coe: 'kubernetes', additionalLabels: [] }}
      steps={steps}
      onSubmit={onSubmit}
    />
  );
}
