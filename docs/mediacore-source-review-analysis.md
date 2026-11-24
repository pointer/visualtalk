# mediacore — source review for VisualTalk

Review of GlobalArt Inc.'s mediacore SFU (cloned at `/Users/Kateb/_dev/mediacore`)
against VisualTalk's needs. Companion to
[`decisions/0010-mediacore-sfu.md`](decisions/0010-mediacore-sfu.md) and
[`mediacore-adoption-roadmap.md`](mediacore-adoption-roadmap.md).

This is a **source review**, not a roadmap summary: every claim below is checked
against the cloned tree, with the file and line that proves it.

## What mediacore is

A selective forwarding unit (SFU) written in Rust on `str0m 0.23`, speaking
LiveKit's signalling and room protocol. Workspace of 12 crates (`Cargo.toml`):
`auth`, `client`, `config`, `events`, `front`, `load`, `proto`, `recording`,
`room`, `server`, `session`, `sfu`, `transport`. Stack: `axum 0.8`, `prost 0.14`,
edition 2024, `jsonwebtoken`, `str0m`, `rdkafka` (optional), `postgres`.

## The verdict in one table

| VisualTalk capability | Works against mediacore? | Why |
|---|---|---|
| Join a meeting (signalling) | ✅ Yes | `/rtc` speaks LiveKit signalling; `livekit-client` connects unmodified |
| Auth (JWT tokens) | ✅ Yes | `mediacore_auth::verify_join` reads the same LiveKit-spec JWT `token.rs` mints |
| Audio / video / screen share | ✅ Yes | `sfu` crate forwards, picks simulcast layer per subscriber |
| Moderation (mute, remove, roster) | ✅ Yes | `RoomService` Twirp methods implemented (see below) |
| **Server-side recording** | ❌ No | No `Egress` service; native audio-Ogg only |
| **Video recording** | ❌ No | Tap opens for `audio/opus` only |
| E2EE (Pro edition) | ✅ Yes | `e2ee.rs` is SFU-agnostic; unaffected by the swap |

## Evidence: mediacore implements RoomService, not Egress

The router (`crates/server/src/http.rs:17-54`) mounts exactly:

- `/rtc`, `/rtc/validate` — signalling WebSocket (`http.rs:26-27`)
- `/twirp/mediacore.RoomService/{method}` — room moderation (`http.rs:28`),
  aliased to `/twirp/livekit.RoomService/{method}` when `twirp.livekit_alias`
  is on (`http.rs:44-46`)
- Custom session/recording REST under `/api/sessions/...` — not Twirp, LiveKit
  has no equivalent (`http.rs:33-37`)
- `/healthz`, `/readyz`, `/metrics`, `/api/cluster` (`http.rs:22-25`)

There is **no `livekit.Egress` route anywhere in the server.** A grep for
`Egress`/`egress`/`startRoomComposite` across `crates/server/src/` returns
nothing. `crates/proto/protobufs/livekit_egress.proto` is vendored for
reference, but no handler consumes it.

RoomService methods implemented (`crates/server/src/rooms.rs`, `METHODS` table
from line 122): `CreateRoom`, `ListRooms`, `DeleteRoom`, `ListParticipants`,
`GetParticipant`, `RemoveParticipant`, `MutePublishedTrack`, `UpdateParticipant`
(with `canPublish`/`canSubscribe` revocation), each gated by a `roomCreate` /
`roomList` / `roomAdmin` grant. This is the surface VisualTalk's
`commands/participants.rs` needs — and it is complete.

## Evidence: how mediacore records

Recording is **native and automatic**, not RPC-driven
(`crates/server/src/recording.rs`):

- On `SessionStarted`, the server checks `room.records()` and calls
  `recorder.session_started(...)` (`recording.rs:229-243`).
- `peer.rs` opens a tap **only on microphone Opus tracks**
  (`recording.rs:20-23`: *"opens a tap on it, if it is a microphone carrying
  Opus and the room is recorded"*).
- Finished audio is written to disk as Ogg, uploaded to S3, and announced as a
  `recording_ready` event with `content_type: "audio/ogg"`
  (`recording.rs:333`).

There is no start/stop API, no layout, no video, no RTMP. Recording is governed
by room policy (`room.records()`), not by a client "Record" button.

## Why this breaks `egress.rs`

VisualTalk's `src-tauri/src/egress.rs` is a typed Twirp client for LiveKit's
`livekit.Egress` service. It calls `start_room_composite_egress`, `stop_egress`,
`list_egress` (lines 201-203, 223-225, 250-256). Against mediacore those calls
have **nothing to reach** — the service does not exist. This is why the swap is
clean for everything except recording.

Note on terminology: this is **Twirp** (protobuf-over-HTTP POST with short-lived
JWT auth), not gRPC. mediacore implements the Twirp *framework*
(`crates/server/src/twirp.rs`) and the RoomService method table, but no Egress
methods.

## Two corrections in mediacore's favor

The earlier roadmap-only analysis was pessimistic on two points; the source says
otherwise:

1. **TURN is present.** `deploy/turnserver.conf.template` + `start-turn.sh`
   ship coturn integration, and `Cargo.toml:65-69` keeps `sha1` specifically
   *"to mint TURN credentials: coturn's shared-secret mode."* The roadmap's
   "TURN taken out of M7" was about a *built-in* TURN; a coturn deployment path
   exists. Mobile is less blocked than first assumed.

2. **RoomService is more complete than the roadmap implied.** The `METHODS`
   table already covers full moderation (mute, remove, update with
   publish/subscribe revocation, suffixed-identity handling) — the exact
   surface VisualTalk's participant commands use.

## Bottom line

mediacore is a credible, source-verified LiveKit-compatible SFU for
**media + signalling + room moderation**, but **not for Egress/recording**. The
VisualTalk swap is clean for calls, auth, and moderation; the "Record meeting"
path must be reworked to accept mediacore's native audio-Ogg recording
(Phase 1 of the adoption roadmap) rather than driving an Egress API that does not
exist.

## Where to look next (open questions for the spike)

- `crates/server/src/signal.rs` — join path, token verification, reconnect
  behavior (Phase 0 spike, P0-1).
- `crates/sfu/src/{selector,alloc,layer}.rs` — simulcast layer selection and
  bandwidth estimation (spike P0-6, layer switch quality).
- `deploy/docker-compose.yml` + `Caddyfile` — the real integration stack for
  VisualTalk's `docker/` + `scripts/`.
- `interop/` — the CI job that runs LiveKit's own CLI/Node SDK against
  mediacore; the compatibility guarantee to re-run in the spike.