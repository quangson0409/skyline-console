import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Checkbox, Form, Input, InputNumber, Select } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { zunApi } from '@/api/zun';
import { glanceApi } from '@/api/glance';
import { neutronApi } from '@/api/neutron';
import { novaApi } from '@/api/nova';
import { cinderApi } from '@/api/cinder';
import { currentProjectId } from '@/api/endpoints';
import { useAuthStore } from '@/store/authStore';
import SelectTable from '@/pages/Instances/Create/components/SelectTable';
import NetworkSelectTable from '@/pages/Instances/Create/components/NetworkSelectTable';
import QuotaPanel from '@/pages/Instances/Create/components/QuotaPanel';
import { IdNameCell } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import StepWizard, { selectRequired, firstKey } from '@/pages/ContainerInfra/StepWizard';
import {
  KeyValueList,
  keyValueRule,
  listToLabels,
  imageColumns,
  updateQuotaData,
  getQuotaMessage,
  settled,
} from '@/pages/ContainerInfra/common';
import { imageDrivers, exitPolicies } from '../common';

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/;

/** Legacy components/ExposedPorts (add-select of port + protocol) */
function ExposedPortsList({ value, onChange }) {
  const list = Array.isArray(value) ? value : [];
  const update = (idx, patch) => onChange?.(list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((it, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <InputNumber
            min={1}
            max={65535}
            precision={0}
            placeholder={t('Port')}
            value={it.port}
            onChange={(v) => update(idx, { port: v })}
            style={{ width: 160 }}
          />
          <Select
            value={it.protocol}
            placeholder={t('Protocol')}
            options={[
              { label: t('TCP'), value: 'tcp' },
              { label: t('UDP'), value: 'udp' },
            ]}
            onChange={(v) => update(idx, { protocol: v })}
            style={{ width: 140 }}
          />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(list.filter((_, i) => i !== idx))} />
        </div>
      ))}
      <div>
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange?.([...list, { port: undefined, protocol: 'tcp' }])}>
          {t('Add Exposed Ports')}
        </Button>
      </div>
    </div>
  );
}

/** Legacy components/ZunVolume (type / source or size / destination) */
function ZunVolumeList({ value, onChange, volumes }) {
  const list = Array.isArray(value) ? value : [];
  const update = (idx, patch) => onChange?.(list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {list.map((it, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, marginBottom: 2 }}>{t('Type')}</div>
            <Select
              value={it.type}
              placeholder={t('Please select type')}
              options={[
                { label: t('Existing Volume'), value: 'bind' },
                { label: t('New Volume'), value: 'volume' },
              ]}
              onChange={(v) => update(idx, { type: v, isNewVolume: v === 'volume', source: undefined, size: undefined })}
              style={{ width: 160 }}
            />
          </div>
          {it.type === 'volume' ? (
            <div>
              <div style={{ fontSize: 12, marginBottom: 2 }}>{t('Size (GiB)')}</div>
              <InputNumber min={1} precision={0} value={it.size} onChange={(v) => update(idx, { size: v })} style={{ width: 140 }} />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, marginBottom: 2 }}>{t('Source')}</div>
              <Select
                value={it.source}
                placeholder={t('Please select source')}
                options={volumes}
                showSearch
                optionFilterProp="label"
                onChange={(v) => update(idx, { source: v })}
                style={{ width: 280, maxWidth: '100%' }}
              />
            </div>
          )}
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 12, marginBottom: 2 }}>{t('Destination')}</div>
            <Input value={it.destination} placeholder={t('Specify mount point.')} onChange={(e) => update(idx, { destination: e.target.value })} />
          </div>
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(list.filter((_, i) => i !== idx))} />
        </div>
      ))}
      <div>
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange?.([...list, { type: 'bind' }])}>
          {t('Add Volume')}
        </Button>
      </div>
    </div>
  );
}

