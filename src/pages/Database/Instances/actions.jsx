import { troveApi } from '@/api/trove';
import { deleteAction } from '@/components/ResourcePage';
import { t } from '@/core/i18n';
import { checkStatus, fetchTroveQuota } from '../shared';
import { createBackupAction } from '../Backups/BackupList';

/** legacy Instances/actions/StepCreate (page) */
export const createInstanceAction = (navigate) => ({
  id: 'create-database-instance',
  type: 'custom',
  policy: 'instance:create',
  title: t('Create Database Instance'),
  onExecute: () => navigate('/database/instances/create'),
});

/** legacy Instances/actions/Delete */
export const deleteInstanceAction = () => ({
  ...deleteAction({
    name: t('database instances'),
    title: t('Delete'),
    onDelete: (it) => troveApi.deleteInstance(it.id),
  }),
  policy: 'instance:delete',
});

/** legacy Instances/actions/Edit */
export const editInstanceAction = () => ({
  id: 'edit-instance',
  type: 'modal',
  policy: 'instance:update',
  title: t('Edit'),
  buttonText: t('Edit'),
  getDefaultValues: (item) => ({ name: item.name }),
  formItems: [{ name: 'name', label: t('Name'), type: 'input', required: true, placeholder: t('Please input name') }],
  onSubmit: ({ name }, item) => troveApi.patchInstance(item.id, { instance: { name } }),
});

/** legacy Instances/actions/Restart */
export const restartAction = () => ({
  id: 'restart',
  type: 'confirm',
  policy: 'instance:restart',
  title: t('Restart Database Service'),
  actionName: t('Restart Database Service'),
  isDanger: true,
  allowed: (item) => checkStatus(['active', 'shutoff', 'shutdown'], item),
  onSubmit: async (target) => {
    for (const it of [].concat(target)) {
      // eslint-disable-next-line no-await-in-loop
      await troveApi.instanceAction(it.id, { restart: {} });
    }
  },
});

/** legacy Instances/actions/Stop (admin action endpoint) */
export const stopAction = () => ({
  id: 'stop',
  type: 'confirm',
  policy: 'instance:stop',
  title: t('Stop Database Service'),
  buttonText: t('Stop'),
  actionName: t('Stop Database Service'),
  isDanger: true,
  allowed: (item) => checkStatus(['active'], item),
  onSubmit: async (target) => {
    for (const it of [].concat(target)) {
      // eslint-disable-next-line no-await-in-loop
      await troveApi.adminInstanceAction(it.id, { stop: {} });
    }
  },
});

/** legacy Instances/actions/Reboot */
export const rebootAction = () => ({
  id: 'reboot',
  type: 'confirm',
  policy: 'instance:reboot',
  title: t('Reboot Database Instance'),
  actionName: t('Reboot Database Instance'),
  isDanger: true,
  allowed: (item) => checkStatus(['active', 'shutoff', 'shutdown'], item),
  onSubmit: async (target) => {
    for (const it of [].concat(target)) {
      // eslint-disable-next-line no-await-in-loop
      await troveApi.instanceAction(it.id, { reboot: {} });
    }
  },
});

