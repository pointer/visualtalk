#!/usr/bin/env bash
# setup-pro.sh — Prepare the codebase for a VisualTalk Pro (E2EE) build.
#
# Usage:
#   ./scripts/setup-pro.sh          # Copy real e2ee.rs into place
#   ./scripts/setup-pro.sh --check  # Verify pro build readiness
#   ./scripts/setup-pro.sh --revert # Restore the community stub
#
# This script must be run before any `*:pro` build command.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STUB="$REPO_ROOT/src-tauri/src/e2ee.rs"
PRO_SRC="$REPO_ROOT/src-tauri/e2ee-pro/e2ee.rs"
BACKUP="$REPO_ROOT/src-tauri/src/e2ee.rs.community-backup"

check() {
  if [ ! -f "$REPO_ROOT/src-tauri/tauri.pro.conf.json" ]; then
    echo "❌ Pro identity overlay missing: src-tauri/tauri.pro.conf.json"
    exit 1
  fi
  if [ ! -f "$REPO_ROOT/src-tauri/Info-pro.plist" ]; then
    echo "❌ Pro Info.plist variant missing: src-tauri/Info-pro.plist"
    exit 1
  fi
  if [ ! -f "$PRO_SRC" ]; then
    echo "❌ Pro E2EE source not found at: $PRO_SRC"
    echo "   Ensure the private e2ee-pro submodule is initialized:"
    echo "     git submodule update --init --recursive"
    exit 1
  fi
  if ! grep -q "^\[features\]" "$REPO_ROOT/src-tauri/Cargo.toml"; then
    echo "❌ Cargo.toml missing [features] section with e2ee feature."
    exit 1
  fi
  # Verify the INSTALLED implementation, not just that the Pro source exists.
  # Marker: only the Pro implementation imports the AES-256-GCM cipher; the
  # community stub contains no crypto imports at all.
  if grep -q "Aes256Gcm" "$STUB"; then
    if ! cmp -s "$STUB" "$PRO_SRC"; then
      echo "❌ Installed e2ee.rs is a Pro implementation but DIFFERS from"
      echo "   $PRO_SRC (stale copy or hand edit)."
      echo "   Re-run ./scripts/setup-pro.sh to sync before building."
      exit 1
    fi
    echo "✅ Installed e2ee.rs is the Pro implementation, in sync with e2ee-pro/."
  else
    echo "❌ Installed src/e2ee.rs is the COMMUNITY STUB (no Pro crypto markers)."
    echo "   Run ./scripts/setup-pro.sh before any *:pro build."
    exit 1
  fi
  echo "✅ Pro build is ready."
}

setup() {
  if [ ! -f "$PRO_SRC" ]; then
    echo "❌ Pro E2EE source not found at: $PRO_SRC"
    echo "   See src-tauri/e2ee-pro/README for setup instructions."
    exit 1
  fi

  # Back up the community stub if not already backed up
  if [ ! -f "$BACKUP" ]; then
    cp "$STUB" "$BACKUP"
    echo "📦 Backed up community stub → e2ee.rs.community-backup"
  fi

  # Replace stub with real implementation
  cp "$PRO_SRC" "$STUB"
  echo "🔐 Installed Pro E2EE implementation → src/e2ee.rs"
  echo "🏷️  Pro identity overlay: src-tauri/tauri.pro.conf.json (merged by the *:pro scripts)"
  echo ""
  echo "You can now build with:"
  echo "  pnpm desktop:build:pro"
  echo "  pnpm android:build:pro"
  echo "  pnpm ios:build:pro"
  echo "  etc."
}

revert() {
  if [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$STUB"
    rm "$BACKUP"
    echo "♻️  Restored community stub → src/e2ee.rs"
  else
    echo "⚠️  No backup found. The stub may already be in place."
  fi
}

case "${1:-}" in
  --check)  check ;;
  --revert) revert ;;
  *)        setup ;;
esac