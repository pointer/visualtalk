# MediaCore Egress-style audio/video recording plan

**Status:** Proposed
**Audience:** VisualTalk and MediaCore maintainers
**Scope:** A phased plan for adding a controllable recording service to MediaCore, with the initial compatibility target being VisualTalk Pro's room-composite file recording.

## Executive summary

MediaCore already has useful recording foundations, but not an Egress service:

- The `livekit_egress.proto` schema is already vendored and compiled by `crates/proto/build.rs`.
- The existing recorder is automatic and room-policy-driven. It captures microphone Opus packets, writes separate per-participant Ogg files, uploads completed files to configured S3-compatible storage, and announces them.
- It does not expose Egress RPC handlers, start/stop/list job state, mix audio, capture video, render a room layout, or encode MP4.

VisualTalk Pro currently calls `StartRoomCompositeEgress`, `StopEgress`, and `ListEgress`. Its file path requests an MP4 room-composite recording with a grid layout. Therefore, a service that only returns Egress-shaped responses or reuses the existing Ogg recorder will **not** make VisualTalk Pro recording work.

**Recommendation:** Implement a deliberately small, LiveKit-compatible Egress control surface first, backed by durable job state and a real asynchronous worker. Deliver controllable audio recording as an early vertical slice, then add a separate room compositor/encoder for audio-plus-video MP4. Keep heavy decode, mix, render, and encode work out of MediaCore's SFU packet-forwarding path.

## Current-state findings

### What exists

1. The upstream Egress schema is present at `crates/proto/protobufs/livekit_egress.proto`. It defines `Egress` RPCs including `StartRoomCompositeEgress`, `StopEgress`, and `ListEgress`.
2. `crates/proto/build.rs` compiles that file and renames the protobuf package from `livekit` to `mediacore`. Generated Rust types are available, but this does not register HTTP routes or implement RPC methods.
3. `crates/server/src/recording.rs` wires the current recorder to room/session events, the event bus, `SessionStore`, and S3.
4. `crates/recording/src/lib.rs` exposes `Recorder::track` and a bounded `Tap::packet` ingress. Packet handoff is intentionally non-blocking; file writing and uploads happen elsewhere.
5. `crates/server/src/peer.rs` opens taps only for microphone Opus tracks when room recording policy is enabled.
6. `crates/recording/src/ogg.rs` writes Ogg Opus without decoding or re-encoding. The output is one participant's track, not a mixed room recording.
7. `crates/session/src/recording.rs` and the session schema represent track segments and upload/announcement work. They do not model an Egress job with start/stop state and output results.
8. `crates/auth/src/lib.rs` already parses the `roomRecord` grant into `VideoGrant`, but the server does not currently use it to authorize recording control.
9. The room service in `crates/server/src/rooms.rs` is a useful Twirp pattern for method dispatch, authorization, errors, and compatibility aliases. Egress should be a separate service/handler, not added as room methods.

### What VisualTalk needs

In `src-tauri/src/egress.rs`, VisualTalk Pro calls the generated LiveKit API client to:

- start room-composite Egress with a grid layout and MP4 output;
- stop a running Egress job by ID;
- list jobs, optionally filtered by room.

VisualTalk Community does not expose the recording path. The current Pro file request is the practical compatibility target; RTMP streaming and the rest of LiveKit's Egress surface are not required for the first implementation.

## Proposed support boundary

### First compatibility target

Implement and test the exact calls VisualTalk Pro uses:

- `StartRoomCompositeEgress`
- `StopEgress`
- `ListEgress`

Use the vendored protobuf types and the LiveKit Twirp wire format. Serve the compatibility path expected by LiveKit SDKs, `/twirp/livekit.Egress/<Method>`, and optionally the canonical MediaCore path `/twirp/mediacore.Egress/<Method>`. Follow the existing `twirp.livekit_alias` configuration so aliases are documented and behave identically.

Initially reject unsupported requests explicitly with the repository's standard Twirp errors. Do not return an `EGRESS_ACTIVE` response unless a real capture job has started.

