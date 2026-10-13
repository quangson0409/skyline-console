import React from 'react';
import { t } from '@/core/i18n';
import { novaApi } from '@/api/nova';
import { cinderApi } from '@/api/cinder';
import { neutronApi } from '@/api/neutron';

/**
 * OpenStack Skyline Instance Actions Configuration
 * 100% faithful to legacy Skyline RBAC policies, status constraints, and action categories.
 */

// 1. Console Action (First Action)
export const ConsoleAction = {
  id: 'console',
  title: t('Console'),
  buttonText: t('Console'),
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
  title: t('Start Instance'),
  buttonText: t('Start'),
  actionName: t('start instance'),
  type: 'confirm',
  allowed: (item) => ['shutoff', 'stopped', 'crashed'].includes(item?.status?.toLowerCase()),
  onSubmit: (item) => novaApi.startServer(item.id),
};

export const StopAction = {
  id: 'stop',
  title: t('Stop Instance'),
  buttonText: t('Stop'),
  actionName: t('stop instance'),
  isDanger: true,
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'active' && !item?.locked,
  onSubmit: (item) => novaApi.stopServer(item.id),
};

export const LockAction = {
  id: 'lock',
  title: t('Lock Instance'),
  buttonText: t('Lock'),
  actionName: t('lock instance'),
  type: 'confirm',
  allowed: (item) => !item?.locked,
  onSubmit: (item) => novaApi.lockServer(item.id),
};

export const UnlockAction = {
  id: 'unlock',
  title: t('Unlock Instance'),
  buttonText: t('Unlock'),
  actionName: t('unlock instance'),
  type: 'confirm',
  allowed: (item) => Boolean(item?.locked),
  onSubmit: (item) => novaApi.unlockServer(item.id),
};

export const RebootAction = {
  id: 'reboot',
  title: t('Hard Reboot Instance'),
  buttonText: t('Hard Reboot'),
  actionName: t('hard reboot instance'),
  isDanger: true,
  type: 'confirm',
  allowed: (item) => !item?.locked,
  onSubmit: (item) => novaApi.rebootServer(item.id, 'HARD'),
};

export const SoftRebootAction = {
  id: 'soft-reboot',
  title: t('Soft Reboot Instance'),
  buttonText: t('Soft Reboot'),
  actionName: t('soft reboot instance'),
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'active' && !item?.locked,
  onSubmit: (item) => novaApi.rebootServer(item.id, 'SOFT'),
};

export const SuspendAction = {
  id: 'suspend',
  title: t('Suspend Instance'),
  buttonText: t('Suspend'),
  actionName: t('suspend instance'),
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'active' && !item?.locked,
  onSubmit: (item) => novaApi.suspendServer(item.id),
};

export const ResumeAction = {
  id: 'resume',
  title: t('Resume Instance'),
  buttonText: t('Resume'),
  actionName: t('resume instance'),
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'suspended' && !item?.locked,
  onSubmit: (item) => novaApi.resumeServer(item.id),
};

export const PauseAction = {
  id: 'pause',
  title: t('Pause Instance'),
  buttonText: t('Pause'),
  actionName: t('pause instance'),
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'active' && !item?.locked,
  onSubmit: (item) => novaApi.pauseServer(item.id),
};

export const UnpauseAction = {
  id: 'unpause',
  title: t('Unpause Instance'),
  buttonText: t('Unpause'),
  actionName: t('unpause instance'),
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'paused' && !item?.locked,
  onSubmit: (item) => novaApi.unpauseServer(item.id),
};

export const ShelveAction = {
  id: 'shelve',
  title: t('Shelve Instance'),
  buttonText: t('Shelve'),
  actionName: t('shelve instance'),
  type: 'confirm',
  allowed: (item) => ['active', 'shutoff', 'paused', 'suspended'].includes(item?.status?.toLowerCase()) && !item?.locked,
  onSubmit: (item) => novaApi.shelveServer(item.id),
};

export const UnshelveAction = {
  id: 'unshelve',
  title: t('Unshelve Instance'),
  buttonText: t('Unshelve'),
  actionName: t('unshelve instance'),
  type: 'confirm',
  allowed: (item) => ['shelved', 'shelved_offloaded'].includes(item?.status?.toLowerCase()),
  onSubmit: (item) => novaApi.unshelveServer(item.id),
};

