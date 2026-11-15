#!/usr/bin/env python3
"""Print shell exports that let vendored OpenSSL cross-compile for Android.

Why this exists
---------------
NDK r23 removed the target-prefixed binutils wrappers (`aarch64-linux-android-ar`,
`aarch64-linux-android-ranlib`, and friends); the toolchain now ships only
`llvm-ar` / `llvm-ranlib`. OpenSSL's Android build and native dependency build
scripts can still request the removed names, so map them to the NDK tools.

Setting `AR` / `AR_<target>` and `RANLIB_<target>` to the NDK tools fixes this
without touching any crate.

The same NDK removal bites OpenSSL's Configure a second way: it invokes
`CC=<triple>-clang`, but NDK r23+ only ships API-suffixed wrappers
(`aarch64-linux-android26-clang`), so any *rebuild* of openssl-sys — every
Cargo.toml/lock change invalidates its cached build script — dies with
`aarch64-linux-android-clang: command not found`. Exporting `CC_<target>` /
`CXX_<target>` at the minSdk API level points the cc crate (and aws-lc-sys,
which reads the same variables) at the real wrapper.

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


def ar_path(ndk: Path) -> Path:
    return ndk / "toolchains" / "llvm" / "prebuilt" / host_triple() / "bin" / "llvm-ar"


# NDK clang wrapper prefix per target triple (armv7 gains an "a" in the
# wrapper name) and the API level baked into the wrapper suffix; 26 matches
# the Play listing minSdk (docs/play-store-submission.md §1).
WRAPPER_PREFIX = {
    "aarch64-linux-android": "aarch64-linux-android",
    "armv7-linux-androideabi": "armv7a-linux-androideabi",
    "i686-linux-android": "i686-linux-android",
    "x86_64-linux-android": "x86_64-linux-android",
}
MIN_API = 26


def clang_bin(ndk: Path) -> Path:
    return ndk / "toolchains" / "llvm" / "prebuilt" / host_triple() / "bin"


def exports(ar: Path, ranlib: Path, bindir: Path) -> list[str]:
    # Only the underscored spelling is expressible as a shell environment
    # variable; the dashed form cc also probes can never be set from a shell,
    # so emitting it would produce `export: not valid in this context`.
    lines = ['export RANLIB_%s="%s"' % (t.replace("-", "_"), ranlib) for t in TARGETS]
    lines.insert(0, 'export AR="%s"' % ar)
    lines.extend('export AR_%s="%s"' % (t.replace("-", "_"), ar) for t in TARGETS)
    for target in TARGETS:
        wrapper = bindir / ("%s%d-clang" % (WRAPPER_PREFIX[target], MIN_API))
        if wrapper.is_file():
            env = target.replace("-", "_")
            lines.append('export CC_%s="%s"' % (env, wrapper))
            lines.append('export CXX_%s="%s++"' % (env, wrapper))
    return lines


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate only")
    args = parser.parse_args()

    root = sdk_root()
    ndk = ndk_dir(root)
    ranlib = ranlib_path(ndk)
    ar = ar_path(ndk)
    bindir = clang_bin(ndk)

    for tool in (ar, ranlib):
        if not tool.is_file():
            print("android-toolchain-env: missing %s" % tool, file=sys.stderr)
            return 1
    if args.check:
        print("• NDK: %s" % ndk)
        print("• llvm-ar: %s" % ar)
        print("• llvm-ranlib: %s" % ranlib)
        missing = [
            t
            for t in TARGETS
            if not (bindir / ("%s%d-clang" % (WRAPPER_PREFIX[t], MIN_API))).is_file()
        ]
        if missing:
            print(
                "android-toolchain-env: missing clang wrappers for %s" % missing,
                file=sys.stderr,
            )
            return 1
        print("✓ Android AR + RANLIB + CC toolchain resolvable for %d targets" % len(TARGETS))
        return 0

    print("# NDK %s — use llvm-ar / llvm-ranlib instead of removed target-prefixed tools" % ndk.name)
    print("# and the API-suffixed clang wrapper as CC_<target> / CXX_<target>")
    for line in exports(ar, ranlib, bindir):
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
