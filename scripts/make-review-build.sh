#!/usr/bin/env bash
# make-review-build.sh — App Store review build with demo credentials injected.
#
# WHY THIS EXISTS
# VisualTalk is bring-your-own-server: `src-tauri/src/session.rs` deliberately
# fails closed when no LiveKit server is configured, and documents that no
# signing secret may ever be embedded in the binary. That is the right default,
# but it means an App Review reviewer who installs the app cold hits "No LiveKit
# server configured" and cannot exercise a single meeting.
#
# This script produces the one build that is allowed to carry credentials. It
# injects them through VISUALTALK_DEMO_* at compile time (read by `option_env!`
# in src/demo.rs), so:
#
#   * the secret never enters the repository or git history;
#   * every other build — dev, release, CI — contains no credentials at all;
#   * only a build made by this script can reach the demo project.
#
# WHAT YOU ARE ACCEPTING
# Anything compiled into a shipped IPA is recoverable by anyone who runs
# `strings` over it. The credentials in a review build are public for as long as
# that build exists. Therefore:
#
#   1. Use a dedicated LiveKit project with a spend cap, not your main one.
#   2. ROTATE the API key and secret as soon as App Review approves the build.
#
# Usage:
#   ./scripts/make-review-build.sh                 # App Store Connect IPA
#   ./scripts/make-review-build.sh --check         # resolve creds, build nothing
#   ./scripts/make-review-build.sh --features e2ee
#
# Credentials come from the environment if set, otherwise from the LiveKit
# config already saved in Settings → LiveKit:
#   VISUALTALK_DEMO_LIVEKIT_URL / _API_KEY / _API_SECRET

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# The config dir follows the bundle identifier, so derive it rather than
# hardcoding a path that silently breaks if the identifier ever changes.
IDENTIFIER="$(python3 -c 'import json;print(json.load(open("src-tauri/tauri.conf.json"))["identifier"])')"
LIVEKIT_JSON="${HOME}/Library/Application Support/${IDENTIFIER}/livekit.json"

CHECK_ONLY=0
PASSTHROUGH=()
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    *) PASSTHROUGH+=("$arg") ;;
  esac
done

# ---- Resolve credentials ----------------------------------------------------
# Environment wins, so CI can supply a dedicated review project without
# depending on whatever happens to be saved on the build machine.
if [ -z "${VISUALTALK_DEMO_LIVEKIT_URL:-}" ] ||
   [ -z "${VISUALTALK_DEMO_API_KEY:-}" ] ||
   [ -z "${VISUALTALK_DEMO_API_SECRET:-}" ]; then
  if [ ! -f "$LIVEKIT_JSON" ]; then
    echo "error: no demo credentials." >&2
    echo "  Set VISUALTALK_DEMO_LIVEKIT_URL / _API_KEY / _API_SECRET," >&2
    echo "  or configure a server in Settings → LiveKit (expected at:" >&2
    echo "  ${LIVEKIT_JSON})." >&2
    exit 1
  fi
  echo "Reading demo credentials from ${LIVEKIT_JSON}"
  # Emitted as shell assignments and eval'd: keeps the secret out of temp files
  # and out of the process listing.
  eval "$(python3 - "$LIVEKIT_JSON" <<'PY'
import json, shlex, sys
cfg = json.load(open(sys.argv[1]))["livekit_config"]
for env, key in (
    ("VISUALTALK_DEMO_LIVEKIT_URL", "url"),
    ("VISUALTALK_DEMO_API_KEY", "api_key"),
    ("VISUALTALK_DEMO_API_SECRET", "api_secret"),
):
    value = str(cfg.get(key) or "").strip()
    if not value:
        sys.exit(f"error: {key} is empty in {sys.argv[1]}")
    print(f"export {env}={shlex.quote(value)}")
PY
  )"
fi

for var in VISUALTALK_DEMO_LIVEKIT_URL VISUALTALK_DEMO_API_KEY VISUALTALK_DEMO_API_SECRET; do
  if [ -z "${!var}" ]; then
    echo "error: ${var} resolved empty — refusing to build a review IPA that" >&2
    echo "       would only fail at runtime, in front of the reviewer." >&2
    exit 1
  fi
done
export VISUALTALK_DEMO_LIVEKIT_URL VISUALTALK_DEMO_API_KEY VISUALTALK_DEMO_API_SECRET

# Show the key but never the secret: enough to confirm which project this build
# points at, safe to leave in a terminal scrollback or a CI log.
echo "Demo project : ${VISUALTALK_DEMO_LIVEKIT_URL}"
echo "Demo API key : ${VISUALTALK_DEMO_API_KEY}"
echo "Demo secret  : (${#VISUALTALK_DEMO_API_SECRET} chars, not printed)"

if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "OK: credentials resolved. Nothing built (--check)."
  exit 0
fi

# ---- Build ------------------------------------------------------------------
# Matches `pnpm ios:build:store`, with the demo env exported above.
echo
echo "Building App Store Connect IPA with demo credentials…"
# NOTE: ${PASSTHROUGH[@]+...} is required — macOS ships bash 3.2, where
# expanding an empty array as "${PASSTHROUGH[@]}" under `set -u` aborts.
pnpm tauri ios build --export-method app-store-connect \
  ${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}

# ---- Verify the credentials really landed -----------------------------------
# `option_env!` is compile-time, so a stale cargo cache could otherwise yield an
# IPA with no demo project in it — a failure only the reviewer would ever see.
# build.rs declares rerun-if-env-changed for these variables to prevent that;
# this check is the belt to those braces.
APP_BIN="$(find src-tauri/gen/apple/build -type f -name 'visualtalk' -perm +11 2>/dev/null | head -1 || true)"
if [ -n "$APP_BIN" ]; then
  if strings "$APP_BIN" | grep -qF "$VISUALTALK_DEMO_API_KEY"; then
    echo "Verified: demo credentials are present in ${APP_BIN}."
  else
    echo "WARNING: demo API key not found in ${APP_BIN}." >&2
    echo "         The build may have reused a cached object. Retry with:" >&2
    echo "           cargo clean -p visualtalk && $0" >&2
  fi
else
  echo "note: could not locate the built binary to verify — check the IPA manually."
fi

cat <<'EOF'

──────────────────────────────────────────────────────────────────────────────
 REMINDER: the credentials in this IPA are recoverable by anyone who has it.
 Rotate the LiveKit API key and secret once App Review approves the build, and
 do not reuse this IPA for a later submission.
──────────────────────────────────────────────────────────────────────────────
EOF
