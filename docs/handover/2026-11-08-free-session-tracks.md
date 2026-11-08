# VisualTalk — free-session handover tracks (2026-11-08)

Six self-contained tracks for unattended work by a coding agent (GitHub Copilot coding
agent on a fresh clone, or a local `opencode` `/medium` lane driving `@builder`).
Written for models on a free/fallback provider: every track ends in a command that
**fails loudly**, not a judgement call.

Read `AGENTS.md` and `Guidance.md` first — they are canonical and override anything
here. This file only adds track scope and the guardrails below.

## 0. Preamble — read before editing anything

### 0.1 Hard guardrails (violating one of these is worse than not finishing a track)

1. **Never run `scripts/setup-pro.py`, and never run any `*:pro` build command**
   (`desktop:pro`, `desktop:build:pro`, `ios:build:pro`, `android:build:pro`).
   That script overwrites `src-tauri/src/e2ee.rs` with private Pro cryptography source
   from the gitignored `src-tauri/e2ee-pro/`. **Committing that file publishes the
   private Pro implementation to this public repository. It cannot be undone.**
   If `git status --short` ever shows `src-tauri/src/e2ee.rs` as modified, stop
   immediately and report `PIVOT_REQUIRED: e2ee.rs modified`.
2. Before any `git add`, run `git status --short` and confirm nothing outside your
   track's file list appears. Never `git add -A` / `git add .` — always explicit paths.
3. **CE-only verification**: `cd src-tauri && cargo check && cargo test`
   (baseline: 69 passing tests) plus `pnpm build`. Never `--features e2ee` or
   `--features pro` — those require private sources that must not be present.
4. No new dependencies. No `pnpm install`. Never edit `pnpm-lock.yaml` or
   `package-lock.json` (a legacy artifact in the repo root — leave it alone).
   **Never run `npm`**; `pnpm` only.
5. No changes to: `src-tauri/gen/**`, `Info.plist`, `Info-pro.plist`,
   `Entitlements.plist`, `capabilities/**`, `tauri.conf.json`,
   `tauri.pro.conf.json`, bundle identifiers, signing, or CSP. If your track seems to
   need one, that is a `PIVOT_REQUIRED`, not a fix.
6. Never read or copy the contents of `docker/.env`, `~/Keys/**`,
   `src-tauri/gen/android/keystore.properties`, or any API key. Never paste a real
   credential into a file, commit message, or PR description. Use `devkey` and
   `<your-secret>` placeholders.
7. Never read whole: `THIRD_PARTY_NOTICES.md`, lockfiles, `dist/`, `node_modules/`,
   `src-tauri/target/`, `src-tauri/gen/`, `docker/recordings/`. Grep for the line
   range you need.
8. Do **not** edit: `Todo.txt`, `docs/decisions/*`, `docs/anssi-*`, `docs/bis-*`,
   `docs/export-compliance-pro*.md`, `docs/play-store-submission.md`, `EULA*`,
   `PRIVACY.md`, `SUPPORT.md`, `SECURITY.md`. If your track reveals that a decision
   must change, write one line under "Questions for the owner" — do not write an ADR.
9. **Known pre-existing failure: `cargo fmt --check` fails repo-wide** (~34 hunks in
   files unrelated to any current work — a rustfmt version drift). Run `cargo fmt` only
   if you edited Rust files, and if it reformats anything you did not touch, revert
   those hunks. Do not mass-reformat.
10. If a verification command fails twice, stop and report it with its output. Do not
    "fix" an unrelated failure to make a command go green.
11. Do not push to `main`. One track = one branch (Copilot: one PR; opencode: leave the
    commit on a `handover/<track>` branch for review). Conventional-commit style,
    matching `git log`: `docs(docker):`, `chore(scripts):`, `fix(recording):`,
    `refactor(ipc):`.
12. One track per session. Do not start a second track because the first went fast.
13. **CI will not catch you.** The only workflow is `.github/workflows/release.yml`,
    and it runs neither `cargo test` nor `pnpm build`. Your own verification output is
    the only evidence a track works, so paste the decisive line into the report.

### 0.2 What each track needs

