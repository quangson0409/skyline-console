// Reports what the scheduler did on its own (run results, per volume results) to audit-proxy.
// Fire and forget: a missing / slow audit service never affects a backup run.

const outcomeOf = (status) => ({ success: 'success', partial: 'partial', error: 'failed', skipped: 'skipped' })[status] || 'failed';

/** POST events to <AUDIT_URL>/audit-api/internal/events (no-op when AUDIT_URL or the shared secret is not set) */
export async function reportEvents(cfg, events, log = () => {}) {
  if (!cfg.auditUrl || !cfg.auditSecret || !events.length) return;
  try {
    const res = await fetch(`${cfg.auditUrl}/audit-api/internal/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-audit-secret': cfg.auditSecret },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) log('warn', `audit report rejected: HTTP ${res.status}`);
  } catch (e) {
    log('warn', `audit report failed: ${e.cause?.code || e.message}`);
  }
}

const trigger = (run) => (run.trigger === 'manual' ? 'manual' : 'scheduled');

/** one event for a finished run of a schedule */
export function runEvent(schedule, run) {
  const c = run.counts || {};
  return {
    ts: run.started_at,
    action: `Backup Schedule Run (${trigger(run)})`,
    outcome: outcomeOf(run.status),
    error: run.error || null,
    resource_type: 'Backup Schedule',
    resource_id: schedule.id,
    resource_name: schedule.name,
    user_id: schedule.created_by || null,
    project_id: schedule.project_id || null,
    on_behalf_of: `schedule ${schedule.id} (${schedule.name || ''})`,
    path: `/schedules/${schedule.id}/run`,
    duration_ms: run.finished_at ? Date.parse(run.finished_at) - Date.parse(run.started_at) : null,
    fields: [`volumes=${c.total ?? 0}`, `ok=${c.success ?? 0}`, `failed=${c.error ?? 0}`, `skipped=${c.skipped ?? 0}`],
  };
}

/** one event for one volume of a run */
export function itemEvent(schedule, run, item) {
  return {
    ts: item.started_at || run.started_at,
    action: `Backup Volume (${trigger(run)})`,
    outcome: outcomeOf(item.status),
    error: item.error || null,
    resource_type: 'Volume',
    resource_id: item.volume_id || item.vm_id || null,
    resource_name: [item.vm_name, item.volume_name].filter(Boolean).join(' / ') || null,
    user_id: schedule.created_by || null,
    project_id: schedule.project_id || null,
    on_behalf_of: `schedule ${schedule.id} (${schedule.name || ''})`,
    path: `/schedules/${schedule.id}/run`,
    duration_ms: item.finished_at && item.started_at ? Date.parse(item.finished_at) - Date.parse(item.started_at) : null,
    fields: item.backup_id ? [`backup=${item.backup_id}`] : null,
  };
}
