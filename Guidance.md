# Guidance.md — VisualTalk

> Guidance for you (or any coding agent) working on this project. Read this at the start of every session and follow it strictly.

## 1. Project overview

VisualTalk is a lightweight desktop video-conferencing client: a thin **SolidJS** UI over a **Rust/Tauri v2** core, streaming audio/video through **LiveKit** SFU. The Community Edition is public; the Pro Edition adds end-to-end encryption from private sources (`src-tauri/e2ee-pro/`).

- **Target platform:** macOS is the reference platform — signing, entitlements, and camera/mic TCC permissions are validated there. Windows, Linux, Android, and iOS targets exist via Tauri; don't break them, but macOS correctness comes first.
- **Purpose:** a privacy-first Zoom alternative — native performance (no bundled Chromium), security logic in Rust rather than JavaScript, and self-hostable real-time infrastructure.

## 2. Tech stack

| Layer        | Technology                                    |
| ------------ | --------------------------------------------- |
| Shell        | Tauri v2                                      |
| Frontend     | SolidJS (plain JSX), Tailwind CSS v4 via Vite |
| Backend      | Rust (Tauri commands + plugins)               |
| Realtime A/V | LiveKit (`livekit-client`, `livekit-api`)     |
| Package mgr  | pnpm — `pnpm-lock.yaml` is the only lockfile |
| Runtime      | Node.js v24                                   |
| OS / env     | macOS, Homebrew, Git, Xcode CLT               |
| Editions     | Community (default) / Pro (`--features pro`)  |

## 3. How to run, build, test

```bash
pnpm install              # install JS deps (Node 24 via .nvmrc; pnpm only)
pnpm dev                  # Vite frontend only — no Tauri APIs available
pnpm desktop              # run the full desktop app in dev mode (tauri dev)
pnpm desktop:build        # production bundle (Community Edition)
pnpm build                # build the SolidJS frontend only

# Pro Edition (E2EE + streaming) — requires the private src-tauri/e2ee-pro/ sources
pnpm desktop:pro          # python3 scripts/setup-pro.py && tauri dev --features pro
pnpm desktop:build:pro    # production Pro bundle
pnpm check:pro-frontend   # vite-only smoke check: the Pro JSX compiles and
                          # __PRO_EDITION__ dead-code-eliminates. NOT a Pro app
                          # build — no Rust, no setup-pro.py source swap.

# Rust — run from src-tauri/ (there is no root Cargo.toml)
cd src-tauri
cargo check               # type-check Rust backend
cargo test                # run Rust tests
```

- `*:pro` on desktop/mobile means a **full** Pro build: source swap + `--features pro` + the Pro config overlay. There is deliberately **no** vite-only Pro dev mode — a Pro UI with no Pro Rust core renders commands that cannot exist (`e2ee_*`, translation), so it only ever errors. The frontend-only check carries a distinct name (`check:pro-frontend`) so it cannot be mistaken for a Pro build.
- Formatting/linting: there is **no** `pnpm lint` or `pnpm format`. Use `cargo fmt` for Rust and match the surrounding JSX style; don't add a formatter config without being asked.
- Platform bundles: `pnpm mac:build` (plus `mac:build:intel` / `mac:build:universal`), `pnpm win:build`, `pnpm linux:build`, `pnpm ios:build` / `ios:build:pro`, `pnpm android:build` / `android:build:pro`. Mobile setup helpers live in `scripts/` (`fix-ios-project.py`, `fix-android-project.py`, `ensure-ios-toolchain.py`).
- Android toolchain: NDK r23+ dropped the target-prefixed binutils, so the vendored OpenSSL Makefile cannot find `<triple>-ranlib` and dies with `make: *** [install_dev] Error 127`. Every `android:*` script and the CI android job therefore `eval "$(python3 scripts/android-toolchain-env.py)"` first, which exports `RANLIB_<target>` pointing at the NDK's `llvm-ranlib` (resolved from `ANDROID_HOME`, newest NDK). If an android build hits that error, the wiring or `ANDROID_HOME` is missing. `src-tauri/gen/android` is generated, gitignored, and patched by `fix-android-project.py` (upload-key signing + WebView media permissions); regenerate with `pnpm android:init`.
- **Never build or Run this project from Android Studio.** Studio's Gradle builds the same `gen/android` without Tauri's `custom-protocol` feature, installs a dev-mode APK that points the WebView at `http://localhost:1420` (white/black screen, "Failed to request …"), and writes dev-mode artifacts into the shared `src-tauri/target/<abi>/debug`, which a later CLI build can ship. It has overwritten a good CLI install twice during the 2026-11-07 session. Recovery: quit Studio, `adb uninstall com.katebg.visualtalk`, `cargo clean -p visualtalk`, rebuild via `pnpm android:*`, reinstall.
- Android/iOS are single-Activity: Tauri cannot spawn a second window there, and the one `spawn_meeting_window` creates never surfaces (ghost behind the dashboard). `App.jsx` therefore renders `MeetingView` **in place** when `IS_MOBILE`, and leaving uses `leaveCall({ keepWindowOpen: true })` plus `onExit` back to the dashboard — closing the only window would quit the app.
- `pnpm notices` regenerates `THIRD_PARTY_NOTICES.md`; `pnpm license:check` verifies it. Run both after adding or removing a dependency.
- Minimum macOS version and required Xcode CLT: see `docs/` and `scripts/ensure-ios-toolchain.py`; Tauri v2 requires Xcode CLT for desktop builds.