| Track | Needs Docker? | Needs a Mac GUI? | Copilot-eligible |
| --- | --- | --- | --- |
| 1 doc drift | no | no | yes |
| 2 whisper hygiene | **yes** | no | **no** |
| 3 whisper contract | **yes** | no | **no** |
| 4 i18n parity | no | no | yes |
| 5 egress ids | no | no | yes |
| 6 invoke migration | no | no | yes |

### 0.3 Allowed Pro-frontend check

`pnpm check:pro-frontend` sets `VITE_EDITION=pro` and runs `vite build`. It touches no
Rust and no private source, so it is allowed when a track must prove a Pro-gated JSX
branch compiles and dead-code-eliminates. It is **not** a Pro build and must never be
reported as one.

### 0.4 Required report format (verbatim, at the end of every track)

```text
Track: <id and title>
Changed: <file list>
Ran: <command -> pass/fail, with the decisive line of output>
Not run: <command -> why>
Diff check: clean / <findings>
Secrets check: no credential read or written
Guardrail breaches: none / <what and when>
Residual risk: <bullet list, or "none identified">
Questions for the owner: <bullet list, or "none">
```

Never claim a check passed that you skipped.

---

## Track 1 — `livekit-local.sh` doc drift: rename, and flag the two lost subcommands

**Status: DONE 2026-11-08** (`c72dd84` + audit fix `fb7081d`). Kept for the record and
for the corrected gate below. The first pass left three `.sh` references (both
quick-start `smoke` lines and the flagged section), kept advertising the removed
`restart`/`smoke` in the day-to-day table, the LAN note, three troubleshooting cells and
the verified-behaviour list, and missed `docker/.env.example` entirely because the gate
only grepped `*.md` and `*.yml`.

**Follow-up (same day):** the owner chose to restore the lost subcommands rather than
delete the docs, so `smoke` and `restart` are now implemented in
`scripts/livekit-local.py` — ported from the deleted `.sh` at `bf8404f^`, not rewritten.
The "removed / owner decision pending" markers this track added were therefore reverted,
and the README's original smoke/restart documentation is accurate again. `smoke` also
gained two fixes the `.sh` never had: it probes for a host-reachable address because
`LIVEKIT_NODE_IP` may be an emulator-only `10.0.2.2`, and it names the stale-credentials
cause instead of dumping `lk`'s Go stack trace.

**Objective.** The stack helper was migrated from `scripts/livekit-local.sh` to
`scripts/livekit-local.py`; the `.sh` no longer exists, but 24 references to it remain
across three files (15 in `docker/README.md`, 5 in `docker/docker-compose.yml` over 4
lines, 4 in `README.md`). Replace every reference with the real invocation. Separately,
the `.py` dropped two subcommands the README still advertises — those must be flagged,
not faked.

**Verified ground truth (do not re-derive; do not contradict without evidence).**
`scripts/livekit-local.py` implements exactly five subcommands — `up`, `down`, `status`,
`logs`, `creds` — with `up` flags `-r/--recording`, `-t/--translation`, `--host`, and
`logs` flags `-f/--follow` plus an optional service argument.
**`restart` and `smoke` are NOT implemented.**

**Files.**
- `docker/README.md` — `.sh` occurrences near lines 34, 35, 36, 57, 118, 251, 265, 300,
  333, 384, 397, 463, 510, 586, 593.
- `docker/docker-compose.yml` — the comment at line 12, and the trailing hint text
  inside the `${LIVEKIT_API_KEY:?…}` / `${LIVEKIT_API_SECRET:?…}` strings at lines 37
  (**twice on that line** — the key and the secret each carry the same hint), 113 and
  114 ("or run scripts/livekit-local.sh up"). Change only that prose, never the variable
  names or the text before the `:?`.
- `README.md` lines **126, 181, 182, 183** — line 126 is the tree entry
  `livekit-local.sh      # up/down/restart/status/logs/creds/smoke wrapper` (also drop
  `restart` and `smoke` from that comment), and lines 181-183 are the quick-start block
  (`up --recording`, `creds`, `smoke --recording`). Line 183 is a `smoke` reference, so
  rule 3 applies to it as well as to `docker/README.md`.

**Decision rules — apply literally.**
1. `./scripts/livekit-local.sh <args>` → `python3 scripts/livekit-local.py <args>`,
   keeping only flags that exist (see ground truth above).
