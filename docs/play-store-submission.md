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
| 2026-11-08 | 3.3.42 | 3034200 | `gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab` (35 MB; upload-cert SHA256 3F:83:5B:92:8D:00:38:0E:26:95:FB:1A:7E:E0:4D:10:F0:87:72:48:63:6B:84:FA:D0:08:32:42:F5:DD:3A:EF; `bundletool validate` OK) | not yet — internal track first |
| 2026-11-09 | 3.3.42 | 3034200 | same path, **rebuilt** to pick up the fr/es locale fixes and the meeting-link fix. File SHA-256 `eeecee131e5e9e125e4b64b73ce218327f1194ef390ba97878e01b278a2431e8`; `bundletool validate` OK; manifest confirms `com.katebg.visualtalk` / 3034200 / 3.3.42; signed by the same `release` signingConfig (keystore.properties → `~/Keys/visualtalk-play/upload-keystore.jks`, cert 3F:83:5B:92…). versionCode is unchanged on purpose: nothing has been uploaded yet. **Once any AAB is uploaded, a rebuild must bump the version first** or Play rejects it. | not yet — internal track first |
| 2026-11-09 | 3.3.42 | 3034200 | (the artifact above) — **versionCode CONSUMED** by the first internal-upload attempt; Play rejects any further bundle carrying it, so this code is dead | consumed, never rolled out |
| 2026-11-09 | 3.3.43 | 3034300 | rebuilt after the bump (version in package.json + Cargo.toml + tauri.conf.json, then `fix-android-project.py` refreshed the code). SHA-256 `5f4d1929741db9a3fb0bbe8dea256ac4675f1c2e97b4d32737b6df543d6e0542`; `bundletool validate` OK; manifest confirms `com.katebg.visualtalk` / 3034300 / 3.3.43; same upload-key signingConfig | **this is the bundle to upload** |

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
  **`https://visualtalk.app/privacy`** — live since 2026-11-08, served from
  `site/privacy.html` (rendered from `PRIVACY.md`; regenerate + `pnpm cf:site`,
  see `docs/cloudflare-deploy.md`). The domain is registered on Cloudflare and
  the static site also serves `/.well-known/assetlinks.json` for Android App
  Links and `/j/?room=<code>` as the meeting-link handoff page.
- Graphics: 512×512 icon — downscale the deterministic master from
  `python3 scripts/render-icon.py` (the committed Android mipmaps are NOT stale:
  an audit on 2026-11-08 showed every platform's icons derive from the same
  Oct-12 `logo.svg`; the Oct-13/14 iOS commits were an alpha/opacity fix for
  Apple's no-alpha store-icon rule, not a rebrand). Generated 2026-11-09:
  `product-release/play/icon-512.png` (512×512 RGBA, downscaled from that master).
  1024×500 feature graphic: candidate at
  `product-release/play/feature-graphic-1024x500.png`, rendered by headless Chrome
  from `product-release/play/feature-graphic-source.html` (this ffmpeg build has no
  `drawtext` filter): `"/Applications/Google Chrome.app/Contents/MacOS/Google
  Chrome" --headless=new --disable-gpu --hide-scrollbars
  --force-device-scale-factor=1 --window-size=1024,500
  --user-data-dir=/tmp/chrome-fg --screenshot=<out.png>
  file://<…>/feature-graphic-source.html`. Owner to approve or restyle the HTML.
  Phone screenshots: re-captured on a **real device** 2026-11-09 (settings, prejoin,
  in-meeting) and normalized in `product-release/play/1080x1920/` — the raw window
  captures are 648×1411 with titlebar bands and a scrollbar, so each is cropped
  (bands + scrollbar removed, per-image y offset) and scaled to exactly 1080×1920,
  the 9:16 edge of Play's accepted window (the originals' ~9:19.6 is outside it).
  Set: `01-home` (emulator), `02-settings-livekit`, `03-prejoin`, `04-meeting`.
  Owner confirmed the LiveKit Cloud URL and API key visible in shot 02 are **dummy
  values**. Residual cosmetic caveats, acceptable for the internal track but worth
  fixing before the production store page: shot 02's tab strip is truncated at the
  left edge (capture defect, not fixable by cropping), and all three are upscaled
  from a 648 px-wide source so they are soft at full size — re-capture at native
  device resolution when convenient. The two pre-2026-11-09 emulator shots they
  replace showed `devkey`, `ws://10.0.2.2:7880` and a green preview artifact.
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
4. Closed testing → production, staged or 100%. **Not optional for personal
   developer accounts registered after 2023-11-13:** Play gates production access
   behind closed testing with at least 20 testers for 14 consecutive days. The
   Console's Testing page states the exact requirement for this account;
   organisation accounts are exempt. Internal testing is available immediately
   either way, to up to 100 chosen testers.
5. Record date / versionName / versionCode / artifact in §1 after each upload.

Rules learned the hard way (2026-11-09):

- A versionCode is **consumed the moment any bundle carrying it is processed by
  Play**, even if the release is never rolled out or is deleted afterwards.
  `3034200` (v3.3.42) was consumed by the first internal-upload attempt and can
  never be reused — a retry therefore requires a version bump, not a re-upload.
- Never hand-edit `versionCode` in `src-tauri/gen/android`: `fix-android-project.py`
  owns that line (derived from `tauri.conf.json`) and `--check` fails forever if
  the two disagree. Bump the version in `package.json` + `Cargo.toml` +
  `tauri.conf.json`, then re-run the patch script.

Console progress log:

- 2026-11-09: app created; internal testing release created. The first upload of
  `3034200` processed (consuming the code); the retry was rejected; the release
  now carries the library bundle `3034200`, which is content-identical to
  `3034300` (see §1 — only docs and version stamps changed between the builds).
  App content: **11 declarations actioned** (trader status & ToS, health,
  advertising ID, financial features, government, data safety, target audience,
  content ratings, ads, sign-in details, privacy policy), none needing attention.
  Still open: add testers and roll out the internal release, install on the
  moto g67 and report first-launch behaviour, then the personal-account
  closed-testing gate (20 testers / 14 days) before any production rollout.
  The missing-debug-symbols warning is deferred to pre-production.

## 8. Device-catalog notes

- The manifest carries a leanback launcher intent filter (Android TV) with
  camera/mic features `required="false"`, so TV devices are eligible. Decide
  deliberately before production: keep (receive-only TV client is plausible) or
  drop the leanback filter to restrict to phones/tablets.
- Wear OS: not targeted; no watch layout exists.
- ChromeOS: eligible by default (ARM/x86 ABIs present); untested — note in the
  listing or exclude via Console once tested.

