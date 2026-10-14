/**
 * CreateSnapshot, Configuration Update (ConfirmResize, RevertResize, Resize, ChangePassword, Rebuild),
 * Edit, Delete (SoftDelete), DeleteIronic, ModifyTags, Migrate, LiveMigrate.
 */
import React from 'react';
import { t } from '@/core/i18n';
import { novaApi } from '@/api/nova';
import { useAuthStore } from '@/store/authStore';
import FlavorSelectTable from '@/pages/Instances/Create/components/FlavorSelectTable';
import { instancePasswordRule, instanceNameValidator } from '@/pages/Instances/Create/utils';
import {
  checkStatus,
  isActive,
  isActiveOrShutOff,
  isBootFromVolume,
  isIronicInstance,
  isIsoInstance,
  isNotDeleting,
  isNotLocked,
  isNotLockedOrAdmin,
  isPaused,
  isStopped,
} from '../resources';
import {
  define,
  forEach,
  serverAction,
  instanceLabel,
  tipsAlert,
  deleteState,
  isShelvedOffloaded,
  DeleteConfirmContent,
  ForceShutdownCheck,
  fetchNovaQuota,
  fetchCinderQuotaSet,
  quotaLeft,
  loadServerVolumes,
} from './common';
import {
  selectTableRule,
  HostSelect,
  loadRebuildSources,
  ImageSelect,
  InstanceSnapshotSelect,
  TagsInput,
  VolumesPreview,
} from './fields';

const flavorLabel = (item) => {
  const f = item.flavor_info || {};
  const ram = typeof f.ram === 'number' ? `${Number((f.ram / 1024).toFixed(2))} GiB` : '-';
  return `${item.flavor} (${t('vCPU')}: ${f.vcpus ?? '-'}, ${t('Memory')}: ${ram})`;
};