export const ResetStateAction = {
  id: 'reset-state',
  title: t('Reset State'),
  buttonText: t('Reset State'),
  actionName: t('reset state to active'),
  adminOnly: true,
  type: 'confirm',
  allowed: () => true,
  onSubmit: (item) => novaApi.resetServerState(item.id, 'active'),
};

// 3. Resource Actions (Modal Forms)
export const AttachVolumeAction = {
  id: 'attach-volume',
  title: t('Attach Volume'),
  buttonText: t('Attach Volume'),
  type: 'modal',
  allowed: (item) => ['active', 'shutoff'].includes(item?.status?.toLowerCase()) && !item?.locked,
  getFormItems: async (item) => {
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
  title: t('Detach Volume'),
  buttonText: t('Detach Volume'),
  isDanger: true,
  type: 'modal',
  allowed: (item) => Boolean(item?.volumesAttached && item.volumesAttached.length > 0) && !item?.locked,
  getFormItems: async (item) => {
    const attached = item?.volumesAttached || [];
    const options = attached.map((v) => ({
      label: v.id,
      value: v.id,
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

export const AttachInterfaceAction = {
  id: 'attach-interface',
  title: t('Attach Interface'),
  buttonText: t('Attach Interface'),
  type: 'modal',
  allowed: (item) => ['active', 'shutoff'].includes(item?.status?.toLowerCase()) && !item?.locked,
  getFormItems: async (item) => {
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
  title: t('Create Instance Snapshot'),
  buttonText: t('Create Snapshot'),
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
  title: t('Resize Instance'),
  buttonText: t('Resize'),
  isDanger: true,
  type: 'modal',
  allowed: (item) => ['active', 'shutoff'].includes(item?.status?.toLowerCase()) && !item?.locked,
  getFormItems: async (item) => {
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
  title: t('Confirm Resize'),
  buttonText: t('Confirm Resize'),
  actionName: t('confirm resize'),
  type: 'confirm',
  allowed: (item) => item?.status?.toUpperCase() === 'VERIFY_RESIZE',
  onSubmit: (item) => novaApi.confirmResizeServer(item.id),
};

export const RevertResizeAction = {
  id: 'revert-resize',
  title: t('Revert Resize'),
  buttonText: t('Revert Resize'),
  actionName: t('revert resize'),
  isDanger: true,
  type: 'confirm',
  allowed: (item) => item?.status?.toUpperCase() === 'VERIFY_RESIZE',
  onSubmit: (item) => novaApi.revertResizeServer(item.id),
};

export const ChangePasswordAction = {
  id: 'change-password',
  title: t('Change Password'),
  buttonText: t('Change Password'),
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
  title: t('Modify Tags'),
  buttonText: t('Modify Tags'),
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

// 7. Migration (Admin Only)
export const MigrateAction = {
  id: 'migrate',
  title: t('Cold Migrate'),
  buttonText: t('Cold Migrate'),
  actionName: t('cold migrate instance to another host'),
  adminOnly: true,
  type: 'confirm',
  allowed: () => true,
  onSubmit: (item) => novaApi.migrateServer(item.id),
};

export const LiveMigrateAction = {
  id: 'live-migrate',
  title: t('Live Migrate'),
  buttonText: t('Live Migrate'),
  actionName: t('live migrate instance without downtime'),
  adminOnly: true,
  type: 'confirm',
  allowed: (item) => item?.status?.toLowerCase() === 'active',
  onSubmit: (item) => novaApi.liveMigrateServer(item.id),
};

// 8. Delete Action
export const DeleteAction = {
  id: 'delete',
  title: t('Delete Instance'),
  buttonText: t('Delete'),
  actionName: t('delete instance'),
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
  ResetStateAction,
];

export const resourceActions = [
  AttachInterfaceAction,
  AttachVolumeAction,
  DetachVolumeAction,
];

export const configActions = [
  ConfirmResizeAction,
  RevertResizeAction,
  ResizeAction,
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
  moreActions: [
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
  ],
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
