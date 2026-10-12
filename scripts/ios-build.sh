#!/usr/bin/env bash
# ios-build.sh — Build the iOS app on Xcode 27 despite tauri-apps/tauri#16130.
#
# THE PROBLEM
# `tauri ios build` (release) fails to link on Xcode 27 / Swift 6.4:
#
#   error: linking with `cc` failed: exit status: 1
#   Undefined symbols for architecture arm64:
#     "_register_plugin", "_log_stdout", "_retain_object", ...
#
# SwiftPM's default build system internalizes Tauri's non-`public` @_cdecl entry
# points in the release configuration (nm shows 't' instead of 'T'). Debug builds
# are unaffected. Installing rustup's `llvm-tools` lets swift-rs re-globalize most
# of them (9 -> 3 undefined symbols in this repo), but three symbols embedded in
# SwiftRs.o — _retain_object, _release_object, _string_from_bytes — are still
# skipped by swift-rs's own-member-only guard, so a true release link still fails.
#
# THE WORKAROUND (from the upstream report)
# swift-rs picks the Swift configuration from cargo's DEBUG flag, which follows
# whether *debuginfo* is enabled — not opt-level. So building the dev profile with
# debuginfo kept ON compiles Swift in Debug configuration (all @_cdecl symbols
# global -> the link succeeds), while CARGO_PROFILE_DEV_OPT_LEVEL=3 still fully
# optimizes the Rust code. Verified: `cargo build --lib --target aarch64-apple-ios`
# finishes with "dev profile [optimized + debuginfo]".
#
# TRADE-OFF
# Xcode builds the app in its Debug configuration and the IPA is development-signed.
# Rust is optimized; Swift is not. App Store submission needs a true release build,
# which stays blocked until tauri-apps/tauri#16130 is fixed — so `ios:build:release`
# and `ios:build:store` are deliberately left on the real release path.
#
# Usage:
#   ./scripts/ios-build.sh                      # optimized build, debugging export
#   ./scripts/ios-build.sh --open               # extra flags pass through to tauri
#   ./scripts/ios-build.sh --export-method release-testing
#   ./scripts/ios-build.sh -- --features e2ee   # Pro/E2EE (run setup-pro.sh first)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

case "${1:-}" in
  -h|--help) awk 'NR>1 && /^#/ { sub(/^#[[:space:]]?/, ""); print; next }
                 NR>1 { exit }' "$0"; exit 0 ;;
esac

"$REPO_ROOT/scripts/ensure-ios-toolchain.sh"

# `tauri ios init` seeds AppIcon.appiconset with Tauri's placeholder icons and
# never reads src-tauri/icons/ — make sure the real icons are in place before
# xcodebuild compiles the asset catalog.
"$REPO_ROOT/scripts/sync-ios-icons.sh"

# Keep debuginfo ON (so swift-rs builds Swift in Debug configuration) while still
# optimizing the Rust code. Do NOT set CARGO_PROFILE_DEV_DEBUG=0 — that turns DEBUG
# off, Swift is built in release again, and the link fails.
export CARGO_PROFILE_DEV_OPT_LEVEL=3
export CARGO_PROFILE_DEV_DEBUG=line-tables-only
export CARGO_PROFILE_DEV_DEBUG_ASSERTIONS=false
export CARGO_PROFILE_DEV_OVERFLOW_CHECKS=false

# Only default --export-method when the caller did not supply one.
EXPORT_ARGS=(--export-method debugging)
for arg in "$@"; do
  case "$arg" in
    --export-method|--export-method=*) EXPORT_ARGS=() ;;
  esac
done

cd "$REPO_ROOT"
echo "⚙️  Building iOS (optimized dev profile — Xcode 27 workaround) …"
# NOTE: ${EXPORT_ARGS[@]+...} is required — macOS ships bash 3.2, where expanding
# an empty array as "${EXPORT_ARGS[@]}" under `set -u` aborts with
# "unbound variable" (which happens once the caller passes --export-method).
exec pnpm tauri ios build --debug ${EXPORT_ARGS[@]+"${EXPORT_ARGS[@]}"} "$@"
