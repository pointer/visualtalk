#!/usr/bin/env python3
"""Build an optimized development-profile iOS app for on-device iteration.

Release and store builds should use ``pnpm ios:build:release`` or
``pnpm ios:build:store`` instead.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main(args: list[str]) -> int:
    if args and args[0] in ("-h", "--help"):
        print(__doc__.strip())
        print(
            "\nUsage:\n"
            "  python3 scripts/ios-build.py                      # optimized build, debugging export\n"
            "  python3 scripts/ios-build.py --open               # extra flags pass through to tauri\n"
            "  python3 scripts/ios-build.py --export-method release-testing\n"
            "  python3 scripts/ios-build.py -- --features e2ee   # Pro/E2EE (run setup-pro.py first)"
        )
        return 0

    subprocess.run([sys.executable, str(ROOT / "scripts/ensure-ios-toolchain.py")], check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts/sync-ios-icons.py")], check=True)

    env = os.environ.copy()
    env["CARGO_PROFILE_DEV_OPT_LEVEL"] = "3"
    env["CARGO_PROFILE_DEV_DEBUG"] = "line-tables-only"
    env["CARGO_PROFILE_DEV_DEBUG_ASSERTIONS"] = "false"
    env["CARGO_PROFILE_DEV_OVERFLOW_CHECKS"] = "false"

    export_args = ["--export-method", "debugging"]
    if any(arg == "--export-method" or arg.startswith("--export-method=") for arg in args):
        export_args = []

    command = ["pnpm", "tauri", "ios", "build", "--debug", *export_args, *args]
    print("⚙️  Building iOS (optimized dev profile — Xcode 27 workaround) …", flush=True)
    try:
        os.chdir(ROOT)
        env["PWD"] = str(ROOT)
        os.execvpe(command[0], command, env)
    except FileNotFoundError:
        print("❌ pnpm not found; install pnpm and ensure it is on PATH.", file=sys.stderr)
        return 127
    except OSError as error:
        print(f"❌ Could not start pnpm: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
