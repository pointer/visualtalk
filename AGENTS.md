# AGENTS.md — VisualTalk

**Read [`Guidance.md`](./Guidance.md) before touching anything.** It is the canonical
guide for this repo; this file is only the short index for agents that auto-load
`AGENTS.md`.

## What this repo is

A lightweight desktop video-conferencing client: SolidJS (plain JSX) UI, Rust/Tauri v2
core, LiveKit SFU for media. Community Edition is public; a Pro Edition adds E2EE from
private sources.

## Non-negotiables

- **Thin UI, fat core.** Business logic, JWT signing, persistence, and secrets live in
  `src-tauri/src/`. The webview only renders and invokes commands.
- **No secrets in the frontend** or in `tauri.conf.json`. API keys stay in Rust and are
  exposed through `#[tauri::command]`s.
- **LiveKit stays behind `src/lib/`.** Components must not import `livekit-client`
  directly; clean up tracks/participants on unmount.
- **Plain JSX, Solid primitives.** No TypeScript, no `useState`/`useEffect`, no CSS
  modules. Tailwind v4 utilities only (`@tailwindcss/vite`, no config file).
- **Permission plumbing must stay in sync:** `Info.plist` / `Info-pro.plist` usage
  strings ↔ `Entitlements.plist` ↔ `capabilities/default.json` ↔ `tauri*.conf.json`.
  The CSP lives only in `tauri.conf.json` (`app.security.csp`).
- **Dependencies are a decision, not a convenience.** Explain why, keep pnpm as the only
  package manager, never hand-edit a lockfile, and run `pnpm notices` afterwards.

## Commands that actually exist

```bash
pnpm install                 # deps (Node 24 via .nvmrc; pnpm-lock.yaml is authoritative)
pnpm dev                     # Vite only — no Tauri APIs
pnpm desktop                 # full app, dev mode
pnpm desktop:build           # Community bundle
pnpm desktop:pro             # Pro dev build (needs private e2ee-pro sources)

cd src-tauri                 # no root Cargo.toml
cargo check
cargo test
cargo fmt
```

There is **no** `pnpm lint` or `pnpm format`. Platform/mobile bundles and the notices
generator are listed in `Guidance.md` §3.

## Where things live

| Need | Path |
| --- | --- |
| Root UI / window routing | `src/App.jsx`, `src/MainWindow.jsx`, `src/MeetingView.jsx` |
| Components | `src/components/` |
| Hooks & LiveKit wrappers | `src/lib/` |
| Tauri commands & domain logic | `src-tauri/src/*.rs` (registered in `lib.rs`) |
| App config / CSP / bundle | `src-tauri/tauri.conf.json` (+ `tauri.pro.conf.json`) |
| macOS permissions | `src-tauri/Info*.plist`, `Entitlements.plist` |
| Build & release helpers | `scripts/` |
| Durable decisions | `docs/decisions/` |

State is Solid signals/stores owned by the three root components and passed as props —
there is no `src/stores/` directory. Don't create one for a single feature.

Read `docs/decisions/` before proposing a design. If a decision changes, add a new ADR;
do not re-litigate a settled decision in chat.

## Do not

- Read generated or binary files whole (`THIRD_PARTY_NOTICES.md`, lockfiles, `dist/`,
  `node_modules/`, `src-tauri/target/`, `src-tauri/gen/`, recorded media). Grep for the
  line range you need instead.
- Commit or assume the existence of `src-tauri/e2ee-pro/` — it is private and local-only;
  a fresh clone does not have it.
- Edit `docs/` compliance filings (ANSSI/BIS/export-control) unless the task is
  explicitly about them. Some are gitignored for a reason.
- Change signing, bundle identifiers, or entitlements as a side effect of an unrelated
  fix.
- Refactor beyond the task. Smallest correct change first.

## Before you call it done

1. `cd src-tauri && cargo check && cargo test` (add `--features e2ee` only for Pro work).
2. `pnpm build` to confirm the frontend bundles.
3. Skim `git diff` — no stray debug output, no secrets, no lockfile churn.
4. Report what changed, why, and which macOS permission paths need a manual check
   (camera, microphone, screen share) if you touched them.
