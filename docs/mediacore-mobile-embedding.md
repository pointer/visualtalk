# Mobile LiveKit clients and MediaCore hosting

**Status:** Proposed  
**Scope:** Explain what is embedded in VisualTalk's iOS and Android apps today, distinguish that from embedding an SFU server, and recommend a mobile integration path for MediaCore.

## Short answer

LiveKit is relatively straightforward to include in a mobile application because the application includes a **client SDK**. The client captures local media and connects outward to a separately hosted SFU. It does not host the meeting server.

MediaCore is that server-side SFU. Embedding its server process in each user's iOS or Android app is a different product and networking model, not the mobile equivalent of adding a LiveKit client SDK.

**Recommendation:** Keep a mobile client SDK in VisualTalk and run MediaCore on a reachable, stable server. Point the client at MediaCore only after iOS and Android compatibility and reconnect behavior pass device testing. Do not ship MediaCore's SFU server inside ordinary mobile client builds.

## What VisualTalk currently embeds

VisualTalk's frontend depends on the JavaScript package `livekit-client` (`package.json`) and imports it in `src/lib/useLiveKitRoom.js`. The app is built with Tauri for iOS and Android (`package.json` mobile build scripts); the JavaScript client runs as part of the app's webview frontend.

The Rust dependency `livekit-api` in `src-tauri/Cargo.toml` is used for LiveKit API/token operations. It is not the LiveKit SFU server. Similarly, a native Swift or Kotlin LiveKit SDK, if used by another app, is still a client SDK and still connects to a server elsewhere.

## Why a mobile client SDK fits the app process

A client library participates in a call as one endpoint:

1. The user grants microphone/camera permissions.
2. The SDK captures local tracks using platform media APIs.
3. The app initiates signaling and ICE connectivity to a configured server.
4. Media travels between the app and that remote SFU, directly or through a configured TURN relay.

The client generally needs outbound connectivity, not a publicly reachable listener on the phone. It does not own room-wide forwarding, server-side room state, public UDP ports, recording storage, or a server's graceful shutdown. The OS may still limit camera/microphone use and background execution; those behaviors need mobile testing, but they are normal client-app concerns.

For VisualTalk, the existing JavaScript client is already in the mobile app bundle. The first mobile integration question is whether that client works reliably against MediaCore's LiveKit-compatible signaling and media behavior, not how to run an SFU inside the phone.

## Why embedding MediaCore's server is different

MediaCore's `mediacore-server` package is a Rust SFU server with an HTTP/WebSocket signaling router and a UDP media transport (`crates/server/Cargo.toml`, `crates/server/src/http.rs`, `crates/server/src/media.rs`). Its documented deployment listens for signaling on TCP and media on UDP (`README.md`). The server must advertise addresses that remote participants can reach.

Putting that server in a mobile process adds requirements the LiveKit client does not have:

- **Reachability:** Other participants need to connect inbound to the phone's signaling and media endpoints. Mobile devices are commonly behind carrier NAT, changing networks, and restrictive firewalls. A server listening on the phone is not automatically reachable from the Internet.
- **Stable host lifecycle:** A meeting hosted by the phone depends on that app remaining alive. iOS may suspend an app in the background; Android also applies background-execution restrictions. An ordinary conferencing client cannot assume it may run a general-purpose server indefinitely.
- **Host responsibility:** The phone becomes the SFU for every participant in that room, forwarding their media and using its CPU, memory, battery, and network uplink. If it sleeps, exits, loses connectivity, or moves between Wi-Fi and cellular, the meeting's server disappears or changes address.
- **Server operations and secrets:** MediaCore needs server configuration, signing keys, and potentially recording, persistence, event, and TURN configuration. A shared operator secret must not be embedded in a distributed app binary.
- **Mobile build surface:** MediaCore is a multi-crate server package with Axum, transport, room, session, and recording dependencies. The repository's `mediacore-client` is described as a test client that publishes real RTP, not as a camera/microphone SDK for iOS or Android.

Cross-compiling Rust code is not proof that this is a usable mobile SFU. The app would still need a viable inbound network path, a platform-compliant lifetime, a reachable advertised address, and a product model for who operates the phone-hosted meeting.

## Recommended approach: mobile client to remote MediaCore

Keep the SFU on a server or other stable host and use VisualTalk's existing client path:

