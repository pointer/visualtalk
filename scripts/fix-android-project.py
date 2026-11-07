#!/usr/bin/env python3
"""Patch Tauri's generated Android project with signing and media permissions."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SIGNING_VALUES = """\
// Google Play upload-key signing — added by scripts/fix-android-project.py.
// CI writes ../keystore.properties from repo secrets on tag pushes / manual
// dispatch; without it the release build stays unsigned, like the stock template.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val hasUploadKeystore = keystorePropertiesFile.exists()
val keystoreProperties = Properties().apply {
    if (hasUploadKeystore) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

"""
SIGNING_BLOCK = """\
    signingConfigs {
        if (hasUploadKeystore) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }
"""
SIGNING_ASSIGNMENT = """\
            if (hasUploadKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
"""
INTERNET_PERMISSION = '    <uses-permission android:name="android.permission.INTERNET" />\n'
MEDIA_PERMISSIONS = """
    <!-- Media permissions for getUserMedia inside the WebView (LiveKit audio /
         video). wry's RustWebChromeClient turns the WebView permission request
         into the Android runtime prompt itself (CAMERA + RECORD_AUDIO +
         MODIFY_AUDIO_SETTINGS), but Android silently denies a runtime request
         for a permission that is not declared here — so declaring them is the
         whole fix; no MainActivity change is needed.
         Added by scripts/fix-android-project.py -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <!-- Headset / speakerphone routing during a meeting (runtime grant on 12+) -->
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <!-- Reachability checks for the LiveKit connection + keep the media session
         alive while the screen is off -->
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <!-- Declaring CAMERA / RECORD_AUDIO makes AAPT imply the matching
         <uses-feature> as required="true", which would filter VisualTalk out of
         Play on camera-less devices (Android TV — see the leanback intent filter
         below, and some tablets). Opt back out: the app degrades to
         audio-only / receive-only instead of refusing to install. -->
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />
"""


def replace_once(source: str, anchor: str, replacement: str, path: Path, after: bool = False) -> str:
    count = source.count(anchor)
    if count != 1:
        raise ValueError(
            f"✗ anchor {anchor!r} found {count}× — the Tauri android template "
            f"drifted; update scripts/fix-android-project.py"
        )
    # `after=False` inserts the block *above* the anchor (used to open a new
    # brace level before an existing one); `after=True` inserts *inside* it,
    # which is what a statement belonging to a block body needs. Getting this
    # wrong puts e.g. `signingConfig =` in `buildTypes {}` instead of in the
    # release build type, where the property does not exist.
    joined = anchor + replacement if after else replacement + anchor
    return source.replace(anchor, joined, 1)


def patch(path: Path, marker: str, edits: list[tuple[str, str, bool]], description: str, check_only: bool) -> bool:
    source = path.read_text(encoding="utf-8")
    if marker in source:
        print(f"• Android {description} patch already applied")
        return True
    if check_only:
        print(f"✗ Android {description} patch NOT applied — {path}", file=sys.stderr)
        return False
    for anchor, replacement, after in edits:
        source = replace_once(source, anchor, replacement, path, after)
    path.write_text(source, encoding="utf-8")
    print(f"✓ Android {description} patch applied to {path}")
    return True


VERSIONCODE_MARKER = "Deterministic Play versionCode"
VERSIONCODE_ANCHOR = '        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()\n'


def play_version_code() -> int:
    """major*1_000_000 + minor*10_000 + patch*100, from tauri.conf.json.

    Tauri's `autoIncrementVersionCode` emits an opaque per-build counter, so a CI
    tag build and a local build of the same version produce different codes and
    Play rejects whichever is uploaded second. A code derived from the public
    version is identical everywhere and monotonic across releases; the trailing
    two digits leave room for a hotfix suffix later if ever needed.
    """
    conf = json.loads((ROOT / "src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
    major, minor, patch = (int(p) for p in conf["version"].split(".")[:3])
    return major * 1_000_000 + minor * 10_000 + patch * 100


def patch_version_code(gradle: Path, check_only: bool) -> bool:
    source = gradle.read_text(encoding="utf-8")
    expected = "        versionCode = %d\n" % play_version_code()
    if VERSIONCODE_MARKER in source:
        ok = expected.rstrip("\n") in source
        if check_only:
            print("• versionCode patch %s" % ("current" if ok else "STALE (version bumped?)"))
            return ok
        if ok:
            return True
        # Version was bumped: rewrite the number in place.
        source = re.sub(r"        versionCode = \d+\n", expected, source, count=1)
        gradle.write_text(source, encoding="utf-8")
        print("✓ versionCode refreshed to %d" % play_version_code())
        return True
    if check_only:
        print("✗ versionCode patch NOT applied — %s" % gradle, file=sys.stderr)
        return False
    if source.count(VERSIONCODE_ANCHOR) != 1:
        raise ValueError("versionCode anchor found %d× — template drifted" % source.count(VERSIONCODE_ANCHOR))
    block = (
        "        // %s: major*1_000_000 + minor*10_000 + patch*100.\n"
        "        // Added by scripts/fix-android-project.py — see play_version_code().\n"
        "        versionCode = %d\n" % (VERSIONCODE_MARKER, play_version_code())
    )
    gradle.write_text(source.replace(VERSIONCODE_ANCHOR, block), encoding="utf-8")
    print("✓ versionCode pinned to %d" % play_version_code())
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report missing patches without editing")
    args = parser.parse_args()

    default_gen = ROOT / "src-tauri/gen/android"
    gen_dir = Path(os.environ.get("ANDROID_GEN_DIR", str(default_gen))).expanduser()
    if not gen_dir.is_absolute():
        gen_dir = Path.cwd() / gen_dir
    gradle = gen_dir / "app/build.gradle.kts"
    manifest = gen_dir / "app/src/main/AndroidManifest.xml"
    if not gradle.is_file() or not manifest.is_file():
        print(f"✗ {gradle} or {manifest} not found — run 'pnpm tauri android init' first", file=sys.stderr)
        return 1

    failed = False
    try:
        failed |= not patch(
            gradle,
            "keystore.properties",
            (
                ("android {\n", SIGNING_VALUES, False),
                ("    buildTypes {\n", SIGNING_BLOCK, False),
                # Inside the release build type, not beside it.
                ('        getByName("release") {\n', SIGNING_ASSIGNMENT, True),
            ),
            "signing",
            args.check,
        )
        failed |= not patch(
            manifest,
            "android.permission.RECORD_AUDIO",
            ((INTERNET_PERMISSION, INTERNET_PERMISSION + MEDIA_PERMISSIONS, False),),
            "media permission",
            args.check,
        )
        failed |= not patch_version_code(gradle, args.check)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1

    if failed:
        print("✗ Android project patches missing — run python3 scripts/fix-android-project.py", file=sys.stderr)
        return 1
    if args.check:
        print("✓ Android project patches applied (upload-key signing + media permissions)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