2. Where a documented **`restart --recording`** is used (`docker/README.md:128`, `129`,
   `463`), substitute the equivalent the README already documents in its own table at
   line 128:
   `docker compose -f docker/docker-compose.yml --profile recording up -d --force-recreate`
   (add `--profile translation` where the surrounding text also starts whisper). Note in
   one line that the wrapper no longer exposes `restart`.
3. Where **`smoke`** is used (`docker/README.md:36`; the whole "Verifying a recording"
   section at 297-327; mentions at 68, 70, 196, 250; the table row at 133; and
   `README.md:183`): **do not delete the prose and do not invent a command.** It records
   real, previously-working behaviour. Add one clearly-marked blockquote at the top of
   the "Verifying a recording" section, worded as below:

   ```text
   > Note: the `smoke` subcommand is not implemented in `scripts/livekit-local.py`
   > (which provides up/down/status/logs/creds only). The steps below describe the
   > behaviour of the removed `.sh` wrapper and are pending an owner decision:
   > re-implement `smoke`, or replace this section with the manual equivalents at
   > lines 329-335.
   ```

   Keep lines 329-335 (`ffprobe` / `status` / `lk egress list`) as the manual route.
4. `docker/README.md:251` cites `scripts/livekit-local.sh:368-378`. Re-derive the
   equivalent range in the `.py`, or drop the line numbers and name the function
   instead. Never cite a line range you have not opened.
5. Docs and comments only. Do not "improve" surrounding prose, restructure the README,
   or add sections.

**Verification.**
```bash
# Use git grep, NOT `grep --include`: two of the stale references lived in
# docker/.env.example, which no *.md/*.yml filter matches — that blind spot is how the
# first pass missed them. This handover file quotes the old name, hence the pathspec
# exclusion; do not "fix" this document to make the check pass.
git grep -n 'livekit-local\.sh' -- . ':!docs/handover'
# must print nothing (exit status 1)
python3 scripts/livekit-local.py --help        # confirm the five subcommands you wrote
grep -n 'smoke\|restart' docker/README.md README.md   # every hit is now a compose
                 # equivalent, or covered by the owner-decision note
docker compose -f docker/docker-compose.yml config >/dev/null && echo compose-ok
git diff --stat                                # only the three files above
```

**Commit:** `docs(docker): repoint helper references at livekit-local.py`

---

## Track 2 — Docker translation-stack hygiene (Docker required — local opencode only)

**Status: DONE 2026-11-08** by the lead, with two findings this track did not anticipate:
the compose `environment` block set `WHISPER_MODEL` / `WHISPER_DEVICE`, which the image
**silently ignores** (it reads `WHISPER__MODEL` / `WHISPER__INFERENCE_DEVICE`, and the
value must be a full HF repo id, not `small`), and the image ships **no `curl`, `wget` or
`nc`** — only `python3` and `uv` — so the `curl -fsS` healthcheck suggested below would
have been permanently broken. Implemented instead: pinned `${WHISPER_VERSION:-0.5.0-cpu}`,
a `python3`/urllib healthcheck with `start_period: 30s` (weights download on the first
*request*, not at boot, so 60s was unnecessary), `WHISPER__MODEL` passed through under the
image's own spelling so a stale `.env` cannot forward an invalid model id, a loopback /
no-auth warning, a **Live Translation (opt-in)** README section, and the diagram line.
Verified live: `compose config` renders, the container reaches `healthy` on the first
probe with `WHISPER__MODEL` applied. Evidence: `docs/whisper-service-contract.md` §6.

**Objective.** The `whisper` service exists in `docker/docker-compose.yml:129-141`,
`WHISPER_*` keys exist in `docker/.env.example:66-71`, and the wrapper already accepts
`--translation` — but `docker/README.md` never mentions it, the image tag floats while
every other image is pinned, and it is the only service with no health check at all
(`redis` declares one in compose at line 72; `livekit` gets its `HEALTHCHECK` from
`docker/Dockerfile:99`, which is why `egress` can use `depends_on: …
service_healthy`; whisper is a third-party image we do not build, so its check must be
declared in compose). Bring it to the standard the rest of the stack already meets.
**No product code changes.**

