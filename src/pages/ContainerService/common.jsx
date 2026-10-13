import React from 'react';
import yaml from 'js-yaml';
import { t } from '@/core/i18n';

/** Legacy resources/zun/container.js */
export const containerStatus = () => ({
  Creating: t('Creating'),
  Created: t('Created'),
  Running: t('Running'),
  Stopped: t('Stopped'),
  Paused: t('Paused'),
  Restarting: t('Restarting'),
  Deleting: t('Deleting'),
  Error: t('Error'),
  Unknown: t('Unknown'),
  Rebuilding: t('Rebuilding'),
});

export const containerTaskStatus = () => ({
  free: t('No Task'),
  container_creating: t('Container Creating'),
  container_starting: t('Container Starting'),
  container_stopping: t('Container Stopping'),
  container_rebooting: t('Container Rebooting'),
  container_deleting: t('Container Deleting'),
  container_rebuilding: t('Container Rebuilding'),
  container_killing: t('Container Killing'),
  container_pausing: t('Container Pausing'),
  container_unpausing: t('Container Unpausing'),
  container_restarting: t('Container Restarting'),
  image_pulling: t('Image Pulling'),
  sg_adding: t('Security Groups Adding'),
  sg_removing: t('Security Groups Removing'),
  network_attaching: t('Network Attaching'),
  network_detaching: t('Network Detaching'),
});

const S = {
  ERROR: 'Error',
  RUNNING: 'Running',
  STOPPED: 'Stopped',
  PAUSED: 'Paused',
  UNKNOWN: 'Unknown',
  CREATING: 'Creating',
  CREATED: 'Created',
  DELETED: 'Deleted',
  DELETING: 'Deleting',
  REBUILDING: 'Rebuilding',
  DEAD: 'Dead',
  RESTARTING: 'Restarting',
};

const validStates = {
  update: [S.CREATED, S.RUNNING, S.STOPPED, S.PAUSED],
  start: [S.CREATED, S.STOPPED, S.ERROR],
  stop: [S.RUNNING],
  reboot: [S.CREATED, S.RUNNING, S.STOPPED, S.ERROR],
  rebuild: [S.CREATED, S.RUNNING, S.STOPPED, S.ERROR],
  pause: [S.RUNNING],
  unpause: [S.PAUSED],
  execute: [S.RUNNING],
  kill: [S.RUNNING],
  delete: [S.CREATED, S.ERROR, S.STOPPED, S.DELETED, S.DEAD],
  delete_force: [
    S.CREATED,
    S.CREATING,
    S.ERROR,
    S.RUNNING,
    S.STOPPED,
    S.UNKNOWN,
    S.DELETED,
    S.DEAD,
    S.RESTARTING,
    S.REBUILDING,
    S.DELETING,
  ],
  delete_stop: [S.RUNNING, S.CREATED, S.ERROR, S.STOPPED, S.DELETED, S.DEAD],
  manage_security_groups: [S.CREATED, S.RUNNING, S.STOPPED, S.PAUSED],
  network_attach_detach: [S.CREATED, S.RUNNING, S.STOPPED, S.PAUSED],
};

export const checkItemAction = (item, actionName) => {
  if (!item) return false;
  return (validStates[actionName] || []).includes(item.status);
};

export const imageDrivers = () => ({
  docker: t('Docker Hub'),
  glance: t('Glance Image'),
});

export const exitPolicies = () => ({
  no: t('No'),
  'on-failure': t('On failure'),
  always: t('Always'),
  'unless-stopped': t('Unless Stopped'),
});

/** Legacy resources/zun/capsule.js */
export const capsuleStatus = () => ({
  Creating: t('Creating'),
  Pending: t('Pending'),
  Running: t('Running'),
  Succeeded: t('Succeeded'),
  Failed: t('Failed'),
  Unknown: t('Unknown'),
});

/** Legacy resources/zun/actions.jsx */
export const actionEvent = () => ({
  compute__do_container_start: t('Start Container'),
  compute__do_container_create: t('Create Container'),
  compute__do_container_stop: t('Stop Container'),
  compute__do_container_reboot: t('Reboot Container'),
  compute__do_container_restart: t('Restart Container'),
  compute__do_container_pause: t('Pause Container'),
  compute__do_container_unpause: t('Unpause Container'),
  compute__do_container_rebuild: t('Rebuild Container'),
  compute__do_container_kill: t('Kill Container'),
  compute__do_container_delete: t('Delete Container'),
});

export const actionMap = () => ({
  create: t('Create'),
  stop: t('Stop'),
  reboot: t('Reboot'),
  start: t('Start'),
  restart: t('Restart'),
  pause: t('Pause'),
  unpause: t('Unpause'),
  resize: t('Resize'),
  rebuild: t('Rebuild'),
  kill: t('Kill'),
  delete: t('Delete'),
});

/** Legacy resources/nova/service.js serviceState */
export const serviceState = () => ({
  up: t('Up'),
  down: t('Down'),
});

/** Legacy utils/content stringifyContent */
export const stringifyContent = (value) => {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'object') {
    if (Array.isArray(value) ? !value.length : !Object.keys(value).length) return '-';
    return (
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return String(value);
};

export const listRender = (value = [], render = (it) => it, key = (it) => it) =>
  value && value.length ? value.map((it) => <div key={key(it)}>{render(it)}</div>) : '-';

/** Transition check: zun task_state (null means no task) or busy status */
export const isContainerTransition = (item = {}) =>
  Boolean(item.task_state) || ['Creating', 'Deleting', 'Restarting', 'Rebuilding'].includes(item.status);

/** Capsule template parser (legacy utils/yaml getYaml -> js-yaml load); JSON is valid YAML too */
export const parseYaml = (text = '') => {
  const src = String(text).trim();
  if (!src) return {};
  return yaml.load(src) ?? {};
};
