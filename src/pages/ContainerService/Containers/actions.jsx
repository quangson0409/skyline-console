import React from 'react';
import { Modal, Typography } from 'antd';
import { zunApi } from '@/api/zun';
import { glanceApi } from '@/api/glance';
import { neutronApi } from '@/api/neutron';
import { deleteAction } from '@/components/ResourcePage';
import { useAuthStore } from '@/store/authStore';
import SelectTable from '@/pages/Instances/Create/components/SelectTable';
import NetworkSelectTable from '@/pages/Instances/Create/components/NetworkSelectTable';
import { t } from '@/core/i18n';
import { networkColumns } from '@/pages/ContainerInfra/common';
import { checkItemAction } from '../common';

const uuidOf = (it) => it.uuid || it.id;

const confirmAction = ({ id, title, actionName, check, run, isDanger, policy, aliasPolicy }) => ({
  id,
  type: 'confirm',
  policy,
  aliasPolicy,
  title,
  actionName: actionName || title,
  isDanger,
  allowed: (item) => checkItemAction(item, check),
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await run(uuidOf(it));
    }
  },
});

export const createContainerAction = (navigate) => ({
  id: 'create-container',
  type: 'custom',
  policy: 'container:create',
  aliasPolicy: 'zun:container:create',
  title: t('Create Container'),
  onExecute: () => navigate('/container-service/containers/create'),
});

export const deleteContainerAction = () => ({
  ...deleteAction({
    name: t('Container'),
    title: t('Delete Container'),
    allowed: (item) => checkItemAction(item, 'delete'),
    onDelete: (it) => zunApi.deleteContainer(uuidOf(it)),
  }),
  policy: 'container:delete',
  aliasPolicy: 'zun:container:delete',
});

export const forceDeleteContainerAction = () =>
  confirmAction({
    id: 'force-delete',
    policy: 'container:delete_force',
    aliasPolicy: 'zun:container:delete_force',
    title: t('Force Delete Container'),
    check: 'delete_force',
    isDanger: true,
    run: (id) => zunApi.forceDeleteContainer(id),
  });

export const startContainerAction = () =>
  confirmAction({
    id: 'start',
    policy: 'container:start',
    aliasPolicy: 'zun:container:start',
    title: t('Start Container'),
    check: 'start',
    run: (id) => zunApi.startContainer(id),
  });
export const stopContainerAction = () =>
  confirmAction({
    id: 'stop',
    policy: 'container:stop',
    aliasPolicy: 'zun:container:stop',
    title: t('Stop Container'),
    check: 'stop',
    run: (id) => zunApi.stopContainer(id),
  });
export const rebootContainerAction = () =>
  confirmAction({
    id: 'reboot',
    policy: 'container:reboot',
    aliasPolicy: 'zun:container:reboot',
    title: t('Reboot Container'),
    check: 'reboot',
    run: (id) => zunApi.rebootContainer(id),
  });
export const pauseContainerAction = () =>
  confirmAction({
    id: 'pause',
    policy: 'container:pause',
    aliasPolicy: 'zun:container:pause',
    title: t('Pause Container'),
    check: 'pause',
    run: (id) => zunApi.pauseContainer(id),
  });
export const unpauseContainerAction = () =>
  confirmAction({
    id: 'unpause',
    policy: 'container:unpause',
    aliasPolicy: 'zun:container:unpause',
    title: t('Unpause Container'),
    check: 'unpause',
    run: (id) => zunApi.unpauseContainer(id),
  });

