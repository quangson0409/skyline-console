import React from 'react';
import { Divider } from 'antd';
import { ironicApi } from '@/api/ironic';
import { deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import {
  provisioningState,
  canChangeStatus,
  yesNoOptions,
  KeyValueList,
  keyValueRule,
  macRule,
  objToKV,
  kvToObj,
  getDifFromKV,
  hasPath,
  getPath,
  isEqual,
  fetchNodePortGroups,
} from './helpers';

const asList = (target) => (Array.isArray(target) ? target : [target]);
const nodeLabel = (item) => item?.name || item?.uuid;

/* ======================= Node actions ======================= */

/** legacy actions/Create (primary, step page) */
export const createNodeAction = (navigate) => ({
  id: 'create',
  type: 'custom',
  policy: 'baremetal:node:create',
  title: t('Create Node'),
  onExecute: () => navigate('/compute/baremetal-node-admin/create'),
});

/** legacy actions/Edit (step page on /edit/:id) */
export const editNodeAction = (navigate) => ({
  id: 'edit-node',
  type: 'custom',
  policy: 'baremetal:node:update',
  title: t('Edit Bare Metal Node'),
  buttonText: t('Edit'),
  allowed: () => true,
  onExecute: (item) => navigate(`/compute/baremetal-node-admin/edit/${item.uuid}`),
});

/** legacy actions/ManageState */
export const manageStateAction = () => ({
  id: 'ManageState',
  type: 'modal',
  policy: 'baremetal:node:set_provision_state',
  title: t('Manage State'),
  allowed: (item) => canChangeStatus(item),
  getDefaultValues: (item) => ({ name: nodeLabel(item) }),
  getFormItems: (item) => {
    const state = item?.provision_state;
    const maps = provisioningState();
    const options =
      state === 'available' || state === 'active' || state === 'enroll'
        ? [{ value: 'manageable', label: maps.manageable }]
        : [{ value: 'available', label: maps.available }];
    return [
      { name: 'name', label: t('Node'), type: 'label' },
      { name: 'target', label: t('State'), type: 'select', required: true, options },
    ];
  },
  onSubmit: (values, item) => {
    const { target } = values;
    const { uuid, provision_state: state } = item;
    let realTarget = '';
    if (target === 'available') {
      realTarget = 'provide';
    } else if (target === 'manageable') {
      switch (state) {
        case 'available':
        case 'enroll':
          realTarget = 'manage';
          break;
        default:
          realTarget = 'delete';
      }
    }
    return ironicApi.setProvisionState(uuid, { target: realTarget });
  },
});

/** legacy actions/PowerOff.jsx (class PowerOn) */
export const powerOnAction = () => ({
  id: 'power-on',
  type: 'confirm',
  policy: 'baremetal:node:set_power_state',
  title: t('Power On'),
  actionName: t('Power On'),
  allowed: (item) => item?.power_state === 'power off',
  onSubmit: async (target) => {
    for (const it of asList(target)) {
      // eslint-disable-next-line no-await-in-loop
      await ironicApi.setPowerState(it.uuid, { target: 'power on' });
    }
  },
});

/** legacy actions/PowerOn.jsx (class PowerOff) */
export const powerOffAction = () => ({
  id: 'power-off',
  type: 'confirm',
  policy: 'baremetal:node:set_power_state',
  title: t('Power Off'),
  actionName: t('Power Off'),
  allowed: (item) => item?.power_state === 'power on',
  onSubmit: async (target) => {
    for (const it of asList(target)) {
      // eslint-disable-next-line no-await-in-loop
      await ironicApi.setPowerState(it.uuid, { target: 'power off' });
    }
  },
});

/** legacy actions/SetMaintenance */
export const setMaintenanceAction = () => ({
  id: 'SetMaintenance',
  type: 'modal',
  policy: 'baremetal:node:set_maintenance',
  title: t('Enter Maintenance Mode'),
  allowed: (item) => !item?.maintenance,
  getDefaultValues: (item) => ({ name: nodeLabel(item) }),
  formItems: [
    { name: 'name', label: t('Node'), type: 'label' },
    { name: 'reason', label: t('Reason'), type: 'textarea' },
  ],
  onSubmit: ({ reason }, item) => ironicApi.setMaintenance(item.uuid, { reason }),
});

/** legacy actions/ClearMaintenance */
export const clearMaintenanceAction = () => ({
  id: 'ClearMaintenance',
  type: 'confirm',
  policy: 'baremetal:node:clear_maintenance',
  title: t('Leave Maintenance Mode'),
  actionName: t('Leave Maintenance Mode'),
  allowed: (item) => !!item?.maintenance,
  onSubmit: async (target) => {
    for (const it of asList(target)) {
      // eslint-disable-next-line no-await-in-loop
      await ironicApi.clearMaintenance(it.uuid);
    }
  },
});

/** legacy actions/SetBootDevice */
export const setBootDeviceAction = () => ({
  id: 'SetBootDevice',
  type: 'modal',
  policy: ['baremetal:node:get_boot_device', 'baremetal:node:set_boot_device'],
  title: t('Set Boot Device'),
  allowed: () => true,
  getDefaultValues: async (item) => {
    const bootDevice = await ironicApi.getBootDevice(item.uuid).catch(() => null);
    const { boot_device, persistent = false } = bootDevice || {};
    return { name: nodeLabel(item), boot_device, persistent };
  },
  getFormItems: async (item) => {
    const res = await ironicApi.getSupportedBootDevices(item.uuid).catch(() => ({}));
    const devices = Array.isArray(res?.supported_boot_devices) ? res.supported_boot_devices : [];
    return [
      { name: 'name', label: t('Node'), type: 'label' },
      {
        name: 'boot_device',
        label: t('Boot Device'),
        type: 'select',
        required: true,
        options: devices.map((it) => ({ value: it, label: it })),
      },
      {
        name: 'persistent',
        label: t('Persistent'),
        type: 'radio',
        tip: t('Whether the boot device should be set only for the next reboot, or persistently.'),
        options: yesNoOptions(),
      },
    ];
  },
  onSubmit: ({ boot_device, persistent }, item) =>
    ironicApi.setBootDevice(item.uuid, { boot_device, persistent }),
});

/** legacy actions/Delete */
export const deleteNodeAction = () => ({
  ...deleteAction({ name: t('Node'), onDelete: (it) => ironicApi.deleteNode(it.uuid) }),
  policy: 'baremetal:node:delete',
  title: t('Delete Node'),
  actionName: t('Delete Node'),
});

/* ======================= Port actions ======================= */

const titleField = (name, label) => ({
  name,
  label: '',
  render: () => (
    <Divider orientation="left" plain style={{ margin: '4px 0' }}>
      {label}
    </Divider>
  ),
});

const portGroupOptions = async (nodeId) =>
  (await fetchNodePortGroups(nodeId)).map((it) => ({ value: it.uuid, label: it.name || it.uuid }));

const extraField = () => ({
  name: 'extra',
  label: t('Extra Infos'),
  rules: [keyValueRule()],
  render: () => <KeyValueList addText={t('Add Extra Info')} />,
});

const propertiesField = () => ({
  name: 'properties',
  label: t('Properties'),
  rules: [keyValueRule()],
  render: () => <KeyValueList addText={t('Add Property')} />,
});

const portLinkFields = (prefix = '') => [
  titleField('__local_link_title', t('Local Link Connection')),
  {
    name: `${prefix}port_id`,
    label: t('Port ID'),
    type: 'input',
    tip: t('Identifier of the physical port on the switch to which node’s port is connected to'),
  },
  {
    name: `${prefix}switch_id`,
    label: t('Switch ID'),
    type: 'input',
    tip: t('Only a MAC address or an OpenFlow based datapath_id of the switch are accepted in this field'),
  },
  {
    name: `${prefix}switch_info`,
    label: t('Switch Info'),
    type: 'input',
    tip: t('an optional string field to be used to store any vendor-specific information'),
  },
  {
    name: 'physical_network',
    label: t('Physical Network'),
    type: 'input',
    tip: t('The name of the physical network to which a port is connected'),
  },
];

/** legacy Detail/Port/actions/Create (also a node row action; item = node) */
export const createPortAction = (fixedNode) => ({
  id: 'CreatePort',
  type: 'modal',
  policy: 'baremetal:port:create',
  title: t('Create Port'),
  allowed: () => true,
  getDefaultValues: (item) => {
    const node = fixedNode || item;
    return { node: nodeLabel(node), pxe_enabled: true, extra: [] };
  },
  getFormItems: async (item) => {
    const node = fixedNode || item;
    return [
      { name: 'node', label: t('Node'), type: 'label' },
      { name: 'address', label: t('MAC Address'), type: 'input', required: true, rules: [macRule()] },
      { name: 'pxe_enabled', label: t('PXE Enabled'), type: 'radio', options: yesNoOptions() },
      { name: 'portgroup_uuid', label: t('Port Group'), type: 'select', options: await portGroupOptions(node?.uuid) },
      ...portLinkFields(),
      extraField(),
    ];
  },
  onSubmit: (values, item) => {
    const node = fixedNode || item;
    // eslint-disable-next-line no-unused-vars
    const { port_id, switch_id, switch_info, extra, node: _n, __local_link_title, ...rest } = values;
    const body = {
      ...rest,
      local_link_connection: { port_id, switch_id, switch_info },
      node_uuid: node.uuid,
      extra: kvToObj(extra),
    };
    return ironicApi.createPort(body);
  },
});

const llPath = (key) => {
  const prefix = 'local_link_connection.';
  if (key.indexOf(prefix) === 0) return `/local_link_connection/${key.substring(prefix.length)}`;
  return `/${key}`;
};

/** legacy Detail/Port/actions/Edit */
export const editPortAction = (node) => ({
  id: 'EditPort',
  type: 'modal',
  policy: 'baremetal:port:update',
  title: t('Edit Port'),
  buttonText: t('Edit'),
  allowed: () => true,
  getDefaultValues: (item) => {
    const { port_id, switch_id, switch_info } = item.local_link_connection || {};
    const { pxe_enabled, address, portgroup_uuid, extra = {}, physical_network } = item;
    return {
      node: nodeLabel(node),
      address,
      pxe_enabled,
      portgroup_uuid,
      physical_network,
      'local_link_connection.port_id': port_id,
      'local_link_connection.switch_id': switch_id,
      'local_link_connection.switch_info': switch_info,
      extra: objToKV(extra),
    };
  },
  getFormItems: async () => [
    { name: 'node', label: t('Node'), type: 'label' },
    { name: 'address', label: t('MAC Address'), type: 'input', required: true, rules: [macRule()] },
    { name: 'pxe_enabled', label: t('PXE Enabled'), type: 'radio', options: yesNoOptions() },
    { name: 'portgroup_uuid', label: t('Port Group'), type: 'select', options: await portGroupOptions(node?.uuid) },
    ...portLinkFields('local_link_connection.'),
    extraField(),
  ],
  onSubmit: (values, item) => {
    const adds = [];
    const replaces = [];
    const dels = [];
    const oldExtra = objToKV(item.extra);
    // eslint-disable-next-line no-unused-vars
    const { extra, node: _n, __local_link_title, ...rest } = values;
    Object.keys(rest).forEach((key) => {
      const value = rest[key];
      const obj = { value, path: llPath(key) };
      if (!hasPath(item, key) && value) {
        obj.op = 'add';
        adds.push(obj);
      } else if (!isEqual(getPath(item, key), value)) {
        obj.op = 'replace';
        replaces.push(obj);
      }
    });
    const d = getDifFromKV(extra, oldExtra, 'extra');
    adds.push(...d.adds);
    replaces.push(...d.replaces);
    dels.push(...d.dels);
    const body = [...adds, ...replaces, ...dels];
    if (!body.length) return Promise.resolve();
    return ironicApi.updatePort(item.uuid, body);
  },
});

export const deletePortAction = () => ({
  ...deleteAction({ name: t('Port'), onDelete: (it) => ironicApi.deletePort(it.uuid) }),
  policy: 'baremetal:port:delete',
  title: t('Delete Port'),
  actionName: t('Delete Port'),
});

/* ======================= Port group actions ======================= */

/** legacy Detail/PortGroup/actions/Create (also a node row action; item = node) */
export const createPortGroupAction = (fixedNode) => ({
  id: 'CreatePortGroup',
  type: 'modal',
  policy: 'baremetal:portgroup:create',
  title: t('Create Port Group'),
  allowed: () => true,
  getDefaultValues: (item) => ({
    node: nodeLabel(fixedNode || item),
    standalone_ports_supported: true,
    properties: [],
    extra: [],
  }),
  formItems: [
    { name: 'node', label: t('Node'), type: 'label' },
    { name: 'name', label: t('Port Name'), type: 'input' },
    { name: 'address', label: t('MAC Address'), type: 'input', required: true, rules: [macRule()] },
    {
      name: 'standalone_ports_supported',
      label: t('Stand Alone Ports Supported'),
      type: 'radio',
      options: yesNoOptions(),
    },
    propertiesField(),
    extraField(),
  ],
  onSubmit: (values, item) => {
    const node = fixedNode || item;
    // eslint-disable-next-line no-unused-vars
    const { properties, extra, node: _n, ...rest } = values;
    return ironicApi.createPortGroup({
      ...rest,
      node_uuid: node.uuid,
      extra: kvToObj(extra),
      properties: kvToObj(properties),
    });
  },
});

/** legacy Detail/PortGroup/actions/Edit */
export const editPortGroupAction = (node) => ({
  id: 'EditPortGroup',
  type: 'modal',
  policy: 'baremetal:portgroup:update',
  title: t('Edit Port Group'),
  buttonText: t('Edit'),
  allowed: () => true,
  getDefaultValues: (item) => {
    const { name, standalone_ports_supported, address, extra = {}, properties = {} } = item;
    return {
      node: nodeLabel(node),
      name,
      address,
      standalone_ports_supported,
      extra: objToKV(extra),
      properties: objToKV(properties),
    };
  },
  formItems: [
    { name: 'node', label: t('Node'), type: 'label' },
    { name: 'name', label: t('Name'), type: 'input' },
    { name: 'address', label: t('MAC Address'), type: 'input', required: true, rules: [macRule()] },
    {
      name: 'standalone_ports_supported',
      label: t('Stand Alone Ports Supported'),
      type: 'radio',
      options: yesNoOptions(),
    },
    propertiesField(),
    extraField(),
  ],
  onSubmit: (values, item) => {
    const adds = [];
    const replaces = [];
    const dels = [];
    const oldExtra = objToKV(item.extra);
    const oldProps = objToKV(item.properties);
    // eslint-disable-next-line no-unused-vars
    const { properties, extra, node: _n, ...rest } = values;
    Object.keys(rest).forEach((key) => {
      const value = rest[key];
      const obj = { value, path: llPath(key) };
      if (!hasPath(item, key) && value) {
        obj.op = 'add';
        adds.push(obj);
      } else if (!isEqual(getPath(item, key), value)) {
        obj.op = 'replace';
        replaces.push(obj);
      }
    });
    const e = getDifFromKV(extra, oldExtra, 'extra');
    const p = getDifFromKV(properties, oldProps, 'properties');
    adds.push(...p.adds, ...e.adds);
    replaces.push(...p.replaces, ...e.replaces);
    dels.push(...p.dels, ...e.dels);
    const body = [...adds, ...replaces, ...dels];
    if (!body.length) return Promise.resolve();
    return ironicApi.updatePortGroup(item.uuid, body);
  },
});

export const deletePortGroupAction = () => ({
  ...deleteAction({ name: t('Port Group'), onDelete: (it) => ironicApi.deletePortGroup(it.uuid) }),
  policy: 'baremetal:portgroup:delete',
  title: t('Delete Port Group'),
  actionName: t('Delete Port Group'),
});

/** legacy actions/index.jsx row actions (shared by list and detail) */
export const nodeRowActions = (navigate) => ({
  firstAction: manageStateAction(),
  moreActions: [
    { action: editNodeAction(navigate) },
    { action: powerOnAction() },
    { action: powerOffAction() },
    { action: setMaintenanceAction() },
    { action: clearMaintenanceAction() },
    { action: setBootDeviceAction() },
    { action: createPortAction() },
    { action: createPortGroupAction() },
    { action: deleteNodeAction() },
  ],
});
