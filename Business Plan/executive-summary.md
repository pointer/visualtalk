# Executive Summary

> Companion sections: [Market](market-section.md) · [Product](product.md) ·
> [Go-to-Market](go-to-market.md) · [Financials](financials.md)

## Motto

**"True sovereignty depends on who controls the infrastructure, keys, operations, and data flows."**

**We will not compete head-on with AWS, Microsoft, and Google across all customers. We will become indispensable in one tightly regulated industry where their standard U.S.-cloud bundles cannot meet the rules. Once we dominate that niche, we will grow from there.**

## What it is

We provide an open, self-hostable video-conferencing platform that organizations can deploy in the environment they control — so data and keys stay inside their own perimeter.

Concretely, VisualTalk is a lightweight desktop video-conferencing client: a SolidJS (plain JSX) UI over a Rust/Tauri v2 core, using a Selective Forwarding Unit (SFU) for media. It ships as a **Community Edition** (PolyForm Noncommercial License) and a **Pro Edition** (commercial license) that adds end-to-end encryption, recording, backgrounds, and an AI assistant.

## The problem

The video-call market is dominated by US-cloud SaaS (Microsoft Teams, Google
Meet, Zoom) and consumer-messaging E2EE titans (WhatsApp, Signal, FaceTime).
For **French Sovereign entities (OIVs, Defense, SecNumCloud)**, these tools are
structurally disqualified:
- **Infrastructure:** US-cloud control violates SecNumCloud and the Cloud Act.
- **Keys:** Lack of true BYOK/HYOK breaks sovereignty requirements.
- **Operations:** Foreign operational control is a legal risk.
- **Data Flows:** Data transiting foreign jurisdictions violates GDPR and national security rules.

## The wedge

VisualTalk competes on the axes consumer and bundled tools are **structurally disqualified** from:

- **Self-hostable (Infrastructure & Operations)** — the mediacore Rust SFU lets an
  organization run its own media server: "your meetings, your servers, your operations."
- **True E2EE & Key Control (Keys)** — Pro edition E2EE ensures keys never leave the organization.
- **Data Sovereignty (Data Flows)** — On-prem architecture ensures data never leaves national/EU borders.
- **Admin / enterprise control** — organizations manage participants, retention, and data residency.

See [Product → What you own](product.md) for the plain, honest list of what a customer actually gets (and does not).

## Beachhead

**French Sovereign Cloud & Defense (SecNumCloud / OIV - Operators of Vital Importance).**

A deploy-anywhere, LiveKit-compatible conferencing layer for organizations that need control over where their real-time communications run. True sovereignty depends on who controls the infrastructure, keys, operations, and data flows.

We target entities legally bound by **SecNumCloud** and **GDPR** to control their infrastructure, keys, operations, and data flows. This is a legally mandated market, not a discretionary one.

## Business model

- **Community Edition** — free, noncommercial, bottom-of-funnel adoption.
- **Pro Edition** — paid per-organization license, monetizing E2EE, recording, backgrounds, AI.
- **Self-hosted enterprise** — license for on-prem mediacore deployments (SecNumCloud compliant). Support/SLA, managed hosting, compliance packaging, and integrations are roadmap — not offered today.

## Open-core model

Open source is the **trust and distribution** strategy, not the whole business model.

- **Open core = trust/distribution.** The Community Edition (PolyForm Noncommercial) lets customers verify and self-host the product.
- **Pro = today's revenue.** The commercial boundary today is E2EE (plus recording, backgrounds, AI).
- **Everything else = roadmap.** Managed hosting, enterprise support/SLA, compliance packaging (audit logs, retention, certification dossier), and integrations are future, not current, offerings.

Our starting defensibility is narrower — a **regulatory beachhead** (SecNumCloud/OIV buyers cannot use US-cloud tools) plus **sovereignty-by-architecture** (self-host + keys-with-customer). Operational excellence defends the niche once we are in it; it does not get us in.

## Why now

- Open-source SFUs (LiveKit, mediacore) make self-hosted real-time video viable.
- Regulatory pressure (GDPR, SecNumCloud, Gaia-X) pushes French entities away from US-cloud SaaS.
- The CPaaS/embedded layer is fragmenting — a window for a sovereign entrant.