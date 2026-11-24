# Executive Summary

> Companion sections: [Market](market-section.md) · [Product](product.md) ·
> [Go-to-Market](go-to-market.md) · [Financials](financials.md)
>
> Every figure is a `TODO: verify` placeholder until a named source is cited.

## What it is

VisualTalk is a lightweight desktop video-conferencing client: a SolidJS (plain
JSX) UI over a Rust/Tauri v2 core, using a Selective Forwarding Unit (SFU) for
media. It ships as a **Community Edition** (PolyForm Noncommercial License) and
a **Pro Edition** (commercial license) that adds end-to-end encryption, recording,
backgrounds, and an AI assistant.

## The problem

The video-call market is dominated by bundled utilities (Microsoft Teams, Google
Meet, Zoom) and by consumer-messaging E2EE titans (WhatsApp, Signal, FaceTime).
The bundled tools are **US-cloud SaaS** subject to US law, cannot be self-hosted,
and offer no true end-to-end encryption to the organization; the consumer E2EE
tools are **free and private but consumer-only** — US-cloud (Meta/Apple),
not self-hostable, no admin controls, no enterprise compliance or data-residency
guarantees. Regulated, privacy-first, and non-US buyers — healthcare, legal,
government, critical infrastructure — are structurally unserved by both.

## The wedge

VisualTalk competes **not** on "better video calls" (a distribution game it
would lose) nor on "true E2EE" alone (WhatsApp, Signal and FaceTime already give
consumers free E2EE video — E2EE is table stakes, not a moat). It competes on the
axes consumer and bundled tools are **structurally disqualified** from:

- **Self-hostable** — the mediacore Rust SFU (speaks LiveKit's protocol) lets an
  organization run its own media server: "your meetings, your servers, your keys."
- **Admin / enterprise control** — organizations manage participants, retention,
  and data residency; consumer apps (WhatsApp) offer none.
- **Regulated-vertical compliance** — healthcare, legal, government, education,
  where US-cloud consumer and bundled SaaS tools cannot meet data-residency and
  compliance requirements.
- **True E2EE** — Pro edition, above the media path, SFU-agnostic; expected as
  baseline, not sold as the differentiator.
- **Desktop-native** — Tauri/Rust core, thin UI; secrets and business logic stay
  in Rust, never in the webview.

## Beachhead

One regulated vertical (healthcare, legal, government, or education — **TODO:
choose one**), not the horizontal market. Win there, then expand.

## Business model (TODO: validate)

- **Community Edition** — free, noncommercial, bottom-of-funnel adoption.
- **Pro Edition** — paid (per-seat or per-organization — **TODO: decide**),
  monetizing E2EE, recording, backgrounds, AI.
- **Self-hosted enterprise** — license + support for on-prem mediacore
  deployments.

## Ask (TODO: fill in)

`TODO: funding sought, use of funds, milestones, team size, runway.`

## Why now

- Open-source SFUs (LiveKit, mediacore) make self-hosted real-time video viable
  without building a media server from scratch.
- Regulatory pressure (data sovereignty, GDPR, sector rules) pushes buyers away
  from US-cloud SaaS.
- The CPaaS/embedded layer is fragmenting and consolidating — a window for a
  privacy-first entrant.