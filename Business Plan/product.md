# Product

> Companion sections: [Executive Summary](executive-summary.md) ·
> [Market](market-section.md) · [Go-to-Market](go-to-market.md) ·
> [Financials](financials.md)

## What VisualTalk is

A lightweight desktop video-conferencing client. Architecture (from the repo):

- **UI:** SolidJS (plain JSX, Tailwind v4). No TypeScript, no CSS modules.
- **Core:** Rust / Tauri v2. Business logic, JWT signing, persistence, and
  secrets live in `src-tauri/src/`, exposed to the UI through `#[tauri::command]`s.
  The webview never holds secrets.
- **Media:** an SFU. Today LiveKit (self-hosted or cloud); the mediacore Rust SFU
  is the self-hostable path (see [Market](market-section.md), Layer 3).
- **Platforms:** macOS, Windows, Linux (desktop), Android, iOS (mobile bundles).

## Editions

| | Community | Pro |
|---|---|---|
| Meetings, join, chat, scheduling | ✅ | ✅ |
| Backgrounds | — | ✅ |
| Recording | — | ✅ (see gap below) |
| AI assistant | — | ✅ |
| **End-to-end encryption** | — | ✅ |
| License | PolyForm Noncommercial | Commercial |

## Current capabilities

- Instant and scheduled meetings with per-attendee invite links
- Rust-minted LiveKit participant tokens (secrets never reach the webview)
- Optional external guest-token issuer for one shareable link
- Email / SMS invitations (provider-backed)
- Recording and RTMP streaming (server-side, Pro)
- Chat, participant moderation, device management, grid layouts
- **E2EE (Pro)** — layered above the media path, SFU-agnostic

## The self-host story (the moat)

mediacore is a Rust SFU on `str0m` that speaks LiveKit's signalling and room
protocol. It lets an organization **run its own media server** with no
vendor-cloud dependency. Source review (see
`docs/mediacore-analysis.md`):

| Capability | Against mediacore |
|---|---|
| Join / auth (JWT) | ✅ Works unmodified |
| Audio / video / screen share | ✅ Works |
| Moderation (mute, remove, roster) | ✅ RoomService implemented |
| Server-side recording | ⚠️ Native audio-Ogg only — no Egress gRPC |
| Video recording | ❌ Not yet (mediacore roadmap: months away) |

**Known product gap:** the "Record meeting" button drives LiveKit's Egress
service, which mediacore does not implement. Against a self-hosted mediacore
backend, recording is **audio-only**. Video recording on mediacore is a roadmap
dependency, not a VisualTalk one. Plan the self-host tier around audio recording
until mediacore ships video egress.

## Differentiation (vs. the titans)

- **True E2EE** — not a US-cloud add-on; keys stay with the organization.
- **Self-hostable** — mediacore path; "your servers, your keys."
- **Desktop-native** — Tauri/Rust core, secrets in Rust, thin webview.
- **Vertical focus** — built for one regulated segment, not horizontal.

See the [Market](market-section.md) positioning table for the axis-by-axis
comparison.

## Roadmap dependencies (external)

- mediacore video recording → unlocks server-side video on the self-host tier.
- mediacore Egress gRPC → `egress.rs` works unmodified against mediacore.
- mediacore TURN / resume → mobile parity on the self-host tier.

## Open product questions

- [ ] Which vertical is the beachhead? (drives compliance work)
- [ ] Is E2EE default-on for Pro, or opt-in per meeting?
- [ ] Pricing unit: per-seat, per-org, or per-minute?
- [ ] Mobile strategy until mediacore TURN/resume land (keep LiveKit for mobile?)