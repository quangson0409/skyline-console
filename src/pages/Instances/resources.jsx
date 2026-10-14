/**
 * Port of legacy src/resources/nova/instance.jsx (status maps, state checks, renderers)
 * plus the server normalizer shared by the instance list, detail page and actions.
 */
import React from 'react';
import { Tag, Tooltip } from 'antd';
import { LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { t } from '@/core/i18n';

/* ------------------------------------------------------------------ */
/* Status maps                                                         */
/* ------------------------------------------------------------------ */
export const transitionStatus = () => ({
  build: t('Build'),
  building: t('Building'),
  stopped: t('Stopped'),
  recovering: t('Recovering'),
  rescued: t('Rescued'),
  resized: t('Resized'),
  scheduling: t('Scheduling'),
  reboot: t('Reboot'),
  hard_reboot: t('Hard Reboot'),
  migrating: t('Migrating'),
});

export const stableStatus = () => ({
  deleted: t('Deleted'),
  active: t('Active'),
  shutoff: t('Shutoff'),
  paused: t('Paused'),
  error: t('Error'),
  resize: t('Resizing or Migrating'),
  verify_resize: t('Verify Resize/Migrate'),
  revert_resize: t('Revert Resize/Migrate'),
  password: t('Password'),
  rebuild: t('Rebuild'),
  rescue: t('Rescue'),
  'soft-delete': t('Soft Deleted'),
  soft_deleted: t('Soft Deleted'),
  shelved: t('Shelved'),
  shelved_offloaded: t('Shelved Offloaded'),
  suspended: t('Suspended'),
  stopped: t('Shutoff'),
});

export const taskStatus = () => ({
  null: t('No Task'),
  scheduling: t('Scheduling'),
  block_device_mapping: t('Block Device Mapping'),
  networking: t('Networking'),
  spawning: t('Spawning'),
  image_snapshot: t('Snapshotting'),
  image_snapshot_pending: t('Image Snapshot Pending'),
  image_pending_upload: t('Image Pending Upload'),
  image_uploading: t('Image Uploading'),
  image_backup: t('Image Backup'),
  updating_password: t('Updating Password'),
  resize_prep: t('Resizing or Migrating'),
  resize_migrating: t('Resizing or Migrating'),
  resize_migrated: t('Resizing or Migrating'),
  resize_finish: t('Resizing or Migrating'),
  resize_reverting: t('Reverting Resize or Migrate'),
  resize_confirming: t('Confirming Resize or Migrate'),
  rebooting: t('Rebooting'),
  reboot_pending: t('Rebooting'),
  reboot_started: t('Rebooting'),
  rebooting_hard: t('Hard Rebooting'),
  reboot_pending_hard: t('Hard Rebooting'),
  reboot_started_hard: t('Hard Rebooting'),
  pausing: t('Pausing'),
  unpausing: t('Resuming'),
  suspending: t('Suspending'),
  resuming: t('Resuming'),
  'powering-off': t('Powering Off'),
  'powering-on': t('Powering On'),
  rescuing: t('Rescuing'),
  unrescuing: t('Unrescuing'),
  rebuilding: t('Rebuilding'),
  rebuild_block_device_mapping: t('Rebuild Block Device Mapping'),
  rebuild_spawning: t('Rebuild Spawning'),
  migrating: t('Migrating'),
  deleting: t('Deleting'),
  'soft-deleting': t('Soft Deleting'),
  restoring: t('Restoring'),
  shelving: t('Shelving'),
  shelving_image_pending_upload: t('Shelving Image Pending Upload'),
  shelving_image_uploading: t('Shelving Image Uploading'),
  shelving_offloading: t('Shelving Offloading'),
  unshelving: t('Unshelving'),
});

export const powerStatus = () => ({
  'NO STATE': t('No State'),
  RUNNING: t('Running'),
  BLOCKED: t('Blocked'),
  PAUSED: t('Paused'),
  SHUTDOWN: t('Shut Down'),
  SHUTOFF: t('Shut Off'),
  CRASHED: t('Crashed'),
  SUSPENDED: t('Suspended'),
  FAILED: t('Failed'),
  BUILDING: t('Building'),
});

/** nova OS-EXT-STS:power_state numbers */
export const POWER_STATE_NAMES = {
  0: 'NO STATE',
  1: 'RUNNING',
  3: 'PAUSED',
  4: 'SHUTDOWN',
  6: 'CRASHED',
  7: 'SUSPENDED',
};

export const instanceStatus = () => ({
  ...transitionStatus(),
  ...stableStatus(),
  ...taskStatus(),
  ...powerStatus(),
});

/** Status text like legacy `instanceStatus[value.toLowerCase()]` */
export const instanceStatusText = (status) => {
  if (!status) return '-';
  return instanceStatus()[String(status).toLowerCase()] || status;
};

/** Legacy instanceStatusFilter (nova status values) */
export const instanceStatusFilterOptions = () => [
  { label: t('Active'), key: 'ACTIVE' },
  { label: t('Building'), key: 'BUILD' },
  { label: t('Paused'), key: 'PAUSED' },
  { label: t('Suspended'), key: 'SUSPENDED' },
  { label: t('Error'), key: 'ERROR' },
  { label: t('Shutoff'), key: 'SHUTOFF' },
  { label: t('Shelved Offloaded'), key: 'SHELVED_OFFLOADED' },
];

/** Legacy transition statuses of the list watcher + any running task */
export const isInstanceTransition = (item = {}) => {
  const task = item.task_state || item.taskState;
  if (task && task !== 'None' && task !== 'null') return true;
  const status = String(item.status || '').toLowerCase();
  return Object.keys(transitionStatus()).includes(status) || ['resize', 'revert_resize', 'rebuild', 'password'].includes(status);
};

/* ------------------------------------------------------------------ */
/* State checks (legacy resources/nova/instance.jsx)                   */
/* ------------------------------------------------------------------ */
const lower = (v) => String(v || '').toLowerCase();

export const checkStatus = (statusList = [], instance = {}, checkState = true) => {
  const status = lower(instance.status);
  const vmState = lower(instance.vm_state);
  return statusList.includes(status) || (checkState && !!vmState && statusList.includes(vmState));
};

export const isNotLocked = (item = {}) => !item.locked;
export const isLocked = (item = {}) => !!item.locked;
export const isNotLockedOrAdmin = (item, isAdmin = false) => (isLocked(item) ? isAdmin : true);
export const isNotDeleting = (item = {}) => (item.task_state ? lower(item.task_state) !== 'deleting' : true);
export const isActiveOrShutOff = (item) => checkStatus(['active', 'shutoff'], item);
export const isShutOff = (item) => checkStatus(['shutoff'], item);
export const isActive = (item) => checkStatus(['active'], item);
export const isActiveOrRescue = (item) => checkStatus(['active', 'rescue'], item);
export const isStopped = (item) => checkStatus(['stopped'], item);
export const isPaused = (item) => checkStatus(['paused'], item);
export const isNotError = (item) => !checkStatus(['error'], item);
export const isIsoInstance = (item = {}) => !!item.iso_server;

export const isIronicInstance = (item = {}) => {
  const extra = (item.flavor_info && item.flavor_info.extra_specs) || {};
  return extra[':architecture'] === 'bare_metal';
};

export const isBootFromVolume = (item = {}) => {
  const raw = item.raw || item.origin_data;
  if (raw && typeof raw === 'object' && Object.keys(raw).length) return !raw.image;
  return !item.image_id && !item.image;
};

export const allowAttachVolumeInstance = (item) =>
  checkStatus(['active', 'paused', 'stopped', 'resized', 'soft-delete', 'shelved', 'shelved_offloaded'], item) &&
  isNotDeleting(item) &&
  isNotLocked(item) &&
  !isIronicInstance(item);

/* ------------------------------------------------------------------ */
/* Renderers                                                           */
/* ------------------------------------------------------------------ */
export const lockRender = (value) =>
  value ? (
    <Tooltip title={t('The instance has been locked. If you want to do more, please unlock it first.')}>
      <LockOutlined style={{ color: '#f59e0b' }} />
    </Tooltip>
  ) : (
    <UnlockOutlined style={{ color: '#94a3b8' }} />
  );

const TAG_COLORS = ['magenta', 'red', 'volcano', 'orange', 'gold', 'lime', 'green', 'cyan', 'blue', 'geekblue'];

/** Legacy SimpleTag (long tags truncated to 20 chars with a tooltip) */
export const SimpleTag = ({ tag, index }) => {
  const isLong = tag.length > 20;
  const el = (
    <Tag key={tag} color={TAG_COLORS[index % 10]} style={{ marginTop: 2, marginBottom: 2 }}>
      <span style={{ whiteSpace: 'pre-wrap' }}>{isLong ? `${tag.slice(0, 20)}...` : tag}</span>
    </Tag>
  );
  return isLong ? (
    <Tooltip key={tag} title={<span style={{ whiteSpace: 'pre-wrap' }}>{tag}</span>}>
      {el}
    </Tooltip>
  ) : (
    el
  );
};

export const renderTags = (tags = []) =>
  Array.isArray(tags) && tags.length ? tags.map((tag, index) => SimpleTag({ tag, index })) : '-';

/* ------------------------------------------------------------------ */
/* Action log maps (legacy actionMap / actionEvent)                    */
/* ------------------------------------------------------------------ */
export const actionMap = () => ({
  attach_interface: t('Attach Interface'),
  detach_interface: t('Detach Interface'),
  attach_volume: t('Attach Volume'),
  detach_volume: t('Detach Volume'),
  create: t('Create'),
  stop: t('Stop'),
  reboot: t('Reboot'),
  suspend: t('Suspend'),
  resume: t('Resume'),
  shelve: t('Shelve'),
  unshelve: t('Unshelve'),
  start: t('Start'),
  lock: t('Lock'),
  unlock: t('Unlock'),
  pause: t('Pause'),
  unpause: t('Unpause'),
  createImage: t('Create Snapshot'),
  resize: t('Extend Root Volume'),
  confirmResize: t('Resize'),
  'live-resize': t('Online Resize'),
  extend_volume: t('Extend Volume'),
  changePassword: t('Change Password'),
  rebuild: t('Rebuild'),
  migrate: t('Migrate'),
  'live-migration': t('Live Migrate'),
  delete: t('Delete'),
  restore: t('Recover'),
});

export const actionEvent = () => ({
  compute_restore_instance: t('Resume Instance'),
  compute_soft_delete_instance: t('Soft Delete Instance'),
  compute_post_live_migration_at_destination: t('Live Migration At Destination'),
  compute_pre_live_migration: t('Pre Live Migration'),
  compute_live_migration: t('Compute Live Migration'),
  compute_check_can_live_migrate_source: t('Check Can Live Migrate Source'),
  compute_check_can_live_migrate_destination: t('Check Can Live Migrate Destination'),
  conductor_live_migrate_instance: t('Conductor Live Migrate Instance'),
  compute_confirm_resize: t('Resized'),
  compute_finish_resize: t('Finish Resize'),
  compute_resize_instance: t('Resize Instance'),
  compute_prep_resize: t('Prep Resize'),
  cold_migrate: t('Cold Migrate'),
  conductor_migrate_server: t('Conductor Migrate Server'),
  compute_rebuild_instance: t('Rebuild Instance'),
  rebuild_server: t('Rebuild Instance'),
  compute_set_admin_password: t('Set Admin Password'),
  compute_extend_volume: t('Extend Volume'),
  compute_live_resize_instance: t('Compute Live Resize Instance'),
  conductor_live_resize_instance: t('Conductor Live Resize Instance'),
  api_snapshot_instance: t('Snapshot Instance'),
  api_lock: t('Lock'),
  api_unlock: t('Unlock'),
  compute_detach_volume: t('Detach Volume'),
  compute_attach_volume: t('Attach Volume'),
  compute_detach_interface: t('Detach Interface'),
  compute_attach_interface: t('Attach Interface'),
  compute__do_build_and_run_instance: t('Do Build And Run Instance'),
  compute_suspend_instance: t('Compute Suspend Instance'),
  compute_start_instance: t('Compute Start Instance'),
  compute_stop_instance: t('Compute Stop Instance'),
  compute_resume_instance: t('Compute Resume Instance'),
  compute_pause_instance: t('Compute Pause Instance'),
  compute_unpause_instance: t('Compute Unpause Instance'),
  compute_reboot_instance: t('Compute Reboot Instance'),
});

/* ------------------------------------------------------------------ */
/* Server normalizer                                                   */
/* ------------------------------------------------------------------ */
const shortTime = (v) => (v ? String(v).replace('T', ' ').substring(0, 19) : '');

/** fixed / floating addresses of a nova server (legacy extension fixed_addresses / floating_addresses) */
export const serverAddresses = (srv = {}) => {
  const fixed = [];
  const floating = [];
  Object.values(srv.addresses || {}).forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((a) => {
      if (!a || !a.addr) return;
      if (a['OS-EXT-IPS:type'] === 'floating') {
        if (!floating.includes(a.addr)) floating.push(a.addr);
      } else if (!fixed.includes(a.addr)) {
        fixed.push(a.addr);
      }
    });
  });
  return { fixed, floating };
};

