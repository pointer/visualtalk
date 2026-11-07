# Google Play submission packet — VisualTalk (Community Edition)

Working dossier for the Play launch. Store/legal surface, same status as
`export-compliance-pro.md`: drafts live here, final answers are entered in
Play Console by the owner. **No secrets in this file** — the keystore passwords
live in the owner's password manager only.

Scope decision: the **Community Edition goes first**, free, package
`com.katebg.visualtalk`. Pro is a separate listing (`com.katebg.visualtalk.pro`,
paid) and waits on the private e2ee sources + the Phase 3 build matrix; nothing
here blocks it, but nothing here covers it either.

## 1. Identity & versioning

| Field | Value |
| --- | --- |
| Package | `com.katebg.visualtalk` |
| versionName | from `src-tauri/tauri.conf.json` (`3.3.42`) |
| versionCode | `major*1_000_000 + minor*10_000 + patch*100` → `3034200`, injected by `scripts/fix-android-project.py` (`play_version_code`). Deterministic so CI tag builds and local builds agree; Play rejects a repeat or lower code. `--check` fails if the number drifts from the conf version. |
| minSdk / targetSdk | 26 / 37 (template; 37 clears Play's current new-app floor) |
| ABIs | arm64-v8a, armeabi-v7a, x86, x86_64 in one AAB (Play delivers per device) |

Before every upload: confirm the code with `aapt2 dump badging` (APK) or
bundletool (AAB) and record it in the table below.

| date | versionName | versionCode | artifact | uploaded |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 2. Signing

- **Play App Signing** (mandatory for new apps): Google holds the app-signing
  key; we upload with our own **upload key**.
- Upload keystore: `~/Keys/visualtalk-play/upload-keystore.jks`, alias `upload`,
  RSA-2048, validity 10000 days, created 2026-11-07. Passwords: owner's password
  manager. Back it up off-machine BEFORE the first upload — losing it means a
  key-rotation request to Google.
- Local wiring: `src-tauri/gen/android/keystore.properties` (gitignored) makes
  `pnpm android:build:aab` produce a signed AAB. CI: the four repo secrets
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD` (release.yml already decodes them); the base64 secret
  must be the SAME jks file.
- Enrol in Play App Signing at first upload; keep upload key ≠ app-signing key
  so a compromised upload key stays rotatable.

## 3. Build & validate

```bash
python3 scripts/android-toolchain-env.py --check   # NDK ranlib wiring
pnpm android:build:aab                             # signed when keystore.properties exists
python3 scripts/fix-android-project.py --check     # signing + perms + versionCode
```

Never build/upload from Android Studio (dev-mode APK, poisoned cargo target —
see Guidance.md §3).

## 4. Store listing (drafts, en; fr/es later)

- Title (≤30): `VisualTalk`
- Short description (≤80): `Private video meetings on your own LiveKit server.`
- Full description (≤4000): lead with bring-your-own-server privacy — no
  accounts, no licensor-operated infrastructure, no analytics, no ads; in-meeting
  chat and file transfer; recordings stay on the user's device; bring your own
  LiveKit server (self-hosted or hosted); the Community Edition is free and
  contains no purchases or subscriptions (parity with the EULA text).
- Category: Social (alt. Communication).
- Contact: support address = `settings.rs SUPPORT_EMAIL`; privacy policy URL =
  hosted `PRIVACY.md` (OWNER TASK: publish it — GitHub Pages or the product
  site; Play rejects listings without a reachable URL).
- Graphics: 512×512 icon (regenerate from the Oct-14 master, see Todo.txt — the
  committed android mipmaps are the OLD Oct-12 mark), 1024×500 feature graphic
  (OWNER TASK, design), phone screenshots in `product-release/play/`
  (gitignored, regenerated per release).
- Ads: none. In-app purchases: none. Data safety: §5. Content rating: §6.

## 5. Data safety form (draft answers)

- Collected by the licensor: **nothing** — no account, no analytics, no
  telemetry, no crash reporter, no ads SDK. The app talks only to the LiveKit
  server the user configures.
- Sent by the app (to the user's own server): audio, video, chat messages,
  files — user-provided content, in-meeting, over TLS (or cleartext only if the
  user explicitly configures a ws:// server).
- Device permissions (manifest): camera, microphone (in-meeting media),
  modify-audio-settings, bluetooth-connect (routing), network-state
  (reachability), wake-lock (media session). All runtime-granted and
  functionally required; camera/microphone are `required="false"` features so
  camera-less devices install and degrade to audio/receive-only.
- Location: not collected. Financial / health: n/a.
- Deletion: uninstalling removes local data (settings, recordings, notes);
  server-side data is controlled by the user's own server operator — say so
  verbatim in the form's free-text field.
- Security in transit: TLS to the configured server; the licensor holds no keys.

## 6. Content rating (IARC) — recommended answers

- Chat/messaging between users: yes, but only inside meetings on the user's own
  server, with per-participant block and report-to-organizer (Guideline 1.2
  parity). Answer the reporting/blocking follow-ups YES (both exist) to avoid
  the highest UGC outcome; expect a low rating overall.
- Violence / sex / gambling / substances: all no.
- Record the actual certificate rating here once the questionnaire is submitted.

## 7. Console rollout plan

1. Create app (Free, en-US), accept developer policies.
2. Complete data safety + content rating + privacy policy URL.
3. Upload the signed AAB to the **internal testing** track; add the owner's
   Gmail; install from the track on the emulator AND the moto g67.
4. Closed testing (optional) → production, staged or 100%.
5. Record date / versionName / versionCode / artifact in §1 after each upload.

## 8. Device-catalog notes

- The manifest carries a leanback launcher intent filter (Android TV) with
  camera/mic features `required="false"`, so TV devices are eligible. Decide
  deliberately before production: keep (receive-only TV client is plausible) or
  drop the leanback filter to restrict to phones/tablets.
- Wear OS: not targeted; no watch layout exists.
- ChromeOS: eligible by default (ARM/x86 ABIs present); untested — note in the
  listing or exclude via Console once tested.

