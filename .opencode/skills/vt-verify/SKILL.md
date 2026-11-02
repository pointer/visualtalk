---
name: vt-verify
description: Verify a VisualTalk change before claiming it is done. Use when finishing implementation, reviewing a diff, checking a build, running Rust or frontend tests, validating permissions/plist changes, or preparing a release. Covers cargo check/test, pnpm build, notices/license checks, diff hygiene, and manual macOS verification.
---

# VisualTalk Verification

Use this skill before any completion claim for a VisualTalk change.

## 1. Identify the changed surface

```bash
git status --short
git diff --stat
```

Classify the change:

- frontend only (JSX/CSS/locales)
- Rust/Tauri only
- frontend + Rust contract change
- config, permissions, signing, or bundle change
- docs or compliance only
- dependency change

Only run the checks that apply. Do not run a full release build unless the task asks for one.

## 2. Frontend

```bash
pnpm build
```

- Use `pnpm` only. Never `npm install` or edit a lockfile.
- If `package.json` or a lockfile changed, run:

```bash
pnpm install
pnpm notices
pnpm license:check
```

- `pnpm dev` is not a verification step; it does not exercise Tauri APIs.

### Interface check (UI changes)

For changes touching `src/**/*.jsx` or `src/*.css`, run Impeccable on the changed files:

```bash
FILES=$(git diff --name-only --diff-filter=ACMR -- 'src/**/*.jsx' 'src/*.css')
[ -n "$FILES" ] && npx --yes impeccable@4.8.0 detect $FILES
```

- Exit `2` means findings were reported; review them and fix real issues.
- A clean build does not mean the interface is good. This check covers generic
  AI-UI tells, typography, contrast, spacing, and motion.
- Baseline the whole tree once with `npx --yes impeccable@4.8.0 detect src/`.
  Pre-existing findings in untouched files are not blockers.
- Report what you fixed and what you consciously waived.

## 3. Rust / Tauri

From `src-tauri/` (there is no root `Cargo.toml`):

```bash
cargo check
cargo test
cargo fmt
```

- Run `cargo fmt` after Rust edits; do not add a JS formatter.
- Pro/E2EE checks only when the private sources are present:

```bash
test -d src-tauri/e2ee-pro && (cd src-tauri && cargo test --features e2ee)
```

- Never assume `src-tauri/e2ee-pro/` exists in a fresh clone.
- If the change adds a Tauri command, confirm it is registered in `lib.rs`.

## 4. Diff hygiene

Inspect `git diff` for:

- secrets, API keys, tokens, or private endpoints
- stray `println!`, `console.log`, debug flags, or temporary files
- lockfile churn or generated-file edits
- unrelated refactors or formatting noise
- changes to CSP, identifiers, signing, entitlements, or capabilities that the task did not require

Do not read generated files whole: `THIRD_PARTY_NOTICES.md`, lockfiles, `dist/`, `node_modules/`, `src-tauri/target/`, `src-tauri/gen/`.

## 5. Permission surfaces

If the change touches camera, microphone, screen share, sandboxing, or file access, verify these stay consistent:

- `src-tauri/Info.plist` and `src-tauri/Info-pro.plist` usage strings
- `src-tauri/Entitlements.plist`
- `src-tauri/capabilities/default.json`
- `src-tauri/tauri.conf.json` and `src-tauri/tauri.pro.conf.json`

List the manual checks the user must perform on macOS:

- camera prompt and video preview
- microphone prompt and audio level
- screen-share picker and stream
- relaunch behavior after a TCC reset

## 6. Report format

Report only what actually ran:

```text
Changed: <files>
Ran: <commands and pass/fail>
Not run: <checks and why>
Diff check: <clean / findings>
Manual macOS checks: <list or none>
Residual risk: <short list>
```

Never claim a check passed if it was skipped or failed.
