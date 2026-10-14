/**
 * Port actions - port of legacy pages/network/containers/Port/actions/* and Detail/* actions.
 * Payloads are identical to the legacy onSubmit / store calls.
 */
import React from 'react';
import { neutronApi } from '@/api/neutron';
import { novaApi } from '@/api/nova';
import { deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { quotaItem, withQuota } from '@/components/Quota/utils';
import { fetchNeutronQuota, neutronQuotaItems } from '@/components/Quota/services';
import { PORT_TYPES, MacAddressInput, macAddressRule, DependentSelect, checkIpOrCidr, loadQosPolicyOptions, qosEnabled, isPortError, currentProjectId } from './helpers';
import { NetworkIpDistributor, ipDistributorRule } from '@/components/network/IpDistributor';
import { loadAssociateFipData } from '@/components/network/associateFip';

const safeList = async (promise, key) => {
  try {
    const res = await promise;
    return res?.[key] || [];
  } catch {
    return [];
  }
};

const toFixedIpsPayload = (fixedIps = []) =>
  fixedIps.map((i) => {
    const ret = { subnet_id: i.subnet };
    if (i.ip_address && i.ip_address.type === 'manual') {
      ret.ip_address = i.ip_address.ip;
    }
    return ret;
  });

const portLabel = (item) => item?.name || item?.id;

/* ---------------- Create Port ---------------- */
export const createPortAction = ({ networkId } = {}) => ({
  id: 'create-virtual-adapter',
  type: 'modal',
  policy: 'create_port',
  title: t('Create Port'),
  width: 860,
  description: t('Port mainly used for binding instance and other operations, occupying the quota of the port.'),
  getDefaultValues: () => ({
    more: false,
    mac_address: { type: 'auto' },
    port_security_enabled: true,
    enableQosPolicy: false,
    network_id: networkId,
  }),
  // legacy Port/actions/Create showQuota: disabled when used >= limit (reserved ignored like legacy)
  quota: withQuota(
    () => fetchNeutronQuota(),
    (quota) => [quotaItem(quota.port && { ...quota.port, reserved: 0 }, { name: 'port', title: t('Ports'), add: 1 })]
  ),
  getFormItems: async () => {
    const projectId = currentProjectId();
    const [networks, securityGroups, qosOptions] = await Promise.all([
      safeList(neutronApi.listNetworks(), 'networks'),
      safeList(neutronApi.listSecurityGroups({ project_id: projectId }), 'security_groups'),
      qosEnabled() ? loadQosPolicyOptions() : Promise.resolve([]),
    ]);
    const networkOptions = networks
      .filter((n) => n.status !== 'ERROR' || n.id === networkId)
      .map((n) => ({
        value: n.id,
        label: `${n.name || n.id}${n['router:external'] ? ` (${t('External')})` : ''}${n.shared ? ` (${t('Shared')})` : ''}`,
      }));
    if (networkId && !networkOptions.some((o) => o.value === networkId)) {
      networkOptions.unshift({ value: networkId, label: networkId });
    }
    return [
      { name: 'name', label: t('Port Name'), type: 'input', required: true },
      { name: 'description', label: t('Description'), type: 'textarea', rows: 2 },
      {
        name: 'network_id',
        label: t('Network'),
        type: 'select',
        required: true,
        disabled: Boolean(networkId),
        options: networkOptions,
      },
      {
        name: 'fixed_ips',
        label: t('Subnet'),
        visible: (v) => Boolean(v.network_id),
        rules: [ipDistributorRule()],
        render: ({ form }) => <NetworkIpDistributor form={form} />,
      },
      {
        name: 'mac_address',
        label: t('MAC Address'),
        rules: [macAddressRule()],
        render: () => <MacAddressInput />,
      },
      {
        name: 'port_security_enabled',
        label: t('Port Security'),
        type: 'switch',
        tip: t(
          'Disabling port security will turn off the security group policy protection and anti-spoofing protection on the port. General applicable scenarios: NFV or operation and maintenance Debug.'
        ),
      },
      {
        name: 'security_groups',
        label: t('Security Group'),
        type: 'select',
        mode: 'multiple',
        required: true,
        visible: (v) => v.port_security_enabled !== false,
        tip: t(
          'The security group is similar to the firewall function for setting up network access control, or you can go to the console and create a new security group. (Note: The security group you selected will work on all virtual LANs on the instances.)'
        ),
        options: securityGroups.map((sg) => ({
          value: sg.id,
          label: sg.description ? `${sg.name} (${sg.description})` : sg.name || sg.id,
        })),
      },
      { name: 'more', label: t('Advanced Options'), type: 'switch' },
      {
        name: 'binding:vnic_type',
        label: t('Port Type'),
        type: 'select',
        options: PORT_TYPES,
        visible: (v) => Boolean(v.more),
      },
      qosEnabled() && {
        name: 'enableQosPolicy',
        label: t('Enable QoS Policy'),
        type: 'switch',
        visible: (v) => Boolean(v.more),
      },
      qosEnabled() && {
        name: 'qos_policy_id',
        label: t('QoS Policy'),
        type: 'select',
        required: true,
        tip: t('Choosing a QoS policy can limit bandwidth and DSCP'),
        options: qosOptions,
        visible: (v) => Boolean(v.more && v.enableQosPolicy),
      },
      {
        name: 'bindingProfile',
        label: t('Binding Profile'),
        type: 'textarea',
        rows: 6,
        placeholder: '{ }',
        visible: (v) => Boolean(v.more),
        rules: [
          {
            validator: (_, value) => {
              if (value !== undefined && value !== '') {
                try {
                  JSON.parse(value);
                } catch {
                  return Promise.reject(new Error(t('Illegal JSON scheme')));
                }
              }
              return Promise.resolve();
            },
          },
        ],
      },
    ].filter(Boolean);
  },
  onSubmit: (values) => {
    const {
      mac_address: { type, mac } = {},
      security_groups,
      enableQosPolicy,
      qos_policy_id,
      more,
      network_id,
      fixed_ips,
      bindingProfile,
      ...rest
    } = values;
    const data = {
      ...(fixed_ips && fixed_ips.length > 0 ? { fixed_ips: toFixedIpsPayload(fixed_ips) } : {}),
      network_id,
      ...rest,
    };
    if (type && type !== 'auto') data.mac_address = mac;
    if (enableQosPolicy && qos_policy_id !== undefined) {
      data.qos_policy_id = qos_policy_id || null;
    }
    if (security_groups) data.security_groups = security_groups;
    data.project_id = currentProjectId();
    if (bindingProfile) data['binding:profile'] = JSON.parse(bindingProfile);
    return neutronApi.createPort(data);
  },
});

/* ---------------- Edit ---------------- */
export const editPortAction = () => ({
  id: 'edit-virtual-adapter',
  type: 'modal',
  policy: 'update_port',
  title: t('Edit'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({
    name: item.name,
    description: item.description,
    mac_address: { type: 'manual', mac: item.mac_address },
    'binding:vnic_type': item.binding_vnic_type || item['binding:vnic_type'],
    more: false,
  }),
  formItems: [
    { name: 'name', label: t('Name'), type: 'input', required: true },
    {
      name: 'mac_address',
      label: t('MAC Address'),
      rules: [macAddressRule()],
      render: () => <MacAddressInput />,
    },
    { name: 'description', label: t('Description'), type: 'textarea', rows: 3 },
    { name: 'more', label: t('Advanced Options'), type: 'switch' },
    {
      name: 'binding:vnic_type',
      label: t('Port Type'),
      type: 'select',
      required: true,
      options: PORT_TYPES,
      visible: (v) => Boolean(v.more),
    },
  ],
  onSubmit: (values, item) => {
    const { mac_address: { type, mac } = {}, more, ...rest } = values;
    const data = { ...rest };
    if (type && type !== 'auto') data.mac_address = mac;
    return neutronApi.updatePort(item.id, data);
  },
});

/* ---------------- Attach Instance ---------------- */
const allowAttachInterfaceStatus = ['active', 'paused', 'stopped'];

export const attachInstanceAction = () => ({
  id: 'attach_instance',
  type: 'modal',
  policy: 'os_compute_api:os-attach-interfaces:create',
  title: t('Attach Instance'),
  width: 720,
  allowed: (item) => !item.device_id,
  getDefaultValues: (item) => ({ virtual_adapter: portLabel(item) }),
  getFormItems: async () => {
    const servers = await safeList(novaApi.listServers(), 'servers');
    return [
      { name: 'virtual_adapter', label: t('Port'), type: 'label' },
      {
        name: 'instance',
        label: t('Instance'),
        type: 'select',
        required: true,
        options: servers.map((s) => {
          const vmState = s['OS-EXT-STS:vm_state'] || s.vm_state || '';
          return {
            value: s.id,
            label: `${s.name || s.id} (${s.status || '-'})`,
            disabled: Boolean(s.locked) || !allowAttachInterfaceStatus.includes(String(vmState).toLowerCase()),
          };
        }),
      },
    ];
  },
  onSubmit: (values, item) => novaApi.attachInterface(values.instance, { port_id: item.id }),
});

/* ---------------- Detach Instance ---------------- */
export const detachInstanceAction = () => ({
  id: 'detach_instance',
  type: 'confirm',
  policy: 'os_compute_api:os-attach-interfaces:delete',
  title: t('Detach Instance'),
  buttonText: t('Detach'),
  actionName: t('detach instance'),
  allowed: (item) => !!item.device_id && item.device_owner === 'compute:nova',
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    for (const it of list) {
      // eslint-disable-next-line no-await-in-loop
      await novaApi.detachInterface(it.device_id, it.id);
    }
  },
});

/* ---------------- Associate / Disassociate Floating IP ---------------- */
export const associateFipAction = ({ isAdmin } = {}) => ({
  id: 'AssociateFip',
  type: 'modal',
  policy: 'update_floatingip',
  title: t('Associate Floating IP'),
  width: 760,
  allowed: (item) =>
    !isAdmin &&
    !isPortError(item) &&
    Array.isArray(item.associatedDetail) &&
    item.associatedDetail.length < (item.ipv4 || []).length,
  getDefaultValues: (item) => ({ virtualAdapter: portLabel(item) }),
  getFormItems: async (item) => {
    const { interfaces, fipsForSubnet } = await loadAssociateFipData(item);
    const bySubnet = Object.fromEntries(interfaces.map((i) => [i.fixed_ip_address, i.subnet_id]));
    return [
      { name: 'virtualAdapter', label: t('Port'), type: 'label' },
      {
        name: 'fixed_ip',
        label: t('Instance IP'),
        type: 'select',
        required: true,
        options: interfaces.map((i) => ({
          value: i.fixed_ip_address,
          disabled: !i.available,
          label: `${i.fixed_ip_address} | ${i.network_name || '-'} | ${i.subnet_id}${i.reason ? ` - ${i.reason}` : ''}`,
        })),
      },
      {
        name: 'fip',
        label: t('Floating IP'),
        required: true,
        tip: t('The floating IP configured with port forwardings cannot be bound'),
        render: ({ form }) => (
          <DependentSelect
            form={form}
            depName="fixed_ip"
            optionsFor={(ip) =>
              fipsForSubnet(bySubnet[ip]).map((fip) => ({
                value: fip.id,
                label: `${fip.floating_ip_address} (${fip.network_name})`,
                disabled: (fip.port_forwardings || []).length > 0,
              }))
            }
          />
        ),
      },
    ];
  },
  onSubmit: (values, item) => {
    const body = { port_id: item.id };
    if (values.fixed_ip) body.fixed_ip_address = values.fixed_ip;
    return neutronApi.updateFloatingIp(values.fip, body);
  },
});

export const disassociateFipAction = ({ isAdmin } = {}) => ({
  id: 'DisAssociateFip',
  type: 'modal',
  policy: 'update_floatingip',
  title: t('Disassociate Floating IP'),
  width: 720,
  allowed: (item) =>
    !isAdmin && !isPortError(item) && Array.isArray(item.associatedDetail) && item.associatedDetail.length > 0,
  getDefaultValues: (item) => ({ virtualAdapter: portLabel(item) }),
  getFormItems: (item) => [
    { name: 'virtualAdapter', label: t('Port'), type: 'label' },
    {
      name: 'floating_ip',
      label: t('Floating IP'),
      type: 'select',
      required: true,
      options: (item.associatedDetail || []).map((f) => ({
        value: f.id,
        label: `${f.floating_ip_address} (${t('Fixed IP')}: ${f.fixed_ip_address || '-'})`,
      })),
    },
  ],
  onSubmit: (values) => neutronApi.updateFloatingIp(values.floating_ip, { port_id: null }),
});

/* ---------------- Modify QoS ---------------- */
export const modifyQosAction = () => ({
  id: 'modify_qos',
  type: 'modal',
  policy: 'update_port',
  title: t('Modify QoS'),
  width: 720,
  allowed: () => qosEnabled(),
  getDefaultValues: async (item) => {
    let currentName = t('Not yet bound');
    if (item.qos_policy_id) {
      try {
        const res = await neutronApi.getQosPolicy(item.qos_policy_id);
        currentName = res?.policy?.name || item.qos_policy_id;
      } catch {
        currentName = item.qos_policy_id;
      }
    }
    return {
      enableQosPolicy: Boolean(item.qos_policy_id),
      qos_policy_id: item.qos_policy_id || undefined,
      currentQos: currentName,
    };
  },
  getFormItems: async (item) => {
    const options = await loadQosPolicyOptions({ disabledId: item.qos_policy_id });
    return [
      { name: 'enableQosPolicy', label: t('Enable QoS Policy'), type: 'switch' },
      {
        name: 'currentQos',
        label: t('Current QoS policy name'),
        type: 'label',
        visible: (v) => Boolean(v.enableQosPolicy),
      },
      {
        name: 'qos_policy_id',
        label: t('QoS Policy'),
        type: 'select',
        required: true,
        tip: t('Choosing a QoS policy can limit bandwidth and DSCP'),
        options,
        visible: (v) => Boolean(v.enableQosPolicy),
      },
    ];
  },
  onSubmit: (values, item) => {
    const data = { qos_policy_id: null };
    if (values.enableQosPolicy && values.qos_policy_id !== undefined) {
      data.qos_policy_id = values.qos_policy_id || null;
    }
    return neutronApi.updatePort(item.id, data);
  },
});

/* ---------------- Manage Security Group ---------------- */
export const manageSecurityGroupAction = () => ({
  id: 'manage-security-group',
  type: 'modal',
  policy: 'update_port:port_security_enabled',
  title: t('Manage Security Group'),
  width: 720,
  allowed: (item) => {
    const pairs = item?.origin_data?.allowed_address_pairs ?? [];
    return (Array.isArray(pairs) ? pairs : []).length === 0;
  },
  getDefaultValues: async (item) => {
    let sgs = item.security_groups;
    let enabled = item.port_security_enabled;
    if (!Array.isArray(sgs)) {
      try {
        const port = (await neutronApi.getPort(item.id))?.port || {};
        sgs = port.security_groups;
        if (enabled === undefined) enabled = port.port_security_enabled;
      } catch {
        sgs = [];
      }
    }
    return { port_security_enabled: enabled !== false, securityGroup: Array.isArray(sgs) ? sgs : [] };
  },
  getFormItems: async (item) => {
    const list = await safeList(neutronApi.listSecurityGroups({ project_id: currentProjectId() }), 'security_groups');
    const options = list.map((sg) => ({ value: sg.id, label: sg.name || sg.id }));
    (Array.isArray(item.security_groups) ? item.security_groups : []).forEach((id) => {
      if (!options.some((o) => o.value === id)) options.push({ value: id, label: id });
    });
    return [
      { name: 'port_security_enabled', label: t('Port Security'), type: 'switch', required: true },
      {
        name: 'securityGroup',
        label: t('Security Group'),
        type: 'select',
        mode: 'multiple',
        options,
        tip: t(
          'The security group is similar to the firewall function for setting up network access control, or you can go to the console and create a new security group. (Note: The security group you selected will work on all virtual LANs on the instances.)'
        ),
        visible: (v) => v.port_security_enabled !== false,
      },
    ];
  },
  onSubmit: (values, item) => {
    const { securityGroup = [], port_security_enabled } = values;
    return neutronApi.updatePort(item.id, {
      security_groups: port_security_enabled ? securityGroup || [] : [],
      port_security_enabled,
    });
  },
});

/* ---------------- Delete ---------------- */
export const deletePortAction = () =>
  ({
    ...deleteAction({ name: t('Port'), title: t('Delete Port'), onDelete: (it) => neutronApi.deletePort(it.id) }),
    policy: 'delete_port',
  });

/* ---------------- Allocate IP (Fixed IPs tab) ---------------- */
export const allocateIpAction = ({ getPort } = {}) => ({
  id: 'allocate-ip',
  type: 'modal',
  policy: 'update_port:fixed_ips:ip_address',
  title: t('Allocate IP'),
  width: 860,
  getDefaultValues: async (item) => {
    const port = (getPort ? getPort() : item) || {};
    let networkName = port.network_name || '';
    if (!networkName && port.network_id) {
      try {
        networkName = (await neutronApi.getNetwork(port.network_id))?.network?.name || '';
      } catch {
        // ignore
      }
    }
    return { network_id: port.network_id, network_name: networkName || '-' };
  },
  getFormItems: (item) => {
    const port = (getPort ? getPort() : item) || {};
    return [
      { name: 'network_id', label: t('Network ID'), type: 'label' },
      { name: 'network_name', label: t('Network'), type: 'label' },
      {
        name: 'fixed_ips',
        label: t('Subnet'),
        required: true,
        rules: [ipDistributorRule()],
        render: ({ form }) => <NetworkIpDistributor form={form} networkId={port.network_id} />,
      },
    ];
  },
  onSubmit: async (values, item) => {
    const port = (getPort ? getPort() : item) || {};
    const data = toFixedIpsPayload(values.fixed_ips || []);
    return neutronApi.updatePort(port.id, { fixed_ips: [...data, ...(port.fixed_ips || [])] });
  },
});

/* ---------------- Release Fixed IP ---------------- */
export const releaseIpAction = () => ({
  id: 'release-ip',
  type: 'confirm',
  policy: 'update_port',
  title: t('Release Fixed IP'),
  buttonText: t('Release'),
  actionName: t('release fixed IP'),
  isDanger: true,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    if (!list.length) return undefined;
    const { id, fixed_ips = [] } = list[0].port || {};
    const newFixedIps = fixed_ips.filter(
      (it) => !list.some((r) => r.ip_address === it.ip_address && r.subnet_id === it.subnet_id)
    );
    return neutronApi.updatePort(id, { fixed_ips: newFixedIps });
  },
});