### Deferred until separately designed

- RTMP/SRT/WebSocket streaming and `UpdateStream`
- Web Egress and arbitrary URL capture
- image capture, HLS/segmented output, cloud storage providers other than configured S3-compatible storage
- every deprecated and unified Egress RPC
- cross-node job migration or seamless recovery after the worker's host dies

## Architecture proposal

### Control plane

Add a distinct Egress control module that:

- validates requests and resolves the room, session, tracks, output, and server-side storage policy;
- authorizes start/list/stop operations;
- creates and updates Egress job state;
- sends start/stop commands to a worker without waiting for media processing in the HTTP request;
- returns the generated `EgressInfo` protobuf in JSON or protobuf form, preserving Twirp error semantics.

Keep the current policy-based meeting recorder working independently. Egress control is user/API initiated and can start or stop during a live meeting; changing `room.records()` is not a substitute.

### Job state and persistence

Add an Egress job model separate from `mediacore_recording`. At minimum it needs:

- Egress ID, room name/ID, owning node, normalized request/source type, and creation/start/end timestamps;
- status transitions: `EGRESS_STARTING` -> `EGRESS_ACTIVE` -> `EGRESS_ENDING` -> `EGRESS_COMPLETE`, or a truthful failed/aborted result;
- output result metadata, error code/message, and enough information for `ListEgress`;
- idempotent stop behavior and bounded cleanup for abandoned jobs.

Persist job state using a schema migration and `SessionStore`-compatible access patterns, or make the single-node limitation explicit for the first slice. Do not overload the current per-participant recording segment rows: their uniqueness, upload queue, and lifecycle describe different data.

For a clustered deployment, route start/stop/list to the node that owns the room/job. A first release may deliberately support Egress on one node only, but must reject or forward cross-node requests explicitly rather than report an empty list or a false success.

### Authorization and request validation

- Wire the existing `roomRecord` grant into the Egress authorization path. Require a room-scoped grant for room-specific start/stop operations; define the exact authorization for unfiltered `ListEgress` before enabling it.
- Test unauthorized, wrong-room, and expired-token requests.
- Use server-configured storage credentials. Do not log request credentials or accept arbitrary caller-provided secrets by default.
- Validate room, track, output type, file type, layout, and encoding before creating a job.
- Do not allow arbitrary filesystem paths from an API request. Generate safe names under a configured output prefix and reject path traversal or unsupported destinations.
- Enforce maximum concurrent jobs, maximum duration/output size, and per-room limits. Report limit and resource failures explicitly.

### Media and output plane

#### Audio-only vertical slice

The existing audio recorder is a useful low-level component, not a complete room-composite Egress implementation:

- It can tap individual microphone Opus tracks and write those tracks as separate Ogg files.
- It only opens taps when room recording policy is active, and its normal lifecycle is tied to meeting start/end.
- It does not mix participants into one audio stream or create an Egress job's single output.

For a controllable first slice, add an Egress-owned capture lifecycle that can attach to already-published and newly-published tracks, detach on stop, and safely fan packets to bounded workers. Reuse the existing packet writer where its per-track Ogg semantics match the chosen API contract. If the supported output must be one room audio mix, add a real mixer/encoder; do not concatenate participant Ogg files and call that a composite.

#### Audio-plus-video room composite

VisualTalk's MP4/grid request requires substantially more than the current tap:

1. Subscribe to or capture all selected room tracks for the lifetime of the job.
2. Decode media as needed, synchronize audio/video timestamps, and mix audio.
3. Render a room layout (grid, participant selection, screen-share behavior).
4. Encode the composed output (at minimum the codec/container combination VisualTalk requests).
5. Finalize and validate the file, upload it, and publish accurate `FileInfo` and Egress status.

The current SFU forwards encoded packets; it has no existing general audio decoder/mixer, video compositor, or MP4 encoder. Choose and prototype the media-processing engine before committing to a full Egress API. Prefer an isolated worker process/service or a separately supervised pipeline so codec crashes and CPU-heavy work cannot stall forwarding. Record the worker's resource limits, codec support, and packaging/licensing implications in that decision.