export const killContainerAction = () => ({
  id: 'kill',
  type: 'modal',
  policy: 'container:kill',
  aliasPolicy: 'zun:container:kill',
  title: t('Kill Container'),
  buttonText: t('Kill'),
  allowed: (item) => checkItemAction(item, 'kill'),
  getDefaultValues: (item) => ({ name: item.name }),
  formItems: [
    { name: 'name', label: t('Container Name'), type: 'label' },
    {
      name: 'signal',
      label: t('Kill Signal'),
      type: 'input',
      placeholder: t('The kill signal to send'),
      tip: t(
        'Signal to send to the container: integer or string like SIGINT. When not set, SIGKILL is set as default value and the container will exit. The supported signals varies between platform. Besides, you can omit "SIG" prefix.'
      ),
    },
  ],
  onSubmit: (values, item) => zunApi.killContainer(uuidOf(item), values.signal ? { signal: values.signal } : undefined),
});

export const rebuildContainerAction = () => ({
  id: 'rebuild',
  type: 'modal',
  policy: 'container:rebuild',
  aliasPolicy: 'zun:container:rebuild',
  title: t('Rebuild Container'),
  buttonText: t('Rebuild'),
  allowed: (item) => checkItemAction(item, 'rebuild'),
  getDefaultValues: (item) => ({ name: item.name, image: item.image, image_driver: item.image_driver }),
  formItems: [
    { name: 'name', label: t('Container Name'), type: 'label' },
    {
      name: 'image',
      label: t('Image'),
      type: 'input',
      placeholder: t('Name or ID og the container image'),
      required: true,
      rules: [
        ({ getFieldValue }) => ({
          // legacy validator checks the image in glance; docker hub images cannot be checked here
          validator: (_, value) => {
            if (!value || getFieldValue('image_driver') !== 'glance') return Promise.resolve();
            return glanceApi
              .getImage(value)
              .then(() => Promise.resolve())
              .catch(() => Promise.reject(new Error(t('The image is not existed'))));
          },
        }),
      ],
    },
    {
      name: 'image_driver',
      label: t('Image Driver'),
      type: 'select',
      placeholder: t('Image Driver'),
      options: [
        { label: t('Docker'), value: 'docker' },
        { label: t('Glance'), value: 'glance' },
      ],
    },
  ],
  onSubmit: (values, item) => {
    const { name, ...rest } = values;
    const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    return zunApi.rebuildContainer(uuidOf(item), data);
  },
});

export const editContainerAction = () => ({
  id: 'edit',
  type: 'modal',
  policy: 'container:update',
  aliasPolicy: 'zun:container:update',
  title: t('Edit Container'),
  buttonText: t('Edit'),
  allowed: (item) => checkItemAction(item, 'update'),
  getDefaultValues: (item) => ({ name: item.name, cpu: item.cpu, memory: item.memory ? Number(item.memory) : item.memory }),
  formItems: [
    { name: 'name', label: t('Container Name'), type: 'input', placeholder: t('Container Name'), required: true },
    { name: 'cpu', label: t('CPU (Core)'), type: 'number', min: 1, tip: t('The number of virtual cpu for this container') },
    { name: 'memory', label: t('Memory (MiB)'), type: 'number', min: 4, tip: t('The container memory size in MiB') },
  ],
  onSubmit: (values, item) => zunApi.updateContainer(uuidOf(item), values),
});