const portColumns = () => [
  {
    title: t('ID/Name'),
    dataIndex: 'name',
    key: 'name',
    render: (v, r) => <IdNameCell id={r.id} name={v} />,
  },
  { title: t('Network'), dataIndex: 'network_id', key: 'network_id', render: (v) => <IdNameCell id={v} bold={false} /> },
  {
    title: t('IP Address'),
    dataIndex: 'fixed_ips',
    key: 'fixed_ips',
    render: (v = []) => (v || []).map((ip) => <div key={ip.ip_address}>{ip.ip_address}</div>),
  },
  { title: t('MAC Address'), dataIndex: 'mac_address', key: 'mac_address' },
  { title: t('Status'), dataIndex: 'status', key: 'status' },
];

const securityGroupColumns = () => [
  {
    title: t('ID/Name'),
    dataIndex: 'name',
    key: 'name',
    render: (v, r) => <IdNameCell id={r.id} name={v} />,
  },
  { title: t('Description'), dataIndex: 'description', key: 'description', render: (v) => v || '-' },
];

/** Legacy StepCreate.onSubmit */
export const buildContainerBody = (values) => {
  const {
    exposedPorts,
    environmentVariables,
    labels,
    mounts,
    image_driver,
    imageDocker,
    imageGlance,
    exitPolicy,
    maxRetry,
    networks,
    ports,
    hints,
    securityGroup,
    healthcheck,
    healthcheck_cmd,
    healthcheck_interval,
    healthcheck_retries,
    healthcheck_timeout,
    command,
    entrypoint,
  } = values;
  const body = { image_driver };
  ['name', 'cpu', 'memory', 'disk', 'availability_zone', 'auto_heal', 'auto_remove', 'interactive', 'hostname', 'runtime', 'workdir'].forEach(
    (key) => {
      if (values[key] !== undefined && values[key] !== null && values[key] !== '') body[key] = values[key];
    }
  );
  const requestExposedPorts = {};
  const nets = [];
  if (exposedPorts && exposedPorts.length) {
    exposedPorts.forEach((it) => {
      requestExposedPorts[`${it.port}/${it.protocol}`] = {};
    });
    body.exposed_ports = requestExposedPorts;
  }
  if (environmentVariables && environmentVariables.length) body.environment = listToLabels(environmentVariables);
  if (labels && labels.length) body.labels = listToLabels(labels);
  if (mounts && mounts.length) {
    body.mounts = mounts.map(({ type, source, size, destination }) =>
      type === 'volume' ? { type, size, destination } : { type, source, destination }
    );
  }
  if (networks?.selectedRowKeys?.length) {
    networks.selectedRowKeys.forEach((it) => nets.push({ network: it }));
    body.nets = nets;
  }
  if (ports?.selectedRowKeys?.length) {
    ports.selectedRowKeys.forEach((it) => nets.push({ port: it }));
    body.nets = nets;
  }
  if (hints && hints.length) body.hints = listToLabels(hints);
  if (securityGroup?.selectedRows?.length && !Object.keys(requestExposedPorts).length) {
    body.security_groups = securityGroup.selectedRows.map((it) => it.name);
  }
  if (healthcheck) {
    body.healthcheck = {
      cmd: healthcheck_cmd,
      interval: healthcheck_interval,
      retries: healthcheck_retries,
      timeout: healthcheck_timeout,
    };
  }
  if (command) body.command = [command];
  if (entrypoint) body.entrypoint = [entrypoint];
  if (imageDocker && image_driver === 'docker') body.image = imageDocker;
  if (imageGlance && image_driver === 'glance') body.image = firstKey(imageGlance);
  if (exitPolicy) {
    body.restart_policy = { Name: exitPolicy, ...(maxRetry ? { MaximumRetryCount: maxRetry } : {}) };
  }
  return body;
};