For MediaCore's normal audio/video path, require Egress to fail clearly when a requested codec/layout/output cannot be processed. An API stub must not imply a valid playable recording.

### Output storage and completion

The current recording configuration already owns S3-compatible credentials and the automatic recorder's upload queue. Extend or reuse the tested storage implementation only where its whole-file upload and retry semantics fit Egress outputs.

For each job:

1. Write to a temporary, job-specific local path with bounded disk use.
2. On stop or natural completion, close and validate the media container.
3. Upload using server-owned credentials and the configured bucket/prefix.
4. Persist the final location, byte size, duration, and timestamps.
5. Mark `EGRESS_COMPLETE` only after the output is usable and its result is durable; otherwise report `EGRESS_FAILED` with an actionable error.

Retain local artifacts or retry work according to an explicit policy. A server restart must not silently convert an active job into a successful result.

## Step-by-step implementation phases

### Phase 0 - Contract and media-engine spike

1. Pin the MediaCore revision and LiveKit protocol version used by VisualTalk's `livekit-api` dependency.
2. Confirm generated Egress protobuf messages and service descriptors, including package-renamed paths and the `livekit.Egress` compatibility alias.
3. Record the exact VisualTalk request fields for MP4/grid output and the status/result fields it consumes.
4. Prototype the candidate audio/video processing path with representative WebRTC audio and video tracks. Measure CPU, memory, latency, output validity, and codec support.
5. Decide the initial supported media and output matrix. Keep unsupported features explicit.

**Gate 0:** The protocol contract is fixed, the MP4/composite approach is technically demonstrated, and the worker architecture is selected. If composite video is not feasible, publish an audio-only support boundary and do not claim VisualTalk Pro recording compatibility.

### Phase 1 - Egress control API

1. Add an Egress service handler and register canonical and LiveKit alias routes.
2. Implement request decoding/response encoding for both Twirp JSON and protobuf.
3. Add `roomRecord` authorization and scoped-room checks.
4. Add safe request validation and explicit unsupported-method/output errors.
5. Add job state and `StartRoomCompositeEgress`, `StopEgress`, and `ListEgress` dispatch.
6. Document supported methods and request fields in `/swagger` and server documentation.

**Gate 1:** Twirp contract tests pass for valid requests, malformed input, unsupported features, unauthorized/wrong-room access, and all lifecycle/error statuses. Starting a job does not yet claim media is being recorded unless the worker has accepted it.

### Phase 2 - Controllable audio capture

1. Add Egress start/stop control independent of the room's automatic-recording policy.
2. Attach to currently live tracks and listen for later publish/unpublish events.
3. Fan packets through bounded queues; preserve the rule that disk or upload backpressure never blocks the SFU media path.
4. Implement the explicitly selected audio output shape (individual Ogg tracks or a true mixed output).
5. Stop cleanly, close files, upload, persist result metadata, and transition job state.
6. Keep automatic policy-based audio recording regression-tested and behaviorally unchanged.

**Gate 2:** Start during an active meeting, capture audio, stop by Egress ID, list the final result, and play the uploaded artifact. Test no-track, track churn, full queue, disk/upload failure, repeated stop, and process shutdown.

### Phase 3 - Composite video and MP4

1. Implement or integrate the isolated video/audio capture and compositing worker chosen in Phase 0.
2. Support the grid layout and encoding settings VisualTalk Pro currently sends.
3. Synchronize participant audio and video and define how screen shares, muted tracks, late joiners, and participant departures affect layout.
4. Produce MP4 output, finalize it on stop, upload it, and return accurate `FileInfo`.
5. Add hard resource limits and cancellation paths. Ensure worker failure marks the job failed and does not take down the SFU.

**Gate 3:** VisualTalk Pro's unchanged MP4/grid request produces a playable recording with synchronized audio/video, correct completion status, and bounded server resource use in realistic multi-participant tests.

