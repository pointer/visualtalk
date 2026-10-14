#!/usr/bin/env bash
# ensure-ios-toolchain.sh — Install the Rust toolchain pieces Tauri iOS needs.
#
# WHY THIS EXISTS
# On Xcode 27 (Swift 6.4) SwiftPM's default "Swift Build" system gives non-`public`
# @_cdecl functions LOCAL visibility in the *release* configuration. `nm` shows them
# as 't' instead of 'T', so the Rust link step dies with:
#
#   error: linking with `cc` failed: exit status: 1
#   Undefined symbols for architecture arm64:
#     "_register_plugin", "_log_stdout", "_init_plugin_opener", ...
#
# swift-rs 1.0.8 mitigates this by re-globalizing those symbols with `llvm-objcopy`
# from rustup's `llvm-tools` component. But `llvm-tools` is NOT installed by
# default, and when it is absent swift-rs emits only a `cargo:warning` and gives up
# silently — leaving the link broken.
#
# Installing it is verified to cut the undefined-symbol list from 9 to 3 on this
# repo (the remaining 3 live in SwiftRs.o, which swift-rs's own-member-only guard
# skips — see scripts/ios-build.sh).
#
# Upstream https://github.com/tauri-apps/tauri/issues/16130 is now FIXED in the
# `tauri` 2.12.3 crate (tauri-apps/tauri#16246), so a true release link no longer
# depends on this component. It is still checked/installed because the cost is
# trivial and it keeps builds working if the crate is ever pinned back below
# 2.12.3.
#
# Usage:
#   ./scripts/ensure-ios-toolchain.sh          # install whatever is missing
#   ./scripts/ensure-ios-toolchain.sh --check  # report only, exit 1 if missing
#   ./scripts/ensure-ios-toolchain.sh --help

set -euo pipefail

CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check)   CHECK_ONLY=1 ;;
    -h|--help) awk 'NR>1 && /^#/ { sub(/^#[[:space:]]?/, ""); print; next }
                   NR>1 { exit }' "$0"; exit 0 ;;
    *)         echo "❌ Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

MISSING=0

# ---------------------------------------------------------------------------
# rustup's llvm-tools component (provides llvm-objcopy for swift-rs)
# ---------------------------------------------------------------------------
if ! command -v rustup >/dev/null 2>&1; then
  echo "❌ rustup not found — install it from https://rustup.rs"
  exit 1
fi

HOST="$(rustc -vV | awk '/^host:/ { print $2 }')"
SYSROOT="$(rustc --print sysroot)"
OBJCOPY="$SYSROOT/lib/rustlib/$HOST/bin/llvm-objcopy"

if [ -x "$OBJCOPY" ]; then
  echo "✅ llvm-tools installed ($HOST)."
else
  MISSING=1
  echo "⚠️  rustup component 'llvm-tools' is missing."
  echo "   Without it swift-rs cannot re-globalize the @_cdecl symbols that"
  echo "   Xcode 27 internalizes, so iOS builds fail to link."
  if [ "$CHECK_ONLY" -eq 1 ]; then
    echo "   Install with: rustup component add llvm-tools"
  else
    echo "⚙️  Installing llvm-tools …"
    rustup component add llvm-tools
    if [ -x "$OBJCOPY" ]; then
      echo "✅ Installed llvm-tools → $OBJCOPY"
    else
      echo "❌ Install finished but $OBJCOPY is still missing."
      exit 1
    fi
  fi
fi

# ---------------------------------------------------------------------------
# xcodegen — needed by scripts/fix-ios-project.sh to regenerate the .xcodeproj
# ---------------------------------------------------------------------------
if command -v xcodegen >/dev/null 2>&1; then
  echo "✅ xcodegen installed."
else
  MISSING=1
  echo "⚠️  xcodegen not found — install with: brew install xcodegen"
  echo "   'tauri ios init' generates project.yml; xcodegen turns it into"
  echo "   visualtalk.xcodeproj, which fix-ios-project.sh needs to re-patch."
fi

if [ "$CHECK_ONLY" -eq 1 ] && [ "$MISSING" -ne 0 ]; then
  exit 1
fi
