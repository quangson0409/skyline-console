/**
 * Instance actions - port of legacy pages/compute/containers/Instance/actions/index.jsx.
 * Allowed rules, grouping and request bodies follow the legacy actions / ServerStore 1:1;
 * extras the new console already had (description on Edit, password + keypair on Rebuild,
 * Migrate / Live Migrate for administrators on the project list) are kept.
 *
 * Actions are built per page (`getInstanceActions(isAdminPage)`) because several legacy
 * allowed checks depend on the administrator page (isNotLockedOrAdmin, !isAdminPage...).
 */
import { t } from '@/core/i18n';
import { isIronicInstance } from '../resources';
import { buildStatusActions } from './statusActions';
import { buildResourceActions } from './resourceActions';
import { buildConfigActions } from './configActions';

export { getRemoteConsoleUrl, CONSOLE_TYPES, consoleErrorMessage } from './common';
export { loadDataVolumes } from './resourceActions';

export function buildInstanceActions(isAdminPage = false) {
  const s = buildStatusActions(isAdminPage);
  const r = buildResourceActions(isAdminPage);
  const c = buildConfigActions(isAdminPage);

  const statusActions = [
    s.Start,
    s.Stop,
    s.Lock,
    s.Unlock,
    s.Reboot,
    s.SoftReboot,
    s.Suspend,
    s.Resume,
    s.Pause,
    s.Unpause,
    s.Shelve,
    s.Unshelve,
    s.Rescue,
    s.Unrescue,
    s.ResetState,
  ];
  const resourceActions = [
    r.AttachInterface,
    r.DetachInterface,
    r.AttachVolume,
    r.DetachVolume,
    r.AssociateFip,
    r.DisassociateFip,
    r.ManageSecurityGroup,
  ];
  const configActions = [c.ConfirmResize, c.RevertResize, c.Resize, c.ChangePassword, c.Rebuild];
  const batchActions = [s.Start, s.Stop, s.Reboot, s.SoftReboot, c.Delete];
  const batchActionsForIronic = [...batchActions.slice(0, -2), c.DeleteIronic];
  const batchActionsForOthers = batchActions.slice(0, -1);

  const getRowActions = () =>
    isAdminPage
      ? {
          firstAction: s.Console,
          menuVariant: 'grouped',
          moreActions: [
            { title: t('Instance Status'), actions: statusActions },
            { action: c.Migrate },
            { action: c.LiveMigrate },
            { action: c.Delete },
            { action: c.DeleteIronic },
            { action: c.ConfirmResize },
          ],
        }
      : {
          firstAction: s.Console,
          menuVariant: 'grouped',
          moreActions: [
            { title: t('Instance Status'), actions: statusActions },
            { title: t('Related Resources'), actions: resourceActions },
            { title: t('Backups & Snapshots'), actions: [c.CreateSnapshot] },
            { title: t('Configuration Update'), actions: configActions },
            { action: c.Edit },
            { action: c.Delete },
            { action: c.DeleteIronic },
            { action: c.ModifyTags },
            // new console extra: administrators can migrate from the project list as well
            { title: t('Administration'), actions: [c.Migrate, c.LiveMigrate] },
          ],
        };

  /** legacy Instance.batchActions getter: depends on the ironic instances in the selection */
  const getBatchActions = (selectedRows = []) => {
    if (selectedRows.length && selectedRows.every(isIronicInstance)) return batchActionsForIronic;
    if (selectedRows.every((it) => !isIronicInstance(it))) return batchActions;
    return batchActionsForOthers;
  };

  return {
    ...s,
    ...r,
    ...c,
    statusActions,
    resourceActions,
    configActions,
    backupActions: [c.CreateSnapshot],
    adminActions: [c.Migrate, c.LiveMigrate],
    batchActions,
    batchActionsForIronic,
    batchActionsForOthers,
    getBatchActions,
    getRowActions,
    get rowActions() {
      return getRowActions();
    },
  };
}

const cache = {};
/** Cached per page type; titles are translation getters so they follow the current locale */
export const getInstanceActions = (isAdminPage = false) => {
  const key = isAdminPage ? 'admin' : 'project';
  if (!cache[key]) cache[key] = buildInstanceActions(isAdminPage);
  return cache[key];
};

/* ---------------- backwards compatible named exports (project page) ---------------- */
const project = getInstanceActions(false);

export const ConsoleAction = project.Console;
export const StartAction = project.Start;
export const StopAction = project.Stop;
export const LockAction = project.Lock;
export const UnlockAction = project.Unlock;
export const RebootAction = project.Reboot;
export const SoftRebootAction = project.SoftReboot;
export const SuspendAction = project.Suspend;
export const ResumeAction = project.Resume;
export const PauseAction = project.Pause;
export const UnpauseAction = project.Unpause;
export const ShelveAction = project.Shelve;
export const UnshelveAction = project.Unshelve;
export const RescueAction = project.Rescue;
export const UnrescueAction = project.Unrescue;
export const ResetStateAction = project.ResetState;
export const AttachInterfaceAction = project.AttachInterface;
export const DetachInterfaceAction = project.DetachInterface;
export const AttachVolumeAction = project.AttachVolume;
export const DetachVolumeAction = project.DetachVolume;
export const AssociateFipAction = project.AssociateFip;
export const DisassociateFipAction = project.DisassociateFip;
export const ManageSecurityGroupAction = project.ManageSecurityGroup;
export const CreateSnapshotAction = project.CreateSnapshot;
export const ConfirmResizeAction = project.ConfirmResize;
export const RevertResizeAction = project.RevertResize;
export const ResizeAction = project.Resize;
export const ChangePasswordAction = project.ChangePassword;
export const RebuildAction = project.Rebuild;
export const EditInstanceAction = project.Edit;
export const DeleteAction = project.Delete;
export const DeleteIronicAction = project.DeleteIronic;
export const ModifyTagsAction = project.ModifyTags;
export const MigrateAction = project.Migrate;
export const LiveMigrateAction = project.LiveMigrate;

export const { statusActions, resourceActions, configActions, backupActions, adminActions, batchActions } = project;
export const rowActions = {
  firstAction: ConsoleAction,
  get moreActions() {
    return project.getRowActions().moreActions;
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
