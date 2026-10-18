#!/usr/bin/env bash
# livekit-local.sh — run VisualTalk's self-hosted local LiveKit stack.
#
#   ./scripts/livekit-local.sh up                  # signalling + media
#   ./scripts/livekit-local.sh up --recording      # + egress (server-side recording)
#   ./scripts/livekit-local.sh creds               # what to paste into Settings -> LiveKit
#   ./scripts/livekit-local.sh smoke --recording   # end-to-end test incl. a real recording
#   ./scripts/livekit-local.sh status | logs | restart | down
#
# Everything lives in docker/: docker-compose.yml (bridge networking, default),
# compose.host.yml (--host: host networking + the full UDP range), livekit.yaml,
# egress.yaml and .env — created from .env.example on first run with a random API
# key pair, and git-ignored. Every tunable is documented inline in
# docker/.env.example; `--help` lists all commands.
#
# Bash 3.2 compatible (macOS default) — no bash 4 features.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_DIR="$REPO_ROOT/docker"
ENV_FILE="$DOCKER_DIR/.env"
ENV_EXAMPLE="$DOCKER_DIR/.env.example"

SERVER_CONTAINER="visualtalk-livekit"
EGRESS_CONTAINER="visualtalk-egress"
RECORDINGS_DIR="$DOCKER_DIR/recordings"

COMPOSE_FILES=(-f "$DOCKER_DIR/docker-compose.yml")
PROFILE_ARGS=()
EXTRA_ARGS=()
RECORDING=0
HOST_NET=0

# Smoke-test state (globals on purpose: the EXIT trap outlives cmd_smoke).
SMOKE_PID=""
SMOKE_ROOM=""
SMOKE_LOG=""
SMOKE_KEY=""
SMOKE_SECRET=""
SMOKE_HTTP=""


# ── output ───────────────────────────────────────────────────────────────────

