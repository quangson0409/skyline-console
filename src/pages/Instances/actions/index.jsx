import React from 'react';
import { t } from '@/core/i18n';
import { novaApi } from '@/api/nova';
import { cinderApi } from '@/api/cinder';
import { neutronApi } from '@/api/neutron';
import { glanceApi } from '@/api/glance';

/**
 * OpenStack Skyline Instance Actions Configuration
 * 100% faithful to legacy Skyline RBAC policies, status constraints, and action categories.
 * Full i18n support with reactive dynamic getters and official vendor descriptions.
 */

// 1. Console Action (First Action)
export const ConsoleAction = {
  id: 'console',
  titleKey: 'Console',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Console',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  descKey: 'action.desc.console',
  get description() {
    return t(this.descKey);
  },
  type: 'custom',
  allowed: (item) => Boolean(item && item.id),
  onExecute: async (item) => {
    try {
      const res = await novaApi.getVncConsole(item.id);
      const url = res?.console?.url || res?.data?.console?.url;
      if (url) {
        window.open(url, '_blank');
      } else {
        window.open(`/compute/instance/detail/${item.id}?tab=console`, '_blank');
      }
    } catch {
      window.open(`/compute/instance/detail/${item.id}?tab=console`, '_blank');
    }
  },
};

// 2. Status Actions
export const StartAction = {
  id: 'start',
  titleKey: 'Start Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Start',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'start instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.start',
  get description() {
    return t(this.descKey);
  },
  type: 'confirm',
  allowed: (item) => ['shutoff', 'stopped', 'crashed'].includes(item?.status?.toLowerCase()),
  onSubmit: (item) => novaApi.startServer(item.id),
};

export const StopAction = {
  id: 'stop',
  titleKey: 'Stop Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Stop',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'stop instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.stop',
  get description() {
    return t(this.descKey);
  },
  isDanger: true,
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'active' && !item?.locked,
  onSubmit: (item) => novaApi.stopServer(item.id),
};

export const LockAction = {
  id: 'lock',
  titleKey: 'Lock Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Lock',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'lock instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.lock',
  get description() {
    return t(this.descKey);
  },
  type: 'confirm',
  allowed: (item) => !item?.locked,
  onSubmit: (item) => novaApi.lockServer(item.id),
};

export const UnlockAction = {
  id: 'unlock',
  titleKey: 'Unlock Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Unlock',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'unlock instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.unlock',
  get description() {
    return t(this.descKey);
  },
  type: 'confirm',
  allowed: (item) => Boolean(item?.locked),
  onSubmit: (item) => novaApi.unlockServer(item.id),
};

export const RebootAction = {
  id: 'reboot',
  titleKey: 'Hard Reboot Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Hard Reboot',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'hard reboot instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.hard_reboot',
  get description() {
    return t(this.descKey);
  },
  isDanger: true,
  type: 'confirm',
  allowed: (item) => !item?.locked,
  onSubmit: (item) => novaApi.rebootServer(item.id, 'HARD'),
};

export const SoftRebootAction = {
  id: 'soft-reboot',
  titleKey: 'Soft Reboot Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Soft Reboot',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'soft reboot instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.soft_reboot',
  get description() {
    return t(this.descKey);
  },
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'active' && !item?.locked,
  onSubmit: (item) => novaApi.rebootServer(item.id, 'SOFT'),
};

export const SuspendAction = {
  id: 'suspend',
  titleKey: 'Suspend Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Suspend',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'suspend instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.suspend',
  get description() {
    return t(this.descKey);
  },
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'active' && !item?.locked,
  onSubmit: (item) => novaApi.suspendServer(item.id),
};

export const ResumeAction = {
  id: 'resume',
  titleKey: 'Resume Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Resume',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'resume instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.resume',
  get description() {
    return t(this.descKey);
  },
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'suspended' && !item?.locked,
  onSubmit: (item) => novaApi.resumeServer(item.id),
};

export const PauseAction = {
  id: 'pause',
  titleKey: 'Pause Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Pause',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'pause instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.pause',
  get description() {
    return t(this.descKey);
  },
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'active' && !item?.locked,
  onSubmit: (item) => novaApi.pauseServer(item.id),
};