**Facts already established (do not re-derive).**
- Image `fedirz/faster-whisper-server:latest-cpu`; the upstream project is **archived**
  ("moved to `speaches-ai/speaches`"), last push roughly two years ago.
- `latest-cpu`, `0-cpu`, `0.5-cpu`, `0.5.0-cpu` and `sha-caba05a-cpu` are the same
  image, digest `f36450118071`, about 404 MB compressed on arm64. So pinning to
  `0.5.0-cpu` is a no-op today and protective tomorrow.
- Repo policy is pinned tags with a stated reason: `LIVEKIT_VERSION`, `EGRESS_VERSION`
  and `REDIS_VERSION` each default to a literal in the compose file, and the `egress`
  comment says a floating tag "would silently swap the recording pipeline under you".

**Files.**
- `docker/docker-compose.yml` — the `whisper` service only:
  - `image:` → `fedirz/faster-whisper-server:${WHISPER_VERSION:-0.5.0-cpu}`
  - add a `healthcheck` against the container-internal port `8000` using the endpoint
    confirmed in Track 3 (typically `curl -fsS http://127.0.0.1:8000/health`), with
    `interval: 10s`, `timeout: 5s`, `retries: 10`, `start_period: 60s` — the image
    downloads model weights on first run, so a short `start_period` fails spuriously.
  - **If the service exposes no health endpoint**, do not fake one: leave the
    healthcheck out and add a one-line comment saying why.
  - add a short comment in the style of the `egress` block: pinned because upstream is
    archived, so `latest-cpu` would outlive the project silently.
- `docker/.env.example` — add `WHISPER_VERSION=0.5.0-cpu` inside the existing
  `# ── Live Translation (Whisper service)` block (lines 66-71), with a one-line note
  that the upstream image is archived.
- `docker/README.md` — add a **Live Translation (opt-in)** section in the existing
  voice, covering: `python3 scripts/livekit-local.py up --translation`; host port
  `${WHISPER_PORT:-8080}` → container `8000`; model selection via `WHISPER_MODEL`
  (default `small`); first-run weight download; the ~400 MB pull; the archived-upstream
  caveat; how a client reaches it on loopback; and that live translation is
  **Pro-gated** and, per `docs/decisions/0003-translation-architecture.md`, available
  only in self-hosted / direct distributions — never in an app-store build. Add
  `whisper` to the ASCII diagram (lines 12-27) as a second opt-in profile beside
  `egress`.

**Constraints.**
- Do not change any other service, port mapping, network, or volume.
- Do not leave containers running: always `python3 scripts/livekit-local.py down` after.
- Never read `docker/recordings/**` (binary egress output), and never start a recording
  to prove this track — whisper needs no egress.
- Do not create or edit `docker/.env` (real credentials). `.env.example` only.
- If the container will not start, report it under "Questions for the owner" instead of
  changing the image or the platform.

**Verification.**
```bash
docker compose -f docker/docker-compose.yml --profile translation config | grep -A8 whisper
python3 scripts/livekit-local.py up --translation
docker ps --filter name=visualtalk-whisper
curl -fsS http://127.0.0.1:8080/health; echo
python3 scripts/livekit-local.py status
python3 scripts/livekit-local.py down
grep -n -i 'whisper' docker/README.md | head
git diff --stat        # only the three files above
```

**Commit:** `chore(docker): pin and document the local Whisper translation service`

---

## Track 3 — Capture the real Whisper service contract (Docker required — local opencode only)

**Status: DONE 2026-11-08** — see [`docs/whisper-service-contract.md`](../whisper-service-contract.md).
Headline: **translation is English-only and a target language is not expressible**, so the
per-attendee target-language MVP needs a second MT hop (owner decision, §11 of that doc).
Also captured: SSE streaming works, `verbose_json` returns the detected source language,
errors are opaque 500s, there is no auth, and latency is ~4.3 s fixed + 0.10×audio (so
batch ~10-15 s windows). **One instruction below was wrong and is corrected here:**
`/openapi.json` is *not* the complete route list — `/api/transcribe` and `/api/translate`
are served (POST → 422) but absent from the spec. Do not treat the spec as exhaustive for
any service; probe the routes as well as the schema.

**Objective.** `Todo.txt` requires the Whisper service contract to be verified before
any code is written against it. Produce that evidence as a document. **Zero product
code changes** — this track exists so a later track can be trusted.

