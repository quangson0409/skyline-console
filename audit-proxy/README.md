# audit-proxy

Reverse proxy in front of the Skyline API that records every **POST, PUT, PATCH and DELETE** (who, when, which
resource, result) into MariaDB. Requests are streamed through untouched; GET is never recorded.
Node >= 24, one dependency (`mysql2`).

```text
browser -> nginx (console) -+- /api/            -> audit-proxy -> Skyline API (UPSTREAM_API)
                            +- /scheduler-api/  -> audit-proxy -> backup-scheduler (rewritten to /api/v1/*)
                            +- /audit-api/      -> audit-proxy (read API for the Audit Logs page)
backup-scheduler -- CINDER_URL=http://audit-proxy:8788/upstream/cinder/v3/{project_id} --> audit-proxy -> Cinder
```

## What is stored

Per event: time (UTC), user / project / roles (taken from the Keystone token, never from the client), service,
HTTP method + path (no query string), readable action (`Reboot Instance`, `Delete Volume`...), resource type / id /
name, request id, HTTP status, outcome (`success`, `accepted` = 202, `failed`, `aborted`), error message, duration,
client IP, user agent, source (`ui`, `api`, `scheduler`) and the **names** of the changed fields.
**Request bodies and values are never stored** (no passwords, tokens, user_data). Login bodies are never stored either.

## Database (MariaDB / Galera)

`scripts/provision-db.sh` (run once as root on one controller) creates database `skyline_audit`, table `audit_events`
(monthly partitions) and two users, passwords generated and saved to `/etc/kolla/audit-proxy/db.env` (proxy) and `maint.env` (retention job), mode 0600:

| User | Grants | Used by |
|---|---|---|
| `audit_app` | `INSERT, SELECT` on `skyline_audit.audit_events` only | the proxy (cannot update or delete) |
| `audit_maint` | `SELECT, INSERT, ALTER, DROP, CREATE, INDEX` on `skyline_audit.*` | daily retention job |

```bash
DRY_RUN=1 ALLOWED_HOST='10.0.29.%' ./scripts/provision-db.sh   # show the SQL, masked, change nothing
ALLOWED_HOST='10.0.29.%' ./scripts/provision-db.sh              # apply
```

## Run

```bash
docker build -t audit-proxy .
docker run -d --name audit-proxy --restart always -p 8788:8788 --env-file /etc/kolla/audit-proxy/db.env \
  -e KEYSTONE_URL=http://10.0.29.10:5000 -e UPSTREAM_API=http://10.0.29.10:9999 \
  -e UPSTREAM_SCHEDULER=http://backup-scheduler:8787 -e UPSTREAM_CINDER=http://10.0.29.10:8776 \
  -e DB_HOST=10.0.29.10 -e AUDIT_INTERNAL_SECRET_FILE=/run/secrets/audit_internal \
  -v /etc/kolla/audit-proxy/internal.secret:/run/secrets/audit_internal:ro audit-proxy
```

Retention (daily, host cron): `docker run --rm --env-file /etc/kolla/audit-proxy/maint.env -e KEYSTONE_URL=http://10.0.29.10:5000 -e DB_HOST=10.0.29.10 audit-proxy node src/maintenance.js`
(adds the next 3 monthly partitions, drops those older than `RETENTION_DAYS`).

Backup scheduler: set `CINDER_URL=http://audit-proxy:8788/upstream/cinder/v3/{project_id}` and the same
`AUDIT_INTERNAL_SECRET` so its automatic backups are recorded as actor `backup-scheduler` (`... (scheduled)`).

Local development / tests use SQLite: `DB_DRIVER=sqlite SQLITE_PATH=./data/audit.sqlite KEYSTONE_URL=... npm start`, `npm test`.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` / `HOST` | `8788` / `0.0.0.0` | listen address |
| `KEYSTONE_URL` | (required) | token validation |
| `UPSTREAM_API` | `http://10.0.29.10:9999` | Skyline API |
| `UPSTREAM_SCHEDULER` | `http://127.0.0.1:8787` | backup-scheduler |
| `UPSTREAM_CINDER` | (empty = route disabled) | Cinder endpoint for `/upstream/cinder/*` |
| `AUDIT_INTERNAL_SECRET[_FILE]` | | shared secret that lets backup-scheduler name itself as actor |
| `DB_DRIVER` | `mariadb` | `mariadb` or `sqlite` |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` | `127.0.0.1` `3306` `skyline_audit` `audit_app` | |
| `DB_PASSWORD[_FILE]` | (required for mariadb) | |
| `DB_MAINT_USER` `DB_MAINT_PASSWORD[_FILE]` | `audit_maint` | maintenance job only |
| `ADMIN_ROLE` | `admin` | role that may read every user's events |
| `RETENTION_DAYS` | `180` | partitions older than this are dropped |
| `BODY_PEEK_BYTES` | `16384` | max JSON body bytes read to name the action |
| `AUDIT_SKIP_REGEX` | | extra paths never audited |

## Read API (`X-Auth-Token` = the user's Keystone token)

`GET /audit-api/events?limit=50&before_id=<id>&action=&user=&project=&service=&outcome=&source=&resource_id=&q=&from=&to=`
returns `{ events, has_more, next_before_id, is_admin }`, newest first. Administrators see everyone; other users only their own events.
`GET /audit-api/health` needs no token.

`POST /audit-api/internal/events` (header `X-Audit-Secret` = `AUDIT_INTERNAL_SECRET`) lets a trusted service report what it did on its own,
e.g. backup-scheduler reports each run and each volume (`Backup Schedule Run (manual|scheduled)`, `Backup Volume (...)`) with outcome
`success`, `partial`, `failed` or `skipped`. These are the results the HTTP proxy cannot see because the run is asynchronous (202).

## Notes and limits

- `202 Accepted` means OpenStack accepted the call, not that the operation finished.
- Only traffic that goes through the console's `/api/` is seen. CLI / Horizon calls straight to OpenStack are not
  (Keystone CADF audit would cover those; not part of this service).
- If audit-proxy is down the console answers 502: run it with `--restart always` and watch `/audit-api/health`.
- Behind nginx the client IP comes from `X-Forwarded-For`; do not expose audit-proxy directly to untrusted clients.