export const UnpauseAction = {
  id: 'unpause',
  titleKey: 'Unpause Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Unpause',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'unpause instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.unpause',
  get description() {
    return t(this.descKey);
  },
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'paused' && !item?.locked,
  onSubmit: (item) => novaApi.unpauseServer(item.id),
};

export const ShelveAction = {
  id: 'shelve',
  titleKey: 'Shelve Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Shelve',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'shelve instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.shelve',
  get description() {
    return t(this.descKey);
  },
  type: 'confirm',
  allowed: (item) => ['active', 'shutoff', 'paused', 'suspended'].includes(item?.status?.toLowerCase()) && !item?.locked,
  onSubmit: (item) => novaApi.shelveServer(item.id),
};

export const UnshelveAction = {
  id: 'unshelve',
  titleKey: 'Unshelve Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Unshelve',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'unshelve instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.unshelve',
  get description() {
    return t(this.descKey);
  },
  type: 'confirm',
  allowed: (item) => ['shelved', 'shelved_offloaded'].includes(item?.status?.toLowerCase()),
  onSubmit: (item) => novaApi.unshelveServer(item.id),
};

export const ResetStateAction = {
  id: 'reset-state',
  titleKey: 'Reset State',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Reset State',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'reset instance state',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.reset_state',
  get description() {
    return t(this.descKey);
  },
  adminOnly: true,
  type: 'modal',
  allowed: () => true,
  getFormItems: async () => [
    {
      name: 'instance',
      label: t('Instance'),
      type: 'label',
    },
    {
      name: 'currentState',
      label: t('Current State'),
      type: 'label',
    },
    {
      name: 'state',
      label: t('Target State'),
      type: 'select',
      required: true,
      options: [
        { label: `ACTIVE (${t('Active')})`, value: 'active' },
        { label: `ERROR (${t('Error')})`, value: 'error' },
        { label: `SHUTOFF (${t('Shutoff')})`, value: 'shutoff' },
        { label: `PAUSED (${t('Pause')})`, value: 'paused' },
        { label: `SUSPENDED (${t('Suspend')})`, value: 'suspended' },
      ],
      placeholder: t('Select new instance state...'),
    },
  ],
  getDefaultValues: (item) => ({
    instance: item?.name || item?.id,
    currentState: item?.status || 'UNKNOWN',
    state: 'active',
  }),
  onSubmit: (values, item) => novaApi.resetServerState(item.id, values.state),
};

export const RescueAction = {
  id: 'rescue',
  titleKey: 'Rescue Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Rescue',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'rescue instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.rescue',
  get description() {
    return t(this.descKey);
  },
  isDanger: true,
  type: 'modal',
  allowed: (item) => ['active', 'shutoff'].includes(item?.status?.toLowerCase()) && !item?.locked,
  getFormItems: async () => {
    let imageOptions = [];
    try {
      const res = await glanceApi.listImages();
      const imgs = res?.images || res?.data?.images || [];
      imageOptions = imgs.map((img) => ({
        label: `${img.name || img.id} (${img.disk_format?.toUpperCase() || 'RAW'})`,
        value: img.id,
      }));
    } catch {}

    return [
      {
        name: 'instance',
        label: t('Instance'),
        type: 'label',
      },
      {
        name: 'rescue_image_ref',
        label: t('Rescue Image (Optional)'),
        type: 'select',
        options: [{ label: t('Default (Use instance base image)'), value: '' }, ...imageOptions],
        placeholder: t('Select image to rebuild...'),
      },
      {
        name: 'adminPass',
        label: t('Rescue Password (Optional)'),
        type: 'password',
        placeholder: t('Enter password for rescue console/SSH'),
      },
    ];
  },
  getDefaultValues: (item) => ({
    instance: item?.name || item?.id,
    rescue_image_ref: '',
  }),
  onSubmit: (values, item) => novaApi.rescueServer(item.id, values.rescue_image_ref || null),
};

export const UnrescueAction = {
  id: 'unrescue',
  titleKey: 'Unrescue Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Unrescue',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'unrescue instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.unrescue',
  get description() {
    return t(this.descKey);
  },
  type: 'confirm',
  allowed: (item) => item?.status?.toUpperCase() === 'RESCUE',
  onSubmit: (item) => novaApi.unrescueServer(item.id),
};