**Deliverable:** `docs/whisper-service-contract.md` containing:

1. The exact image and tag started, plus the `docker image inspect` digest.
2. Every route the service actually serves. Hit `/`, `/health`, `/docs`,
   `/openapi.json`, `/v1/audio/transcriptions`, `/v1/audio/translations`,
   `/api/transcribe`, `/api/translate` and record the status code of each. The
   **`/openapi.json` dump is the ground truth** — list only routes that appear in it;
   do not copy them from any README.
3. A **real** request against a real audio file, with the raw `curl` command and the
   raw JSON response both pasted in full. Generate the clip yourself (for example
   `ffmpeg -f lavfi -i sine=frequency=440:duration=3` for a tone, or a short spoken
   recording you make). **Never use `docker/recordings/` output** — it is user media.
4. The parameters that matter for a client implementation: accepted audio formats and
   upload encoding (`multipart/form-data` field name), `language` value format
   (BCP-47? ISO-639-1? is `auto` accepted?), `task` values, `response_format` options,
   whether chunked/streaming (SSE) transcription is supported **on the pinned tag**,
   whether the model is chosen per request or only by env, authentication (none /
   `API_KEY`), and the exact behaviour on bad input and on an oversized upload.
5. **The decisive question, answered with evidence rather than reasoning:** does
   `task=translate` on this image translate into the *requested target language*, or
   **always into English?** Run it with a non-English audio sample plus
   `language=<non-English>` and paste the output. Then state plainly what follows: if
   translation is English-only, the promised MVP behaviour in `Todo.txt` lines 56-57
   ("private captions translated to that attendee's selected target language")
   **cannot** be met by this service alone and needs a second machine-translation hop.
   Do not design that hop. Report what the evidence implies and stop there.
6. Latency and resource notes, clearly labelled **observed on this machine, not a
   benchmark**: wall-clock seconds per ~10 s clip, and container CPU/RSS if readable.
7. A closing **Open questions for the owner** list: whether an archived upstream image
   is an acceptable Pro dependency, the `speaches` migration path, CPU vs GPU, and
   whether the `small` model is good enough for non-English audio.

**Constraints.** Cite raw command output only. Any claim without a captured
command+response next to it must be marked `UNVERIFIED`. Never write a real credential
into the document. Do not edit `docker/docker-compose.yml` in this track (that is
Track 2) — if you need a healthcheck to run it, note that in the report instead. Do not
add product code, i18n keys, or links from other docs beyond what Track 2 already does.

**Verification.**
```bash
test -f docs/whisper-service-contract.md && wc -l docs/whisper-service-contract.md
grep -c 'curl' docs/whisper-service-contract.md              # expect >= 2
grep -n 'UNVERIFIED' docs/whisper-service-contract.md        # report what remains
grep -n -i 'english-only\|into English' docs/whisper-service-contract.md   # the answer, stated
git diff --stat     # exactly one new file
```

**Commit:** `docs(translation): record the pinned Whisper service contract`

---

## Track 4 — i18n parity guard + repair the `fr`/`es` gaps

**Objective.** `en.json`, `fr.json` and `es.json` are drifting: a crude token count
gives 955 / 953 / 953, so at least a couple of keys are missing from the non-English
files (the AI assistant, translation settings and recordings features are all newer than
the last parity pass). Parity is a ship requirement. Add a mechanical guard in the style
of the two that already exist (`scripts/check_jsx_refs.py`,
`scripts/verify_models.py`), then close the current gaps.

**Files.**
- New `scripts/check_i18n_parity.py` — **Python 3 standard library only** (`json`,
  `pathlib`, `sys`, optionally `difflib`), mirroring the brevity and plain-print style
  of the existing guard scripts. Behaviour:
  - load all three locales; walk keys recursively, reporting a dotted path per leaf;
  - print keys present in `en` but missing from `fr` / `es`, and keys present only in
    `fr` / `es`;
  - report empty-string values, and values identical to the English text, as
    **warnings** (placeholders needing human review), not as failures;
  - exit `1` on any missing/extra key, exit `0` otherwise;
  - when clean, print `OK: en/fr/es parity (<n> keys)` so a human can see it ran.
