# VisualTalk / MediaCore in-process embedding plan

**Status:** Proposed  
**Scope:** Evaluate and, only if the hosting model supports it, embed MediaCore in a VisualTalk-owned Rust/Tokio process. This is distinct from adopting MediaCore as a separately deployed SFU service.

## Recommendation

MediaCore exposes a Rust server library, so same-process integration is technically plausible. However, VisualTalk's current Rust host is the Tauri desktop application, not an evident shared backend: it stores user-selected LiveKit server settings and connects to that server. Embedding an SFU in each desktop installation would make each user's machine responsible for hosting meetings and making signaling and UDP media reachable to other participants.

**Do not begin product integration until the hosting topology is decided.** For ordinary multi-user meetings, prefer a shared VisualTalk-controlled media host. That may be a separate MediaCore service, or a VisualTalk server process that links MediaCore; neither means embedding an SFU in every desktop client. Proceed with embedding in the Tauri process only for an explicitly supported user-hosted or single-host meeting model, after its network, security, and lifecycle requirements pass Phase 0.

The existing LiveKit-compatible client and user-configured server path should remain available throughout the evaluation. This plan does not authorize shipping server credentials in the desktop app.

## Current-state assumptions

- `src-tauri/` is VisualTalk's Rust/Tauri application. Its `Cargo.toml` uses Rust 2021 and depends on Tokio, but does not currently declare Axum.
- `src-tauri/src/session.rs` describes VisualTalk as bring-your-own-server and resolves the user's LiveKit URL and credentials from the Tauri store.
- `src-tauri/src/lib.rs` creates Tauri-managed application state during setup; server startup and shutdown would need to fit that lifecycle.
- MediaCore's `mediacore-server` package provides both a binary and library. Its library exposes `AppState::start` and an Axum router; startup also opens the media transport and its UDP socket.
- MediaCore's binary currently owns its listener and graceful-drain sequence. The library does not present that complete sequence as one host-facing shutdown operation.
- MediaCore has no LiveKit Egress service. Its native recording is audio-only and follows room recording policy rather than a client Egress start/stop call.

These assumptions should be rechecked against the exact MediaCore commit selected for the spike.

## Goals

- Establish whether a same-process MediaCore host is viable for VisualTalk's intended meeting topology.
- If viable, prove a minimal desktop-only integration using MediaCore's server library, Tokio runtime, signaling routes, and UDP media transport.
- Preserve the existing LiveKit connection path and make MediaCore selection explicit.
- Define ownership of credentials, listener addresses, recording, and graceful shutdown before product rollout.

## Non-goals

- Building or forking an SFU, changing MediaCore's protocol, or replacing its internal server architecture.
- Embedding MediaCore into iOS or Android application processes.
- Shipping MediaCore API signing secrets or other operator credentials in VisualTalk binaries.
- Claiming transparent session resume, Egress compatibility, video recording, or cross-node media migration that MediaCore does not provide.
- Removing the existing LiveKit option during the spike.

## Phases and gates

### Phase 0 — Hosting topology and product decision

Answer these before adding dependencies:

1. Is the MediaCore process a shared, remotely reachable VisualTalk host, or is it the Tauri process on an end user's device?
2. How do remote participants discover and reach the host's signaling endpoint and advertised UDP media address through NATs and firewalls?
3. Who provisions, stores, rotates, and controls the MediaCore API key/secret and any TURN credentials?
4. Is a meeting expected to keep working when the host desktop sleeps, quits, changes networks, or loses power?

**Gate 0:** Approve an explicit hosting model and threat model. If the target is one SFU per desktop client for ordinary multi-user meetings, stop: that does not match VisualTalk's current bring-your-own-server model without a deliberate user-hosted-meeting product and the associated reachable-host behavior. Prefer a shared media host instead.

### Phase 1 — Minimal integration spike

Run only if Phase 0 approves a same-process host.

- Add MediaCore as a desktop-only dependency in a spike branch or isolated test harness. Check the selected MediaCore commit, Rust toolchain, Tokio features, native dependencies, and desktop target builds before broad dependency changes.
- Start MediaCore asynchronously under Tauri's runtime and expose startup failure/readiness explicitly. Avoid blocking Tauri setup or silently falling back to an apparently successful but unavailable server.
- Host MediaCore's Axum routes on an explicitly selected listener and compose routes only if VisualTalk has an appropriate HTTP host. Verify route collisions, CORS, and local-interface binding.
- Configure the UDP media bind and advertised address independently from the signaling URL. Confirm that a second device can actually reach the host; loopback-only success is not a multi-user result.
- Feed the resolved MediaCore signaling URL and credentials to the existing LiveKit client path without changing the protocol-specific client behavior.

