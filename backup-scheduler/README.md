# backup-scheduler

Small background service that stores Cinder volume backup schedules and creates the backups on time.
Plain Node.js >= 20 (ES modules), **no npm dependencies**. Used by the console page "Backup Schedules"
(see `docs/BACKUP_SCHEDULER.md` in the console repository for architecture and proxy examples).

## Run

```bash
export KEYSTONE_URL=http://keystone:5000      # base URL, with or without /v3
export SCHEDULER_SECRET="$(openssl rand -hex 32)"   # required, >= 16 chars; encrypts stored credentials
export DATA_DIR=./data TZ=UTC PORT=8787
npm start            # node src/index.js
npm test             # node --test (cron, retention, and an end-to-end test against a fake Keystone+Cinder)
```

The service refuses to start without `SCHEDULER_SECRET` (or `KEYSTONE_URL`). Losing or changing the secret
makes stored credentials undecryptable: schedules then fail until the credential is re-entered (edit the schedule).

Docker: `docker build -t backup-scheduler . && docker run -d -p 8787:8787 -v bs-data:/data -e KEYSTONE_URL=... -e SCHEDULER_SECRET=... backup-scheduler`

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `KEYSTONE_URL` | (required) | Keystone base URL, e.g. `http://keystone:5000` |
| `SCHEDULER_SECRET` | (required) | Passphrase for AES-256-GCM encryption of credentials (scrypt-derived key) |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Listen address |
| `DATA_DIR` | `./data` | Holds `state.json` (atomic writes, mode 0600) |
| `TZ` | `UTC` | IANA timezone used to evaluate cron expressions |
| `CINDER_URL` | from catalog | Cinder endpoint override; `{project_id}` is substituted, e.g. `http://cinder:8776/v3/{project_id}` |
| `CINDER_INTERFACE` | `public` | Catalog interface to use (`public`, `internal`, `admin`) |
| `REGION_NAME` | any | Restrict catalog lookup to this region |
| `TICK_SECONDS` | `30` | Runner loop interval |
| `MIN_INTERVAL_MINUTES` | `5` | Reject cron expressions that fire more often |
| `BACKUP_POLL_MS` | `5000` | Poll interval while waiting for backups |
| `BACKUP_WAIT_SECONDS` | `21600` | Max wait for a backup to become `available` |
| `DELETE_WAIT_SECONDS` | `600` | Max wait for a retention delete |
| `ADMIN_ROLE` | `admin` | Role allowed to use `?all_projects=1` |
| `MAX_VMS_PER_SCHEDULE` | `30` | Most instances one schedule may back up |
| `RUN_MAX_HOURS` | `24` | Hard cap of one run; volumes not started by then are skipped |
| `MAX_CONCURRENT_RUNS` | `1` | Runs of different schedules are executed one after another by default |
| `AUDIT_INTERNAL_SECRET` | (empty) | Shared secret so Cinder calls are recorded by audit-proxy as actor `backup-scheduler` |
| `AUDIT_URL` | (empty) | audit-proxy base URL (e.g. `http://audit-proxy:8788`): the result of every run and of every volume (failures and skips included) is reported to the audit log; needs `AUDIT_INTERNAL_SECRET` |

## API (`/api/v1`, header `X-Auth-Token: <keystone token>` on everything except `health`)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | no auth |
| GET | `/schedules` | own project; `?all_projects=1` for admins |
| POST | `/schedules` | body below, returns 201 |
| GET / PATCH / DELETE | `/schedules/:id` | PATCH accepts name, mode, cron, retention, enabled, force_in_use, credential |
| POST | `/schedules/:id/run` | run now, 202; 409 when a run is in progress |
| GET | `/schedules/:id/runs` | last 50 runs, newest first |
| POST | `/cron/preview` | `{cron, count}` -> next run times in the service timezone |

```json
{ "name": "nightly", "volume_id": "<uuid>", "mode": "full|incremental", "cron": "0 2 * * *",
  "retention": { "keep_last": 3, "keep_daily": 7, "keep_weekly": 4, "keep_monthly": 6 }, "enabled": true, "force_in_use": false,
  "credential": { "application_credential_id": "...", "secret": "..." } }
```

### Backing up instances (Proxmox style)

A schedule normally targets **instances**: `"vms": [{ "id": "<server uuid>", "name": "web-01" }]` (1 to `MAX_VMS_PER_SCHEDULE`, default 30)
instead of `volume_id`. At run time the scheduler finds every Cinder volume attached to those instances and backs them up
**one volume after another**:

- a volume that fails (error, timeout, wrong state) is recorded and **skipped; the next volume still runs**;
- an instance without Cinder volumes (local / ephemeral disk) is recorded as `skipped` (it cannot be backed up with Cinder);
- attached volumes are in-use, so backups are taken with `force` (crash-consistent, like a Proxmox backup of a running guest);
- retention is applied per volume right after its backup is available;
- run status: `success` (all volumes ok), `partial` (some failed or skipped), `error` (nothing backed up); `items[]` of a run holds the
  result of each volume and `last_run.counts` the totals.

Schedules created with `volume_id` keep working unchanged.

### Timeout

`timeout_minutes` (integer 5-2880, optional, per schedule) is the longest the scheduler waits for **each** new backup to become `available`.
When it is exceeded the run is marked `error` (`timed out after N min ...`) and the next run can start. Without it the service default
`BACKUP_WAIT_SECONDS` (6 h) applies. Every retention delete waits at most `DELETE_WAIT_SECONDS` (10 min) and a run does at most 5 delete passes,
so a run can never wait forever.

### Retention (Proxmox `prune-backups` model)

`retention` accepts `keep_last`, `keep_hourly`, `keep_daily`, `keep_weekly`, `keep_monthly`, `keep_yearly` (integers 1-1000) or
`keep_all: true` (cannot be combined). At least one option is required; `{ "keep_last": n }` from older versions stays valid.

- `keep_last N`: the N newest backups of the schedule.
- `keep_hourly|daily|weekly|monthly|yearly N`: the **newest backup of each of the last N distinct periods** that have a backup
  (weeks are ISO weeks). Periods are evaluated in the scheduler time zone (`TZ`).
- Options are applied together: a backup kept by **any** option is kept, the rest of the schedule's `available` backups are deleted
  after each successful run. Failed (`error`) backups of the schedule are removed too.
- Only backups whose description is `scheduler:<schedule id>` are considered; backups with dependent (incremental) backups are never deleted,
  so with incremental mode and sparse options the chain base stays until its dependents are gone.

The credential is verified against Keystone at creation (must be scoped to the same project as the token),
stored encrypted, and never returned.

Scheduled backups are named `<schedule name>-<YYYYMMDD-HHmmss>` (UTC) and described `scheduler:<schedule id>`.
Retention only ever deletes backups carrying that exact description, oldest first, and never a backup that
still has dependent backups.