export const executeCommandAction = () => ({
  id: 'execute-command',
  type: 'modal',
  policy: 'container:execute',
  aliasPolicy: 'zun:container:execute',
  title: t('Execute Command'),
  buttonText: t('Execute Command'),
  allowed: (item) => checkItemAction(item, 'execute'),
  getDefaultValues: (item) => ({ name: item.name }),
  formItems: [
    { name: 'name', label: t('Container Name'), type: 'label' },
    { name: 'command', label: t('Command'), type: 'input', placeholder: t('The command to execute'), required: true },
  ],
  onSubmit: async (values, item) => {
    const { command } = values;
    const res = await zunApi.executeContainer(uuidOf(item), { command });
    const { Title, Paragraph } = Typography;
    Modal.info({
      width: 720,
      title: t('Command was successfully executed at container {name}.', { name: item.name }),
      content: (
        <>
          <Title level={5}>{`${t('Command')}: ${command}`}</Title>
          {res?.exit_code !== undefined && res?.exit_code !== null ? (
            <Paragraph>{`${t('Exit Code')}: ${res.exit_code}`}</Paragraph>
          ) : null}
          <Title level={5}>{`${t('Outputs')}:`}</Title>
          <Paragraph>
            {res?.output ? (
              <pre style={{ maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{res.output}</pre>
            ) : (
              t('No Outputs')
            )}
          </Paragraph>
        </>
      ),
    });
    return res;
  },
});

const selectRule = (label) => ({
  validator: (_, value) =>
    value?.selectedRowKeys?.length ? Promise.resolve() : Promise.reject(new Error(`${t('Please select')} ${label}`)),
});

export const attachNetworkAction = () => ({
  id: 'AttachNetwork',
  type: 'modal',
  policy: 'container:network_attach',
  aliasPolicy: 'zun:container:network_attach',
  title: t('Attach Network'),
  width: 1000,
  allowed: (item) => checkItemAction(item, 'network_attach_detach'),
  getDefaultValues: (item) => ({ instance: item.name }),
  getFormItems: (item) => [
    { name: 'instance', label: t('Container'), type: 'label' },
    {
      name: 'networks',
      label: t('Networks'),
      rules: [selectRule(t('Networks'))],
      render: () => (
        <NetworkSelectTable
          hasAdminRole={useAuthStore.getState().hasAdminRole}
          disabledFunc={(net) => (item.networks || []).some((n) => n?.id === net.id)}
        />
      ),
    },
  ],
  onSubmit: (values, item) => zunApi.attachNetwork(uuidOf(item), { network: values.networks.selectedRowKeys[0] }),
});

export const detachNetworkAction = () => ({
  id: 'DetachNetwork',
  type: 'modal',
  policy: 'container:network_detach',
  aliasPolicy: 'zun:container:network_detach',
  title: t('Detach Network'),
  width: 1000,
  allowed: (item) => checkItemAction(item, 'network_attach_detach'),
  getDefaultValues: (item) => ({ instance: item.name }),
  getFormItems: async (item) => {
    let nets = (item.networks || []).filter(Boolean);
    if (!nets.length && item.addresses) {
      const ids = Object.keys(item.addresses);
      const res = await neutronApi.listNetworks({ id: ids }).catch(() => ({}));
      nets = res?.networks || [];
    }
    const unique = Array.from(new Map(nets.map((n) => [n.id, { ...n, name: n.name || n.id }])).values());
    return [
      { name: 'instance', label: t('Container'), type: 'label' },
      {
        name: 'networks',
        label: t('Networks'),
        rules: [selectRule(t('Networks'))],
        render: () => <SelectTable data={unique} columns={networkColumns()} filterParams={[{ label: t('Name'), name: 'name' }]} />,
      },
    ];
  },
  onSubmit: (values, item) => zunApi.detachNetwork(uuidOf(item), { network: values.networks.selectedRowKeys[0] }),
});

/** Legacy Containers/actions/index.jsx */
export const containerRowActions = (isAdmin) => {
  const statusActions = [
    startContainerAction(),
    stopContainerAction(),
    rebootContainerAction(),
    killContainerAction(),
    rebuildContainerAction(),
  ];
  if (isAdmin) {
    return {
      firstAction: deleteContainerAction(),
      moreActions: [
        { title: t('Container Status'), actions: statusActions },
        { action: editContainerAction() },
        { action: forceDeleteContainerAction() },
      ],
    };
  }
  return {
    firstAction: deleteContainerAction(),
    moreActions: [
      {
        title: t('Container Status'),
        actions: [...statusActions, pauseContainerAction(), unpauseContainerAction(), executeCommandAction()],
      },
      { title: t('Related Resources'), actions: [attachNetworkAction(), detachNetworkAction()] },
      { action: editContainerAction() },
      { action: forceDeleteContainerAction() },
    ],
  };
};
