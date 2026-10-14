/**
 * "Related Resources" group: AttachInterface, DetachInterface, AttachVolume, DetachVolume,
 * AssociateFip, DisassociateFip, ManageSecurityGroup (port level).
 */
import React from 'react';
import { t } from '@/core/i18n';
import { novaApi } from '@/api/nova';
import { neutronApi } from '@/api/neutron';
import { hasEndpoint } from '@/api/endpoints';
import NetworkSelectTable from '@/pages/Instances/Create/components/NetworkSelectTable';
import { isIpInRangeAll, isIPv4, isIpv6, ipTypeOptions } from '@/pages/Instances/Create/utils';
import { isOsDisk } from '@/pages/Storage/Volumes/volumeShared';
import {
  isActiveOrShutOff,
  isNotDeleting,
  isNotError,
  isNotLocked,
  allowAttachVolumeInstance,
} from '../resources';
import { define, hasAdminRole, instanceLabel, tipsAlert, loadServerVolumes } from './common';
import {
  selectTableRule,
  SubnetSelect,
  InterfaceSelect,
  VolumeSelect,
  AttachedVolumeSelect,
  FixedIpSelect,
  FipSelect,
  loadFixedIpRows,
  loadServerPorts,
  PortSelect,
  SecurityGroupSelect,
} from './fields';

/** Data volumes of the server (legacy DetachVolume: InstanceVolumeStore without the OS disk) */
export const loadDataVolumes = async (item) => {
  const vols = await loadServerVolumes(item);
  const root = item.root_device_name;
  return vols.filter((v) => {
    const device = v.__attachment?.device || (v.attachments || []).find((a) => a.server_id === item.id)?.device;
    if (root && device) return device !== root;
    return !isOsDisk({ ...v, bootable: String(v.bootable) });
  });
};