### Phase 4 - Hardening and rollout

1. Add metrics for active/failed jobs, start latency, duration, dropped packets/frames, encoder health, disk usage, upload retries, and output size.
2. Test concurrent jobs, large rooms, track churn, node restart, worker crash, object-store outage, and quota exhaustion.
3. Define job recovery and retention semantics; explicitly document what is lost on node/worker failure.
4. Add interop tests using VisualTalk's actual generated client and preserve its Egress JSON/status contract.
5. Release behind a feature flag; keep the existing LiveKit path available until compatibility and operational gates pass.

**Gate 4:** The advertised Egress subset is implemented end to end, failure modes are observable, and operators can enforce capacity and retention.

## Test strategy

- **Protocol:** LiveKit `EgressClient` calls against MediaCore for start, stop, and list; JSON and protobuf Twirp payloads; canonical and alias paths.
- **Authorization:** `roomRecord` required, scoped to the requested room; no cross-room job discovery or stopping.
- **Lifecycle:** starting/active/ending/complete/failed/aborted transitions; stop unknown ID; repeated stop; start for missing room; job cancellation.
- **Media:** audio packet gaps and timestamps; video keyframe start, codec negotiation, A/V sync, participant joins/leaves, screen-share selection, output container validity.
- **Reliability:** bounded queue behavior; disk full; worker panic/exit; S3 refusal/timeout; restart during recording; stale job cleanup.
- **Performance:** no blocking work on packet-forwarding tasks; CPU, memory, latency, and disk usage at expected room and concurrent-job limits.
- **Compatibility:** VisualTalk Pro's current room-composite MP4 request, status parsing, stop flow, and list flow. Audio-only success is not a substitute for this gate.

## Risks and decisions to resolve

| Question or risk | Plan |
|---|---|
| Does "Egress support" mean matching VisualTalk Pro or all LiveKit Egress methods? | Start with the three methods VisualTalk invokes. Publish an explicit support matrix; defer streaming and other methods. |
| What does the first audio-only output represent? | Decide between separate participant tracks and one mixed room track. The current recorder only provides separate Ogg tracks. |
| Which video pipeline will compose and encode MP4? | Benchmark and select an isolated worker before API promises; MediaCore currently has no compositor/encoder. |
| Where do output credentials come from? | Prefer configured server credentials and a safe output prefix; never trust arbitrary client-provided filesystem paths or secrets. |
| How are jobs routed in a cluster? | Initially constrain to the room-owning node or add explicit owner forwarding and durable job ownership. Never return false empty/success results. |
| How are outages surfaced? | Persist job state and errors; distinguish failed output from completed output and preserve retryable uploads. |

## Source map

- `crates/proto/protobufs/livekit_egress.proto` - vendored Egress RPC and message schema.
- `crates/proto/build.rs` - protobuf compilation and package rename.
- `crates/server/src/http.rs` and `crates/server/src/rooms.rs` - current Axum/Twirp route and dispatch patterns.
- `crates/server/src/recording.rs` - automatic recording lifecycle and S3 worker wiring.
- `crates/server/src/peer.rs` - microphone Opus tap creation and packet delivery.
- `crates/recording/src/lib.rs`, `ogg.rs`, and `writer.rs` - bounded packet taps and per-track Ogg writing.
- `crates/session/src/recording.rs` and `schema.rs` - existing segment records and durable upload work.
- `crates/auth/src/lib.rs` - parsed `room_record` grant, currently not enforced for Egress.
- VisualTalk `src-tauri/src/egress.rs` - actual `StartRoomCompositeEgress`, `StopEgress`, and `ListEgress` usage.

## Related VisualTalk documents

- `docs/mediacore-source-review-analysis.md` - current MediaCore capabilities and recording gaps.
- `docs/mediacore-adoption-roadmap.md` - adoption phases and mobile gates.
- `docs/mediacore-embedding-plan.md` - in-process hosting decision gates.
