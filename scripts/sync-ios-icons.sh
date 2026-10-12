#!/usr/bin/env bash
# sync-ios-icons.sh — Copy the real app icons into the generated iOS asset catalog.
#
# THE PROBLEM
# `tauri ios init` never reads src-tauri/icons/: it renders gen/apple from
# templates embedded in the Tauri CLI binary, whose AppIcon.appiconset ships
# Tauri's default placeholder icons (the yellow/teal logo). Worse, the
# template renderer skips files that already exist (mobile/ios/project.rs:
# `if !path.exists() { create } else { skip }`), so re-running init never
# refreshes them either. Result: the simulator/device keeps showing the
# placeholder icon no matter how often `tauri icon` or `pnpm ios:init` runs.
#
# THE FIX
# `tauri icon` already generates src-tauri/icons/ios/ with exactly the
# filenames AppIcon.appiconset/Contents.json references, so this script
# copies any out-of-date PNG across. Called from fix-ios-project.sh (hooked
# into `pnpm ios:init`) and from ios-build.sh before every build.
#
# Usage:
#   ./scripts/sync-ios-icons.sh           # copy stale icons into the catalog
#   ./scripts/sync-ios-icons.sh --check   # report drift only (exit 1 if any)
#
# Idempotent: running it repeatedly makes no further changes.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$REPO_ROOT/src-tauri/icons/ios"
DEST_DIR="$REPO_ROOT/src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset"

CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check)   CHECK_ONLY=1 ;;
    -h|--help) awk 'NR>1 && /^#/ { sub(/^#[[:space:]]?/, ""); print; next }
                   NR>1 { exit }' "$0"; exit 0 ;;
    *)         echo "❌ Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

if [ ! -d "$SRC_DIR" ]; then
  echo "❌ $SRC_DIR not found."
  echo "   Generate the per-platform icons first: pnpm tauri icon src-tauri/icons/icon.png"
  exit 1
fi

if [ ! -d "$DEST_DIR" ]; then
  # Not an error: the iOS project simply has not been generated yet.
  echo "ℹ️  $DEST_DIR not found — iOS project not initialized."
  echo "   Run 'pnpm ios:init'; this sync is hooked into it."
  exit 0
fi

shopt -s nullglob
stale=()
for src in "$SRC_DIR"/*.png; do
  name="$(basename "$src")"
  dest="$DEST_DIR/$name"
  if [ ! -f "$dest" ] \
     || [ "$(shasum -a 256 "$src"  | awk '{print $1}')" \
       != "$(shasum -a 256 "$dest" | awk '{print $1}')" ]; then
    stale+=("$name")
  fi
done

# NOTE: ${stale[@]+"${stale[@]}"} is required — macOS ships bash 3.2, where
# expanding an empty array as "${stale[@]}" under `set -u` aborts with
# "unbound variable".
if [ "${#stale[@]}" -eq 0 ]; then
  echo "✅ AppIcon.appiconset is in sync with src-tauri/icons/ios."
  exit 0
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "⚠️  AppIcon.appiconset has stale icons (${#stale[@]} file(s)):"
  for name in ${stale[@]+"${stale[@]}"}; do echo "     • $name"; done
  echo ""
  echo "   Re-apply with: ./scripts/sync-ios-icons.sh"
  exit 1
fi

for name in ${stale[@]+"${stale[@]}"}; do
  cp -f "$SRC_DIR/$name" "$DEST_DIR/$name"
done
echo "🎨 Synced ${#stale[@]} icon(s) from src-tauri/icons/ios into AppIcon.appiconset."
