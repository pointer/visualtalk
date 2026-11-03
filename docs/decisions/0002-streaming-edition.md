# 0002: Streaming is a Pro, organizer-only feature on the configured LiveKit server

- Date: 2026-11-02
- Status: accepted

## Context

LiveKit Egress RTMP support exists in the backend but is unwired. VisualTalk has
two editions: Community (free) and Pro (one-time paid, E2EE chat/files). Egress
runs on the LiveKit server the organizer configures, which may be self-hosted
(the optional `docker/` stack), LiveKit Cloud, or another deployment.

## Decision

- Streaming is available only in Pro builds.
- It is an organizer action: it requires the LiveKit API key/secret supplied in
  Settings, so a guest on someone else's server cannot start a stream.
- It uses the organizer's configured LiveKit deployment. VisualTalk does not
  operate or pay for that server.
- The server must have Egress enabled. If it does not, the app must fail with an
  actionable message, not a generic error.
- The broadcast is not end-to-end encrypted. Pro E2EE covers chat and files only;
  the egress layout must never include chat or files.
- CE builds must not expose or advertise the feature.

## Consequences

- Egress cost sits with whoever operates the configured LiveKit server: the
  organizer or their provider.
- The one-time Pro price stays viable as long as VisualTalk does not ship a
  default hosted LiveKit. If it ever does, streaming needs metering or exclusion,
  and a new ADR.
- The `docker/` stack remains an optional on-prem path, not a dependency.
