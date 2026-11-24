# VisualTalk — mediacore SFU adoption roadmap

Companion to `docs/decisions/0010-mediacore-sfu.md`. The ADR records the
*why*; this file records the *how and when*. Work top to bottom; each phase has
a gate that stops the next one until it passes.

Source of truth for mediacore's own state is its published `ROADMAP.md`
(checked against commit `d6cfa79`). This file describes the **VisualTalk-side**
work and the points where mediacore's roadmap gates us.

**How to use this file.** Tick `[x]` as items land. Items marked **BLOCKER**
stop a phase; the rest are quality gates. Write failures in the notes table at
the bottom — a failing item with its exact error is worth more than a pass.
Estimates are in working days.

---

## Phase 0 — Spike (1 week) — go/no-go

Stand mediacore up locally and prove the protocol-compatibility claim against
our own client and token path. This phase is the gate for everything else; if
it fails, the decision in ADR 0010 falls back to self-hosted LiveKit.

Setup:

1. Obtain the mediacore Docker image / compose stack from GlobalArt.
2. Bring it up alongside coturn on this Mac (mediacore ships no TURN yet, so
   loopback/LAN only for the spike).
3. Generate a mediacore API key/secret and a room.

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| P0-1 | **BLOCKER** JWT accepted | Join from `pnpm desktop` with `Settings → LiveKit` pointed at mediacore, using a token minted by `src-tauri/src/token.rs` unmodified | Room joins; `livekit-client@2.23` connects | ☐ |
| P0-2 | **BLOCKER** Audio | Two participants (Mac + phone on LAN) | Both hear each other | ☐ |
| P0-3 | **BLOCKER** Video | Both publish camera | Each sees the other's video; tile renders | ☐ |
| P0-4 | Screenshare | One participant shares screen | Other sees it; `get_active_screen_share` path works | ☐ |
| P0-5 | Data channel | Send a chat message (Rust `chat.rs` → data channel) | Receives on the other side | ☐ |
| P0-6 | Simulcast layer switch | One participant on WiFi, one deliberately throttled | Layer steps down; no freeze (see mediacore roadmap "picture stops freezing" item) | ☐ |
| P0-7 | Recording | Press Record | An `.ogg` lands in the configured S3 bucket (audio only — expected) | ☐ |
| P0-8 | Egress calls fail honestly | Press Record and watch `src-tauri/src/egress.rs` path | `start_room_egress` returns an error, not a hang or crash | ☐ |
| P0-9 | Disconnect | Kill mediacore mid-call | `disconnectReasons.js` shows words, not a bare code | ☐ |

**Gate 0:** P0-1, P0-2, P0-3 pass. If P0-1 fails, mediacore's protocol has
drifted from `livekit-protocol@0.8` — stop, fall back to self-hosted LiveKit.
Estimated: ~5 days.

---

## Phase 1 — Desktop recording rework (1 week)

mediacore has no `EgressClient`, so `src-tauri/src/egress.rs` cannot serve the
mediacore path. Accept audio-only server-side recording for launch; keep the
local `MediaRecorder` fallback for video.

- [ ] `src/lib/useRecording.js`: branch on the active SFU. For mediacore, the
  "Record" button records **meeting audio** and states so in the UI; it does
  not call `invoke("start_room_egress")`.
- [ ] `useRecording.js`: keep the `MediaRecorder` local path for video, labelled
  as a local recording (per-client, not composited).
- [ ] `src-tauri/src/egress.rs`: leave intact for the LiveKit fallback and the
  eventual mediacore Egress implementation. Do **not** write a one-off
  mediacore backend here (ADR 0010).
- [ ] Rust: `cargo check && cargo test` clean; frontend: `pnpm build` clean.
- [ ] Manual: record a 5-minute desktop meeting; confirm the Ogg plays and the
  S3 key matches the session.

**Gate 1:** recording is honest in the UI (audio vs. local video) and no code
path calls `start_room_egress` against mediacore. Estimated: ~5 days.

---

## Phase 2 — Mobile split (temporary, ~2 weeks standby)

mediacore ships no TURN and no resume yet (its roadmap: TURN was *taken out* of
M7; resume is "rejoining as a new session"). Mobile and corporate networks are
exactly where that fails, so the iOS/Android bundles stay on self-hosted
LiveKit until mediacore closes it.

- [ ] No code change: mobile keeps its current `Settings → LiveKit` target.
- [ ] Document the split in the release notes so it is not read as permanent.
- [ ] Watch mediacore's roadmap for TURN (M7) and resume landing.
- [ ] When they land: rerun a mobile spike (WiFi→LTE handoff, 5s network dip)
  against mediacore before any cutover.

**Gate 2:** mediacore TURN + resume confirmed in a release; mobile spike passes
a WiFi→LTE handoff without a full rejoin. Estimated: standby; re-evaluate at
the 6–8 week mark.

---

## Phase 3 — Production ops & load test (1–2 weeks, then cutover)

mediacore's ops scaffolding (Prometheus `/metrics`, `/healthz`, `/readyz`,
SIGTERM drain) is younger than LiveKit's. Prove capacity before pointing
default users at it.

- [ ] Production compose: mediacore + coturn + TLS (Caddy) — extend
  `docker/docker-compose.yml`, do not fork it.
- [ ] Wire Prometheus scrape + alert rules; confirm `/readyz` 503s during
  drain.
- [ ] Load test at VisualTalk scale (our largest expected room). mediacore's
  own `crates/load` bench found one node's ceiling; find ours.
- [ ] Failure test: kill a cluster node mid-meeting; confirm rooms drain and
  survivors reconnect.
- [ ] Flip the default `LIVEKIT_URL` to mediacore for desktop; keep LiveKit as
  a config option for one release.
- [ ] Update `docs/decisions/0010-mediacore-sfu.md` status proposed → accepted.

**Gate 3:** load + failure tests pass at target scale; desktop default is
mediacore; LiveKit remains selectable. Estimated: ~10 days.

---

## What we deliberately are not doing

- Not building a Rust SFU ourselves (evaluated and rejected — see the
  conversation that produced ADR 0010; mediacore is the build).
- Not implementing the `Egress` gRPC service client-side; that is mediacore's
  to add.
- Not dropping LiveKit from mobile until TURN + resume land (Phase 2).
- Not changing `src-tauri/src/e2ee.rs`; it is SFU-agnostic and stays a stub in
  CE.

## Re-evaluation triggers

- mediacore ships video recording → revisit Phase 1 (drop audio-only limit).
- mediacore ships Egress gRPC → `egress.rs` works unmodified; revisit Phase 1.
- mediacore protocol drifts from `livekit-protocol@0.8` → Gate 0 fails; fall
  back to self-hosted LiveKit.
- 6–8 weeks elapsed → re-read mediacore's roadmap and re-run Gate 0 + Gate 2.

---

## Notes / failures

| Item | What happened (exact error, build, SFU version) |
|---|---|
| | |
| | |

**Sign-off.** Gate 0 passed: ☐ — desktop on mediacore: ☐ — mobile cutover: ☐