export function buildConfigActions(isAdminPage = false) {
  const notLockedOrAdmin = (item) => isNotLockedOrAdmin(item, isAdminPage);

  const CreateSnapshot = define({
    id: 'create-snapshot',
    type: 'modal',
    titleKey: 'Create Instance Snapshot',
    buttonTextKey: 'Create Snapshot',
    descKey: 'action.desc.create_snapshot',
    width: 720,
    policy: 'os_compute_api:servers:create_image',
    allowed: (item) => checkStatus(['active', 'shutoff', 'suspended'], item) && !isIronicInstance(item),
    getFormItems: async (item) => {
      const bfv = isBootFromVolume(item);
      let quotaError = '';
      let volumes = [];
      if (bfv) {
        const [vols, quota] = await Promise.all([loadServerVolumes(item), fetchCinderQuotaSet()]);
        volumes = vols;
        // legacy getAdd / disableSubmit: snapshot quota, total and per volume type
        if (quota && volumes.length) {
          const left = quotaLeft(quota.snapshots);
          if (left !== -1 && left < volumes.length) quotaError = t('Volume Snapshot');
          const types = volumes.reduce((acc, v) => ({ ...acc, [v.volume_type]: (acc[v.volume_type] || 0) + 1 }), {});
          Object.entries(types).forEach(([type, count]) => {
            const typeLeft = quotaLeft(quota[`snapshots_${type}`]);
            if (!quotaError && typeLeft !== -1 && typeLeft < count) quotaError = t('{name} type snapshots', { name: type });
          });
        }
      }
      return [
        tipsAlert(
          t(
            'A snapshot is an image which preserves the disk state of a running instance and can be used to start a new instance. An instance that boots from a volume will create snapshots for each mounted volume.'
          )
        ),
        quotaError ? tipsAlert(`${t('Quota exceeded')}: ${quotaError}`, 'error') : null,
        instanceLabel(),
        {
          name: 'snapshot',
          label: t('Snapshot Name'),
          type: 'input',
          required: true,
          rules: quotaError ? [{ validator: () => Promise.reject(new Error(`${t('Quota exceeded')}: ${quotaError}`)) }] : [],
        },
        bfv ? { name: 'volumes', label: t('Volumes'), render: () => <VolumesPreview volumes={volumes} /> } : null,
      ].filter(Boolean);
    },
    getDefaultValues: (item) => ({ instance: item?.name || item?.id, snapshot: '' }),
    // legacy ServerStore.createImage
    onSubmit: (values, item) =>
      serverAction(item.id, {
        createImage: {
          name: values.snapshot,
          metadata: { usage_type: 'common', image_type: 'snapshot', instance_id: item.id },
        },
      }),
  });

  const ConfirmResize = define({
    id: 'confirm-resize',
    type: 'confirm',
    titleKey: 'Confirm Resize or Migrate',
    buttonTextKey: 'Confirm Resize or Migrate',
    actionNameKey: 'confirm resize or migrate',
    descKey: 'action.desc.confirm_resize',
    policy: 'os_compute_api:servers:resize',
    allowed: (item) => String(item?.status || '').toLowerCase() === 'verify_resize',
    onSubmit: (target) => forEach(target, (it) => serverAction(it.id, { confirmResize: null })),
  });

  const RevertResize = define({
    id: 'revert-resize',
    type: 'confirm',
    titleKey: 'Revert Resize or Migrate',
    buttonTextKey: 'Revert Resize or Migrate',
    actionNameKey: 'revert resize or migrate',
    descKey: 'action.desc.revert_resize',
    isDanger: true,
    policy: 'os_compute_api:servers:resize',
    allowed: (item) => String(item?.status || '').toLowerCase() === 'verify_resize',
    onSubmit: (target) => forEach(target, (it) => serverAction(it.id, { revertResize: null })),
  });

  const Resize = define({
    id: 'resize',
    type: 'modal',
    titleKey: 'Resize Instance',
    buttonTextKey: 'Resize',
    descKey: 'action.desc.resize',
    isDanger: true,
    width: 1100,
    policy: 'os_compute_api:servers:resize',
    allowed: (item) => checkStatus(['active', 'shutoff'], item, false) && notLockedOrAdmin(item) && !isIronicInstance(item),
    getFormItems: async (item) => {
      const [quota, flavorRes] = await Promise.all([fetchNovaQuota(), novaApi.listFlavorsV().catch(() => ({}))]);
      const current = item.flavor_info || {};
      // legacy FlavorSelectTable hides the current flavor
      const exclude = (flavorRes?.flavors || [])
        .filter((f) => f.name === (current.original_name || item.flavor) || (current.id && f.id === current.id))
        .map((f) => f.id);
      const coresLeft = quotaLeft(quota?.cores);
      const ramLeft = quotaLeft(quota?.ram);
      const limitText = (q, div = 1) =>
        q?.limit === -1 ? t('Unlimited') : Number(((q?.limit || 0) / div).toFixed(2));
      const quotaText = quota
        ? `${t('CPU')}: ${quota.cores?.in_use ?? 0} / ${limitText(quota.cores)} · ${t('Memory (GiB)')}: ${Number(
            ((quota.ram?.in_use || 0) / 1024).toFixed(2)
          )} / ${limitText(quota.ram, 1024)}`
        : null;
      return [
        tipsAlert(
          <div>
            <div style={{ fontWeight: 600 }}>{t('The current operation requires the instance to be shut down:')}</div>
            <div>
              {t('In order to avoid data loss, the instance will shut down and interrupt your business. Please confirm carefully.')}
            </div>
            <div>
              {t(
                'Forced shutdown may result in data loss or file system damage. You can also take the initiative to shut down and perform operations.'
              )}
            </div>
          </div>,
          'warning'
        ),
        quotaText ? tipsAlert(`${t('Quota')}: ${quotaText}`) : null,
        instanceLabel(),
        { name: 'flavor', label: t('Current Flavor'), type: 'label' },
        {
          name: 'newFlavor',
          label: t('Flavor'),
          rules: [
            selectTableRule(t('Flavor')),
            {
              // legacy checkFlavorDisable: the added vCPU / RAM must fit in the nova quota
              validator: (_, value) => {
                const flavor = value?.selectedRows?.[0];
                if (!flavor || !quota) return Promise.resolve();
                const vcpuAdd = (flavor.vcpus || 0) - (current.vcpus || 0);
                const ramAdd = (flavor.ram || 0) - (current.ram || 0);
                const ok = (coresLeft === -1 || coresLeft >= vcpuAdd) && (ramLeft === -1 || ramLeft >= ramAdd);
                return ok ? Promise.resolve() : Promise.reject(new Error(t('Quota exceeded')));
              },
            },
          ],
          render: () => <FlavorSelectTable excludeFlavors={exclude} />,
        },
        {
          name: 'option',
          label: t('Forced Shutdown'),
          render: () => <ForceShutdownCheck id="resize-force-shutdown" />,
          rules: [
            {
              required: true,
              validator: (_, v) =>
                v === true ? Promise.resolve() : Promise.reject(new Error(t('Force shutdown must be checked!'))),
            },
          ],
        },
      ].filter(Boolean);
    },
    getDefaultValues: (item) => ({ instance: item?.name || item?.id, flavor: flavorLabel(item) }),
    onSubmit: (values, item) => serverAction(item.id, { resize: { flavorRef: values.newFlavor.selectedRowKeys[0] } }),
  });

  const ChangePassword = define({
    id: 'change-password',
    type: 'modal',
    titleKey: 'Change Password',
    buttonTextKey: 'Change Password',
    descKey: 'action.desc.change_password',
    policy: 'os_compute_api:os-admin-password',
    allowed: (item) => isActive(item) && notLockedOrAdmin(item) && !isIronicInstance(item),
    getFormItems: () => [
      tipsAlert(
        t('If OS is Linux, system will reset root password, if OS is Windows, system will reset Administrator password.')
      ),
      instanceLabel(),
      { name: 'password', label: t('Password'), type: 'password', required: true, rules: [instancePasswordRule('password')] },
      {
        name: 'confirmPassword',
        label: t('Confirm Password'),
        type: 'password',
        required: true,
        dependencies: ['password'],
        rules: [instancePasswordRule('confirmPassword')],
      },
    ],
    getDefaultValues: (item) => ({ instance: item?.name || item?.id }),
    onSubmit: (values, item) => serverAction(item.id, { changePassword: { adminPass: values.password } }),
  });

  const Rebuild = define({
    id: 'rebuild',
    type: 'modal',
    titleKey: 'Rebuild Instance',
    buttonTextKey: 'Rebuild',
    actionNameKey: 'rebuild instance',
    descKey: 'action.desc.rebuild',
    isDanger: true,
    width: 1100,
    policy: 'os_compute_api:servers:rebuild',
    allowed: (item) => isActiveOrShutOff(item) && isNotLocked(item) && !isIsoInstance(item),
    getFormItems: async () => {
      const auth = useAuthStore.getState();
      const projectId = auth?.currentProject?.id;
      const admin = Boolean(auth?.hasAdminRole);
      const [{ images, snapshots }, keyRes] = await Promise.all([
        loadRebuildSources({ hasAdminRole: admin, projectId }),
        novaApi.listKeypairsV().catch(() => ({})),
      ]);
      const keypairs = (keyRes?.keypairs || []).map((k) => k.keypair?.name || k.name).filter(Boolean);
      return [
        tipsAlert(
          t(
            'If the root disk has a snapshot, it will affect the deletion of the original disk during reconstruction or the recovery of the instance snapshot.'
          ),
          'warning'
        ),
        instanceLabel(),
        {
          name: 'source',
          label: t('Start Source'),
          type: 'radio',
          required: true,
          tip: t('The start source is a template used to create an instance. You can choose an image.'),
          options: [
            { label: t('Image'), value: 'image' },
            { label: t('Instance Snapshot'), value: 'instanceSnapshot' },
          ],
        },
        {
          name: 'image',
          label: t('Operating System'),
          visible: (v) => v.source !== 'instanceSnapshot',
          rules: [selectTableRule(t('Image'))],
          render: () => <ImageSelect images={images} hasAdminRole={admin} projectId={projectId} />,
        },
        {
          name: 'instanceSnapshot',
          label: t('Instance Snapshot'),
          visible: (v) => v.source === 'instanceSnapshot',
          rules: [selectTableRule(t('Instance Snapshot'))],
          render: () => <InstanceSnapshotSelect snapshots={snapshots} />,
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
          options: [{ label: t('No keypair / Keep current'), value: '' }, ...keypairs.map((k) => ({ label: k, value: k }))],
        },
      ];
    },
    getDefaultValues: (item) => ({ instance: item?.name || item?.id, source: 'image', key_name: '' }),
    // legacy ServerStore.rebuild: { rebuild: { imageRef } } (+ optional password / keypair extras)
    onSubmit: (values, item) => {
      const imageRef =
        values.source === 'instanceSnapshot' ? values.instanceSnapshot?.selectedRowKeys?.[0] : values.image?.selectedRowKeys?.[0];
      const rebuild = { imageRef };
      if (values.adminPass) rebuild.adminPass = values.adminPass;
      if (values.key_name) rebuild.key_name = values.key_name;
      return serverAction(item.id, { rebuild });
    },
  });

  const Edit = define({
    id: 'edit-instance',
    type: 'modal',
    titleKey: 'Edit Instance',
    buttonTextKey: 'Edit',
    descKey: 'action.desc.edit_instance',
    policy: 'os_compute_api:servers:update',
    allowed: (item) => Boolean(item?.id),
    getFormItems: () => [
      {
        name: 'name',
        label: t('Name'),
        type: 'input',
        required: true,
        placeholder: t('Please input name'),
        rules: [{ validator: instanceNameValidator }],
      },
      { name: 'description', label: t('Description'), type: 'input', placeholder: t('Enter description (optional)...') },
    ],
    getDefaultValues: (item) => ({ name: item?.name || '', description: item?.description || item?.raw?.description || '' }),
    onSubmit: (values, item) => novaApi.updateServerV(item.id, { name: values.name, description: values.description || undefined }),
  });

  const Delete = define({
    id: 'delete',
    type: 'confirm',
    titleKey: 'Delete Instance',
    buttonTextKey: 'Delete',
    actionNameKey: 'delete instance',
    descKey: 'action.desc.delete',
    isDanger: true,
    policy: 'os_compute_api:servers:delete',
    allowed: (item) => notLockedOrAdmin(item) && !isIronicInstance(item),
    confirmText: (items) => <DeleteConfirmContent items={items} />,
    // legacy SoftDelete.onSubmit: forceDelete for "Immediately delete" or shelved offloaded, else DELETE
    onSubmit: (target) => {
      const { hard } = deleteState;
      return forEach(target, (it) =>
        hard || isShelvedOffloaded(it) ? serverAction(it.id, { forceDelete: null }) : novaApi.deleteServerV(it.id)
      );
    },
  });

  const DeleteIronic = define({
    id: 'delete-ironic',
    type: 'confirm',
    titleKey: 'Delete',
    buttonTextKey: 'Delete',
    actionNameKey: 'delete ironic instance',
    isDanger: true,
    policy: 'os_compute_api:os-deferred-delete:force',
    allowed: (item) => notLockedOrAdmin(item) && isIronicInstance(item),
    onSubmit: (target) => forEach(target, (it) => serverAction(it.id, { forceDelete: null })),
  });

  const ModifyTags = define({
    id: 'modify-tags',
    type: 'modal',
    titleKey: 'Modify Instance Tags',
    buttonTextKey: 'Modify Instance Tags',
    descKey: 'action.desc.modify_tags',
    policy: 'os_compute_api:os-server-tags:update_all',
    allowed: (item) => ['active', 'paused', 'suspended', 'stopped'].includes(String(item?.vm_state || '').toLowerCase()),
    getFormItems: () => [
      {
        name: 'tags',
        label: t('Tags'),
        render: () => <TagsInput />,
        extra: (
          <div>
            <div>1. {t('Each instance can have up to 50 tags')}</div>
            <div>2. {t('Tags are not case sensitive')}</div>
            <div>3. {t('Tag is no longer than 60 characters')}</div>
            <div>4. {t('Forward Slash ‘/’ is not allowed to be in a tag name')}</div>
            <div>
              5. {t('Commas ‘,’ are not allowed to be in a tag name in order to simplify requests that specify lists of tags')}
            </div>
          </div>
        ),
        rules: [
          {
            validator: (_, val = []) => {
              const bad = (val || []).find((tag) => tag.includes('/') || tag.includes(','));
              if (bad) return Promise.reject(new Error(t('Invalid Tag Value: {tag}', { tag: bad })));
              const dup = (val || []).find(
                (v, i) => val.findIndex((o) => o.toLowerCase() === v.toLowerCase()) !== i
              );
              if (dup) return Promise.reject(new Error(t('Duplicate tag name: {tag}', { tag: dup })));
              return Promise.resolve();
            },
          },
        ],
      },
    ],
    getDefaultValues: (item) => ({ tags: Array.isArray(item?.tags) ? item.tags : [] }),
    // legacy tag store: PUT /servers/{id}/tags { tags }
    onSubmit: (values, item) => novaApi.updateServerTagsV(item.id, { tags: values.tags || [] }),
  });

  const hostField = (item) => ({
    name: 'host',
    label: t('Target Compute Host'),
    extra: t('If nova-compute on the host is disabled, it will be forbidden to be selected as the target host.'),
    render: () => <HostSelect currentHost={item.host} />,
  });

  const Migrate = define({
    id: 'migrate',
    type: 'modal',
    titleKey: 'Migrate',
    buttonTextKey: 'Migrate',
    descKey: 'action.desc.migrate',
    width: 1000,
    adminOnly: true,
    policy: 'os_compute_api:os-migrate-server:migrate',
    allowed: (item) => (isActive(item) || isStopped(item)) && isNotDeleting(item) && !isIronicInstance(item),
    getFormItems: (item) => [
      tipsAlert(t('Choose a host to migrate instance to. If not selected, the scheduler will auto select target host.')),
      instanceLabel(),
      { name: 'current', label: t('Current Compute Host'), type: 'label' },
      hostField(item),
    ],
    getDefaultValues: (item) => ({ instance: item?.name || item?.id, current: item?.host || '-' }),
    // legacy ServerStore.migrate: { migrate: null } or { migrate: { host } }
    onSubmit: (values, item) => {
      const row = values.host?.selectedRows?.[0];
      return serverAction(item.id, row ? { migrate: { host: row.service_host } } : { migrate: null });
    },
  });

  const LiveMigrate = define({
    id: 'live-migrate',
    type: 'modal',
    titleKey: 'Live Migrate',
    buttonTextKey: 'Live Migrate',
    descKey: 'action.desc.live_migrate',
    width: 1000,
    adminOnly: true,
    policy: 'os_compute_api:os-migrate-server:migrate_live',
    allowed: (item) => (isActive(item) || isPaused(item)) && isNotDeleting(item) && !isIronicInstance(item),
    getFormItems: (item) => [
      tipsAlert(t('Choose a host to live migrate instance to. If not selected, the scheduler will auto select target host.')),
      instanceLabel(),
      { name: 'current', label: t('Current Compute Host'), type: 'label' },
      hostField(item),
      { name: 'blockMigrate', label: t('Block Migrate'), type: 'checkbox' },
    ],
    getDefaultValues: (item) => ({ instance: item?.name || item?.id, current: item?.host || '-', blockMigrate: false }),
    // legacy: { 'os-migrateLive': { host, block_migration: blockMigrate || 'auto' } }
    onSubmit: (values, item) => {
      const row = values.host?.selectedRows?.[0];
      return serverAction(item.id, {
        'os-migrateLive': { host: row ? row.service_host : null, block_migration: values.blockMigrate || 'auto' },
      });
    },
  });

  return {
    CreateSnapshot,
    ConfirmResize,
    RevertResize,
    Resize,
    ChangePassword,
    Rebuild,
    Edit,
    Delete,
    DeleteIronic,
    ModifyTags,
    Migrate,
    LiveMigrate,
  };
}
