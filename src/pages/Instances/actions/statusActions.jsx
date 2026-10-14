/**
 * Console + "Instance Status" group (legacy Console, Start, Stop, Lock, Unlock, Reboot,
 * SoftReboot, Suspend, Resume, Pause, Unpause, Shelve, Unshelve, Rescue, Unrescue, Reset).
 */
import React from 'react';
import { message } from 'antd';
import { t } from '@/core/i18n';
import { glanceApi } from '@/api/glance';
import { instancePasswordRule } from '@/pages/Instances/Create/utils';
import {
  checkStatus,
  isActiveOrRescue,
  isIronicInstance,
  isLocked,
  isNotLocked,
  isNotLockedOrAdmin,
  instanceDetailPath,
} from '../resources';
import {
  define,
  forEach,
  serverAction,
  toList,
  instanceLabel,
  tipsAlert,
  getRemoteConsoleUrl,
  consoleErrorMessage,
} from './common';

export function buildStatusActions(isAdminPage = false) {
  const notLockedOrAdmin = (item) => isNotLockedOrAdmin(item, isAdminPage);
  const confirmAction = (cfg) =>
    define({
      type: 'confirm',
      ...cfg,
      onSubmit: cfg.onSubmit || ((target) => forEach(target, (it) => serverAction(it.id, cfg.body))),
    });

  const Console = define({
    id: 'console',
    type: 'confirm',
    titleKey: 'Jump to Console',
    buttonTextKey: 'Console',
    actionNameKey: 'jump to the console',
    descKey: 'action.desc.console',
    policy: 'os_compute_api:os-remote-consoles',
    allowed: (item) => isActiveOrRescue(item) && !isIronicInstance(item),
    confirmText: () => t('Are you sure to jump directly to the console? The console will open in a new page later.'),
    onSubmit: async (target) => {
      const item = toList(target)[0];
      // open the window synchronously (inside the click) so it is not blocked as a popup
      const win = window.open('', '_blank');
      try {
        const { url } = await getRemoteConsoleUrl(item);
        if (win) win.location.href = url;
        else window.open(url, '_blank');
      } catch (err) {
        const msg = consoleErrorMessage(err);
        message.error(`${t('You are not allowed to jump to the console.')}${msg ? ` ${msg}` : ''}`);
        // fallback: the Console tab of the instance detail page
        const fallback = `${instanceDetailPath(item.id, isAdminPage)}?tab=console`;
        if (win) win.location.href = fallback;
      }
    },
  });
  // the row button shows the legacy buttonText ("Console"); the confirm dialog keeps the title
  delete Console.titleKey;

  const Start = confirmAction({
    id: 'start',
    titleKey: 'Start Instance',
    buttonTextKey: 'Start',
    actionNameKey: 'start instance',
    descKey: 'action.desc.start',
    policy: 'os_compute_api:servers:start',
    allowed: (item) => checkStatus(['shutdown', 'shutoff', 'crashed'], item) && notLockedOrAdmin(item),
    body: { 'os-start': null },
  });

  const Stop = confirmAction({
    id: 'stop',
    titleKey: 'Stop Instance',
    buttonTextKey: 'Stop',
    actionNameKey: 'stop instance',
    descKey: 'action.desc.stop',
    isDanger: true,
    policy: 'os_compute_api:servers:stop',
    allowed: (item) => notLockedOrAdmin(item) && checkStatus(['active'], item),
    body: { 'os-stop': null },
  });

  const Lock = confirmAction({
    id: 'lock',
    titleKey: 'Lock Instance',
    buttonTextKey: 'Lock',
    actionNameKey: 'lock instance',
    descKey: 'action.desc.lock',
    policy: 'os_compute_api:os-lock-server:lock',
    allowed: (item) => !isAdminPage && isNotLocked(item),
    confirmText: (items) =>
      `${t('Are you sure to {action} (instance: {name})?', {
        action: t('lock instance'),
        name: items.map((it) => it.name || it.id).join(', '),
      })} ${t(
        'Lock instance will lock the operations that have a direct impact on the operation of the instance, such as: shutdown, restart, delete, the mounting and unmounting of volume, etc. It does not involve the capacity expansion and change type of volume.'
      )}`,
    body: { lock: null },
  });

  const Unlock = confirmAction({
    id: 'unlock',
    titleKey: 'Unlock Instance',
    buttonTextKey: 'Unlock',
    actionNameKey: 'unlock instance',
    descKey: 'action.desc.unlock',
    policy: 'os_compute_api:os-lock-server:unlock',
    allowed: (item) => !isAdminPage && isLocked(item),
    body: { unlock: null },
  });

  const Reboot = confirmAction({
    id: 'reboot',
    titleKey: 'Hard Reboot Instance',
    buttonTextKey: 'Hard Reboot',
    actionNameKey: 'hard reboot instance',
    descKey: 'action.desc.hard_reboot',
    isDanger: true,
    policy: 'os_compute_api:servers:reboot',
    allowed: (item) => notLockedOrAdmin(item) && checkStatus(['active', 'shutoff'], item),
    body: { reboot: { type: 'HARD' } },
  });

  const SoftReboot = confirmAction({
    id: 'soft-reboot',
    titleKey: 'Soft Reboot Instance',
    buttonTextKey: 'Soft Reboot',
    actionNameKey: 'soft reboot instance',
    descKey: 'action.desc.soft_reboot',
    policy: 'os_compute_api:servers:reboot',
    allowed: (item) => notLockedOrAdmin(item) && checkStatus(['active'], item) && !isIronicInstance(item),
    body: { reboot: { type: 'SOFT' } },
  });

  const Suspend = confirmAction({
    id: 'suspend',
    titleKey: 'Suspend Instance',
    buttonTextKey: 'Suspend',
    actionNameKey: 'suspend instance',
    descKey: 'action.desc.suspend',
    policy: 'os_compute_api:os-suspend-server:suspend',
    allowed: (item) => notLockedOrAdmin(item) && checkStatus(['active'], item) && !isIronicInstance(item),
    body: { suspend: null },
  });

  const Resume = confirmAction({
    id: 'resume',
    titleKey: 'Resume Instance',
    buttonTextKey: 'Resume',
    actionNameKey: 'resume instance',
    descKey: 'action.desc.resume',
    policy: 'os_compute_api:os-suspend-server:resume',
    allowed: (item) => notLockedOrAdmin(item) && checkStatus(['suspended'], item),
    body: { resume: null },
  });

  const Pause = confirmAction({
    id: 'pause',
    titleKey: 'Pause Instance',
    buttonTextKey: 'Pause',
    actionNameKey: 'pause instance',
    descKey: 'action.desc.pause',
    policy: 'os_compute_api:os-pause-server:pause',
    allowed: (item) => isNotLocked(item) && checkStatus(['active'], item) && !isAdminPage && !isIronicInstance(item),
    body: { pause: null },
  });

  const Unpause = confirmAction({
    id: 'unpause',
    titleKey: 'Unpause Instance',
    buttonTextKey: 'Unpause',
    actionNameKey: 'unpause instance',
    descKey: 'action.desc.unpause',
    policy: 'os_compute_api:os-pause-server:unpause',
    allowed: (item) => notLockedOrAdmin(item) && checkStatus(['paused'], item),
    body: { unpause: null },
  });

  const Shelve = confirmAction({
    id: 'shelve',
    titleKey: 'Shelve Instance',
    buttonTextKey: 'Shelve',
    actionNameKey: 'shelve instance',
    descKey: 'action.desc.shelve',
    policy: 'os_compute_api:os-shelve:shelve',
    allowed: (item) =>
      notLockedOrAdmin(item) && checkStatus(['active', 'shutoff', 'paused', 'suspended'], item) && !isIronicInstance(item),
    confirmText: (items) => (
      <div>
        <p>{t('Are you sure to shelve instance { name }? ', { name: items.map((it) => it.name || it.id).join(', ') })}</p>
        <p>
          {t(
            'After shelving, the instance will be shut down, resources will be released, and the snapshot will be saved to Glance. This will take about a few minutes, please be patient. You also can choose to unshelve to restore the instance.'
          )}
        </p>
      </div>
    ),
    body: { shelve: null },
  });

  const Unshelve = confirmAction({
    id: 'unshelve',
    titleKey: 'Unshelve Instance',
    buttonTextKey: 'Unshelve',
    actionNameKey: 'unshelve instance',
    descKey: 'action.desc.unshelve',
    policy: 'os_compute_api:os-shelve:unshelve',
    allowed: (item) => notLockedOrAdmin(item) && checkStatus(['shelved', 'shelved_offloaded'], item),
    body: { unshelve: null },
  });

  const Rescue = define({
    id: 'rescue',
    type: 'modal',
    titleKey: 'Rescue Instance',
    buttonTextKey: 'Rescue',
    descKey: 'action.desc.rescue',
    isDanger: true,
    width: 720,
    policy: 'os_compute_api:os-rescue',
    allowed: (item) => !checkStatus(['rescue'], item) && notLockedOrAdmin(item) && !isIronicInstance(item),
    getFormItems: async () => {
      let images = [];
      try {
        images = (await glanceApi.listAllImages({}))?.images || [];
      } catch {
        images = [];
      }
      return [
        tipsAlert(
          t(
            'The rescue mode is only for emergency purpose, for example in case of a system or access failure. This will shut down your instance and mount the root disk to a temporary server. Then, you will be able to connect to this server, repair the system configuration or recover your data.You may optionally select an image and set a password on the rescue instance server.'
          )
        ),
        instanceLabel(),
        {
          name: 'rescue_image_ref',
          label: t('Select Image'),
          type: 'select',
          options: images.map((img) => ({ label: img.name || img.id, value: img.id })),
          placeholder: t('Default (Use instance base image)'),
        },
        { name: 'adminPass', label: t('Password'), type: 'password', rules: [instancePasswordRule('password')] },
      ];
    },
    getDefaultValues: (item) => ({ instance: item?.name || item?.id }),
    // legacy: { rescue: { adminPass, rescue_image_ref } } - unset keys are dropped by JSON
    onSubmit: (values, item) =>
      serverAction(item.id, {
        rescue: { adminPass: values.adminPass || undefined, rescue_image_ref: values.rescue_image_ref || undefined },
      }),
  });

  const Unrescue = confirmAction({
    id: 'unrescue',
    titleKey: 'Unrescue',
    buttonTextKey: 'Unrescue',
    actionNameKey: 'unrescue instance',
    descKey: 'action.desc.unrescue',
    allowed: (item) => notLockedOrAdmin(item) && checkStatus(['rescue'], item),
    body: { unrescue: null },
  });

  // nova os-resetState only accepts "active" / "error" (legacy resetStateOptions)
  const resetStateOptions = () => ({ active: t('Active'), error: t('Error') });
  const currentState = (item) => String(item?.vm_state || item?.status || '').toLowerCase();
  const ResetState = define({
    id: 'reset-state',
    type: 'modal',
    titleKey: 'Reset State',
    buttonTextKey: 'Reset State',
    descKey: 'action.desc.reset_state',
    isDanger: true,
    adminOnly: true,
    policy: 'os_compute_api:os-admin-actions:reset_state',
    allowed: (item) => !item?.locked,
    getFormItems: (item) => {
      const cur = currentState(item);
      return [
        tipsAlert(
          t(
            'Resetting the server state can make it much harder to recover a server from an error state. If the server is in error status due to a failed move operation then this is likely not the correct approach to fix the problem. Do you wish to continue?'
          ),
          'warning'
        ),
        instanceLabel(),
        { name: 'currentState', label: t('Current State'), type: 'label' },
        {
          name: 'state',
          label: t('New State'),
          type: 'select',
          required: true,
          options: Object.entries(resetStateOptions())
            .filter(([value]) => value !== cur)
            .map(([value, label]) => ({ value, label })),
        },
      ];
    },
    getDefaultValues: (item) => {
      const cur = currentState(item);
      const available = Object.keys(resetStateOptions()).filter((it) => it !== cur);
      return { instance: item?.name || item?.id, currentState: resetStateOptions()[cur] || cur || '-', state: available[0] };
    },
    onSubmit: (values, item) => serverAction(item.id, { 'os-resetState': { state: values.state } }),
  });

  return {
    Console,
    Start,
    Stop,
    Lock,
    Unlock,
    Reboot,
    SoftReboot,
    Suspend,
    Resume,
    Pause,
    Unpause,
    Shelve,
    Unshelve,
    Rescue,
    Unrescue,
    ResetState,
  };
}
