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
  "retention": { "keep_last": 7 }, "enabled": true, "force_in_use": false,
  "credential": { "application_credential_id": "...", "secret": "..." } }
```

The credential is verified against Keystone at creation (must be scoped to the same project as the token),
stored encrypted, and never returned.

Scheduled backups are named `<schedule name>-<YYYYMMDD-HHmmss>` (UTC) and described `scheduler:<schedule id>`.
Retention only ever deletes backups carrying that exact description, oldest first, and never a backup that
still has dependent backups.
