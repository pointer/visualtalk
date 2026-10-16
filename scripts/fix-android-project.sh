#!/usr/bin/env bash
# fix-android-project.sh — patch Tauri's generated Android gradle project so
# release builds are signed with the Google Play upload key.
#
# The stock `tauri android init` template ships NO signing config, so even a
# release AAB comes out unsigned. This script adds:
#
#   1. a `keystore.properties` reader next to the existing tauriProperties val
#   2. a conditional `signingConfigs { create("release") ... }` block
#   3. `signingConfig = signingConfigs.getByName("release")` in the release
#      build type — all guarded so builds still work when the properties file
#      is absent (branch builds / no secrets) by staying unsigned.
#
# Contract with CI (see .github/workflows/release.yml, "Decode Android signing
# key"): src-tauri/gen/android/keystore.properties with storeFile relative to
# the app/ dir (CI writes app/upload-keystore.jks), storePassword, keyAlias,
# keyPassword.
#
# Idempotent: re-running detects the patch and no-ops.
# --check exits 1 if the patch is NOT applied (CI guard, like fix-ios-project.sh).
set -euo pipefail

MODE="apply"
if [ "${1:-}" = "--check" ]; then MODE="check"; fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GEN_DIR="${ANDROID_GEN_DIR:-$script_dir/../src-tauri/gen/android}"
GRADLE="$GEN_DIR/app/build.gradle.kts"

if [ ! -f "$GRADLE" ]; then
  echo "✗ $GRADLE not found — run 'pnpm tauri android init' first" >&2
  exit 1
fi

if grep -q 'keystore.properties' "$GRADLE"; then
  if [ "$MODE" = "check" ]; then echo "✓ Android signing patch applied"; exit 0; fi
  echo "• Android signing patch already applied — nothing to do"
  exit 0
fi

if [ "$MODE" = "check" ]; then
  echo "✗ Android signing patch NOT applied — run scripts/fix-android-project.sh" >&2
  exit 1
fi

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