1. **Keep the roles separate.** Run MediaCore on a reachable Linux/server host. Keep `livekit-client` in VisualTalk's webview, or use an official native LiveKit client if VisualTalk later replaces the webview media path.
2. **Configure endpoints and credentials.** Supply the MediaCore signaling URL and short-lived participant tokens through VisualTalk's existing session flow. Keep the API signing secret on the server that issues tokens; never ship it in iOS/Android binaries.
3. **Configure media reachability.** Set MediaCore's advertised address and firewall rules for UDP. Where needed, deploy coturn alongside MediaCore and provide valid TURN credentials. The optional coturn deployment is a separate relay service, not a TURN server running inside the mobile app.
4. **Run real-device compatibility tests** on both iOS and Android:
   - join, leave, audio, camera video, screen sharing where supported, data channels, and moderation;
   - foreground/background transitions, screen lock, app termination, and return to the call;
   - Wi-Fi to cellular changes, brief network loss, UDP-restricted networks, and TURN relay use;
   - startup/auth failures and visible recovery behavior.
5. **Set expectations for recovery.** MediaCore's current roadmap says session resume is not implemented and a reconnect rejoins as a new session. Test and document that behavior; do not describe it as seamless resume.
6. **Keep unsupported recording behavior explicit.** MediaCore does not implement LiveKit Egress; its native recording is audio-only and policy-driven. The mobile Record UI must not imply that a server-side video recording or Egress start/stop control exists.

**Mobile adoption gate:** Do not change the default mobile server until both platforms pass the real-device network and lifecycle tests, including the actual TURN path required by target users. A successful desktop or localhost test is not sufficient.

## If on-device MediaCore hosting is an explicit requirement

Treat this as a separate, experimental **user-hosted meeting** feature, not as the default way to embed a media SDK.

1. **Constrain the product model first.** Specify who hosts, which participants may join, what happens when the host backgrounds or exits, and whether LAN-only meetings are acceptable. Require explicit user consent before opening network listeners.
2. **Start with a build-only feasibility spike.** Try a minimal, desktop-disabled mobile target that depends on `mediacore-server` without Kafka. Check the exact MediaCore commit, cross-target dependencies, package size, and iOS/Android build constraints before integrating into the app.
3. **Prove the network path on physical devices.** Start signaling and UDP media under the app runtime, then join from a second device on a different network. A loopback-only demo proves only that local components can communicate; it does not prove a hosted meeting works.
4. **Prove platform lifetime separately.** Test foreground use first. On Android, investigate whether a user-visible foreground service is permitted and appropriate for the intended call. On iOS, assume the host may be suspended unless a specifically supported platform mode applies; do not rely on undocumented background execution.
5. **Add a bounded server lifecycle.** MediaCore's binary currently owns its listener and graceful-drain sequence. An embedding host would need explicit startup/readiness, shutdown, room draining, and session-record flushing. Errors must be surfaced rather than hidden behind a client fallback.
6. **Keep privileged operations off the client.** Do not embed a shared API secret, database password, or object-store credential. Use narrowly scoped, short-lived credentials and review any local admin endpoints and network exposure.

**On-device hosting no-go conditions:** remote participants cannot reliably reach the phone; the app must remain alive in the background but the OS will not guarantee it; the feature requires seamless continuity through network changes or host termination; or server credentials/administrative access cannot be protected. In those cases, keep MediaCore on a stable remote host and embed only a client.

## Decision

| Requirement | Recommended architecture |
|---|---|
| Join a call from an iPhone or Android phone | Embed/use a client SDK; connect to a remote SFU |
| Use MediaCore for VisualTalk mobile calls | Operate MediaCore on a reachable server; validate the existing LiveKit-compatible client against it |
| Let a participant's phone host an SFU for everyone | Experimental user-hosted mode only; prove inbound networking and OS lifetime first |

For normal VisualTalk meetings, the first two rows fit the current product architecture. The last row should not be treated as an implementation detail of mobile SDK integration.

## References

- VisualTalk: `package.json`, `src/lib/useLiveKitRoom.js`, `src-tauri/Cargo.toml`, `src-tauri/src/session.rs`
- MediaCore: `README.md`, `crates/server/Cargo.toml`, `crates/server/src/http.rs`, `crates/server/src/media.rs`, `crates/client/Cargo.toml`, `ROADMAP.md`, `deploy/docker-compose.yml`
- Related VisualTalk plans: `docs/mediacore-embedding-plan.md`, `docs/mediacore-adoption-roadmap.md`, `docs/mediacore-source-review-analysis.md`
