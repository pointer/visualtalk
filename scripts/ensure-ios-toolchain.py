#!/usr/bin/env python3
"""Check or install the Rust and Xcode tools used by the iOS build."""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def run(*command: str) -> str:
    result = subprocess.run(command, check=True, text=True, capture_output=True)
    return result.stdout


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report missing tools without installing")
    args = parser.parse_args()

    if shutil.which("rustup") is None:
        print("❌ rustup not found — install it from https://rustup.rs")
        return 1

    try:
        host_line = next(line for line in run("rustc", "-vV").splitlines() if line.startswith("host:"))
        host = host_line.split(maxsplit=1)[1]
        sysroot = Path(run("rustc", "--print", "sysroot").strip())
    except (OSError, subprocess.CalledProcessError, StopIteration, IndexError) as error:
        print(f"❌ Could not determine the Rust toolchain: {error}", file=sys.stderr)
        return 1

    objcopy = sysroot / "lib/rustlib" / host / "bin/llvm-objcopy"
    missing = False
    if objcopy.is_file() and objcopy.stat().st_mode & 0o111:
        print(f"✅ llvm-tools installed ({host}).")
    else:
        missing = True
        print("⚠️  rustup component 'llvm-tools' is missing.")
        print("   Without it swift-rs cannot re-globalize the @_cdecl symbols that")
        print("   Xcode 27 internalizes, so iOS builds fail to link.")
        if args.check:
            print("   Install with: rustup component add llvm-tools")
        else:
            print("⚙️  Installing llvm-tools …")
            try:
                subprocess.run(["rustup", "component", "add", "llvm-tools"], check=True)
            except subprocess.CalledProcessError as error:
                return error.returncode or 1
            if objcopy.is_file() and objcopy.stat().st_mode & 0o111:
                print(f"✅ Installed llvm-tools → {objcopy}")
            else:
                print(f"❌ Install finished but {objcopy} is still missing.")
                return 1

    if shutil.which("xcodegen") is not None:
        print("✅ xcodegen installed.")
    else:
        missing = True
        print("⚠️  xcodegen not found — install with: brew install xcodegen")
        print("   'tauri ios init' generates project.yml; xcodegen turns it into")
        print("   visualtalk.xcodeproj, which fix-ios-project.py needs to re-patch.")

    return 1 if args.check and missing else 0


if __name__ == "__main__":
    sys.exit(main())