// 3. Resource Actions (Modal Forms)
export const AttachVolumeAction = {
  id: 'attach-volume',
  titleKey: 'Attach Volume',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Attach Volume',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  descKey: 'action.desc.attach_volume',
  get description() {
    return t(this.descKey);
  },
  type: 'modal',
  allowed: (item) => ['active', 'shutoff'].includes(item?.status?.toLowerCase()) && !item?.locked,
  getFormItems: async () => {
    let volumeOptions = [];
    try {
      const res = await cinderApi.listVolumes();
      const vols = res?.volumes || res?.data?.volumes || [];
      volumeOptions = vols
        .filter((v) => v.status === 'available')
        .map((v) => ({
          label: `${v.name || v.id} (${v.size} GiB - ${v.volume_type || 'standard'})`,
          value: v.id,
        }));
    } catch {
      // fallback
    }

    return [
      {
        name: 'instance',
        label: t('Instance'),
        type: 'label',
      },
      {
        name: 'volumeId',
        label: t('Volume'),
        type: 'select',
        options: volumeOptions,
        required: true,
        placeholder: t('Select volume to attach...'),
      },
    ];
  },
  getDefaultValues: (item) => ({
    instance: item?.name || item?.id,
  }),
  onSubmit: (values, item) => novaApi.attachVolume(item.id, values.volumeId),
};

export const DetachVolumeAction = {
  id: 'detach-volume',
  titleKey: 'Detach Volume',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Detach Volume',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  descKey: 'action.desc.detach_volume',
  get description() {
    return t(this.descKey);
  },
  isDanger: true,
  type: 'modal',
  allowed: (item) => !item?.locked,
  getFormItems: async (item) => {
    let attached = item?.volumesAttached || [];
    if (attached.length === 0 && item?.id) {
      try {
        const res = await novaApi.listAttachedVolumes(item.id);
        attached = res?.volumeAttachments || [];
      } catch {
        // fallback
      }
    }
    const options = attached.map((v) => ({
      label: v.name ? `${v.name} (${(v.id || v.volumeId)?.substring(0, 8)}... ${v.size ? `- ${v.size} GiB` : ''})` : (v.volumeId || v.id),
      value: v.volumeId || v.id,
    }));

    return [
      {
        name: 'instance',
        label: t('Instance'),
        type: 'label',
      },
      {
        name: 'volumeId',
        label: t('Volume'),
        type: 'select',
        options,
        required: true,
        placeholder: t('Select volume to detach...'),
      },
    ];
  },
  getDefaultValues: (item) => ({
    instance: item?.name || item?.id,
  }),
  onSubmit: (values, item) => novaApi.detachVolume(item.id, values.volumeId),
};

export const DetachInterfaceAction = {
  id: 'detach-interface',
  titleKey: 'Detach Interface',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Detach Interface',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  descKey: 'action.desc.detach_interface',
  get description() {
    return t(this.descKey);
  },
  isDanger: true,
  type: 'modal',
  allowed: (item) => Boolean(item && !item?.locked),
  getFormItems: async (item) => {
    let portOptions = [];
    try {
      const res = await novaApi.listInterfaces(item.id);
      const ifaces = res?.interfaceAttachments || [];
      portOptions = ifaces.map((iface) => ({
        label: `Port ${(iface.port_id || iface.id)?.substring(0, 10)}... (IP: ${iface.fixed_ips?.map((f) => f.ip_address).join(', ') || '-'})`,
        value: iface.port_id || iface.id,
      }));
    } catch {
      // fallback
    }

    return [
      {
        name: 'instance',
        label: t('Instance'),
        type: 'label',
      },
      {
        name: 'portId',
        label: t('Network Interface / Port'),
        type: 'select',
        options: portOptions,
        required: true,
        placeholder: t('Select port to detach...'),
      },
    ];
  },
  getDefaultValues: (item) => ({
    instance: item?.name || item?.id,
  }),
  onSubmit: (values, item) => novaApi.detachInterface(item.id, values.portId),
};

