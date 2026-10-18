#!/usr/bin/env bash
# fix-android-project.sh — patch Tauri's generated Android project so it builds
# a real, installable app instead of the stock template output:
#
#   1. app/build.gradle.kts              — Google Play upload-key signing
#   2. app/src/main/AndroidManifest.xml  — camera/microphone permissions the
#                                          WebView needs for getUserMedia
#
# `tauri android init` regenerates the whole gen/android tree from Tauri's
# templates (and `pnpm android:clean` deletes it), so none of this can live in
# gen/ permanently — this script is the single place the deltas are re-applied.
# CI runs it right after init, then again with --check as a guard (see
# .github/workflows/release.yml). Locally `pnpm android:init` chains it.
#
# --- 1. signing contract with CI ("Decode Android signing key") -------------
# The stock template ships NO signing config, so even a release AAB comes out
# unsigned. The patch adds:
#   a) a `keystore.properties` reader next to the existing tauriProperties val
#   b) a conditional `signingConfigs { create("release") ... }` block
#   c) `signingConfig = signingConfigs.getByName("release")` in the release
#      build type — all guarded so builds still work when the properties file
#      is absent (branch builds / no secrets) by staying unsigned.
# CI writes src-tauri/gen/android/keystore.properties with storeFile relative to
# the app/ dir (app/upload-keystore.jks), storePassword, keyAlias, keyPassword.
#
# --- 2. media permissions ---------------------------------------------------
# Without CAMERA / RECORD_AUDIO / MODIFY_AUDIO_SETTINGS declared, Android
# silently denies the runtime request wry makes on the WebView's behalf
# (WryActivity.requestPermissions ← RustWebChromeClient.grantPermissionRequest),
# so getUserMedia fails with NotAllowedError and no prompt is ever shown.
#
# Idempotent: each patch is detected and skipped when already applied.
# --check exits 1 if ANY patch is missing (CI guard, like fix-ios-project.sh).
set -euo pipefail

MODE="apply"
if [ "${1:-}" = "--check" ]; then MODE="check"; fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GEN_DIR="${ANDROID_GEN_DIR:-$script_dir/../src-tauri/gen/android}"
GRADLE="$GEN_DIR/app/build.gradle.kts"
MANIFEST="$GEN_DIR/app/src/main/AndroidManifest.xml"

if [ ! -f "$GRADLE" ] || [ ! -f "$MANIFEST" ]; then
  echo "✗ $GRADLE or $MANIFEST not found — run 'pnpm tauri android init' first" >&2
  exit 1
fi

FAILED=0

# ------------------------------------------------- 1. upload-key signing ---
if grep -q 'keystore.properties' "$GRADLE"; then
  echo "• Android signing patch already applied"
elif [ "$MODE" = "check" ]; then
  echo "✗ Android signing patch NOT applied — app/build.gradle.kts" >&2
  FAILED=1
else
python3 - "$GRADLE" <<'PYEOF'
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    src = f.read()

vals = '''\
// Google Play upload-key signing — added by scripts/fix-android-project.sh.
// CI writes ../keystore.properties from repo secrets on tag pushes / manual
// dispatch; without it the release build stays unsigned, like the stock template.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val hasUploadKeystore = keystorePropertiesFile.exists()
val keystoreProperties = Properties().apply {
    if (hasUploadKeystore) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

'''

signing = '''\
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
'''

assign = '''\
            if (hasUploadKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
'''


def replace_once(src, anchor, replacement, where):
    n = src.count(anchor)
    if n != 1:
        print(f"✗ anchor {anchor!r} found {n}× — the Tauri android template "
              "drifted; update scripts/fix-android-project.sh", file=sys.stderr)
        sys.exit(1)
    if where == "before":
        return src.replace(anchor, replacement + anchor, 1)
    return src.replace(anchor, anchor + replacement, 1)


src = replace_once(src, "android {\n", vals, "before")
src = replace_once(src, "    buildTypes {\n", signing, "before")
src = replace_once(src, '        getByName("release") {\n', assign, "after")

with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("✓ Android signing patch applied to", path)
PYEOF
fi

# ------------------------------------------------- 2. media permissions ----
if grep -q 'android.permission.RECORD_AUDIO' "$MANIFEST"; then
  echo "• Android media permission patch already applied"
elif [ "$MODE" = "check" ]; then
  echo "✗ Android media permission patch NOT applied — app/src/main/AndroidManifest.xml" >&2
  FAILED=1
else
python3 - "$MANIFEST" <<'PYEOF'
import sys

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    src = f.read()

anchor = '    <uses-permission android:name="android.permission.INTERNET" />\n'

media = '''
    <!-- Media permissions for getUserMedia inside the WebView (LiveKit audio /
         video). wry's RustWebChromeClient turns the WebView permission request
         into the Android runtime prompt itself (CAMERA + RECORD_AUDIO +
         MODIFY_AUDIO_SETTINGS), but Android silently denies a runtime request
         for a permission that is not declared here — so declaring them is the
         whole fix; no MainActivity change is needed.
         Added by scripts/fix-android-project.sh -->
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
         below — and some tablets). Opt back out: the app degrades to
         audio-only / receive-only instead of refusing to install. -->
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />
'''

n = src.count(anchor)
if n != 1:
    print(f"✗ anchor {anchor!r} found {n}× — the Tauri android template "
          "drifted; update scripts/fix-android-project.sh", file=sys.stderr)
    sys.exit(1)

src = src.replace(anchor, anchor + media, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(src)
print("✓ Android media permission patch applied to", path)
PYEOF
fi

if [ "$FAILED" -ne 0 ]; then
  echo "✗ Android project patches missing — run scripts/fix-android-project.sh" >&2
  exit 1
fi

if [ "$MODE" = "check" ]; then
  echo "✓ Android project patches applied (upload-key signing + media permissions)"
fi
