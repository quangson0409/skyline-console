#!/usr/bin/env bash
# Provision the audit database on the Kolla MariaDB (Galera) cluster. Run ONCE, as root.
#
#   - creates database  skyline_audit  + table audit_events (sql/schema.sql)
#   - creates user      audit_app    : INSERT, SELECT on skyline_audit.audit_events   (used by the proxy)
#   - creates user      audit_maint  : SELECT, INSERT, ALTER, DROP, CREATE, INDEX on skyline_audit.*  (retention job only)
#   - writes ProxySQL user files (proxysql-<user>.yaml) next to the secrets so they can be installed on the
#     controllers: ProxySQL only lets in users it knows (see LL-KOLLA-3 / INC-17)
#
# Two ways to reach MariaDB:
#   * VIP / ProxySQL (when MARIADB_HOST is set, e.g. 10.0.29.10): a throw-away mariadb client container is run
#     with `docker run --network host`, as user $MARIADB_USER (Kolla: root_shard_0) which ProxySQL routes to the writer.
#   * local container (MARIADB_HOST empty): `docker exec` into the Kolla `mariadb` container as root (run on a controller).
#
# Passwords are never printed or put on a command line (MYSQL_PWD is passed through the environment):
#   * the MariaDB root password is read from /etc/kolla/passwords.yml (database_password) or MARIADB_ROOT_PASSWORD_FILE
#   * the two new passwords are generated (openssl) unless AUDIT_APP_PASSWORD / AUDIT_MAINT_PASSWORD are exported;
#     they are written to $SECRETS_DIR (db.env for the proxy, maint.env for the retention job), mode 0600
#
# Usage:  MARIADB_HOST=10.0.29.10 ./provision-db.sh      # apply through ProxySQL
#         DRY_RUN=1 ./provision-db.sh                    # print the SQL with passwords masked, change nothing
set -euo pipefail

MARIADB_HOST="${MARIADB_HOST:-}"
MARIADB_USER="${MARIADB_USER:-root_shard_0}"
MARIADB_CLIENT_IMAGE="${MARIADB_CLIENT_IMAGE:-10.0.29.5:5000/openstack.kolla/mariadb-server:2026.1-ubuntu-noble}"
CONTAINER="${MARIADB_CONTAINER:-mariadb}"
DB_NAME="${DB_NAME:-skyline_audit}"
ALLOWED_HOST="${ALLOWED_HOST:-10.0.29.%}"
SECRETS_DIR="${SECRETS_DIR:-/etc/kolla/audit-proxy}"
PASSWORDS_YML="${PASSWORDS_YML:-/etc/kolla/passwords.yml}"
SCHEMA="${SCHEMA:-$(dirname "$0")/../sql/schema.sql}"
DRY_RUN="${DRY_RUN:-0}"

if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then echo "invalid DB_NAME" >&2; exit 1; fi
if [[ ! "$ALLOWED_HOST" =~ ^[A-Za-z0-9_.%:-]+$ ]]; then echo "invalid ALLOWED_HOST" >&2; exit 1; fi
[[ -r "$SCHEMA" ]] || { echo "schema not found: $SCHEMA" >&2; exit 1; }

if [[ -n "${MARIADB_ROOT_PASSWORD_FILE:-}" ]]; then
  ROOT_PW="$(<"$MARIADB_ROOT_PASSWORD_FILE")"
else
  ROOT_PW="$(awk -F': ' '$1=="database_password"{print $2; exit}' "$PASSWORDS_YML")"
fi
[[ -n "$ROOT_PW" ]] || { echo "cannot read the MariaDB root password" >&2; exit 1; }

gen() { openssl rand -hex 24; }
APP_PW="${AUDIT_APP_PASSWORD:-$(gen)}"
MAINT_PW="${AUDIT_MAINT_PASSWORD:-$(gen)}"

SQL="$(cat <<SQL
$(cat "$SCHEMA")
CREATE USER IF NOT EXISTS 'audit_app'@'${ALLOWED_HOST}'   IDENTIFIED BY '${APP_PW}';
CREATE USER IF NOT EXISTS 'audit_maint'@'${ALLOWED_HOST}' IDENTIFIED BY '${MAINT_PW}';
ALTER USER 'audit_app'@'${ALLOWED_HOST}'   IDENTIFIED BY '${APP_PW}';
ALTER USER 'audit_maint'@'${ALLOWED_HOST}' IDENTIFIED BY '${MAINT_PW}';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'audit_app'@'${ALLOWED_HOST}';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'audit_maint'@'${ALLOWED_HOST}';
GRANT INSERT, SELECT ON \`${DB_NAME}\`.\`audit_events\` TO 'audit_app'@'${ALLOWED_HOST}';
GRANT SELECT, INSERT, ALTER, DROP, CREATE, INDEX ON \`${DB_NAME}\`.* TO 'audit_maint'@'${ALLOWED_HOST}';
FLUSH PRIVILEGES;
SQL
)"

if [[ "$DRY_RUN" == "1" ]]; then
  printf '%s\n' "$SQL" | sed -e "s/${APP_PW}/********/g" -e "s/${MAINT_PW}/********/g"
  exit 0
fi

# SQL goes through stdin, the password through the environment (not argv / ps)
mariadb_client() {
  if [[ -n "$MARIADB_HOST" ]]; then
    MYSQL_PWD="$ROOT_PW" docker run --rm -i --network host -e MYSQL_PWD "$MARIADB_CLIENT_IMAGE" \
      mariadb -h"$MARIADB_HOST" -P3306 -u"$MARIADB_USER"
  else
    MYSQL_PWD="$ROOT_PW" docker exec -i -e MYSQL_PWD "$CONTAINER" mariadb -uroot
  fi
}

printf '%s\n' "$SQL" | mariadb_client

umask 077
mkdir -p "$SECRETS_DIR"
printf 'DB_PASSWORD=%s\n' "$APP_PW" > "$SECRETS_DIR/db.env"
printf 'DB_MAINT_PASSWORD=%s\n' "$MAINT_PW" > "$SECRETS_DIR/maint.env"
# ProxySQL user definitions (same layout as /etc/kolla/proxysql/users/hotswap_v3.yaml)
for u in audit_app:"$APP_PW" audit_maint:"$MAINT_PW"; do
  name="${u%%:*}"; pw="${u#*:}"
  cat > "$SECRETS_DIR/proxysql-$name.yaml" <<YAML
mysql_users:
  - username: "$name"
    password: "$pw"
    default_hostgroup: 0
    transaction_persistent: 1
    active: 1
YAML
done
echo "OK: database ${DB_NAME}, users audit_app / audit_maint (host ${ALLOWED_HOST})"
echo "secrets (0600) in ${SECRETS_DIR}: db.env maint.env proxysql-audit_app.yaml proxysql-audit_maint.yaml"

echo "--- grants ---"
printf "SHOW GRANTS FOR 'audit_app'@'%s';\nSHOW GRANTS FOR 'audit_maint'@'%s';\n" "$ALLOWED_HOST" "$ALLOWED_HOST" | mariadb_client