export const AttachInterfaceAction = {
  id: 'attach-interface',
  titleKey: 'Attach Interface',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Attach Interface',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  descKey: 'action.desc.attach_interface',
  get description() {
    return t(this.descKey);
  },
  type: 'modal',
  allowed: (item) => ['active', 'shutoff'].includes(item?.status?.toLowerCase()) && !item?.locked,
  getFormItems: async () => {
    let networkOptions = [];
    try {
      const res = await neutronApi.listNetworks();
      const nets = res?.networks || res?.data?.networks || [];
      networkOptions = nets.map((net) => ({
        label: `${net.name || net.id} (${net.status})`,
        value: net.id,
      }));
    } catch {
      // fallback
    }

    return [
      {
        name: 'instance',
        label: t('Instance'),
        type: 'label',
      },
      {
        name: 'netId',
        label: t('Network'),
        type: 'select',
        options: networkOptions,
        required: true,
        placeholder: t('Select network...'),
      },
    ];
  },
  getDefaultValues: (item) => ({
    instance: item?.name || item?.id,
  }),
  onSubmit: (values, item) => novaApi.attachInterface(item.id, { net_id: values.netId }),
};

// 4. Backups & Snapshots
export const CreateSnapshotAction = {
  id: 'create-snapshot',
  titleKey: 'Create Instance Snapshot',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Create Snapshot',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  descKey: 'action.desc.create_snapshot',
  get description() {
    return t(this.descKey);
  },
  type: 'modal',
  allowed: (item) => ['active', 'shutoff', 'suspended'].includes(item?.status?.toLowerCase()) && !item?.locked,
  getFormItems: async (item) => [
    {
      name: 'instance',
      label: t('Instance'),
      type: 'label',
    },
    {
      name: 'snapshotName',
      label: t('Snapshot Name'),
      type: 'input',
      required: true,
      placeholder: `${item?.name || 'instance'}-snapshot`,
    },
  ],
  getDefaultValues: (item) => ({
    instance: item?.name || item?.id,
    snapshotName: `${item?.name || 'instance'}-snapshot`,
  }),
  onSubmit: (values, item) => novaApi.createSnapshot(item.id, values.snapshotName),
};

// 5. Configuration Update
export const ResizeAction = {
  id: 'resize',
  titleKey: 'Resize Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Resize',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  descKey: 'action.desc.resize',
  get description() {
    return t(this.descKey);
  },
  isDanger: true,
  type: 'modal',
  allowed: (item) => ['active', 'shutoff'].includes(item?.status?.toLowerCase()) && !item?.locked,
  getFormItems: async () => {
    let flavorOptions = [];
    try {
      const res = await novaApi.listFlavors();
      const flvs = res?.flavors || res?.data?.flavors || [];
      flavorOptions = flvs.map((flv) => ({
        label: `${flv.name} (${flv.vcpus} vCPU / ${flv.ram >= 1024 ? flv.ram / 1024 : flv.ram} GiB RAM / ${flv.disk} GiB Disk)`,
        value: flv.id,
      }));
    } catch {
      // fallback
    }

    return [
      {
        name: 'instance',
        label: t('Instance'),
        type: 'label',
      },
      {
        name: 'currentFlavor',
        label: t('Current Flavor'),
        type: 'label',
      },
      {
        name: 'flavorRef',
        label: t('New Flavor'),
        type: 'select',
        options: flavorOptions,
        required: true,
        placeholder: t('Select new flavor...'),
      },
    ];
  },
  getDefaultValues: (item) => ({
    instance: item?.name || item?.id,
    currentFlavor: item?.flavor || '-',
  }),
  onSubmit: (values, item) => novaApi.resizeServer(item.id, values.flavorRef),
};

export const ConfirmResizeAction = {
  id: 'confirm-resize',
  titleKey: 'Confirm Resize',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Confirm Resize',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'confirm resize',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.confirm_resize',
  get description() {
    return t(this.descKey);
  },
  type: 'confirm',
  allowed: (item) => item?.status?.toUpperCase() === 'VERIFY_RESIZE',
  onSubmit: (item) => novaApi.confirmResizeServer(item.id),
};