/* ---------------- Allowed address pairs ---------------- */
export const createAllowedAddressPairAction = ({ getPort } = {}) => ({
  id: 'create-ip',
  type: 'modal',
  policy: 'update_port',
  title: t('Create Allowed Address Pair'),
  getDefaultValues: () => ({ ip_version: 'ipv4', mac_address: { type: 'auto' } }),
  formItems: [
    {
      name: 'ip_version',
      label: t('IP Version'),
      type: 'select',
      required: true,
      options: [
        { label: t('IPv4'), value: 'ipv4' },
        { label: t('IPv6'), value: 'ipv6' },
      ],
    },
    {
      name: 'ip_address',
      label: t('CIDR or IP'),
      type: 'input',
      required: true,
      rules: [
        ({ getFieldValue }) => ({
          validator: (_, value) =>
            !value || checkIpOrCidr(value, getFieldValue('ip_version') || 'ipv4')
              ? Promise.resolve()
              : Promise.reject(new Error(t('Invalid CIDR or IP address.'))),
        }),
      ],
    },
    {
      name: 'mac_address',
      label: t('MAC Address'),
      rules: [macAddressRule()],
      render: () => (
        <MacAddressInput
          options={[
            { label: t('From port'), value: 'auto' },
            { label: t('Manual input'), value: 'manual' },
          ]}
        />
      ),
    },
  ],
  onSubmit: async (values, item) => {
    const port = (getPort ? getPort() : item) || {};
    const { ip_address, mac_address = {} } = values;
    const data = { ip_address };
    if (mac_address.type === 'manual') data.mac_address = mac_address.mac;
    return neutronApi.updatePort(port.id, {
      allowed_address_pairs: [data, ...(port.allowed_address_pairs || [])],
    });
  },
});

export const deleteAllowedAddressPairAction = ({ getPort } = {}) => ({
  id: 'delete',
  type: 'confirm',
  policy: 'update_port',
  title: t('Delete Allowed Address Pair'),
  buttonText: t('Delete'),
  actionName: t('delete allowed address pair'),
  isDanger: true,
  onSubmit: async (target) => {
    const list = Array.isArray(target) ? target : [target];
    const port = getPort() || {};
    const newData = (port.allowed_address_pairs || []).filter(
      (i) => !list.some((r) => r.ip_address === i.ip_address)
    );
    return neutronApi.updatePort(port.id, { allowed_address_pairs: newData });
  },
});

/* ---------------- Detach security group (Security Groups tab) ---------------- */
export const detachSecurityGroupAction = ({ getPort } = {}) => ({
  id: 'detach',
  type: 'confirm',
  policy: 'update_port',
  title: t('Detach Security Group'),
  buttonText: t('Detach'),
  actionName: t('detach security group'),
  isDanger: true,
  onSubmit: (item) => {
    const { id, security_groups = [] } = getPort() || {};
    return neutronApi.updatePort(id, { security_groups: security_groups.filter((it) => it !== item.id) });
  },
});

