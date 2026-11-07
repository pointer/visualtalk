#!/usr/bin/env python3
"""Prepare the codebase for a VisualTalk Pro (E2EE) build."""

import argparse
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STUB = ROOT / "src-tauri/src/e2ee.rs"
PRO_SRC = ROOT / "src-tauri/e2ee-pro/e2ee.rs"
BACKUP = ROOT / "src-tauri/src/e2ee.rs.community-backup"


def check() -> int:
    required = (
        (ROOT / "src-tauri/tauri.pro.conf.json", "Pro identity overlay missing: src-tauri/tauri.pro.conf.json"),
        (ROOT / "src-tauri/Info-pro.plist", "Pro Info.plist variant missing: src-tauri/Info-pro.plist"),
        (PRO_SRC, f"Pro E2EE source not found at: {PRO_SRC}"),
    )
    for path, message in required:
        if not path.is_file():
            print(f"❌ {message}")
            if path == PRO_SRC:
                print("   This directory is private and NOT in the public repo.")
                print("   Restore it from your encrypted backup — see the runbook:")
                print("   src-tauri/e2ee-pro/README §2-§3 (source store & restore).")
            return 1

    cargo_toml = ROOT / "src-tauri/Cargo.toml"
    if not cargo_toml.is_file() or "[features]" not in cargo_toml.read_text(encoding="utf-8"):
        print("❌ Cargo.toml missing [features] section with e2ee feature.")
        return 1

    try:
        stub_text = STUB.read_text(encoding="utf-8")
        pro_text = PRO_SRC.read_text(encoding="utf-8")
    except OSError as error:
        print(f"❌ Could not read Pro E2EE source files: {error}", file=sys.stderr)
        return 1

    if "Aes256Gcm" not in stub_text:
        print("❌ Installed src/e2ee.rs is the COMMUNITY STUB (no Pro crypto markers).")
        print("   Run python3 scripts/setup-pro.py before any *:pro build.")
        return 1
    if stub_text != pro_text:
        print("❌ Installed e2ee.rs is a Pro implementation but DIFFERS from")
        print("   src-tauri/e2ee-pro/e2ee.rs (stale copy or hand edit).")
        print("   Re-run python3 scripts/setup-pro.py to sync before building.")
        return 1

    print("✅ Installed e2ee.rs is the Pro implementation, in sync with e2ee-pro/.")
    print("✅ Pro build is ready.")
    return 0


def setup() -> int:
    if not PRO_SRC.is_file():
        print(f"❌ Pro E2EE source not found at: {PRO_SRC}")
        print("   See src-tauri/e2ee-pro/README for setup instructions.")
        return 1
    try:
        if not BACKUP.exists():
            shutil.copy2(STUB, BACKUP)
            print("📦 Backed up community stub → e2ee.rs.community-backup")
        shutil.copy2(PRO_SRC, STUB)
    except OSError as error:
        print(f"❌ Could not install Pro E2EE source: {error}", file=sys.stderr)
        return 1

    print("🔐 Installed Pro E2EE implementation → src/e2ee.rs")
    print("🏷️  Pro identity overlay: src-tauri/tauri.pro.conf.json (merged by the *:pro scripts)")
    print("\nYou can now build with:")
    print("  pnpm desktop:build:pro")
    print("  pnpm android:build:pro")
    print("  pnpm ios:build:pro")
    print("  etc.")
    return 0


def revert() -> int:
    if BACKUP.is_file():
        try:
            shutil.copy2(BACKUP, STUB)
            BACKUP.unlink()
        except OSError as error:
            print(f"❌ Could not restore community stub: {error}", file=sys.stderr)
            return 1
        print("♻️  Restored community stub → src/e2ee.rs")
    else:
        print("⚠️  No backup found. The stub may already be in place.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--check", action="store_true", help="verify Pro build readiness")
    modes.add_argument("--revert", action="store_true", help="restore the saved community stub")
    args = parser.parse_args()
    if args.check:
        return check()
    if args.revert:
        return revert()
    return setup()


if __name__ == "__main__":
    sys.exit(main())
