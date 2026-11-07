#!/usr/bin/env python3
"""Print shell exports that let vendored OpenSSL cross-compile for Android.

Why this exists
---------------
NDK r23 removed the target-prefixed binutils wrappers (`aarch64-linux-android-ranlib`
and friends); the toolchain now ships only `llvm-ar` / `llvm-ranlib`. The `cc`
crate resolves `AR` correctly for Android but leaves `RANLIB` at the old
prefixed name, so OpenSSL's Makefile dies with
`aarch64-linux-android-ranlib: command not found` -> `make: *** [install_dev] Error 127`
while building `openssl-sys` (vendored, android-only, see Cargo.toml).

Setting `RANLIB_<target>` (underscored triple, the only spelling a shell can
export) to the NDK's `llvm-ranlib` fixes it without touching any crate.

Usage
-----
    eval "$(python3 scripts/android-toolchain-env.py)"   # before tauri android …
    python3 scripts/android-toolchain-env.py --check     # validate, exit 1 on drift

The NDK is located from ANDROID_HOME / ANDROID_SDK_ROOT (falling back to
~/Library/Android/sdk), newest `ndk/*` wins — the same choice Tauri logs at
build start. Nothing machine-specific is committed.
"""

import argparse
import os
import platform
import sys
from pathlib import Path

TARGETS = [
    "aarch64-linux-android",
    "armv7-linux-androideabi",
    "i686-linux-android",
    "x86_64-linux-android",
]


def sdk_root() -> Path:
    for var in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        value = os.environ.get(var)
        if value:
            return Path(value)
    return Path.home() / "Library" / "Android" / "sdk"


def ndk_dir(root: Path) -> Path:
    ndks = sorted(p for p in (root / "ndk").glob("*") if p.is_dir())
    if not ndks:
        raise SystemExit("android-toolchain-env: no NDK under %s/ndk" % root)
    return ndks[-1]


def host_triple() -> str:
    system = platform.system()
    if system == "Darwin":
        # The NDK ships a single macOS prebuilt (x86_64), Rosetta-translated.
        return "darwin-x86_64"
    if system == "Linux":
        return "linux-x86_64"
    if system == "Windows":
        return "windows-x86_64"
    raise SystemExit("android-toolchain-env: unsupported host %s" % system)


def ranlib_path(ndk: Path) -> Path:
    return ndk / "toolchains" / "llvm" / "prebuilt" / host_triple() / "bin" / "llvm-ranlib"


def exports(ranlib: Path) -> list[str]:
    # Only the underscored spelling is expressible as a shell environment
    # variable; the dashed form cc also probes can never be set from a shell,
    # so emitting it would produce `export: not valid in this context`.
    return ['export RANLIB_%s="%s"' % (t.replace("-", "_"), ranlib) for t in TARGETS]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate only")
    args = parser.parse_args()

    root = sdk_root()
    ndk = ndk_dir(root)
    ranlib = ranlib_path(ndk)

    if not ranlib.is_file():
        print("android-toolchain-env: missing %s" % ranlib, file=sys.stderr)
        return 1
    if args.check:
        print("• NDK: %s" % ndk)
        print("• llvm-ranlib: %s" % ranlib)
        print("✓ Android RANLIB toolchain resolvable for %d targets" % len(TARGETS))
        return 0

    print("# NDK %s — vendored OpenSSL needs llvm-ranlib as RANLIB_<target>" % ndk.name)
    for line in exports(ranlib):
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