**Gate 1:** A two-device test joins the same room and verifies audio, video, screen share, data channels, and participant moderation. The selected MediaCore version and exact network topology are recorded. Failure to make media reachable is a no-go for this hosting model, not a reason to weaken the acceptance test to signaling-only.

### Phase 2 — VisualTalk integration boundaries

If the spike passes:

- Introduce a narrowly scoped media-host lifecycle component; do not fold MediaCore internals into VisualTalk's general `AppState`.
- Keep the current user-configured LiveKit flow as the default until users explicitly select a supported MediaCore host mode. Avoid automatic fallback between servers, which can hide configuration failures or split a meeting.
- Keep server credentials in an operator-controlled secret store. Do not bundle a signing secret in the application or expose it to the webview.
- Define whether the frontend connects to a local listener, a shared host, or a separately deployed service. A local listener is not sufficient for remote participants unless the advertised media path is externally reachable.
- Keep mobile builds on their current server path unless MediaCore is intentionally operated as a shared service and the mobile networking/reconnect gates are separately satisfied.

**Gate 2:** Existing LiveKit sessions, user settings, meeting creation, invites, and error handling remain unchanged when MediaCore is not selected. MediaCore startup errors and unsupported operations surface clearly.

### Phase 3 — Recording, persistence, and operations

- Do not route MediaCore calls through VisualTalk's existing Egress client; MediaCore does not implement that service.
- Decide whether native audio-only recording is enabled by room policy, how users are informed, and where the S3 credentials and recordings are owned. Test policy-enabled recording and upload independently from the UI Record button.
- Keep local per-client video recording clearly distinct from server-side meeting audio recording. Do not imply that either is a composited video recording.
- Define session-record storage, retention, backups, and multi-instance behavior. Avoid placing shared server records in a per-user desktop config directory.
- Add explicit readiness, diagnostics, and bounded shutdown handling. Drain rooms, stop accepting new joins, close server tasks, and flush meeting records before the host exits. Ensure forced shutdown behavior is documented.
- Test external TURN deployment where required. Distinguish an optional coturn deployment from TURN built into the MediaCore process, and test the actual supported network paths.

**Gate 3:** Recording behavior is accurate in the UI and tested end to end; credentials and data have an owner; shutdown does not silently lose records; the host's network exposure is reviewed and documented.

### Phase 4 — Scale, resilience, and rollout

- Load-test the largest expected VisualTalk room and concurrent-room count on the actual host topology.
- Exercise host restart, app exit, network changes, and node failure. Specify whether the expected result is a full rejoin or seamless resume; do not treat them as equivalent.
- Do not promise session continuity across a MediaCore process failure unless a tested implementation provides it.
- Keep LiveKit available as an explicit fallback during staged evaluation; collect compatibility, reliability, and resource-use results before changing defaults.

**Gate 4:** The chosen topology meets target load and failure expectations, and the product owner accepts any remaining reconnection or recording limitations before rollout.

## Key risks and mitigations

| Risk | Mitigation / decision gate |
|---|---|
| An SFU inside each desktop app is not a shared meeting service | Resolve topology in Phase 0; stop or choose a shared host if remote reachability and host availability are not part of the product. |
| Signaling works while UDP media is unreachable | Gate success on two-device media tests using the real advertised address and firewall/NAT path. |
| App-bundled signing secrets are extractable | Keep secrets operator-managed; do not ship a shared MediaCore secret in desktop/mobile binaries. |
| Server work interferes with Tauri startup or exit | Isolate lifecycle ownership, expose readiness/errors, and test graceful drain and forced exit. |
| Cargo feature, native-library, or target incompatibility | Start with a desktop-only dependency spike; do not add the server crate to mobile targets by default. |
| Existing recording controls assume LiveKit Egress | Preserve LiveKit behavior; add explicit MediaCore policy/audio semantics rather than pretending Egress calls work. |
| API or protocol drift | Pin the MediaCore revision for the spike and run its SDK interop tests plus VisualTalk's end-to-end checks before upgrades. |

## Decision record to complete after Phase 0

- **Approved hosting model:** shared service / VisualTalk server process / user-hosted desktop / no-go
- **Process boundary:** same process / separate process
- **Signaling URL and bind address:**
- **Advertised media address and UDP/TURN path:**
- **Credential owner and rotation method:**
- **Recording policy and storage owner:**
- **Expected behavior on host shutdown or network loss:**
- **MediaCore commit tested:**
- **Gate 0 decision and evidence:**

## Related documents

- `docs/decisions/0010-mediacore-sfu.md` — current proposal to adopt MediaCore as a desktop SFU.
- `docs/mediacore-adoption-roadmap.md` — current service-oriented adoption and rollout gates.
- `docs/mediacore-source-review-analysis.md` — source findings and known compatibility gaps.