log()  { printf '[livekit] %s\n' "$*"; }
warn() { printf '[livekit] WARN: %s\n' "$*" >&2; }
die()  { printf '[livekit] ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: scripts/livekit-local.sh <command> [--recording] [--host]

Commands:
  up        Create docker/.env if needed, start the stack, wait until the server
            is healthy, and print the URL / API key / API secret for VisualTalk.
  down      Stop and remove the containers (recordings on disk are kept).
  restart   Recreate the containers, picking up docker/*.yaml and docker/.env edits.
  status    Container states, active recordings, files in the recordings directory.
  logs      Tail container logs. Extra args go to `docker compose logs`
            (e.g. `logs -f egress`, `logs --tail 500 livekit`).
  creds     Print the connection details again (starts nothing).
  smoke     End-to-end check with the `lk` CLI: publishes a demo participant,
            verifies it becomes active, and with --recording also records the room
            and verifies the .mp4 lands in the recordings directory.

Flags:
  --recording, -r   Include the egress service (compose profile "recording").
                    Server-side recording is heavy (a whole compositor), so the
                    egress container is opt-in.
  --host            Also apply docker/compose.host.yml (host networking, full UDP
                    port range). Needs LIVEKIT_NODE_IP set to this machine's LAN
                    IP, and Docker Desktop >= 4.34 with host networking enabled.
  -h, --help        This text.

Examples:
  scripts/livekit-local.sh up --recording
  scripts/livekit-local.sh smoke --recording
  scripts/livekit-local.sh logs -f egress
EOF
}

# ── plumbing ─────────────────────────────────────────────────────────────────

require_docker() {
  command -v docker >/dev/null 2>&1 || die "docker not found in PATH"
  docker info >/dev/null 2>&1 \
    || die "cannot reach the Docker daemon - start Docker Desktop (or dockerd) first"
  docker compose version >/dev/null 2>&1 \
    || die "'docker compose' v2 is required (standalone docker-compose v1 is not)"
}

compose() {
  docker compose "${COMPOSE_FILES[@]}" ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"} "$@"
}

# Export docker/.env into this shell so values can be printed and validated.
load_env() {
  [ -f "$ENV_FILE" ] || return 0
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
}
# First run: copy .env.example and replace the placeholder credentials with a
# random pair (>= 32 chars, no ':' or '#' - livekit-server parses them as YAML).
ensure_env() {
  [ -f "$ENV_FILE" ] && return 0
  [ -f "$ENV_EXAMPLE" ] || die "missing $ENV_EXAMPLE"
  command -v openssl >/dev/null 2>&1 \
    || die "openssl is needed to generate an API key pair (or copy docker/.env.example to docker/.env yourself)"

  local key secret tmp
  key="vt-$(openssl rand -hex 4)"
  secret="$(openssl rand -hex 32)"
  tmp="$(mktemp)"
  awk -v k="$key" -v s="$secret" '
    /^LIVEKIT_API_KEY=/    { print "LIVEKIT_API_KEY=" k;    next }
    /^LIVEKIT_API_SECRET=/ { print "LIVEKIT_API_SECRET=" s; next }
    { print }
  ' "$ENV_EXAMPLE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log "created docker/.env with a fresh API key pair (key: $key)"
}

# Resolve LIVEKIT_RECORDINGS_DIR (relative paths resolve against docker/, exactly
# like docker compose does) and make sure egress can write there.
ensure_recordings_dir() {
  local dir="${LIVEKIT_RECORDINGS_DIR:-./recordings}"
  case "$dir" in
    /*) ;;
    *)  dir="$DOCKER_DIR/${dir#./}" ;;
  esac
  RECORDINGS_DIR="$dir"
  mkdir -p "$RECORDINGS_DIR"

  # The egress image runs as uid 1001 and writes into the bind mount directly.
  # Docker Desktop (macOS/Windows) maps ownership for us; Linux does not.
  if [ "$(uname -s)" = "Linux" ]; then
    local owner
    owner="$(stat -c '%u' "$RECORDINGS_DIR" 2>/dev/null || echo unknown)"
    if [ "$owner" != "1001" ]; then
      warn "egress runs as uid 1001 but $RECORDINGS_DIR is owned by uid $owner."
      warn "if recordings fail with a permission error:  sudo chown -R 1001:0 '$RECORDINGS_DIR'"
    fi
  fi
}

# Fail fast on the docker/.env combinations that cannot possibly work.
sanity_check_env() {
  local bind="${LIVEKIT_BIND_ADDR:-127.0.0.1}"
  local ip="${LIVEKIT_NODE_IP:-}"
  local key="${LIVEKIT_API_KEY:-}"
  local secret="${LIVEKIT_API_SECRET:-}"

  [ -n "$key" ] && [ -n "$secret" ] \
    || die "LIVEKIT_API_KEY / LIVEKIT_API_SECRET are empty in docker/.env"
  [ "${#secret}" -ge 32 ] \
    || die "LIVEKIT_API_SECRET must be at least 32 characters (livekit-server refuses shorter ones)"
  case "$key" in *":"*|*"#"*) die "LIVEKIT_API_KEY may not contain ':' or '#' (parsed as YAML)" ;; esac
  case "$secret" in *":"*|*"#"*) die "LIVEKIT_API_SECRET may not contain ':' or '#' (parsed as YAML)" ;; esac

  if [ -z "$ip" ]; then
    warn "LIVEKIT_NODE_IP is empty: livekit-server will auto-detect an interface, which on a"
    warn "laptop with VPN/Docker adapters often picks the wrong one. Set it explicitly."
  elif [ "$bind" != "127.0.0.1" ] && [ "$ip" = "127.0.0.1" ]; then
    die "LIVEKIT_BIND_ADDR=$bind exposes the server to your LAN, but LIVEKIT_NODE_IP=127.0.0.1
       would be advertised to remote clients as the ICE candidate - they can never connect.
       Set LIVEKIT_NODE_IP to this machine's LAN IP (macOS: ipconfig getifaddr en0)."
  fi

  if [ "$HOST_NET" = "1" ] && { [ -z "$ip" ] || [ "$ip" = "127.0.0.1" ]; }; then
    die "--host (host networking) advertises LIVEKIT_NODE_IP verbatim to clients, so it must
       be a real interface address of this machine, not empty and not 127.0.0.1
       (unless every client runs on this same machine)."
  fi
}

# The address clients on this machine use; in LAN mode it is the LAN IP, because
# that is what the server advertises as its ICE candidate.
server_url() { printf 'ws://%s:%s' "${LIVEKIT_NODE_IP:-127.0.0.1}" "${LIVEKIT_PORT:-7880}"; }
http_url()   { printf 'http://%s:%s' "${LIVEKIT_NODE_IP:-127.0.0.1}" "${LIVEKIT_PORT:-7880}"; }

wait_healthy() {
  local name="$1" limit="${2:-90}" i state
  for i in $(seq 1 "$limit"); do
    state="$(docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
      "$name" 2>/dev/null || echo missing)"
    case "$state" in
      healthy|running) return 0 ;;
      exited|dead)     die "$name is '$state' - see: $0 logs" ;;
    esac
    sleep 1
  done
  die "$name did not become healthy within ${limit}s - see: $0 logs"
}

print_info() {
  cat <<EOF

  ── VisualTalk ▸ Settings ▸ LiveKit ────────────────────────────────
    URL:        $(server_url)
    API key:    ${LIVEKIT_API_KEY:-}
    API secret: ${LIVEKIT_API_SECRET:-}
  ───────────────────────────────────────────────────────────────────
  Recordings land in: $RECORDINGS_DIR
  Server-side recording: $([ "$RECORDING" = 1 ] \
    && echo "on (egress running)" \
    || echo "off - restart with '$0 up --recording' to enable it")
  Logs: $0 logs [-f] [livekit|egress|redis]
EOF
}

# ── commands ─────────────────────────────────────────────────────────────────

cmd_up() {
  require_docker
  ensure_env
  load_env
  sanity_check_env
  ensure_recordings_dir

  local mode="recording off"
  if [ "$RECORDING" = 1 ]; then mode="recording on"; fi
  if [ "$HOST_NET" = 1 ]; then mode="$mode, host networking"; fi
  log "starting the stack ($mode)"
  compose up -d
  wait_healthy "$SERVER_CONTAINER" 120

  if [ "$RECORDING" = 1 ]; then
    wait_healthy "$EGRESS_CONTAINER" 60
    # egress has no healthcheck: it logs "service ready" once PSRPC is listening.
    local i ready=""
    for i in $(seq 1 30); do
      if docker logs "$EGRESS_CONTAINER" 2>&1 | grep -q 'service ready'; then
        ready=1
        break
      fi
      sleep 1
    done
    if [ -z "$ready" ]; then
      warn "egress has not logged 'service ready' yet - check: $0 logs egress"
    fi
  fi

  compose ps
  print_info
}

cmd_down() {
  require_docker
  compose down --remove-orphans
  log "stopped. Recordings on disk are untouched (see: $0 status)."
}

cmd_restart() {
  require_docker
  ensure_env
  load_env
  sanity_check_env
  ensure_recordings_dir
  log "recreating containers (picks up docker/*.yaml and docker/.env edits)"
  compose up -d --force-recreate
  wait_healthy "$SERVER_CONTAINER" 120
  compose ps
  print_info
}

cmd_status() {
  require_docker
  load_env
  ensure_recordings_dir
  compose ps
  echo
  if docker ps --format '{{.Names}}' | grep -qx "$EGRESS_CONTAINER"; then
    if command -v lk >/dev/null 2>&1; then
      log "recordings known to the server (newest last):"
      lk egress list --url "$(http_url)" \
        --api-key "${LIVEKIT_API_KEY:-}" --api-secret "${LIVEKIT_API_SECRET:-}" 2>/dev/null \
        | tail -6 || true
    fi
  else
    log "egress is not running (enable with: $0 up --recording)"
  fi
  log "files in $RECORDINGS_DIR:"
  ls -lht "$RECORDINGS_DIR" 2>/dev/null | head -8 || true
}

cmd_logs() {
  require_docker
  compose logs --tail 200 ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
}

cmd_creds() {
  # Creates docker/.env on a fresh clone (nothing is started).
  ensure_env
  load_env
  ensure_recordings_dir
  print_info
}

# Full end-to-end check: signalling -> media -> (optional) a real recording.
# Needs the `lk` CLI; uses a throwaway room that is deleted afterwards.
#
# The EXIT trap below must not use `local` state: locals are already gone when
# the trap fires after this function returns, which under `set -u` would abort
# the cleanup. Hence the SMOKE_* globals.
smoke_cleanup() {
  if [ -n "${SMOKE_PID:-}" ]; then
    kill "$SMOKE_PID" >/dev/null 2>&1 || true
    wait "$SMOKE_PID" 2>/dev/null || true
  fi
  if [ -n "${SMOKE_LOG:-}" ]; then rm -f "$SMOKE_LOG"; fi
  if [ -n "${SMOKE_ROOM:-}" ] && command -v lk >/dev/null 2>&1; then
    lk room delete "$SMOKE_ROOM" --url "${SMOKE_HTTP:-}" \
      --api-key "${SMOKE_KEY:-}" --api-secret "${SMOKE_SECRET:-}" >/dev/null 2>&1 || true
  fi
}

cmd_smoke() {
  require_docker
  load_env
  ensure_recordings_dir
  command -v lk >/dev/null 2>&1 \
    || die "the 'lk' CLI is required for the smoke test (brew install livekit/tap/livekit-cli)"
  docker ps --format '{{.Names}}' | grep -qx "$SERVER_CONTAINER" \
    || die "the server is not running - start it with: $0 up --recording"

  SMOKE_KEY="${LIVEKIT_API_KEY:-}"
  SMOKE_SECRET="${LIVEKIT_API_SECRET:-}"
  SMOKE_HTTP="$(http_url)"
  SMOKE_ROOM="vt-smoke-$(date +%s)"
  SMOKE_LOG="$(mktemp)"
  SMOKE_PID=""
  trap smoke_cleanup EXIT

  local ws out i egress_id="" file="" host_file=""
  ws="$(server_url)"

  log "1/3 publishing a demo participant into '$SMOKE_ROOM' via $ws"
  lk room join --url "$ws" --api-key "$SMOKE_KEY" --api-secret "$SMOKE_SECRET" \
    --identity smoke-pub --room "$SMOKE_ROOM" --publish-demo > "$SMOKE_LOG" 2>&1 &
  SMOKE_PID=$!
  sleep 10
  if ! kill -0 "$SMOKE_PID" 2>/dev/null; then
    cat "$SMOKE_LOG"
    die "the demo publisher exited early - see its output above"
  fi

  log "2/3 verifying the participant joined and is active"
  out="$(lk room participants list "$SMOKE_ROOM" --url "$SMOKE_HTTP" \
    --api-key "$SMOKE_KEY" --api-secret "$SMOKE_SECRET" 2>&1 || true)"
  printf '%s\n' "$out" | grep -v 'Using api-key' | sed 's/^/    /'
  printf '%s' "$out" | grep -q 'smoke-pub' \
    || die "smoke-pub is not in the room - signalling or media failed"

  if ! docker ps --format '{{.Names}}' | grep -qx "$EGRESS_CONTAINER"; then
    warn "3/3 skipped: egress is not running (start it with: $0 up --recording)"
    log "smoke test passed (signalling + media)"
    return 0
  fi

  file="/recordings/smoke-$(date +%s).mp4"
  host_file="$RECORDINGS_DIR/$(basename "$file")"
  log "3/3 recording the room (grid layout) to $file"
  out="$(lk egress start --type room-composite --url "$SMOKE_HTTP" \
    --api-key "$SMOKE_KEY" --api-secret "$SMOKE_SECRET" \
    "{\"room_name\":\"$SMOKE_ROOM\",\"layout\":\"grid\",\"file_outputs\":[{\"filepath\":\"$file\",\"file_type\":\"MP4\"}]}" 2>&1)" \
    || die "lk egress start failed: $out"
  egress_id="$(printf '%s' "$out" | grep -o 'EG_[A-Za-z0-9]*' | head -1)"
  if [ -z "$egress_id" ]; then die "no egress ID in the response: $out"; fi
  log "    $egress_id started - recording for 20s"
  sleep 20
  lk egress stop --id "$egress_id" --url "$SMOKE_HTTP" \
    --api-key "$SMOKE_KEY" --api-secret "$SMOKE_SECRET" >/dev/null 2>&1 || true
  log "    waiting for the file to be finalised"
  for i in $(seq 1 40); do
    if [ -s "$host_file" ]; then break; fi
    sleep 1
  done

  if [ -s "$host_file" ]; then
    log "recording OK: $host_file ($(du -h "$host_file" | cut -f1 | tr -d ' '))"
    if command -v ffprobe >/dev/null 2>&1; then
      ffprobe -v error -show_entries stream=codec_name,width,height \
        -show_entries format=duration -of default=noprint_wrappers=1 "$host_file" | sed 's/^/    /'
    fi
    log "smoke test passed (signalling + media + recording)"
    return 0
  fi

  warn "no recording appeared at $host_file"
  lk egress list --url "$SMOKE_HTTP" --api-key "$SMOKE_KEY" --api-secret "$SMOKE_SECRET" 2>/dev/null \
    | grep "$egress_id" | sed 's/^/    /' || true
  docker logs --tail 80 "$EGRESS_CONTAINER" 2>&1 \
    | grep -iE 'error|abort|failed' | tail -6 | sed 's/^/    /' || true
  warn "common causes:"
  warn "  1. egress could not negotiate media with the server - rtc.use_mdns must"
  warn "     stay 'true' in docker/livekit.yaml (Chrome hides its host candidate otherwise)"
  warn "  2. docker/recordings was deleted while the stack was running (stale inode) -"
  warn "     fix with: $0 restart --recording"
  die "smoke test FAILED at the recording step - full logs: $0 logs egress"
}

# ── dispatch ─────────────────────────────────────────────────────────────────

main() {
  local cmd
  if [ $# -eq 0 ]; then
    cmd="help"
  else
    case "$1" in
      -h|--help) cmd="help"; shift ;;
      # Flags before the command (`--recording up`) - default to `up`.
      -*)        cmd="up" ;;
      *)         cmd="$1"; shift ;;
    esac
  fi

  while [ $# -gt 0 ]; do
    case "$1" in
      --recording|-r)
        RECORDING=1
        PROFILE_ARGS[0]="--profile"
        PROFILE_ARGS[1]="recording"
        ;;
      --host)
        HOST_NET=1
        COMPOSE_FILES[${#COMPOSE_FILES[@]}]="-f"
        COMPOSE_FILES[${#COMPOSE_FILES[@]}]="$DOCKER_DIR/compose.host.yml"
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        EXTRA_ARGS[${#EXTRA_ARGS[@]}]="$1"
        ;;
    esac
    shift
  done

  case "$cmd" in
    up)          cmd_up ;;
    down|stop)   cmd_down ;;
    restart)     cmd_restart ;;
    status|ps)   cmd_status ;;
    logs)        cmd_logs ;;
    creds|info)  cmd_creds ;;
    smoke|test)  cmd_smoke ;;
    help)        usage ;;
    *)           usage; echo; die "unknown command: $cmd" ;;
  esac
}

main "$@"