export const RevertResizeAction = {
  id: 'revert-resize',
  titleKey: 'Revert Resize',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Revert Resize',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'revert resize',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.revert_resize',
  get description() {
    return t(this.descKey);
  },
  isDanger: true,
  type: 'confirm',
  allowed: (item) => item?.status?.toUpperCase() === 'VERIFY_RESIZE',
  onSubmit: (item) => novaApi.revertResizeServer(item.id),
};

export const ChangePasswordAction = {
  id: 'change-password',
  titleKey: 'Change Password',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Change Password',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  descKey: 'action.desc.change_password',
  get description() {
    return t(this.descKey);
  },
  type: 'modal',
  allowed: (item) => item?.status?.toLowerCase() === 'active' && !item?.locked,
  getFormItems: async () => [
    {
      name: 'instance',
      label: t('Instance'),
      type: 'label',
    },
    {
      name: 'password',
      label: t('New Password'),
      type: 'password',
      required: true,
      placeholder: t('Enter new admin password...'),
    },
  ],
  getDefaultValues: (item) => ({
    instance: item?.name || item?.id,
  }),
  onSubmit: (values, item) => novaApi.changePasswordServer(item.id, values.password),
};

// 6. Tags & Metadata
export const ModifyTagsAction = {
  id: 'modify-tags',
  titleKey: 'Modify Tags',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Modify Tags',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  descKey: 'action.desc.modify_tags',
  get description() {
    return t(this.descKey);
  },
  type: 'modal',
  allowed: (item) => ['active', 'paused', 'suspended', 'shutoff'].includes(item?.status?.toLowerCase()),
  getFormItems: async () => [
    {
      name: 'instance',
      label: t('Instance'),
      type: 'label',
    },
    {
      name: 'tags',
      label: t('Tags (comma-separated)'),
      type: 'input',
      placeholder: 'web, production, region-a',
    },
  ],
  getDefaultValues: (item) => ({
    instance: item?.name || item?.id,
    tags: Array.isArray(item?.tags) ? item.tags.join(', ') : '',
  }),
  onSubmit: (values, item) => {
    const tagArray = values.tags
      ? values.tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    return novaApi.setServerTags(item.id, tagArray);
  },
};

export const RebuildAction = {
  id: 'rebuild',
  titleKey: 'Rebuild Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Rebuild',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'rebuild instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.rebuild',
  get description() {
    return t(this.descKey);
  },
  isDanger: true,
  type: 'modal',
  allowed: (item) => ['active', 'shutoff', 'error'].includes(item?.status?.toLowerCase()) && !item?.locked,
  getFormItems: async (item) => {
    let imageOptions = [];
    let keypairOptions = [];
    try {
      const [imgRes, keyRes] = await Promise.allSettled([
        glanceApi.listImages(),
        novaApi.listKeypairs(),
      ]);
      if (imgRes.status === 'fulfilled' && imgRes.value?.images) {
        imageOptions = imgRes.value.images.map((img) => ({
          label: `${img.name || img.id} (${img.disk_format?.toUpperCase() || 'RAW'})`,
          value: img.id,
        }));
      }
      if (keyRes.status === 'fulfilled' && keyRes.value?.keypairs) {
        keypairOptions = keyRes.value.keypairs.map((k) => ({
          label: k.keypair?.name || k.name,
          value: k.keypair?.name || k.name,
        }));
      }
    } catch {}

    return [
      {
        name: 'instance',
        label: t('Instance'),
        type: 'label',
      },
      {
        name: 'imageRef',
        label: t('Images'),
        type: 'select',
        options: imageOptions,
        required: true,
        placeholder: t('Select image to rebuild...'),
      },
      {
        name: 'adminPass',
        label: t('New Admin Password (Optional)'),
        type: 'password',
        placeholder: t('Leave blank to keep existing or use keypair'),
      },
      {
        name: 'key_name',
        label: t('Keypair (Optional)'),
        type: 'select',
        options: [{ label: t('No keypair / Keep current'), value: '' }, ...keypairOptions],
        placeholder: t('Select SSH keypair...'),
      },
    ];
  },
  getDefaultValues: (item) => ({
    instance: item?.name || item?.id,
    key_name: item?.key_name || item?.keyName || '',
  }),
  onSubmit: (values, item) => {
    const payload = {
      imageRef: values.imageRef,
    };
    if (values.adminPass) payload.adminPass = values.adminPass;
    if (values.key_name) payload.key_name = values.key_name;
    return novaApi.rebuildServer(item.id, payload);
  },
};