- `package.json` — add exactly one script, next to `license:check`:
  `"i18n:check": "python3 scripts/check_i18n_parity.py"`. No dependency changes, no
  other script edits, do not reorder the file.
- `src/locales/fr.json`, `src/locales/es.json` — add the missing keys.

**Constraints.**
- **Do not touch `en.json`** — it is the source of truth — unless a key is provably
  dead, in which case report it rather than deleting it.
- Translations must be plausible target-language text. **Never copy the English value
  into `fr`/`es` just to make the script pass, and never leave `""`.** If you are not
  confident in a rendering, keep your best attempt and list that key under "Questions
  for the owner" for native review.
- Preserve each file's existing key order and formatting (2-space indent, no re-sorting)
  so the diff stays reviewable.
- No JSX, no Rust, no hook changes in this track.

**Verification.**
```bash
python3 scripts/check_i18n_parity.py; echo "exit=$?"      # expect exit=0 + the OK line
python3 -c "import json;[json.load(open('src/locales/%s.json'%l)) for l in ('en','fr','es')]" && echo parse-ok
# self-test the guard actually fails: add one bogus key to a scratch copy of en.json,
# confirm exit=1, then restore it and confirm exit=0 again.
pnpm build
python3 scripts/check_jsx_refs.py
git diff --stat    # script + package.json + the two locale files only
```

Report the exact count of keys you added per locale, and the list of keys you are not
confident about.

**Commit:** `chore(i18n): add locale parity guard and close the fr/es gaps`

---

## Track 5 — Split the shared egress id so recording and streaming cannot collide

**Objective.** `src/lib/useRecording.js` keeps **one** `activeEgressId` signal for both
LiveKit egress output types. `startEgressRecording` writes it at line 253 and
`startRtmpStream` writes it at line 295; both also set `recordingMode("egress")`
(lines 255, 296), and `stopRecording()` (line 358) routes solely on that one mode. So a
record-then-stream sequence overwrites the id and the stop path stops the **wrong**
egress session. Streaming has **no UI today** — `startRtmpStream`, `stopRtmpStream` and
`isStreaming` have no call sites outside this file — so this is a latent defect. Fix the
state model now so the later streaming track is not built on top of it.
**Do not build any UI.**

**Files.** `src/lib/useRecording.js` only.

**Design to implement.**
- Replace the single signal with two, one per egress output type:
  `activeRecordingEgressId` and `activeStreamEgressId`.
- `startEgressRecording` writes the recording id, `startRtmpStream` writes the stream
  id. Each clears **its own** id on stop and on failure, and never the other's.
- `stopEgressRecording()` stops the recording id; `stopRtmpStream()` stops the stream
  id. Each returns `null` when its own id is absent — it must not fall through to the
  other session.
- `stopRecording()` must stop every active egress session in a deterministic order
  (recording first, then stream) and reset both, so nothing is left running on the
  server.
- Keep `recordingMode` honest when both run: it describes the recording, while the two
  dimensions are already carried independently by the existing `isRecording` and
  `isStreaming` signals. Do not encode both into one string.
- Keep `activeEgressId` in the returned object (line 375) as a backwards-compatible
  accessor yielding the active **recording** id, so no caller breaks. Do not add, rename,
  or remove any other exported member.
- `startDurationTimer()` is called by both paths: guard it so starting a second session
  while one runs does not create a duplicate `setInterval`, and `stopDurationTimer()`
  still clears it exactly once.

**Constraints.**
- No new file, no new dependency, no `livekit-client` import, no Rust changes.
- Do not wire anything into `MeetingView.jsx` or `MeetingToolbar.jsx` — that is the
  streaming track, which is **not** in this pack.
- Do **not** emit `VtEvent::RecordingStatusChanged` (`src-tauri/src/events.rs:62`): it is
  intentionally dead code until a UI consumes it.
- Preserve the existing error convention in this file: `setRecordingError(err || "...")`
  and `return null` on failure. A stopped session must never look like a saved recording.

