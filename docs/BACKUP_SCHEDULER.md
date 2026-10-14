# Volume Backup Scheduler

Neither legacy Skyline nor Cinder can schedule backups. This feature adds a small service
(`backup-scheduler/`) plus a console page (Storage -> Backup Schedules).

## Architecture

```
Browser (console) --/scheduler-api--> reverse proxy / Vite --/api/v1--> backup-scheduler --> Keystone, Cinder
```

- The console sends the user's Keystone token (`X-Auth-Token`) to the scheduler. The scheduler validates it with
  `GET /v3/auth/tokens` (`X-Subject-Token`) and scopes every schedule to the token's `project_id`.
  Users with the `admin` role may list every project with `?all_projects=1` (the `*-admin` console pages).
- Each schedule stores an **application credential** (id + secret). The user's own token expires, so when a
  schedule fires the scheduler authenticates with the application credential (`v3applicationcredential`), reads the
  Cinder endpoint from the service catalog (or `CINDER_URL`), creates the backup, waits until it is `available`,
  then applies retention.
- State (schedules, run history of the last 50 runs per schedule) is one JSON file `DATA_DIR/state.json`,
  written atomically. After a restart, interrupted runs are marked failed and overdue schedules fire once.
- Runs never overlap per schedule. Scheduled backups are named `<schedule>-<YYYYMMDD-HHmmss>` and tagged with the
  description `scheduler:<schedule id>`; retention only deletes backups carrying that tag.

Console files: `src/api/scheduler.js`, `src/pages/Storage/BackupSchedules/*`, routes `storage/backup-schedule[-admin]`
(+ `/detail/:id`), locale `src/locales/modules/backup-schedule.en.json`. When the service cannot be reached the pages show
"Backup scheduler service is not available".

## Environment variables

See `backup-scheduler/README.md` for the full table. Required: `KEYSTONE_URL`, `SCHEDULER_SECRET`.
Console: `SCHEDULER_URL` (Vite dev proxy target, default `http://127.0.0.1:8787`) and optional
`VITE_SCHEDULER_URL` (override the client base URL, default `/scheduler-api`).

## Running

Node:

```bash
cd backup-scheduler
KEYSTONE_URL=http://keystone:5000 SCHEDULER_SECRET=change-me-to-a-long-random-string TZ=Asia/Ho_Chi_Minh npm start
# console dev server: SCHEDULER_URL=http://127.0.0.1:8787 npm run dev
```

Docker:

```bash
docker build -t backup-scheduler backup-scheduler
docker run -d --name backup-scheduler --restart unless-stopped -p 127.0.0.1:8787:8787 \
  -v backup-scheduler-data:/data -e KEYSTONE_URL=http://keystone:5000 \
  -e SCHEDULER_SECRET=... -e TZ=UTC backup-scheduler
```

Run exactly **one** instance per data directory (state is a local file, no locking between processes).

## nginx

```nginx
location /scheduler-api/ {
    proxy_pass http://127.0.0.1:8787/api/v1/;   # trailing slashes matter: /scheduler-api/x -> /api/v1/x
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 60s;
}
```

## Security notes

- Application credentials are encrypted at rest with AES-256-GCM (key derived from `SCHEDULER_SECRET` with scrypt) in
  `state.json` (file mode 0600). Anyone who can read both the file and the secret can use the credentials; keep the
  data directory and the secret separate, and restrict access to the host/container.
- The secret is shown only once by Keystone; the console passes it straight to the scheduler and never keeps it. It is
  never returned by the scheduler API or written to logs.
- Console "Create application credential automatically" creates a Keystone application credential for the current user,
  `unrestricted: false`, with the roles of the current token (Keystone default when `roles` is omitted). Create a
  dedicated, minimal-role user or set an expiry where you can. Deleting a schedule does **not** delete its application
  credential: remove it under User Center -> Application Credentials.
- The scheduler can only create and delete backups within the credential's project, and only deletes backups it tagged.
- Do not expose the scheduler port directly; put it behind the console's HTTPS proxy. Tokens are validated on every
  request (cached for at most 30 s).
- Changing `SCHEDULER_SECRET` invalidates stored credentials; re-enter them via Edit.
