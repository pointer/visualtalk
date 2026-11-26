# Product

## Motto

**"True sovereignty depends on who controls the infrastructure, keys, operations, and data flows."**

## What VisualTalk is

A lightweight desktop video-conferencing client built on a Rust/Tauri v2 core and a self-hostable Rust SFU (mediacore).

## The Sovereign Architecture

VisualTalk is designed around the four pillars of sovereignty that matter to French public-sector and critical-infrastructure buyers:

1.  **Infrastructure Control:** Self-hostable via mediacore. Runs on French sovereign clouds (OVHcloud, Scaleway, Outscale) or on-premise.
2.  **Key Control:** Pro Edition E2EE keeps encryption keys with the organization.
3.  **Operations Control:** On-premise deployment means the organization runs and operates it.
4.  **Data Flow Control:** Self-hosted, so traffic stays inside the organization's own perimeter.

## What you own

A short, honest statement of what VisualTalk actually gives a customer — no more.

- **A documented self-host path.** The repo ships a Docker Compose stack and scripts (`docker/`, `scripts/livekit-local.py`) to run the media server yourself — LiveKit or mediacore — on your own infrastructure. This is real and documented today.
- **Proof of ownership, by construction.** Because you host it, you can inspect every component: what runs where, who holds the keys, and what leaves the environment (nothing does, unless you send it). There is no vendor-cloud in the path to audit.
- **Bring your own cloud or metal.** LiveKit Cloud if you want managed, or your own LiveKit/mediacore node if you want control. The client does not care which.

What VisualTalk deliberately does **not** ship today (stated plainly, so no one expects it):

- **No integrations.** No SSO/directory/telephony/EHR connectors yet. Standard OIDC where the platform supports it, nothing more.
- **No managed ops or SLA.** You operate it yourself. There is no 24/7 support contract; support is best-effort/community.
- **No migration tooling.** Moving from Zoom/Teams/Meet means rejoining via invite link; there is no import of history or workflows.
- **No compliance artefacts.** We do not provide audit logs, retention dashboards, or a certification dossier. The architecture makes compliance *possible* (data stays yours); the customer's own compliance work is theirs.

## Editions

- **Community Edition:** Free, noncommercial.
- **Pro Edition:** Adds E2EE, recording, backgrounds, AI. Licensed per organization.

## Roadmap

- mediacore video recording (Egress).
- mediacore TURN / resume for mobile parity.
- SecNumCloud compliance hardening.
- Enterprise support / SLA (not offered today).
- Compliance packaging — audit logs, retention controls, certification dossier (not offered today).