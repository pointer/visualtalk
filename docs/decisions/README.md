# Decisions

Durable project decisions for VisualTalk. This is the short record of why the repo is
shaped the way it is, so a new session does not re-open settled questions.

## When to add one

- A rule in `AGENTS.md` or `Guidance.md` changes.
- A dependency, tool, or external service is added for a non-obvious reason.
- A security, permission, licensing, or platform assumption changes.
- A previous decision is reversed.

## Format

One file per decision: `NNNN-short-title.md`.

```text
# NNNN: Title

- Date: YYYY-MM-DD
- Status: accepted | superseded by NNNN

## Context
What forced the decision.

## Decision
What we chose.

## Consequences
What follows, including what we deliberately gave up.
```

Keep entries short. Link the PR or commit when there is one. Do not edit an accepted
decision to change its meaning; add a new one that supersedes it.

## Index

- [0001](0001-tooling-and-mcp-policy.md) — Tooling and MCP policy
- [0002](0002-streaming-edition.md) — Streaming is a Pro, organizer-only feature on the configured LiveKit server
- [0003](0003-translation-architecture.md) — Pro live translation architecture & store policy
- [0004](0004-individual-livekit-invites.md) — Rust-minted individual LiveKit invites
- [0005](0005-provider-backed-invites.md) — Provider-backed email and SMS invitations
- [0006](0006-optional-guest-token-issuer.md) — Optional external guest-token issuer
- [0007](0007-clickable-invite-links.md) — Clickable invite links (`visualtalk://` deep links)
- [0008](0008-pro-feature-gates.md) — Pro edition gates — recording, backgrounds, AI assistant
- [0009](0009-live-translation-withdrawn.md) — Live translation withdrawn
- [0010](0010-mediacore-sfu.md) — Adopt mediacore as the primary SFU for desktop (proposed; see [adoption roadmap](../mediacore-adoption-roadmap.md))