/** legacy Instances/actions/ResizeVolume (quota aware) */
export const resizeVolumeAction = () => ({
  id: 'resize-volume',
  type: 'modal',
  policy: ['trove:instance:resize_volume', 'trove:admin'],
  title: t('Resize Volume'),
  width: 720,
  allowed: (item) => checkStatus(['active', 'shutoff'], item),
  getDefaultValues: (item) => {
    const current = item?.volume?.size ?? item?.size ?? 0;
    return { instance: item.name || item.id, oldSize: current, size: (item?.volume?.size || 1) + 1 };
  },
  getFormItems: async (item) => {
    let volumes = {};
    try {
      volumes = (await fetchTroveQuota())?.volumes || {};
    } catch {
      volumes = {};
    }
    const current = item?.volume?.size ?? item?.size ?? 0;
    const minSize = (item?.volume?.size || 1) + 1;
    const limited = volumes.limit !== undefined && volumes.limit !== -1;
    const maxSize = (volumes.left || 0) + current;
    if (limited && !(maxSize > current)) {
      return [{ type: 'alert', name: 'quota', alertType: 'warning', message: t('Quota is not enough for extend volume.') }];
    }
    return [
      { name: 'instance', label: t('Database Instance'), type: 'label' },
      { name: 'oldSize', label: t('Current Disk (GiB)'), type: 'label' },
      limited
        ? {
            name: 'size',
            label: t('Database Disk (GiB)'),
            type: 'number',
            min: minSize,
            max: maxSize,
            required: true,
            tip: `${minSize}GiB-${maxSize}GiB · ${t('Quota')}: ${t('Used')} ${volumes.used ?? 0} / ${volumes.limit}`,
          }
        : { name: 'size', label: t('Database Disk (GiB)'), type: 'number', min: minSize, required: true },
    ];
  },
  onSubmit: ({ size }, item) => {
    if (!size) return Promise.reject(new Error(t('Quota is not enough for extend volume.')));
    return troveApi.instanceAction(item.id, { resize: { volume: { size } } });
  },
});

/** Extension: attach a configuration group (trove PUT /instances/{id}) */
export const attachConfigurationAction = () => ({
  id: 'attach-configuration',
  type: 'modal',
  title: t('Attach Configuration Group'),
  allowed: (item) => !item.configuration && checkStatus(['active'], item),
  getDefaultValues: (item) => ({ instance: item.name || item.id }),
  getFormItems: async (item) => {
    const res = await troveApi.listConfigurations().catch(() => ({}));
    const type = item?.datastore?.type;
    const version = item?.datastore?.version;
    const options = (res?.configurations || [])
      .filter((c) => (!type || !c.datastore_name || c.datastore_name === type) && (!version || !c.datastore_version_name || c.datastore_version_name === version))
      .map((c) => ({ value: c.id, label: c.name || c.id }));
    return [
      { name: 'instance', label: t('Database Instance'), type: 'label' },
      { name: 'configuration', label: t('Configuration Group'), type: 'select', required: true, options },
    ];
  },
  onSubmit: ({ configuration }, item) => troveApi.updateInstance(item.id, { instance: { configuration } }),
});

/** Extension: detach the configuration group */
export const detachConfigurationAction = () => ({
  id: 'detach-configuration',
  type: 'confirm',
  title: t('Detach Configuration Group'),
  actionName: t('Detach Configuration Group'),
  isDanger: true,
  allowed: (item) => Boolean(item.configuration) && checkStatus(['active', 'restart_required'], item),
  onSubmit: async (target) => {
    for (const it of [].concat(target)) {
      // eslint-disable-next-line no-await-in-loop
      await troveApi.updateInstance(it.id, { instance: {} });
    }
  },
});

/** Extension: create a database backup of this instance */
export const instanceBackupAction = () => ({
  ...createBackupAction(),
  id: 'create-instance-backup',
  allowed: (item) => checkStatus(['active'], item),
  getDefaultValues: (item) => ({ instance: item?.id }),
});

/** legacy actions/index.jsx (actionConfigs / actionConfigsAdmin) */
export const instanceRowActions = (isAdmin) =>
  isAdmin
    ? { firstAction: deleteInstanceAction(), moreActions: [] }
    : {
        firstAction: deleteInstanceAction(),
        moreActions: [
          { action: editInstanceAction() },
          { title: t('Database Instance Status'), actions: [restartAction(), stopAction(), rebootAction()] },
          {
            title: t('Configuration Update'),
            actions: [resizeVolumeAction(), attachConfigurationAction(), detachConfigurationAction()],
          },
          { action: instanceBackupAction() },
        ],
      };