export const EditInstanceAction = {
  id: 'edit-instance',
  titleKey: 'Edit Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Edit',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  descKey: 'action.desc.edit_instance',
  get description() {
    return t(this.descKey);
  },
  type: 'modal',
  allowed: (item) => Boolean(item?.id && !item?.locked),
  getFormItems: async () => [
    {
      name: 'name',
      label: t('Instance Name'),
      type: 'input',
      required: true,
      placeholder: t('Enter instance name...'),
    },
    {
      name: 'description',
      label: t('Description'),
      type: 'input',
      placeholder: t('Enter description (optional)...'),
    },
  ],
  getDefaultValues: (item) => ({
    name: item?.name || '',
    description: item?.description || item?.raw?.description || '',
  }),
  onSubmit: (values, item) =>
    novaApi.updateServer(item.id, {
      name: values.name,
      description: values.description || undefined,
    }),
};

// 7. Migration (Admin Only)
export const MigrateAction = {
  id: 'migrate',
  titleKey: 'Cold Migrate',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Cold Migrate',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'cold migrate instance to another host',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.migrate',
  get description() {
    return t(this.descKey);
  },
  adminOnly: true,
  type: 'confirm',
  allowed: () => true,
  onSubmit: (item) => novaApi.migrateServer(item.id),
};

export const LiveMigrateAction = {
  id: 'live-migrate',
  titleKey: 'Live Migrate',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Live Migrate',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'live migrate instance without downtime',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.live_migrate',
  get description() {
    return t(this.descKey);
  },
  adminOnly: true,
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'active',
  onSubmit: (item) => novaApi.liveMigrateServer(item.id),
};

// 8. Delete Action
export const DeleteAction = {
  id: 'delete',
  titleKey: 'Delete Instance',
  get title() {
    return t(this.titleKey);
  },
  buttonTextKey: 'Delete',
  get buttonText() {
    return t(this.buttonTextKey);
  },
  actionNameKey: 'delete instance',
  get actionName() {
    return t(this.actionNameKey);
  },
  descKey: 'action.desc.delete',
  get description() {
    return t(this.descKey);
  },
  isDanger: true,
  type: 'confirm',
  allowed: (item) => !item?.locked,
  onSubmit: (item) => novaApi.deleteServer(item.id),
};

// Grouped Action Collections
export const statusActions = [
  StartAction,
  StopAction,
  LockAction,
  UnlockAction,
  RebootAction,
  SoftRebootAction,
  SuspendAction,
  ResumeAction,
  PauseAction,
  UnpauseAction,
  ShelveAction,
  UnshelveAction,
  RescueAction,
  UnrescueAction,
  ResetStateAction,
];

export const resourceActions = [
  AttachInterfaceAction,
  DetachInterfaceAction,
  AttachVolumeAction,
  DetachVolumeAction,
];

export const configActions = [
  EditInstanceAction,
  ConfirmResizeAction,
  RevertResizeAction,
  ResizeAction,
  RebuildAction,
  ChangePasswordAction,
  ModifyTagsAction,
];

export const backupActions = [CreateSnapshotAction];

export const adminActions = [MigrateAction, LiveMigrateAction];

export const batchActions = [
  StartAction,
  StopAction,
  RebootAction,
  SoftRebootAction,
  DeleteAction,
];

export const rowActions = {
  firstAction: ConsoleAction,
  get moreActions() {
    return [
      {
        title: t('Instance Status'),
        actions: statusActions,
      },
      {
        title: t('Related Resources'),
        actions: resourceActions,
      },
      {
        title: t('Backups & Snapshots'),
        actions: backupActions,
      },
      {
        title: t('Configuration Update'),
        actions: configActions,
      },
      {
        title: t('Administration'),
        actions: adminActions,
      },
      {
        action: DeleteAction,
      },
    ];
  },
};

export default {
  ConsoleAction,
  rowActions,
  batchActions,
  statusActions,
  resourceActions,
  configActions,
  backupActions,
  adminActions,
};
