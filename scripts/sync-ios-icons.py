#!/usr/bin/env python3
"""Sync generated iOS app icons into the Tauri asset catalog."""

import argparse
import hashlib
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "src-tauri/icons/ios"
DEST_DIR = ROOT / "src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report drift without copying")
    args = parser.parse_args()

    if not SRC_DIR.is_dir():
        print(f"❌ {SRC_DIR} not found.")
        print("   Generate the per-platform icons first: pnpm tauri icon src-tauri/icons/icon.png")
        return 1

    if not DEST_DIR.is_dir():
        print(f"ℹ️  {DEST_DIR} not found — iOS project not initialized.")
        print("   Run 'pnpm ios:init'; this sync is hooked into it.")
        return 0

    stale = [
        src.name
        for src in SRC_DIR.glob("*.png")
        if not (DEST_DIR / src.name).is_file()
        or sha256(src) != sha256(DEST_DIR / src.name)
    ]

    if not stale:
        print("✅ AppIcon.appiconset is in sync with src-tauri/icons/ios.")
        return 0

    if args.check:
        print(f"⚠️  AppIcon.appiconset has stale icons ({len(stale)} file(s)):")
        for name in stale:
            print(f"     • {name}")
        print("\n   Re-apply with: python3 scripts/sync-ios-icons.py")
        return 1

    for name in stale:
        shutil.copyfile(SRC_DIR / name, DEST_DIR / name)
    print(f"🎨 Synced {len(stale)} icon(s) from src-tauri/icons/ios into AppIcon.appiconset.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