export function buildResourceActions(isAdminPage = false) {
  const AttachInterface = define({
    id: 'attach-interface',
    type: 'modal',
    titleKey: 'Attach Interface',
    buttonTextKey: 'Attach Interface',
    descKey: 'action.desc.attach_interface',
    width: 1000,
    policy: 'os_compute_api:os-attach-interfaces:create',
    allowed: (item) => !isAdminPage && isActiveOrShutOff(item) && isNotLocked(item) && isNotDeleting(item),
    getFormItems: () => [
      tipsAlert(
        <div>
          <div>
            {t(
              'After attaching interface, you may need to login the instance to update the network interface configuration and restart the network service.'
            )}
          </div>
          <div>
            {t(
              'The port created here will be automatically deleted when detach. If you need a reusable port, please go to the Ports page to create and attach the port to instance.'
            )}
          </div>
        </div>
      ),
      instanceLabel(),
      {
        name: 'network',
        label: t('Network'),
        rules: [selectTableRule(t('Network'))],
        render: () => (
          <NetworkSelectTable
            showExternal
            hasAdminRole={hasAdminRole()}
            disabledFunc={(it) => !it.subnets || it.subnets.length === 0}
          />
        ),
      },
      { name: 'ipType', label: t('Set IP'), type: 'radio', options: ipTypeOptions() },
      {
        name: 'subnet',
        label: t('Subnet'),
        visible: (v) => v.ipType === 1,
        rules: [selectTableRule(t('Subnet'))],
        render: ({ form }) => <SubnetSelect form={form} />,
      },
      {
        name: 'ip',
        label: t('IP Address'),
        type: 'input',
        visible: (v) => v.ipType === 1,
        extra: t('Please make sure this IP address be available.'),
        rules: [
          ({ getFieldValue }) => ({
            required: true,
            validator: (_, value) => {
              if (!value || (!isIPv4(value) && !isIpv6(value))) {
                return Promise.reject(new Error(t('Please input a valid IP!')));
              }
              const pools = getFieldValue('subnet')?.selectedRows?.[0]?.allocation_pools;
              if (pools && pools.length && !pools.find((p) => isIpInRangeAll(value, p.start, p.end))) {
                return Promise.reject(new Error(t('The IP is not within the allocated pool!')));
              }
              return Promise.resolve();
            },
          }),
        ],
      },
    ],
    getDefaultValues: (item) => ({ instance: item?.name || item?.id, ipType: 0 }),
    onSubmit: (values, item) => {
      const innerBody = { net_id: values.network.selectedRowKeys[0] };
      if (values.ipType === 1) innerBody.fixed_ips = [{ ip_address: values.ip }];
      return novaApi.createServerInterfaceV(item.id, { interfaceAttachment: innerBody });
    },
  });

  const DetachInterface = define({
    id: 'detach-interface',
    type: 'modal',
    titleKey: 'Detach Interface',
    buttonTextKey: 'Detach Interface',
    descKey: 'action.desc.detach_interface',
    isDanger: true,
    width: 900,
    policy: 'os_compute_api:os-attach-interfaces:delete',
    allowed: (item) => isActiveOrShutOff(item) && (item?.fixed_addresses || []).length > 0 && isNotLocked(item),
    getFormItems: async (item) => {
      const res = await novaApi.listServerInterfacesV(item.id).catch(() => ({}));
      const interfaces = res?.interfaceAttachments || [];
      item.__interfaces = interfaces; // eslint-disable-line no-param-reassign
      return [
        instanceLabel(),
        {
          name: 'interfaces',
          label: t('Network Interface'),
          rules: [selectTableRule(t('Network Interface'))],
          render: () => <InterfaceSelect interfaces={interfaces} />,
        },
      ];
    },
    getDefaultValues: (item) => {
      const interfaces = item.__interfaces || [];
      const values = { instance: item?.name || item?.id };
      // legacy: a single interface is selected automatically
      if (interfaces.length === 1) values.interfaces = { selectedRowKeys: [interfaces[0].port_id], selectedRows: [] };
      return values;
    },
    onSubmit: (values, item) =>
      Promise.all((values.interfaces?.selectedRowKeys || []).map((port) => novaApi.deleteServerInterfaceV(item.id, port))),
  });

  const AttachVolume = define({
    id: 'attach-volume',
    type: 'modal',
    titleKey: 'Attach Volume',
    buttonTextKey: 'Attach Volume',
    descKey: 'action.desc.attach_volume',
    width: 1000,
    policy: 'os_compute_api:os-volumes-attachments:create',
    allowed: (item) => hasEndpoint('cinder') && !isAdminPage && allowAttachVolumeInstance(item),
    getFormItems: (item) => [
      instanceLabel(),
      {
        name: 'volume',
        label: t('Volume'),
        rules: [selectTableRule(t('Volume'))],
        tip: t('"Shared" volume can be mounted on multiple instances'),
        render: () => <VolumeSelect serverId={item.id} />,
      },
    ],
    getDefaultValues: (item) => ({ instance: item?.name || item?.id }),
    onSubmit: (values, item) =>
      novaApi.createVolumeAttachmentV(item.id, { volumeAttachment: { volumeId: values.volume.selectedRowKeys[0] } }),
  });

  const DetachVolume = define({
    id: 'detach-volume',
    type: 'modal',
    titleKey: 'Detach Volume',
    buttonTextKey: 'Detach Volume',
    descKey: 'action.desc.detach_volume',
    isDanger: true,
    width: 900,
    policy: 'os_compute_api:os-volumes-attachments:delete',
    allowed: (item) => hasEndpoint('cinder') && !isAdminPage && allowAttachVolumeInstance(item),
    getFormItems: async (item) => {
      const volumes = await loadDataVolumes(item);
      item.__volumes = volumes; // eslint-disable-line no-param-reassign
      return [
        instanceLabel(),
        {
          name: 'volumes',
          label: t('Volume'),
          rules: [selectTableRule(t('Volume'))],
          render: () => <AttachedVolumeSelect volumes={volumes} />,
        },
      ];
    },
    getDefaultValues: (item) => {
      const values = { instance: item?.name || item?.id };
      const volumes = item.__volumes || [];
      if (volumes.length === 1) values.volumes = { selectedRowKeys: [volumes[0].id], selectedRows: [volumes[0]] };
      return values;
    },
    onSubmit: (values, item) =>
      Promise.all((values.volumes?.selectedRowKeys || []).map((vid) => novaApi.deleteVolumeAttachmentV(item.id, vid))),
  });

  const AssociateFip = define({
    id: 'AssociateFip',
    type: 'modal',
    titleKey: 'Associate Floating IP',
    buttonTextKey: 'Associate Floating IP',
    width: 1000,
    policy: 'update_floatingip',
    allowed: (item) =>
      !isAdminPage && isNotError(item) && (item?.fixed_addresses || []).length > (item?.floating_addresses || []).length,
    getFormItems: async (item) => {
      const { rows, reach } = await loadFixedIpRows(item.id);
      return [
        instanceLabel(),
        {
          name: 'fixed_ip',
          label: t('Instance IP'),
          rules: [selectTableRule(t('Instance IP'))],
          render: () => <FixedIpSelect rows={rows} />,
        },
        {
          name: 'fip',
          label: t('Floating IP'),
          rules: [selectTableRule(t('Floating IP'))],
          extra: t('The floating IP configured with port forwardings cannot be bound'),
          render: ({ form }) => <FipSelect form={form} reach={reach} />,
        },
      ];
    },
    getDefaultValues: (item) => ({ instance: item?.name || item?.id }),
    // legacy globalFloatingIpsStore.associateFip
    onSubmit: (values) => {
      const port = values.fixed_ip.selectedRows[0];
      const body = { port_id: port.port_id };
      if (port.fixed_ip_address !== '' && port.fixed_ip_address !== undefined) body.fixed_ip_address = port.fixed_ip_address;
      return neutronApi.updateFloatingIp(values.fip.selectedRowKeys[0], body);
    },
  });

  const DisassociateFip = define({
    id: 'DisassociateFip',
    type: 'modal',
    titleKey: 'Disassociate Floating IP',
    buttonTextKey: 'Disassociate Floating IP',
    isDanger: true,
    policy: 'update_floatingip',
    allowed: (item) => (item?.floating_addresses || []).length > 0,
    getFormItems: (item) => [
      instanceLabel(),
      {
        name: 'address',
        label: t('Floating IP'),
        type: 'select',
        required: true,
        options: (item.floating_addresses || []).map((it) => ({ value: it, label: it })),
      },
    ],
    getDefaultValues: (item) => ({ instance: item?.name || item?.id, address: (item.floating_addresses || [])[0] }),
    // legacy: look the FIP up by address, then { floatingip: { port_id: null } }
    onSubmit: async (values) => {
      const res = await neutronApi.listFloatingIps({ floating_ip_address: values.address });
      const fip = (res?.floatingips || [])[0];
      if (!fip) return undefined;
      return neutronApi.updateFloatingIp(fip.id, { port_id: null });
    },
  });

  const ManageSecurityGroup = define({
    id: 'manage-security-group',
    type: 'modal',
    titleKey: 'Manage Security Group',
    buttonTextKey: 'Manage Security Group',
    width: 1000,
    policy: 'update_port',
    allowed: () => true,
    getFormItems: async (item) => {
      const ports = await loadServerPorts(item.id);
      item.__ports = ports; // eslint-disable-line no-param-reassign
      return [
        instanceLabel(),
        { name: 'port', label: t('Port'), rules: [selectTableRule(t('Port'))], render: () => <PortSelect ports={ports} /> },
        {
          name: 'securityGroup',
          label: t('Security Group'),
          rules: [selectTableRule(t('Security Group'))],
          tip: t(
            'The security group is similar to the firewall function for setting up network access control, or you can go to the console and create a new security group. (Note: The security group you selected will work on all virtual LANs on the instances.)'
          ),
          render: ({ form }) => <SecurityGroupSelect form={form} />,
        },
      ];
    },
    getDefaultValues: (item) => {
      const values = { instance: item?.name || item?.id };
      const port = item.__portId ? (item.__ports || []).find((p) => p.id === item.__portId) : null;
      if (port) values.port = { selectedRowKeys: [port.id], selectedRows: [port] };
      return values;
    },
    // legacy updatePortSecurityGroup: PUT /ports/{id} { port: { security_groups } }
    onSubmit: (values) =>
      neutronApi.updatePort(values.port.selectedRowKeys[0], { security_groups: values.securityGroup?.selectedRowKeys || [] }),
  });

  return { AttachInterface, DetachInterface, AttachVolume, DetachVolume, AssociateFip, DisassociateFip, ManageSecurityGroup };
}
