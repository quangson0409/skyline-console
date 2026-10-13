import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Checkbox, Divider, Form, Input, InputNumber } from 'antd';
import { magnumApi } from '@/api/magnum';
import { neutronApi } from '@/api/neutron';
import { quotaApi } from '@/api/quota';
import { currentProjectId, hasEndpoint } from '@/api/endpoints';
import SelectTable from '@/pages/Instances/Create/components/SelectTable';
import QuotaPanel from '@/pages/Instances/Create/components/QuotaPanel';
import { t } from '@/core/i18n';
import StepWizard, { selectRequired, selection, firstKey } from '../StepWizard';
import {
  defaultTip,
  fetchFlavors,
  fetchKeypairs,
  findRef,
  flavorColumns,
  keypairColumns,
  networkColumns,
  subnetColumns,
  KeyValueList,
  labelsToList,
  listToLabels,
  getGiBValue,
  updateQuotaData,
  getQuotaMessage,
  settled,
} from '../common';
import { templateColumns, fetchTemplates } from '../ClusterTemplates/TemplateList';

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;

/** Legacy updateNovaQuota: ram in GiB */
const novaQuotaGiB = (quota = {}) => {
  const { ram: { limit = 0, in_use = 0, reserved = 0 } = {} } = quota;
  return {
    ...quota,
    ram: { in_use: getGiBValue(in_use), limit: limit === -1 ? limit : getGiBValue(limit), reserved: getGiBValue(reserved) },
  };
};

