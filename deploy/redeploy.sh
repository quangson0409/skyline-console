  #!/usr/bin/env bash
  # Rebuild and restart the console stack on the lab deployment node (see deploy/README.md, section 6).
  # Run from the root of the repository (Git Bash / Linux / macOS). Needs SSH access to the node; no Docker on this machine.
  #
  #   deploy/redeploy.sh                       # test, upload, build and restart all three services
  #   deploy/redeploy.sh console               # only the console (UI changes)
  #   deploy/redeploy.sh backup-scheduler audit-proxy
  #   SKIP_TESTS=1 deploy/redeploy.sh          # skip the local test run
  #   HOST=root@10.0.29.5 REMOTE_DIR=/opt/skyline-console-new deploy/redeploy.sh
  #
  # Nothing secret is read or sent: passwords live in /etc/kolla/audit-proxy on the node (compose env_file).
  set -euo pipefail

  HOST="${HOST:-root@10.0.29.5}"
  REMOTE_DIR="${REMOTE_DIR:-/opt/skyline-console-new}"
  REGISTRY="${REGISTRY:-10.0.29.5:5000}"
  COMPOSE="docker compose -f docker-compose.lab.yml"
  SSH="ssh -o BatchMode=yes"

  declare -A TAG=( [audit-proxy]=1.0.0 [backup-scheduler]=1.0.0 [console]=2.0.0 )
  TARGETS=("$@")
  [[ ${#TARGETS[@]} -gt 0 ]] || TARGETS=(audit-proxy backup-scheduler console)
  for t in "${TARGETS[@]}"; do [[ -n "${TAG[$t]:-}" ]] || { echo "unknown service: $t (audit-proxy | backup-scheduler | console)" >&2; exit 1; }; done
  has() { local x; for x in "${TARGETS[@]}"; do [[ "$x" == "$1" ]] && return 0; done; return 1; }

  [[ -f package.json && -d audit-proxy && -d backup-scheduler && -f deploy/docker-compose.lab.yml ]] \
    || { echo "run this from the repository root" >&2; exit 1; }

  echo "== 1/5 local checks"
  if [[ "${SKIP_TESTS:-0}" != "1" ]]; then
    has audit-proxy       && (cd audit-proxy && node --test >/dev/null && echo "audit-proxy tests ok")
    has backup-scheduler  && (cd backup-scheduler && node --test >/dev/null && echo "backup-scheduler tests ok")
    has console           && { npx vite build --outDir "${TMPDIR:-/tmp}/skybuild" --emptyOutDir >/dev/null && echo "console builds"; }
  fi
  # nginx.conf must not start with a UTF-8 BOM (nginx refuses it: unknown directive "server")
  if has console && [[ "$(head -c 3 nginx.conf | od -An -tx1 | tr -d ' ')" == "efbbbf" ]]; then
    echo "nginx.conf has a BOM; remove it first" >&2; exit 1
  fi

  echo "== 2/5 upload to ${HOST}:${REMOTE_DIR}"
  $SSH "$HOST" "mkdir -p '$REMOTE_DIR'"
  scp -q -o BatchMode=yes deploy/docker-compose.lab.yml "$HOST:$REMOTE_DIR/docker-compose.lab.yml"
  dirs=()
  has audit-proxy      && dirs+=(audit-proxy)
  has backup-scheduler && dirs+=(backup-scheduler)
  if [[ ${#dirs[@]} -gt 0 ]]; then
    tar --exclude=node_modules --exclude=data --exclude='*.sqlite' -cf - "${dirs[@]}" | $SSH "$HOST" "tar -xf - -C '$REMOTE_DIR'"
  fi
  if has console; then
    tar --exclude=node_modules --exclude=dist --exclude=audit-proxy --exclude=backup-scheduler --exclude=.git \
        --exclude=scripts/.real.mjs --exclude=docs --exclude=mockups --exclude=deploy -cf - . \
      | $SSH "$HOST" "rm -rf '$REMOTE_DIR/console' && mkdir -p '$REMOTE_DIR/console' && tar -xf - -C '$REMOTE_DIR/console'"
  fi

  echo "== 3/5 build images on the node"
  for t in "${TARGETS[@]}"; do
    $SSH "$HOST" "cd '$REMOTE_DIR' && docker build -q -t '$REGISTRY/skyline/$t:${TAG[$t]}' '$t'"
  done

  echo "== 4/5 restart"
  $SSH "$HOST" "cd '$REMOTE_DIR' && $COMPOSE config -q && $COMPOSE up -d"

  echo "== 5/5 health"
  $SSH "$HOST" "cd '$REMOTE_DIR'; for s in audit-proxy backup-scheduler; do
      c=\$($COMPOSE ps -q \$s); for i in \$(seq 1 40); do
        [ \"\$(docker inspect -f '{{.State.Health.Status}}' \$c)\" = healthy ] && break; sleep 2; done
      echo \"\$s: \$(docker inspect -f '{{.State.Health.Status}}' \$c)\"; done
    $COMPOSE ps --format '{{.Name}} {{.Status}}'
    curl -s -o /dev/null -w 'console           %{http_code}\n' http://127.0.0.1:8080/
    curl -s -o /dev/null -w 'scheduler-health  %{http_code}\n' http://127.0.0.1:8080/scheduler-api/health
    printf 'audit-health       '; curl -s http://127.0.0.1:8080/audit-api/health; echo"
  echo "done. In the browser press Ctrl+F5 to drop the cached JavaScript."
