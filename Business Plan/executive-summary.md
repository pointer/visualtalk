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

The video-call market is dominated by US-cloud SaaS (Microsoft Teams, Google Meet, Zoom) and consumer-messaging E2EE titans (WhatsApp, Signal, FaceTime). These are free-to-use, frictionless, and widely adopted, but they are **US-cloud SaaS** and cannot be self-hosted, creating a structural dependency on foreign tech giants. Regulated organizations and SMBs seeking privacy and sovereignty are structurally unserved by these titans, either because they are forced into non-compliant US-cloud ecosystems or left with no viable enterprise-ready alternative.

## The wedge

VisualTalk competes on the axes these titans are **structurally disqualified** from:

- **Self-hostable (Infrastructure & Operations)** — the LiveKit Rust SFU lets organizations run their own media server: "your meetings, your servers, your operations."
- **True E2EE & Key Control (Keys)** — Pro edition E2EE ensures keys never leave the organization.
- **Data Sovereignty (Data Flows)** — On-prem architecture ensures data never leaves national/EU borders.
- **Admin / enterprise control** — organizations manage participants, retention, and data residency.

See [Product → What you own](product.md) for the plain, honest list of what a customer actually gets (and does not).

## Beachhead: Bottom-Up Adoption

We do not target Government/Defense directly (as they are reserved for established players). Instead, we drive **Bottom-Up adoption**:

1.  **Mass Distribution:** Distribute the Community Edition for free and Pro Edition for fee via App Stores (Microsoft Store, Apple App Store) for high-frictionless adoption.
2.  **SMB Outreach:** Targeted email and direct outreach to privacy-conscious SMBs.
3.  **The "Sovereign Pull":** Establish a brand for VisualTalk as the sovereign, self-hostable alternative. As VisualTalk becomes synonymous with private/sovereign communication, Defense/Gov agencies will naturally be drawn to us because we are the only credible option that fits their SecNumCloud mandate.

## Business model

- **Community Edition** — free, noncommercial, bottom-of-funnel adoption (App Stores).
- **Pro Edition** — paid per-organization license, monetizing E2EE, recording, backgrounds, AI (SMB-focused).
- **Self-hosted enterprise** — license for on-prem Livekit deployments. Compliance/managed-ops/integrations are roadmap — not offered today.

## Open-core model

Open source is the **trust and distribution** strategy, not the whole business model.

- **Open core = trust/distribution.** The Community Edition (PolyForm Noncommercial) lets customers verify and self-host the product.
- **Pro = today's revenue.** The commercial boundary today is E2EE (plus recording, backgrounds, AI).
- **Everything else = roadmap.** Managed hosting, enterprise support/SLA, compliance packaging (audit logs, retention, certification dossier), and integrations are future, not current, offerings.

Our starting defensibility is narrower — a **regulatory beachhead** (SecNumCloud/OIV buyers cannot use US-cloud tools) plus **sovereignty-by-architecture** (self-host + keys-with-customer). Operational excellence defends the niche once we are in it; it does not get us in.

## Why now

- Open-source SFUs (LiveKit) make self-hosted real-time video viable.
- Regulatory pressure (GDPR, SecNumCloud, Gaia-X) pushes French entities away from US-cloud SaaS.
- The CPaaS/embedded layer is fragmenting — a window for a sovereign entrant.