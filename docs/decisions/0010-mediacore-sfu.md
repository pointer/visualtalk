# 0010: Adopt mediacore as the primary SFU for desktop

- Date: 2026-11-23
- Status: proposed

## Context

VisualTalk today depends on a LiveKit SFU for media transport. The client
(`src/lib/useLiveKitRoom.js`) and the Rust core (`token.rs`, `egress.rs`) are
protocol-coupled to LiveKit: the client speaks `livekit-client`'s wire
protocol, `token.rs` mints LiveKit-spec JWTs, and `egress.rs` calls the
`EgressClient` gRPC service for server-side recording. Self-hosting LiveKit is
possible (Apache-2.0) but still means running a Go server plus coturn plus
Egress plus Redis for anything beyond a single node.

GlobalArt Inc.'s mediacore is a Rust SFU built on `str0m` that speaks LiveKit's
signalling and room protocol, so `livekit-client` and `livekit-server-sdk` work
against it unmodified. Its published roadmap documents M0–M8 as done (core
forwarding, simulcast, layer selection, data channels, audio recording to Ogg
in S3, webhooks/Kafka/Postgres, cluster with node registry and signal relay,
Prometheus metrics, SIGTERM drain, an interop CI job running LiveKit's own CLI
and Node SDK, and a load bench). The same roadmap names three gaps that affect
VisualTalk: no `Egress` gRPC service (recording is SFU-native, audio-only),
no video recording at all (estimated 2–3 weeks per codec, plus prerequisites),
and no TURN or resume (mobile and corporate networks fail or rejoin as a new
session).

The E2EE Pro edition is not a blocker: `src-tauri/src/e2ee.rs` is a stub whose
API surface (`WrappedKeyData`, `EncryptedChatPayload`, `EncryptedChunkResult`)
carries no `livekit_api` or `livekit_protocol` dependency. E2EE sits above the
media path and is SFU-agnostic.

## Decision

Adopt mediacore as the primary SFU for the desktop build, in phases, with
self-hosted LiveKit as the fallback until mediacore closes the gaps below.

- **Phase 0 — Spike (1 week).** Stand up mediacore locally, point
  `Settings → LiveKit` at it, and confirm from `pnpm desktop` that audio,
  video, screen share, and data channels work; that the `livekit-client@2.23`
  in `useLiveKitRoom.js` and the `token.rs` JWT are accepted unmodified; and
  that the recording button produces an Ogg file in S3. This is the go/no-go
  gate.
- **Phase 1 — Recording.** mediacore does not implement `EgressClient`, so
  `src-tauri/src/egress.rs` cannot work against it as-is. For launch, accept
  audio-only recording and rework `useRecording.js` to reflect that the
  "Record" button records meeting audio, not video. Do **not** build a one-off
  `egress.rs` backend for mediacore; revisit when mediacore implements Egress
  gRPC or ships video recording.
- **Phase 2 — Mobile.** Until mediacore ships TURN (M7) and resume, the iOS
  and Android bundles keep using self-hosted LiveKit (or LiveKit Cloud) for
  media. Desktop uses mediacore. This is a temporary split, recorded here so
  it is not mistaken for a permanent architecture.
- **Phase 3 — Cutover.** When mediacore ships TURN and resume, point all
  bundles at mediacore and remove the LiveKit fallback. Re-evaluate at the
  6–8 week mark.

No Rust core code changes are required for phases 0–2. The coupling is
protocol-level (JWT format, Egress gRPC), and mediacore speaks the same JWT
format. The only code change is in `src/lib/useRecording.js`, which must stop
calling `start_room_egress` for the mediacore path and instead surface
audio-only recording honestly in the UI.

## Consequences

- Desktop users get a Rust-native, self-hosted SFU with audio recording and
  S3 upload, without running LiveKit's Go server or Egress service.
- Server-side video recording is lost on the mediacore path until mediacore
  ships it. The local `MediaRecorder` fallback in `useRecording.js` still
  works for video, but it is per-client, not composited.
- Mobile users run on a different SFU than desktop users until mediacore's
  M7 (TURN) and resume land. This is a temporary split and must be revisited
  at the 6–8 week re-evaluation.
- `src-tauri/src/egress.rs` is dead code on the mediacore path. It is kept
  for the LiveKit fallback and for the eventual mediacore Egress
  implementation, but it is not called in the mediacore configuration.
- mediacore's cluster and ops story (Prometheus, `/healthz`, `/readyz`,
  SIGTERM drain) is younger than LiveKit's. Production adoption requires
  load testing at VisualTalk's scale before cutover.
- The interop CI job in mediacore's repo is the compatibility guarantee. If
  mediacore's protocol version drifts from `livekit-protocol@0.8`, the spike
  will fail and this decision must be revisited.
- If the spike fails, the fallback is self-hosted LiveKit (the Apache-2.0
  server), which requires no VisualTalk code changes.