**Verification.**
```bash
grep -n 'activeEgressId\|activeRecordingEgressId\|activeStreamEgressId' src/lib/useRecording.js
grep -rn 'activeEgressId' src/ | grep -v 'lib/useRecording.js'      # must be empty: no external consumer
pnpm build
pnpm check:pro-frontend
python3 scripts/check_jsx_refs.py
cd src-tauri && cargo check && cargo test     # expect 69 pass — this track must not change Rust
git diff --stat                                # exactly one file
```
The record → stream → stop-both sequence cannot be executed without a live meeting:
report it as **not verified**, with the reason. Do not claim it works.

**Commit:** `fix(recording): separate recording and stream egress ids`

---

## Track 6 — Migrate direct `invoke()` call sites to the typed `src/lib/ipc.js` wrapper

**Objective.** `src/lib/ipc.js` exports an `invoke` whose `CommandMap` JSDoc typedef
(lines 55-131) gives the editor the resolved shape of every command — the only such
safety net in a project with no TypeScript build step. Twelve files still import
`invoke` from `@tauri-apps/api/core` directly and therefore resolve to `unknown`.

**Measured starting point.** 13 files import `@tauri-apps/api/core`; 12 of them are
`src/lib/ipc.js` itself plus candidates below. Per-file invoke counts:
`ChatPanel.jsx` 11, `HomeTab.jsx` 5, `useScheduledMeetings.js` 4, `useLiveKitRoom.js` 3,
`NotesTab.jsx` 2, `App.jsx` 1, `MeetingView.jsx` 1, `useMeetingHistory.js` 1,
`useMediaDevices.js` 1, `I18nProvider.jsx` 1.

**Excluded — do not touch in this track, for these reasons:**
- `src/components/chat.jsx` — the E2EE envelope path (it string-matches
  `E2EE_KEY_CHANGED` / `E2EE_REPLAY` / `E2EE_SENDER_MISMATCH` and calls commands by
  variable name). Editing it risks silently breaking fail-closed crypto behaviour.
- `src/lib/useRecording.js` — owned by Track 5; converting it here would collide.
- `src/lib/ipc.js` — it *is* the wrapper (`invoke as tauriInvoke`).

**Files — convert at most FOUR in one session, then stop.**
Recommended first session, smallest and simplest: `src/lib/useMeetingHistory.js`,
`src/lib/useMediaDevices.js`, `src/components/NotesTab.jsx`, `src/App.jsx`.
Later sessions, if asked: `src/lib/useScheduledMeetings.js`,
`src/lib/useLiveKitRoom.js`, `src/components/HomeTab.jsx`, `src/MeetingView.jsx`,
`src/components/ChatPanel.jsx`, `src/i18n/I18nProvider.jsx`.

**Design to implement, per file.**
- Change only the import line. Path depth matters:
  `src/*.jsx` → `from "./lib/ipc"`; `src/components/*.jsx` → `from "../lib/ipc"`;
  `src/lib/*.js` → `from "./ipc"`; `src/i18n/*.jsx` → `from "../lib/ipc"`.
- **Call sites stay byte-identical.** The wrapper is a pass-through: do not restructure
  arguments, error handling, or `async` shape.
- If a file imports anything else from `@tauri-apps/api/core` (e.g. `Channel`, `Event`),
  keep that import line; migrate only `invoke`. All 12 candidate lines are currently
  plain `{ invoke }`, so expect a one-line change per file.
- **Expect zero `CommandMap` additions** for the recommended files: every command they
  call (`get_meeting_history`, `set_devices`, `get_user_notes`, `update_user_notes`,
  `open_meeting_window`, `get_scheduled_meetings`, `get_user_profile`,
  `get_host_meeting_data`, `get_meeting_session`, `get_preferred_speaker`,
  `notify_meeting_ended`, `get_user_settings`, `update_user_settings`,
  `get_meeting_invite`, `update_user_profile`, `get_blocked_participants`,
  `set_participant_blocked`, `pick_file`, `read_file_chunk`, `save_download`,
  `get_file_info`, `get_report_contact`, `ask_ai`, `get_ai_settings`) is already mapped.
  If you believe one is missing, re-check `src/lib/ipc.js` lines 55-131 before adding
  anything, and follow the serde spelling rules at the top of `src/models/index.js`
  (snake_case by default; `TranslationSettings`, `TranslationStrategy`,
  `BackgroundSettings` and `BackgroundKind` are camelCase; argument names are
  camelCase-converted).