export default function ClusterCreate() {
  const [form] = Form.useForm();
  const [searchParams] = useSearchParams();
  const templateParam = searchParams.get('template');
  const projectId = currentProjectId();
  const enableCinder = hasEndpoint('cinder');

  const [templates, setTemplates] = useState([]);
  const [flavors, setFlavors] = useState([]);
  const [keypairs, setKeypairs] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [subnets, setSubnets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  const values = Form.useWatch([], form) || {};

  // ------------------------------------------------------------ data
  useEffect(() => {
    let alive = true;
    (async () => {
      const [tp, fl, kp, nets, subs] = await settled([
        fetchTemplates(),
        fetchFlavors(),
        fetchKeypairs(),
        neutronApi.listNetworks({ 'router:external': false, project_id: projectId }),
        neutronApi.listSubnets(),
      ]);
      if (!alive) return;
      const tpl = tp.status === 'fulfilled' ? tp.value : [];
      setTemplates(templateParam ? tpl.filter((it) => it.uuid === templateParam) : tpl);
      setFlavors(fl.status === 'fulfilled' ? fl.value : []);
      setKeypairs(kp.status === 'fulfilled' ? kp.value : []);
      setNetworks(nets.status === 'fulfilled' ? (nets.value?.networks || []).map((n) => ({ ...n, name: n.name || n.id })) : []);
      setSubnets(subs.status === 'fulfilled' ? subs.value?.subnets || [] : []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [projectId, templateParam]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [nova, magnum, clusters, cinder] = await settled([
        quotaApi.getNovaQuota(projectId),
        magnumApi.getClusterQuota(projectId),
        magnumApi.listClusters({}, { detail: true }),
        enableCinder ? quotaApi.getCinderQuota(projectId) : null,
      ]);
      if (!alive) return;
      const novaQuota = nova.status === 'fulfilled' && nova.value?.quota_set ? updateQuotaData(novaQuotaGiB(nova.value.quota_set)) : null;
      const magnumQuota =
        magnum.status === 'fulfilled'
          ? updateQuotaData({
              magnum_cluster: {
                limit: magnum.value?.hard_limit ?? -1,
                in_use: clusters.status === 'fulfilled' ? (clusters.value?.clusters || []).length : 0,
              },
            })
          : null;
      const cinderQuota = cinder.status === 'fulfilled' && cinder.value?.quota_set ? updateQuotaData(cinder.value.quota_set) : null;
      setQuota({ nova: novaQuota, magnum: magnumQuota, cinder: cinderQuota });
      setQuotaLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [projectId, enableCinder]);

  // preset template from ?template=
  useEffect(() => {
    if (templateParam && templates.length && !firstKey(form.getFieldValue('clusterTemplate'))) {
      applyTemplate(templates[0]);
      form.setFieldsValue({ clusterTemplate: selection(templates[0], 'uuid') });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateParam, templates]);

  /** Legacy StepNodeSpec / StepNetworks / StepLabel defaults taken from the selected template */
  const applyTemplate = (tpl) => {
    if (!tpl) return;
    const master = findRef(flavors, tpl.master_flavor_id);
    const worker = findRef(flavors, tpl.flavor_id);
    const keypair = findRef(keypairs, tpl.keypair_id || tpl.original_keypair_id);
    const net = findRef(networks, tpl.fixed_network);
    const sub = net ? findRef(subnets.filter((s) => s.network_id === net.id), tpl.fixed_subnet) : undefined;
    form.setFieldsValue({
      masterFlavor: selection(master),
      flavor: selection(worker),
      keypair: selection(keypair),
      fixedNetwork: selection(net),
      fixedSubnet: selection(sub),
      additionalLabels: labelsToList(tpl.labels),
    });
  };

  const selectedTemplate = values.clusterTemplate?.selectedRows?.[0];

  // ------------------------------------------------------------ quota
  const flavorInput = useMemo(() => {
    const worker = values.flavor?.selectedRows?.[0] || findRef(flavors, selectedTemplate?.flavor_id) || {};
    const master = values.masterFlavor?.selectedRows?.[0] || findRef(flavors, selectedTemplate?.master_flavor_id) || {};
    const nodeCount = values.node_count ?? 1;
    const masterCount = values.master_count ?? 1;
    return {
      newCPU: (worker.vcpus || 0) * nodeCount + (master.vcpus || 0) * masterCount,
      newRam: getGiBValue(worker.ram || 0) * nodeCount + getGiBValue(master.ram || 0) * masterCount,
    };
  }, [values.flavor, values.masterFlavor, values.node_count, values.master_count, flavors, selectedTemplate]);

  const newNodes = (values.node_count || 0) + (values.master_count || 0);

  const errorMsg = useMemo(() => {
    if (quotaLoading || !quota) return '';
    const { nova, magnum, cinder } = quota;
    const msgs = [];
    if (magnum?.magnum_cluster && magnum.magnum_cluster.left === 0) {
      msgs.push(getQuotaMessage(1, magnum.magnum_cluster, t('Clusters')));
    }
    if (nova) {
      msgs.push(getQuotaMessage(newNodes, nova.instances, t('Instance')));
      msgs.push(getQuotaMessage(flavorInput.newCPU, nova.cores, t('CPU')));
      msgs.push(getQuotaMessage(flavorInput.newRam, nova.ram, t('Memory')));
    }
    if (cinder?.volumes) msgs.push(getQuotaMessage(newNodes, cinder.volumes, t('Volume')));
    return msgs.find(Boolean) || '';
  }, [quota, quotaLoading, newNodes, flavorInput]);

  const quotaInfo = useMemo(() => {
    if (quotaLoading || !quota) return [];
    const add = (v) => (errorMsg ? 0 : v);
    const list = [];
    if (quota.magnum) list.push({ ...quota.magnum.magnum_cluster, add: add(1), name: 'cluster', title: t('Clusters') });
    if (quota.nova) {
      list.push({ ...quota.nova.instances, add: add(newNodes), name: 'instance', title: t('Instance') });
      list.push({ ...quota.nova.cores, add: add(flavorInput.newCPU), name: 'cpu', title: t('CPU') });
      list.push({ ...quota.nova.ram, add: add(flavorInput.newRam), name: 'ram', title: t('Memory (GiB)') });
    }
    if (quota.cinder?.volumes) list.push({ ...quota.cinder.volumes, add: add(newNodes), name: 'volume', title: t('Volume') });
    return list;
  }, [quota, quotaLoading, errorMsg, newNodes, flavorInput]);

  // ------------------------------------------------------------ submit (legacy StepCreate.onSubmit)
  const onSubmit = (all) => {
    const {
      additionalLabels,
      clusterTemplate,
      keypair,
      auto_healing_enabled,
      auto_scaling_enabled,
      newNetwork,
      fixedNetwork,
      fixedSubnet,
      flavor,
      masterFlavor,
      ...rest
    } = all;
    const data = {
      ...rest,
      name: all.name,
      labels: {
        ...listToLabels(additionalLabels),
        auto_healing_enabled: `${!!auto_healing_enabled}`,
        auto_scaling_enabled: `${!!auto_scaling_enabled}`,
      },
      cluster_template_id: firstKey(clusterTemplate),
      keypair: firstKey(keypair) || null,
      master_flavor_id: firstKey(masterFlavor) || null,
      flavor_id: firstKey(flavor) || null,
      fixed_network: (!newNetwork && firstKey(fixedNetwork)) || null,
      fixed_subnet: (!newNetwork && firstKey(fixedSubnet)) || null,
    };
    return magnumApi.createCluster(data);
  };

  const subnetList = subnets.filter((s) => s.network_id === firstKey(values.fixedNetwork));

  const steps = [
    {
      title: t('Cluster Info'),
      fields: ['name', 'clusterTemplate'],
      content: (
        <>
          <Form.Item
            name="name"
            label={t('Cluster Name')}
            required
            rules={[
              {
                validator: (_, v) => {
                  if (!v) return Promise.reject(new Error(`${t('Please input cluster name')}`));
                  if (!NAME_RE.test(v)) {
                    return Promise.reject(
                      new Error(
                        t(
                          'The name should start with upper letter or lower letter, characters can only contain "0-9, a-z, A-Z, -, _, ."'
                        )
                      )
                    );
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input placeholder={t('Please input cluster name')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="clusterTemplate" label={t('Cluster Template')} required rules={[selectRequired(t('Cluster Template'))]}>
            <SelectTable
              data={templates}
              rowKey="uuid"
              isLoading={loading}
              columns={templateColumns({ inSelect: true })}
              filterParams={[{ label: t('Name'), name: 'name' }]}
              onChange={(v) => {
                form.setFieldsValue({ clusterTemplate: v });
                applyTemplate(v?.selectedRows?.[0]);
              }}
            />
          </Form.Item>
        </>
      ),
    },
    {
      title: t('Node Spec'),
      fields: ['keypair', 'master_count', 'masterFlavor', 'node_count', 'flavor'],
      content: (
        <>
          <Form.Item
            name="keypair"
            label={t('Keypair')}
            required
            rules={[selectRequired(t('Keypair'))]}
            extra={t(
              'The SSH key is a way to remotely log in to the cluster instance. If it’s not set, the value of this in the template will be used.'
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
          <Form.Item name="master_count" label={t('Number of Master Nodes')} rules={[{ required: true }]}>
            <InputNumber min={1} precision={0} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="masterFlavor" label={t('Flavor of Master Nodes')} required rules={[selectRequired(t('Flavor of Master Nodes'))]} extra={defaultTip()}>
            <SelectTable data={flavors} isLoading={loading} columns={flavorColumns()} filterParams={[{ label: t('Name'), name: 'name' }]} />
          </Form.Item>
          <Divider />
          <Form.Item name="node_count" label={t('Number of Nodes')} rules={[{ required: true }]}>
            <InputNumber min={1} precision={0} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="flavor" label={t('Flavor of Nodes')} required rules={[selectRequired(t('Flavor of Nodes'))]} extra={defaultTip()}>
            <SelectTable data={flavors} isLoading={loading} columns={flavorColumns()} filterParams={[{ label: t('Name'), name: 'name' }]} />
          </Form.Item>
        </>
      ),
    },
    {
      title: t('Network Setting'),
      fields: [],
      content: (
        <>
          <Form.Item name="master_lb_enabled" label={t('Enable Load Balancer')} valuePropName="checked" extra={defaultTip()}>
            <Checkbox>{t('Enabled Load Balancer for Master Nodes')}</Checkbox>
          </Form.Item>
          <Form.Item name="newNetwork" label={t('Enabled Network')} valuePropName="checked">
            <Checkbox>{t('Create New Network')}</Checkbox>
          </Form.Item>
          {!values.newNetwork ? (
            <>
              <Form.Item name="fixedNetwork" label={t('Fixed Network')}>
                <SelectTable
                  data={networks}
                  isLoading={loading}
                  columns={networkColumns()}
                  filterParams={[{ label: t('Name'), name: 'name' }]}
                  header={
                    <span>
                      {t('You can go to the console to')}{' '}
                      <Link to="/network/networks" target="_blank">
                        {t('create a new network/subnet')} &gt;
                      </Link>
                    </span>
                  }
                  onChange={(v) => form.setFieldsValue({ fixedNetwork: v, fixedSubnet: selection(null) })}
                />
              </Form.Item>
              <Form.Item name="fixedSubnet" label={t('Fixed Subnet')}>
                <SelectTable data={subnetList} columns={subnetColumns()} filterParams={[{ label: t('Name'), name: 'name' }]} />
              </Form.Item>
            </>
          ) : null}
          <Divider />
          <Form.Item name="floating_ip_enabled" label={t('Enable Floating IP')} valuePropName="checked" extra={defaultTip()}>
            <Checkbox />
          </Form.Item>
        </>
      ),
    },
    {
      title: t('Management'),
      fields: ['create_timeout'],
      content: (
        <>
          <Form.Item name="auto_healing_enabled" label={t('Auto Healing')} valuePropName="checked">
            <Checkbox>{t('Automatically repair unhealhty nodes')}</Checkbox>
          </Form.Item>
          <Divider />
          <Form.Item name="auto_scaling_enabled" label={t('Auto Scaling')} valuePropName="checked">
            <Checkbox>{t('Auto scaling feature will be enabled')}</Checkbox>
          </Form.Item>
          <Divider />
          <Form.Item name="create_timeout" label={t('Timeout (Minute)')} extra={t('The timeout for cluster creation in minutes.')}>
            <InputNumber min={1} precision={0} style={{ width: 160 }} />
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

  return (
    <StepWizard
      title={t('Create Cluster')}
      listPath="/container-infra/clusters"
      listTitle={t('Clusters')}
      form={form}
      loading={loading}
      initialValues={{ master_count: 1, node_count: 1, newNetwork: true, create_timeout: 60, additionalLabels: [] }}
      steps={steps}
      onSubmit={onSubmit}
      errorMsg={errorMsg}
      quota={quotaLoading || quota ? <QuotaPanel quotas={quotaInfo} loading={quotaLoading} /> : null}
    />
  );
}
