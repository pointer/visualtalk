# Deploying VisualTalk to Cloudflare

Short version: **Cloudflare cannot build this project, so build here and upload
there.** `dist/` (the static frontend) goes to **Pages**; the native installers
(`.dmg`, `.app.zip`, `.msi`, `.exe`, `.AppImage`, `.apk`, `.aab`) go to **R2**.
`scripts/deploy-cloudflare.py` wraps both.

---

## 1. Why the Cloudflare build failed

```
Executing user build command: pnpm tauri build
failed to run 'cargo metadata' command to get workspace directory:
failed to run command cargo metadata --no-deps --format-version 1:
No such file or directory (os error 2)
```

`os error 2` is `ENOENT`: the Tauri CLI's very first step is to shell out to
`cargo`, and **there is no `cargo` binary in Cloudflare's build image**. This is
not a misconfiguration you can fix with an environment variable.

Two independent reasons the build can never succeed there:

1. **No Rust toolchain.** The Pages v3 build image preinstalls Go, Node.js, Bun,
   Python and Ruby only (<https://developers.cloudflare.com/pages/configuration/build-image/>).
   There is no `rustup`/`cargo`, and no `apt-get install rustc` escape hatch
   that would produce a supported toolchain inside the 20-minute build timeout.
2. **No native platform SDKs, and nothing to run the result.** `tauri build`
   also needs Xcode/CLT (macOS bundles), WebKitGTK + the Linux desktop libs, or
   the MSVC toolchain. And the output is a *native executable* — Cloudflare
   serves HTTP responses; it has no place to run a `.app` or `.exe`.

So the split is: **compile on a machine that has the toolchains (yours, or a
GitHub Actions runner), publish the results to Cloudflare.**

## 2. What goes where

| Artifact | Built by | Cloudflare product | Deploy with |
| --- | --- | --- | --- |
| `dist/` — SolidJS static bundle | `pnpm build` | **Pages** | `pnpm cf:pages` |
| `visualtalk_<ver>_<arch>.dmg`, `.app.zip` | `pnpm desktop:build`, `pnpm mac:build*` | **R2** | `pnpm cf:r2` |
| `*-setup.exe`, `*.msi` | `pnpm win:build` (on Windows) | **R2** | `pnpm cf:r2` |
| `*.AppImage`, `*.deb`, `*.rpm` | `pnpm linux:build` (on Linux) | **R2** | `pnpm cf:r2` |
| `*.apk`, `*.aab` | `pnpm android:build*` | **R2** (or Play Console) | `pnpm cf:r2` |

Why not just put the installers on Pages next to the site?

- Pages caps a single asset at **25 MiB** (<https://developers.cloudflare.com/pages/platform/limits/>)
  and Cloudflare's own docs say: *"To serve larger files, consider uploading them
  to R2 and utilizing the public bucket feature."* The Android `.aab` alone is
  35 MiB.
- R2 has no per-object size cap for this use, **no egress charges**, and a free
  tier of 10 GB-months of storage — enough for several releases per platform.

⚠️ **What the Pages deployment actually is:** the UI shell only. In a browser
every Tauri `invoke` fails (there is no Rust core), so `dist/` on Pages is a
preview/design surface, **not** a working web client. Treat it as such, or point
Pages at a real marketing/download page instead.

## 3. One-time setup

```bash
# 1. Authenticate wrangler (opens a browser; credentials cached locally)
pnpm dlx wrangler@4 login

# 2. Create the Pages project (skip if it already exists in the dashboard)
pnpm dlx wrangler@4 pages project create visualtalk --production-branch main

# 3. Create the R2 bucket. --location is a hint honoured only on first creation;
#    weur = Western Europe, which matches the ANSSI/EU posture of this product.
pnpm dlx wrangler@4 r2 bucket create visualtalk-releases --location weur
```

`wrangler` is deliberately **not** a dependency of this repo — `pnpm dlx`
resolves it on demand (AGENTS.md: dependencies are a decision).

### Making the bucket downloadable

Buckets are private by default. Pick one (Cloudflare dashboard → R2 → your
bucket → Settings):

- **Custom domain** (recommended for anything public): `dl.yourdomain.tld` in
  front of the bucket. Gets Cloudflare caching, WAF, Access, bot management.
- **Public development URL** (`https://<bucket>.<account-subdomain>.r2.dev`):
  one toggle, but Cloudflare documents it as *"rate-limited and should only be
  used for development purposes."* Fine for testing a download link, not for a
  release announcement.

## 4. Fixing the Pages project that failed

If you keep Git integration, the build settings must describe a **frontend-only**
build (dashboard → Pages → your project → Settings → Builds & deployments):

| Setting | Value |
| --- | --- |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Node version | `24` — picked up automatically from `.nvmrc` |
| Environment variables | none required for Community Edition |

Pages detects `pnpm-lock.yaml` and runs `pnpm install` for you before the build
command, so don't chain it. Never put `pnpm tauri build` / `pnpm desktop:build`
here — see §1.

Alternatively switch the project to **Direct Upload** and deploy from your
machine with `pnpm cf:pages`; that is the honest model for this repo, because
the artifact that matters (the installer) is built somewhere else anyway.

## 5. Build + upload (the normal workflow)

```bash
# ── 1. Build the artifacts locally (pick the platforms you can build here) ──
pnpm desktop:build        # macOS on Apple Silicon → .app + .dmg (Community Edition)
pnpm mac:build:intel      # Intel mac (needs the x86_64-apple-darwin rustup target)
pnpm mac:build:universal  # both in one bundle
# pnpm win:build / pnpm linux:build run only on Windows / Linux respectively.

# ── 2. Inspect what would be published (no network writes) ─────────────────
python3 scripts/deploy-cloudflare.py check          # toolchain, auth, artifacts
python3 scripts/deploy-cloudflare.py r2 --bucket visualtalk-releases --dry-run

# ── 3. Upload ─────────────────────────────────────────────────────────────
python3 scripts/deploy-cloudflare.py stage          # collect into dist-cloudflare/
python3 scripts/deploy-cloudflare.py r2 --bucket visualtalk-releases
python3 scripts/deploy-cloudflare.py pages --project visualtalk

# pnpm aliases for the same commands:
pnpm cf:check
pnpm cf:r2     # bucket from --bucket or CF_R2_BUCKET
pnpm cf:pages  # project from --project or CF_PAGES_PROJECT
```

What the R2 upload produces:

```
r2://visualtalk-releases/
├── releases/3.3.42/
│   ├── visualtalk_3.3.42_aarch64.dmg          ← the artifact, versioned key
│   ├── visualtalk_3.3.42_aarch64.app.zip      ← .app bundle, ditto-zipped
│   ├── visualtalk_3.3.33_x64-setup.exe        ← whatever else is built
│   ├── visualtalk_3.3.33_x64_en-US.msi
│   ├── app-universal-release.aab
│   ├── SHA256SUMS.txt                         ← `shasum -a 256 -c` compatible
│   └── latest.json                            ← version + sha256 + size per file
└── releases/latest/latest.json                ← version-less pointer for a download page
```

Public download URL, with a custom domain on the bucket:

```
https://dl.yourdomain.tld/releases/3.3.42/visualtalk_3.3.42_aarch64.dmg
```

Objects are uploaded with a `Content-Type` per extension,
`Content-Disposition: attachment` (so browsers download instead of navigating),
`Cache-Control: immutable` on versioned keys and `max-age=300` on the manifests.

### Raw wrangler, if you prefer no script

```bash
# Pages: the static frontend
pnpm dlx wrangler@4 pages deploy dist --project-name visualtalk --branch main

# R2: one installer
pnpm dlx wrangler@4 r2 object put \
  visualtalk-releases/releases/3.3.42/visualtalk_3.3.42_aarch64.dmg \
  --file src-tauri/target/release/bundle/dmg/visualtalk_3.3.42_aarch64.dmg \
  --remote \
  --content-type application/x-apple-diskimage \
  --content-disposition 'attachment; filename="visualtalk_3.3.42_aarch64.dmg"' \
  --cache-control 'public, max-age=31536000, immutable'

# R2: inspect / remove
pnpm dlx wrangler@4 r2 object get visualtalk-releases/releases/3.3.42/latest.json --remote --pipe
pnpm dlx wrangler@4 r2 object delete visualtalk-releases/releases/3.3.42/visualtalk_3.3.42_aarch64.dmg --remote
```

Dashboard alternative: R2 → bucket → **Upload**, then drag the contents of
`dist-cloudflare/<version>/` in. That folder is exactly what `stage` prepares, so
the script is useful even if you never run `wrangler`.

## 6. Verify after uploading

```bash
URL=https://dl.yourdomain.tld/releases/3.3.42/visualtalk_3.3.42_aarch64.dmg

curl -sIL "$URL" | grep -iE 'HTTP/|content-(type|length|disposition)|cache-control'
curl -fsSL "${URL%/*}/latest.json" | python3 -m json.tool | head -20

# byte-for-byte check against what was staged
cd dist-cloudflare/3.3.42 && shasum -a 256 -c SHA256SUMS.txt
```

## 7. Automating it in CI (GitHub Actions)

`.github/workflows/release.yml` already builds every desktop platform on tag
push and attaches the bundles to a GitHub Release. Add an R2 upload step to the
same `desktop` job to publish to Cloudflare as well — the runners have exactly
the toolchains Cloudflare's image lacks:

```yaml
      - name: Upload bundles to Cloudflare R2
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}   # Account › R2 › Edit
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          version=$(node -p "require('./package.json').version")
          find src-tauri/target -path '*/release/bundle/*' -type f \
            \( -name '*.dmg' -o -name '*.AppImage' -o -name '*.deb' \
               -o -name '*.msi' -o -name '*-setup.exe' \) |
          while read -r f; do
            pnpm dlx wrangler@4 r2 object put \
              "visualtalk-releases/releases/${version}/$(basename "$f")" \
              --file "$f" --remote \
              --content-disposition "attachment; filename=\"$(basename "$f")\""
          done
```

Create the token in the dashboard → My Profile → API Tokens with **Account › R2 ›
Edit**, and take the account ID from the dashboard URL. Both go in repository
secrets, never in the workflow file. Wire this in only once macOS
signing/notarisation is configured (§8) — otherwise CI would publish
Gatekeeper-blocked installers.

## 8. Caveats worth knowing before you publish

- **macOS Gatekeeper.** A local `pnpm desktop:build` is ad-hoc signed
  (`TeamIdentifier=not set`), so a downloader sees *"cannot be opened because the
  developer cannot be verified"*. For anything public, sign **and notarise**
  first (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` in the
  build environment). Distribution signing is tracked in the private Pro runbook
  (`src-tauri/e2ee-pro/README` §macOS) and in the ship schedule.
- **Pro Edition artifacts are refused by default.** `deploy-cloudflare.py` exits
  2 when any filename matches `VisualTalk Pro`, unless you pass `--allow-pro`.
  That guard is deliberate: Pro is paid, export-controlled (ANSSI declaration
  dossier 34842510 — see `docs/export-compliance-pro.md`) and its sources are
  private. A public R2 bucket is not a Pro distribution channel; Pro ships via
  the App Store.
- **Debug builds are skipped.** A debug Android APK is ~200 MB of unstripped,
  unsigned code. `--include-debug` re-enables them if you ever really want that.
- **`dist-cloudflare/` is gitignored** — it holds staged copies plus generated
  `SHA256SUMS.txt` / `latest.json`.
- **Version skew is flagged.** `product-release/` keeps installers built on other
  machines (today: 3.3.33 Windows next to a 3.3.42 macOS build), so staging
  prints `⚠︎ built from vX, not vY` and a stale installer becomes a decision
  rather than an accident. `--match <substring>` (repeatable) publishes a subset.
- **Pages builds time out after 20 minutes** and are capped at 500/month on the
  Free plan — two more reasons the Rust build does not belong there.
- **r2.dev is rate-limited and documented as non-production.** Put a custom
  domain on the bucket before announcing a release.