export default function ContainerCreate() {
  const [form] = Form.useForm();
  const projectId = currentProjectId();
  const hasAdminRole = useAuthStore((s) => s.hasAdminRole);
  const values = Form.useWatch([], form) || {};

  const [images, setImages] = useState([]);
  const [zones, setZones] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [ports, setPorts] = useState([]);
  const [securityGroups, setSecurityGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [img, az, vol, prt, sg, q] = await settled([
        glanceApi.listAllImages({ container_format: 'docker' }),
        novaApi.listAvailabilityZones(),
        cinderApi.listVolumes(),
        neutronApi.listPorts({ project_id: projectId, status: 'DOWN' }),
        neutronApi.listSecurityGroups({ project_id: projectId }),
        zunApi.getQuota(projectId),
      ]);
      if (!alive) return;
      setImages(img.status === 'fulfilled' ? img.value?.images || [] : []);
      setZones(
        az.status === 'fulfilled'
          ? (az.value?.availabilityZoneInfo || [])
              .filter((it) => it.zoneState?.available)
              .map((it) => ({ value: it.zoneName, label: it.zoneName }))
          : []
      );
      setVolumes(
        vol.status === 'fulfilled'
          ? (vol.value?.volumes || [])
              .filter((it) => it.status === 'available')
              .map((it) => ({ value: it.id, label: `${it.name || it.id} (${it.id})` }))
          : []
      );
      setPorts(prt.status === 'fulfilled' ? (prt.value?.ports || []).filter((it) => !it.device_id) : []);
      setSecurityGroups(sg.status === 'fulfilled' ? sg.value?.security_groups || [] : []);
      setQuota(q.status === 'fulfilled' && q.value ? updateQuotaData(q.value) : null);
      setQuotaLoading(false);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  // ------------------------------------------------------------ quota (legacy quotaInfo / checkQuota)
  const cpuCount = values.cpu || 0;
  const memoryCount = values.memory || 0;
  const diskCount = values.disk || 0;
  const errorMsg = useMemo(() => {
    if (quotaLoading || !quota) return '';
    const { containers = {}, cpu = {}, memory = {}, disk = {} } = quota;
    return (
      getQuotaMessage(1, containers, t('Containers')) ||
      getQuotaMessage(cpuCount, cpu, t('CPU')) ||
      getQuotaMessage(memoryCount, memory, t('Memory')) ||
      getQuotaMessage(diskCount, disk, t('Disk')) ||
      ''
    );
  }, [quota, quotaLoading, cpuCount, memoryCount, diskCount]);

  const quotaInfo = useMemo(() => {
    if (quotaLoading || !quota) return [];
    const { containers = {}, cpu = {}, memory = {}, disk = {} } = quota;
    const left = containers.left ?? 0;
    const canAdd =
      left &&
      (cpu.left === -1 || cpuCount <= (cpu.left ?? 0)) &&
      (memory.left === -1 || memoryCount <= (memory.left ?? 0)) &&
      (disk.left === -1 || diskCount <= (disk.left ?? 0));
    return [
      { ...containers, add: left ? 1 : 0, name: 'containers', title: t('Containers') },
      { ...cpu, add: canAdd ? cpuCount : 0, name: 'cpu', title: t('Containers CPU') },
      { ...memory, add: canAdd ? memoryCount : 0, name: 'memory', title: t('Containers Memory (MiB)') },
      { ...disk, add: canAdd ? diskCount : 0, name: 'disk', title: t('Containers Disk (GiB)') },
    ];
  }, [quota, quotaLoading, cpuCount, memoryCount, diskCount]);

  const imageDriverOptions = Object.entries(imageDrivers()).map(([value, label]) => ({ value, label }));
  const exitPolicyOptions = Object.entries(exitPolicies()).map(([value, label]) => ({ value, label }));
  const hasNetworks = Boolean(values.networks?.selectedRowKeys?.length);
  const hasExposedPorts = Boolean(values.exposedPorts?.length);

  const steps = [
    {
      title: t('Info'),
      fields: (v) => ['name', 'image_driver', v.image_driver === 'docker' && 'imageDocker', v.image_driver === 'glance' && 'imageGlance'].filter(Boolean),
      content: (
        <>
          <Form.Item
            name="name"
            label={t('Container Name')}
            required
            rules={[
              {
                validator: (_, v) =>
                  NAME_RE.test(v || '')
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error(
                          v
                            ? t(
                                'The name should start with letter or number, and be a string of 2 to 255, characters can only contain "0-9, a-z, A-Z, -, _, ."'
                              )
                            : t('Please input container name')
                        )
                      ),
              },
            ]}
          >
            <Input placeholder={t('Please input container name')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="image_driver" label={t('Image Driver')} rules={[{ required: true, message: t('Please select image driver') }]}>
            <Select placeholder={t('Please select image driver')} options={imageDriverOptions} style={{ maxWidth: 520 }} />
          </Form.Item>
          {values.image_driver === 'docker' ? (
            <Form.Item name="imageDocker" label={t('Image')} rules={[{ required: true, message: t('Please input image') }]}>
              <Input placeholder={t('Please input image')} style={{ maxWidth: 520 }} />
            </Form.Item>
          ) : null}
          {values.image_driver === 'glance' ? (
            <Form.Item name="imageGlance" label={t('Image')} required rules={[selectRequired(t('Image'))]}>
              <SelectTable data={images} isLoading={loading} columns={imageColumns()} filterParams={[{ label: t('Name'), name: 'name' }]} />
            </Form.Item>
          ) : null}
        </>
      ),
    },
    {
      title: t('Spec'),
      fields: (v) =>
        ['cpu', 'memory', 'disk', 'maxRetry', 'exposedPorts', ...(v.healthcheck ? ['healthcheck_cmd', 'healthcheck_interval', 'healthcheck_retries', 'healthcheck_timeout'] : [])],
      content: (
        <>
          <Form.Item name="cpu" label={t('CPU (Core)')} extra={t('The number of virtual cpu for this container')}>
            <InputNumber min={1} precision={0} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="memory" label={t('Memory (MiB)')} extra={t('The container memory size in MiB')}>
            <InputNumber min={4} precision={0} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="disk" label={t('Disk (GiB)')} extra={t('The disk size in GiB for per container')}>
            <InputNumber min={1} precision={0} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="availability_zone" label={t('Availability Zone')}>
            <Select allowClear options={zones} placeholder={t('Please select')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="exitPolicy" label={t('Exit Policy')}>
            <Select allowClear options={exitPolicyOptions} placeholder={t('Please select')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="maxRetry" label={t('Max Retry')} extra={t('Retry times for restart on failure policy')}>
            <InputNumber min={1} precision={0} disabled={values.exitPolicy !== 'on-failure'} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="auto_heal" label={t('Enable auto heal')} valuePropName="checked">
            <Checkbox />
          </Form.Item>
          <Form.Item name="auto_remove" label={t('Enable auto remove')} valuePropName="checked">
            <Checkbox />
          </Form.Item>
          <Form.Item name="interactive" label={t('Enable interactive mode')} valuePropName="checked">
            <Checkbox />
          </Form.Item>
          <Form.Item name="healthcheck" label={t('Enable Health Check')} valuePropName="checked">
            <Checkbox />
          </Form.Item>
          {values.healthcheck ? (
            <>
              <Form.Item name="healthcheck_cmd" label={t('Health Check CMD')} extra={t('Command to run to check health')} rules={[{ required: true }]}>
                <Input style={{ maxWidth: 520 }} />
              </Form.Item>
              <Form.Item
                name="healthcheck_interval"
                label={t('Health Check Interval')}
                extra={t('Time between running the check in seconds')}
                rules={[{ required: true }]}
              >
                <InputNumber min={1} precision={0} style={{ width: 160 }} />
              </Form.Item>
              <Form.Item
                name="healthcheck_retries"
                label={t('Health Check Retries')}
                extra={t('Consecutive failures needed to report unhealthy')}
                rules={[{ required: true }]}
              >
                <InputNumber min={1} precision={0} style={{ width: 160 }} />
              </Form.Item>
              <Form.Item
                name="healthcheck_timeout"
                label={t('Health Check Timeout')}
                extra={t('Maximum time to allow one check to run in seconds')}
                rules={[{ required: true }]}
              >
                <InputNumber min={1} precision={0} style={{ width: 160 }} />
              </Form.Item>
            </>
          ) : null}
          <Form.Item
            name="exposedPorts"
            label={t('Exposed Ports')}
            extra={t(
              'If this parameter is specified, Zun will create a security group with a set of rules to open the ports that should be exposed, and associate the security group to the container.'
            )}
            rules={[
              {
                validator: (_, v) =>
                  (v || []).some((it) => !it?.port || !it?.protocol)
                    ? Promise.reject(new Error(t('Please input port and protocol')))
                    : Promise.resolve(),
              },
            ]}
          >
            <ExposedPortsList />
          </Form.Item>
        </>
      ),
    },
    {
      title: t('Volumes'),
      fields: ['mounts'],
      content: (
        <Form.Item
          name="mounts"
          label={t('Volumes')}
          rules={[
            {
              validator: (_, v) =>
                (v || []).some((it) => {
                  if (!it?.type) return true;
                  if (it.type === 'volume') return !it.size || !it.destination;
                  return !it.source || !it.destination;
                })
                  ? Promise.reject(new Error(t('Please input complete data')))
                  : Promise.resolve(),
            },
          ]}
        >
          <ZunVolumeList volumes={volumes} />
        </Form.Item>
      ),
    },
    {
      title: t('Network Config'),
      fields: [],
      content: (
        <>
          <Form.Item name="networks" label={t('Networks')}>
            <NetworkSelectTable isMulti hasAdminRole={hasAdminRole} />
          </Form.Item>
          <Form.Item name="ports" label={t('Ports')}>
            <SelectTable
              data={ports}
              isMulti
              isLoading={loading}
              columns={portColumns()}
              filterParams={[{ label: t('Name'), name: 'name' }]}
              header={t(
                'Ports provide extra communication channels to your containers. You can select ports instead of networks or a mix of both, If the terminal port and the network are selected at the same time, note that the terminal port is not a terminal port of the selected network, and the container under the same network will only be assigned one IP address (The port executes its own security group rules by default).'
              )}
            />
          </Form.Item>
          {!hasExposedPorts && hasNetworks ? (
            <Form.Item name="securityGroup" label={t('Security Group')} extra={t('If exposed port is specified, this parameter will be ignored.')}>
              <SelectTable
                data={securityGroups}
                isMulti
                isLoading={loading}
                columns={securityGroupColumns()}
                filterParams={[{ label: t('Name'), name: 'name' }]}
                header={
                  <span>
                    {t('The security group is similar to the firewall function and is used to set up network access control.')}{' '}
                    {t('You can go to the console to')}{' '}
                    <Link to="/network/security-group" target="_blank">
                      {t('create a new security group')} &gt;
                    </Link>
                  </span>
                }
              />
            </Form.Item>
          ) : null}
        </>
      ),
    },
    {
      title: t('Others'),
      fields: ['environmentVariables', 'hints', 'labels'],
      content: (
        <>
          <Form.Item name="hostname" label={t('Hostname')}>
            <Input placeholder={t('The host name of this container')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="runtime" label={t('Runtime')}>
            <Input placeholder={t('The container runtime tool to create container with')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="command" label={t('CMD')}>
            <Input placeholder={t('A command that will be sent to the container')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="entrypoint" label={t('ENTRYPOINT')} extra={t('The entrypoint which overwrites the default ENTRYPOINT of the image')}>
            <Input style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="workdir" label={t('Working Directory')}>
            <Input placeholder={t('The working directory for commands to run in')} style={{ maxWidth: 520 }} />
          </Form.Item>
          <Form.Item name="environmentVariables" label={t('Environment Variables')} rules={[keyValueRule()]}>
            <KeyValueList addText={t('Add Environment Variable')} />
          </Form.Item>
          <Form.Item name="hints" label={t('Scheduler Hints')} rules={[keyValueRule()]}>
            <KeyValueList addText={t('Add scheduler hints')} />
          </Form.Item>
          <Form.Item name="labels" label={t('Labels')} rules={[keyValueRule()]}>
            <KeyValueList addText={t('Add Label')} />
          </Form.Item>
        </>
      ),
    },
  ];

  return (
    <StepWizard
      title={t('Create Container')}
      listPath="/container-service/containers"
      listTitle={t('Containers')}
      form={form}
      loading={loading}
      initialValues={{ cpu: 1, memory: 512, disk: 10 }}
      steps={steps}
      onSubmit={(all) => zunApi.createContainer(buildContainerBody(all))}
      errorMsg={errorMsg}
      quota={quotaLoading || quota ? <QuotaPanel quotas={quotaInfo} loading={quotaLoading} /> : null}
    />
  );
}
