# Desktop release runbook — Windows, macOS, Linux

How a Community Edition desktop release reaches users: **GitHub Release assets**
plus **`visualtalk.app/downloads/`** with checksums. No store is involved, so this
runbook is independent of `play-store-submission.md` (Android) and of any future
Mac App Store work. Pro Edition never goes through this path — see the
`--allow-pro` guard in `scripts/deploy-cloudflare.py` and the private runbook.

## Preconditions

- `gh` CLI authenticated as the repo owner (`gh auth status`).
- The `Release` workflow **enabled** in repo settings. It was found
  `disabled_manually` on 2026-11-09; a disabled workflow silently ignores tags.
- `pnpm license:check` green — it is CI's first gate and fails the whole run
  otherwise. Regenerate with `pnpm notices` and commit both outputs first.
- Working tree clean and on `main`, version bumped (next step).

## Steps

1. **Bump the version in three places** — `package.json`, `src-tauri/Cargo.toml`,
   `src-tauri/tauri.conf.json`. They must agree; CI and the Android versionCode
   derivation read `tauri.conf.json`.
   ```bash
   python3 scripts/fix-android-project.py     # refreshes versionCode (Android only)
   python3 scripts/fix-android-project.py --check
   ```
2. **Sanity:** `cd src-tauri && cargo test`, `pnpm build`, `pnpm license:check`.
3. **Commit and push `main`.**
4. **Tag and push the tag alone** — never `--tags`, never `--all` (a local branch
   carries pre-rewrite history that must not be pushed):
   ```bash
   git tag -a v3.3.44 -m "VisualTalk 3.3.44"
   git push origin v3.3.44
   ```
   The tag triggers CI: license gate, then desktop (macOS aarch64 + Intel,
   Windows, Linux), Android and iOS builds. ~20-30 min. Watch with
   `gh run watch` or `gh run list`.
5. **Publish the release.** The workflow creates it as a **draft**; assets are
   404 until published.
   ```bash
   gh release view v3.3.44 --json assets --jq '.assets[].name'   # expect 9
   gh release edit v3.3.44 --draft=false
   ```
6. **Generate and deploy the downloads page:**
   ```bash
   python3 scripts/build-downloads-page.py --tag v3.3.44 \
     --macos-signing ad-hoc --windows-signing unsigned
   pnpm cf:site
   ```
   Hashes come from GitHub's per-asset digests (the script only downloads when a
   digest is missing). Spot-check one independently before announcing:
   `curl -sL <asset url> | shasum -a 256`.
7. **Verify live:** `https://visualtalk.app/downloads/` returns 200 and lists the
   new version; one asset URL returns 200; `SHA256SUMS.txt` matches the page.

## Signing status (and how to change it)

- **macOS: ad-hoc.** CI has no Apple credentials, so Gatekeeper refuses the dmg
  until the user right-clicks → Open. The downloads page says exactly that.
  When a **Developer ID Application** certificate plus an app-specific password
  exist: build locally with `APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
  `APPLE_PASSWORD`, `APPLE_TEAM_ID` set, notarize and staple, verify with
  `spctl --assess --verbose <app>`, then replace the release's dmg assets and
  re-run step 6 with `--macos-signing notarized`.
- **Windows: unsigned.** SmartScreen warns "unknown publisher"; the page tells
  users to verify the SHA-256 and choose "More info → Run anyway". A code-signing
  certificate removes the warning; until one is bought, this is the disclosed state.

## Gotchas recorded from real releases

- **2026-11-09:** the first tag run failed in 12 s because the workflow pinned
  `pnpm version: 9` while `package.json` declares `packageManager: pnpm@12.15.0`;
  `pnpm/action-setup` rejects both. The pin is gone; `packageManager` is the only
  source of truth. If a job ever dies at "Install pnpm", look there first.
- **Re-pointing a tag** is acceptable only while it is minutes old and unfetched.
  After anyone (including CI) has seen it, bump the version instead.
- **Desktop and Play version numbers drift on purpose.** Android's versionCode is
  consumed by Play on first processing and can never be reused, so the Play track
  may lag or lead the desktop line (e.g. desktop 3.3.43 while Play sits on
  3.3.42). Keep `tauri.conf.json` as the source and bump both channels together
  at the next opportunity.
- **The Android/iOS CI jobs on a tag build artifacts but publish nothing.** The
  AAB goes to Play Console by hand; iOS waits on its own store track.
- `product-release/` holds locally-built or foreign-machine installers and is
  gitignored; `scripts/deploy-cloudflare.py stage` warns when its versions skew
  against `tauri.conf.json`. Archive stale entries rather than letting the
  warning go stale.
