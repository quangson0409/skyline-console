/**
 * Port of legacy pages/heat/containers/Stack/actions (Create, Edit, Delete, Abandon)
 * plus the Heat stack actions the API offers (suspend / resume / check / cancel update).
 */
import React from 'react';
import { heatApi } from '@/api/heat';
import { t } from '@/core/i18n';
import { stackRef, stackEditPath } from './resources';

const stackName = (item) => item?.stack_name || item?.name || item?.id;

/** Legacy ConfirmAction context: "Are you sure to {action} (instance: {name})?" + explanation */
const confirmContext = (actionName, note) => (items) => {
  const names = (items || []).map(stackName).join(', ');
  return (
    <div>
      <p style={{ margin: 0 }}>{t('Are you sure to {action} (instance: {name})?', { action: actionName, name: names })}</p>
      {note ? <p style={{ margin: '8px 0 0' }}>{note}</p> : null}
    </div>
  );
};

const runForEach = (fn) => async (target) => {
  const list = Array.isArray(target) ? target : [target];
  for (const it of list) {
    // eslint-disable-next-line no-await-in-loop
    await fn(it);
  }
};

/** legacy StepCreate (static path /heat/stack/create, /heat/stack-admin/create) */
export const createStackAction = ({ navigate, isAdmin }) => ({
  id: 'stack-create',
  type: 'custom',
  title: t('Create Stack'),
  onExecute: () => navigate(isAdmin ? '/heat/stack-admin/create' : '/heat/stack/create'),
});

/** legacy Edit ("Update Template") -> step form at /heat/stack/edit/:id/:name */
export const editStackAction = ({ navigate, isAdmin }) => ({
  id: 'edit-template',
  type: 'custom',
  title: t('Update Template'),
  onExecute: (item) => navigate(stackEditPath(item, isAdmin)),
});

/** legacy Delete */
export const deleteStackAction = () => ({
  id: 'delete',
  type: 'confirm',
  title: t('Delete'),
  actionName: t('delete stack'),
  isDanger: true,
  confirmText: confirmContext(t('delete stack'), t('Deleting this stack will delete all resources deployed by the stack.')),
  onSubmit: runForEach((it) => heatApi.deleteStack(stackRef(it))),
});

const downloadJson = (data, filename) => {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // download is best effort
  }
};

/** legacy Abandon; the abandon data returned by Heat is offered as a JSON download (needed to adopt the stack later) */
export const abandonStackAction = () => ({
  id: 'abandon',
  type: 'confirm',
  title: t('Abandon Stack'),
  actionName: t('abandon stack'),
  isDanger: true,
  confirmText: confirmContext(
    t('abandon stack'),
    t('Abandoning this stack will preserve the resources deployed by the stack.')
  ),
  onSubmit: runForEach(async (it) => {
    const data = await heatApi.abandonStack(stackRef(it));
    if (data && typeof data === 'object' && Object.keys(data).length) {
      downloadJson(data, `${stackName(it)}-abandon.json`);
    }
  }),
});

const stackActionConfirm = ({ id, action, title, actionName, note, allowed, isDanger = false }) => ({
  id,
  type: 'confirm',
  title,
  actionName,
  isDanger,
  allowed,
  confirmText: confirmContext(actionName, note),
  onSubmit: runForEach((it) => heatApi.stackAction(stackRef(it), action)),
});

const status = (item) => item?.stack_status || '';
const inProgress = (item) => /_IN_PROGRESS$/.test(status(item));

export const suspendStackAction = () =>
  stackActionConfirm({
    id: 'suspend',
    action: 'suspend',
    title: t('Suspend Stack'),
    actionName: t('suspend stack'),
    note: t('Suspending a stack suspends all of its resources (e.g. instances are suspended).'),
    allowed: (item) => !inProgress(item) && status(item) !== 'SUSPEND_COMPLETE' && !/^DELETE_/.test(status(item)),
  });

export const resumeStackAction = () =>
  stackActionConfirm({
    id: 'resume',
    action: 'resume',
    title: t('Resume Stack'),
    actionName: t('resume stack'),
    note: t('Resuming a stack resumes all of its suspended resources.'),
    allowed: (item) => ['SUSPEND_COMPLETE', 'SUSPEND_FAILED', 'RESUME_FAILED'].includes(status(item)),
  });

export const checkStackAction = () =>
  stackActionConfirm({
    id: 'check',
    action: 'check',
    title: t('Check Stack'),
    actionName: t('check stack'),
    note: t('Checking a stack verifies that every resource of the stack still exists and is in the expected state.'),
    allowed: (item) => !inProgress(item) && !/^DELETE_/.test(status(item)),
  });

export const cancelUpdateStackAction = () =>
  stackActionConfirm({
    id: 'cancel-update',
    action: 'cancel_update',
    title: t('Cancel Update'),
    actionName: t('cancel stack update'),
    note: t('The stack update is cancelled and the stack is rolled back to its previous state.'),
    allowed: (item) => status(item) === 'UPDATE_IN_PROGRESS',
  });

/** legacy actionConfigs.rowActions: Delete first, then Update Template / Abandon (+ stack actions) */
export const stackRowActions = (ctx) => ({
  firstAction: deleteStackAction(),
  moreActions: [
    { action: editStackAction(ctx) },
    { action: abandonStackAction() },
    {
      title: t('Stack Actions'),
      actions: [suspendStackAction(), resumeStackAction(), checkStackAction(), cancelUpdateStackAction()],
    },
  ],
});