- **Never add to `CommandMap`:** the ten `e2ee_*` commands, nor the ffmpeg/egress
  commands (`start_room_egress`, `stop_egress`, `ffmpeg_transcode`,
  `ffmpeg_stream_to_rtmp`, and the recording-chunk/ffmpeg helpers) —
  `src/lib/ipc.js:12-16` states they are deliberately unmapped. Leave them `unknown`.

**Constraints.** Four files maximum. No renames, no reformatting of untouched lines, no
new commands, no Rust edits, no component extraction, no behaviour change. If a file's
usage is too tangled to convert with an import-line change alone, skip it and say why.

**Verification.**
```bash
pnpm build
python3 scripts/verify_models.py   # "mapped but not registered" must stay "none";
                                   # "registered but unmapped" must not GROW
python3 scripts/check_jsx_refs.py
grep -rln 'from "@tauri-apps/api/core"' src/ | sort
# expect the count to drop by exactly the number of files you converted
# (13 before; 9 after four files) and src/lib/ipc.js to remain
git diff --stat                    # only the files you converted
```

**Commit:** `refactor(ipc): route <n> call sites through the typed invoke`

---

## Track 7 — Research: can LiveKit Cloud transcription deliver target languages?

**Objective.** Answer one question with citations, and change no product code. Whether
VisualTalk should build captions at all hinges on it: the local path can only ever give
a source-language transcript plus English, so if the cloud path cannot do target
languages either, the feature is captions — not translation — and should be priced and
marketed as such.

**Question.** Does a LiveKit **Cloud** transcription agent translate into an arbitrary
target language (not just English), and can it run against a *user's own* LiveKit Cloud
project using the API key they paste into VisualTalk Settings?

**Method.** The docs site moved and deep links 404 — start from
`https://docs.livekit.io/sitemap.xml` and the `livekit/agents` repo rather than guessing
URLs. Establish: (1) what LiveKit Cloud offers as managed transcription; (2) whether
target-language translation is supported and by which provider/plugin; (3) whether it
needs a LiveKit account owned by *us* or works with the customer's own project and key;
(4) pricing model (per minute? included?); (5) whether the client receives it through
`RoomEvent.TranscriptionReceived`, which `livekit-client` 2.23.0 already supports.

**Already established — do not re-derive.** No local STT plugin exists
(`livekit-plugins-whisper`, `-faster-whisper`, `-inference`, `-translate` are absent
from both the agents repo and PyPI; `-silero` is VAD only). Browser clients cannot
publish transcriptions, only receive them. Whisper's own `translate` is English-only
(`docs/whisper-service-contract.md` §5).

**Deliverable.** `docs/translation-provider-research.md`: a recommendation
(cloud-first / captions-only / defer), the evidence per claim with URLs, and an explicit
list of what could not be verified. If the answer requires contacting LiveKit or creating
a trial Cloud account, say so and stop — do not create accounts.

**Constraints.** No product code, no dependency changes, no edits to `docs/decisions/`
(if the answer changes ADR 0003, report that; the owner writes the ADR). No credentials
in the document.

**Verification.**
```bash
test -f docs/translation-provider-research.md && wc -l docs/translation-provider-research.md
grep -c 'https://' docs/translation-provider-research.md   # every claim needs a source
grep -n -i 'unverified\|could not verify' docs/translation-provider-research.md
git diff --stat   # exactly one new file
```

**Commit:** `docs(translation): research cloud transcription capability`

---

## Explicitly out of scope for these sessions

Streaming UI (banner, toolbar button, organizer-only + Pro gating, `docker/` RTMP sink),
captions UI (`SubtitleOverlay.jsx`, the `CC` toolbar control), per-participant audio
capture behind `src/lib/`, the Rust WebSocket audio relay (`src-tauri/src/translation.rs`),
any `e2ee-pro` / Tier-2 crypto work, Android icon regeneration / `visualtalk://` intent
filter / `gen/` regeneration / physical-device retest, Play Console uploads and the
data-safety and content-rating forms, macOS signing and notarization, the macOS
dmg-versus-App-Store distribution decision, version bumps, `CHANGELOG`, and any
dependency addition.

If your track appears to need one of these: stop, report it under "Questions for the
owner", and leave it to the human. A partially finished track is worth more than an
unrequested change to any of those surfaces.