/**
 * Normalizes a nova server (microversion 2.79) into the shape used by the list, the
 * detail page and the legacy action checks (status, vm_state, task_state, locked,
 * flavor_info, fixed_addresses, floating_addresses, tags...). The raw server stays in `raw`.
 */
export const normalizeServer = (srv = {}, { imageMap = {}, projectMap = {} } = {}) => {
  const { fixed, floating } = serverAddresses(srv);
  const flavorObj = srv.flavor && typeof srv.flavor === 'object' ? srv.flavor : {};
  const flavorName =
    typeof srv.flavor === 'string' ? srv.flavor : flavorObj.original_name || flavorObj.name || flavorObj.id || '-';
  const imageId = typeof srv.image === 'string' ? srv.image : srv.image?.id || '';
  const image = imageId ? imageMap[imageId] : undefined;
  const imageName = srv.image?.name || image?.name || (imageId ? imageId : t('Boot from Volume'));
  const projectId = srv.tenant_id || srv.project_id || '';
  const taskState = srv['OS-EXT-STS:task_state'] || null;
  const powerState = srv['OS-EXT-STS:power_state'];
  return {
    key: srv.id,
    id: srv.id,
    name: srv.name || '',
    description: srv.description || '',
    status: typeof srv.status === 'string' ? srv.status : '',
    vm_state: srv['OS-EXT-STS:vm_state'] || '',
    task_state: taskState,
    power_state: POWER_STATE_NAMES[powerState] || powerState,
    locked: Boolean(srv.locked),
    tags: Array.isArray(srv.tags) ? srv.tags : [],
    // legacy item.flavor is the flavor name, item.flavor_info the embedded flavor (extra_specs, vcpus, ram)
    flavor: flavorName,
    flavor_info: flavorObj,
    vcpus: flavorObj.vcpus ?? null,
    // GiB, rounded like legacy (flavor.ram is MiB)
    ram: typeof flavorObj.ram === 'number' ? Math.round((flavorObj.ram / 1024) * 100) / 100 : null,
    disk: flavorObj.disk ?? null,
    image: imageId,
    image_id: imageId,
    image_name: imageName,
    image_os_distro: image?.os_distro || '',
    iso_server: image?.disk_format === 'iso',
    fixed_addresses: fixed,
    floating_addresses: floating,
    // searchable text for the "Instance IP" filter (legacy backend `ip` filter)
    ip: [...fixed, ...floating].join(' '),
    floatingIp: floating[0] || null,
    project_id: projectId,
    tenant_id: projectId,
    project_name: projectMap[projectId] || '',
    user_id: srv.user_id,
    host: srv['OS-EXT-SRV-ATTR:host'] || '',
    hypervisor: srv['OS-EXT-SRV-ATTR:hypervisor_hostname'] || '',
    root_device_name: srv['OS-EXT-SRV-ATTR:root_device_name'] || '',
    zone: srv['OS-EXT-AZ:availability_zone'] || '',
    key_name: srv.key_name || '',
    keyName: srv.key_name || '-',
    security_groups: Array.isArray(srv.security_groups) ? srv.security_groups : [],
    volumes_attached: Array.isArray(srv['os-extended-volumes:volumes_attached'])
      ? srv['os-extended-volumes:volumes_attached']
      : [],
    volumesAttached: Array.isArray(srv['os-extended-volumes:volumes_attached'])
      ? srv['os-extended-volumes:volumes_attached']
      : [],
    server_groups: Array.isArray(srv.server_groups) ? srv.server_groups : [],
    created_at: srv.created,
    created: shortTime(srv.created),
    updated: shortTime(srv.updated),
    // compatibility with the previous list shape
    taskState: taskState || 'None',
    vmState: srv['OS-EXT-STS:vm_state'] || '',
    powerState: powerState === 1 ? 'Running' : 'Shutoff',
    raw: srv,
  };
};

export const instanceDetailPath = (id, isAdminPage) => `/compute/instance${isAdminPage ? '-admin' : ''}/detail/${id}`;