## 4. Project structure

```
src/                      # SolidJS frontend — plain JSX, no TypeScript build step
  index.jsx               # entry point
  App.jsx                 # root component, window routing, shared state
  MainWindow.jsx          # dashboard window (clock, meeting actions, tabs)
  MeetingView.jsx         # in-call window (green room → call → leave)
  components/             # UI components (Permissions.ts is the only TS file)
  lib/                    # utilities + LiveKit wrappers (useLiveKitRoom,
                          # useMediaDevices, useRecording, useTauriEvents, …)
  i18n/                   # I18nProvider.jsx
  locales/                # translation JSON
  assets/
src-tauri/
  src/
    main.rs               # thin binary entry
    lib.rs                # app setup, plugins, the ONE generate_handler! table
    commands.rs           # invite / LiveKit-store commands + declares commands/
    commands/             # #[tauri::command] wrappers grouped by domain:
                          #   meeting profile schedule safety participants
                          #   devices layout translation(Pro) system
    ai.rs                 # OpenAI-compatible LLM client (ask_ai)
    chat.rs  meeting.rs  participant.rs  session.rs  token.rs
    recording.rs  egress.rs  device.rs  backgrounds.rs  layout.rs
    window.rs  settings.rs  state.rs  events.rs  demo.rs
    e2ee.rs               # Pro implementation; CE ships a stub that setup-pro.py swaps
  Cargo.toml
  tauri.conf.json         # base config: bundle, window, CSP (source of truth)
  tauri.pro.conf.json     # Pro Edition config overlay
  capabilities/default.json
  Entitlements.plist      # macOS sandbox/camera entitlements
  Info.plist / Info-pro.plist   # usage strings (NSCameraUsageDescription, …)
  e2ee-pro/               # private Pro sources — not part of the public repo
scripts/                  # setup-pro.py, platform fixers, notices generator
docs/                     # compliance/export packet (ANSSI, BIS, EULA-adjacent)
```

**Edition gating — two separate switches.** `e2ee` is the *crypto* switch: the Pro
implementation lands in `src-tauri/src/e2ee.rs` by file swap
(`scripts/setup-pro.py`), while the public repo ships a stub. `pro` is the
*edition* switch (`pro = ["e2ee"]` in `Cargo.toml`), and it is what paid-only
features such as RTMP streaming gate on: `#[cfg(feature = "pro")]` in Rust,
`__PRO_EDITION__` in JSX (set from `VITE_EDITION=pro` in `vite.config.js`).
Never gate a paid feature on `e2ee` — a build can carry the crypto without being
the Pro edition, and `#[cfg]` is preferred over a runtime check so a Community
binary contains no reachable code path for the feature.

State lives in Solid signals/stores owned by `App.jsx` / `MainWindow.jsx` / `MeetingView.jsx` and passed down as props — there is no `src/stores/` directory. Don't create one for a single feature.

## 5. Coding conventions

**Frontend (SolidJS / JSX)**

- Prefer Solid primitives (`createSignal`, `createStore`, `createMemo`, `createEffect`) over external state libs.
- Use fine-grained reactivity; avoid React-style patterns (no `useState`, no `useEffect`).
- A component loaded with Solid `lazy()` must have a **default export**: `lazy`
  resolves `module.default`, and a named-only export renders nothing at all —
  a black window, no console error. Cost one regression (c549d8d, fixed in
  e67a64d). `MeetingView` now exports both; keep it that way.
- This is plain JSX: there is no `tsconfig.json` and no type-check step. Don't introduce TypeScript — the lone `components/Permissions.ts` predates this rule. Document non-obvious prop shapes with JSDoc comments.
- Style with Tailwind v4 utilities (configured through `@tailwindcss/vite`; no `tailwind.config.js`). There is no CSS-modules setup — don't add one per component.
- Wrap LiveKit SDK usage in `src/lib/` hooks; components should not import `livekit-client` directly.

**Backend (Rust / Tauri)**

- Expose functionality through typed `#[tauri::command]` functions; call them from the frontend via `invoke`.
- Put new commands in the matching `src-tauri/src/commands/<domain>.rs` module (or the existing non-command module if it already owns that domain, e.g. `ai.rs`, `chat.rs`, `recording.rs`, `egress.rs`) and register them in the single `generate_handler!` table in `lib.rs`. **Do not add a per-module `register(builder)`:** Tauri v2's `Builder::invoke_handler` assigns rather than extends, so a second call silently discards the first module's commands, and `generate_handler!` is a proc macro so it cannot be fed a `macro_rules!` list.
- Reach shared state through the `AppState` / `MediaState` accessors (`read_data`, `with_data`, `update_data`, `read_meetings`, `with_meetings`, `read_devices`, `with_devices`, `read_participants`, `with_participants`) — never `.lock()` directly. They confine the `MutexGuard` to the closure, which keeps it out of `.await` points and out of `emit_event`. Use `update_data` for anything that must be persisted: it saves and rolls the mutation back if the write fails.
- Keep commands small and pure where possible; do heavy work off the main thread.
- Handle errors with `Result`; return typed errors the frontend can react to.
- Use Tauri v2 APIs and plugin patterns (do not copy Tauri v1 patterns).

**General**

- Keep commits focused; follow the existing commit message style in `git log`.
- Run `cargo fmt` (in `src-tauri/`) before finishing a Rust change; match the existing style for JSX/JS.
- Don't introduce new dependencies without explaining why.

## 6. Tauri v2 / macOS specifics

- **Camera & microphone** require the `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` usage strings in `src-tauri/Info.plist` (and `Info-pro.plist` for Pro), the matching macOS sandbox entitlements in `Entitlements.plist`, and the webview capability to use the media-devices API. Keep these in sync across `Info*.plist`, `Entitlements.plist`, `capabilities/default.json`, and `tauri.conf.json`/`tauri.pro.conf.json` — drift here is the usual cause of permission failures.
- **Sandbox:** if sandboxing is enabled, confirm the entitlements allow the access the feature needs before adding new file-system or device access.
- **LiveKit:** wrap all LiveKit client calls in `src/lib/` so the rest of the app doesn't depend on the SDK directly. Always clean up tracks/participants on unmount.
- **Security:** never hardcode secrets/tokens in the frontend. Keep API keys in Rust and expose them through commands if needed. The CSP is defined as an object under `app.security.csp` in `src-tauri/tauri.conf.json` — that file is the only source of truth; don't paste CSP strings elsewhere, and keep `media-src` (`blob:`, `mediastream:`) and `connect-src` (`wss:`, `ipc:`) entries intact or LiveKit and the Tauri IPC bridge break.

## 7. Working rules

- Read the relevant files before proposing changes; don't guess the structure.
- For non-trivial changes, outline a plan first and get agreement before coding.
- Make the smallest change that satisfies the task; avoid unrelated refactors.
- Follow existing style in the repo. If unsure, ask.
- Add or update tests for any new behavior.
- If something is ambiguous (requirements, missing config, permission issue), ask before implementing.
- For third-party API questions (Tauri v2, LiveKit, Solid, Tailwind v4, Vite), consult the `context7` MCP before relying on model memory. Cite the version you checked.
- Read `docs/decisions/` before proposing a design. If a settled decision changes, add a new ADR instead of re-arguing it in chat.
- Summarize what changed and why at the end, and note any manual verification steps needed on macOS.

## 8. Do / Don't

**Do**

- Use Tauri v2 APIs and plugin conventions.
- Keep LiveKit logic isolated in `src/lib/`.
- Maintain entitlements ↔ capabilities ↔ `tauri.conf.json` consistency.
- Handle errors explicitly at every Rust command boundary.

**Don't**

- Don't use React idioms in SolidJS.
- Don't store secrets in frontend code or `tauri.conf.json`.
- Don't bypass the sandbox without explaining the trade-off.
- Don't add dependencies or change config files without stating why.
