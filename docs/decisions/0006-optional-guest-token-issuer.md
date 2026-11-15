# 0006: Optional external guest-token issuer

- Date: 2026-11-15
- Status: accepted

## Context

Decision 0004 made the organizer's app the token authority: Rust signs one LiveKit
participant token per guest and puts it in the link. That keeps the API secret on
the organizer's device and needs no reachable service, but a link then *is* a
single-use credential bound to one identity. Two guests who share a link share an
identity, and a LiveKit server disconnects the earlier of two connections with the
same identity (`DisconnectReason::DUPLICATE_IDENTITY`) — the organizer sees
everyone except the last joiner vanish. Organizers do forward links, and
`visualtalk://` is not a registered URL scheme, so the link has to be copy-pasted,
which invites exactly that sharing.

LiveKit offers no hosted issuer. Whether the server is LiveKit Cloud or
self-hosted, minting participant tokens is the deployer's job; Cloud supplies the
API key and secret and expects your own backend to sign with them.

## Decision

- Reinstate the external guest-token issuer as an **opt-in** service in this
  repository (`packages/guest-token-issuer`), and keep 0004's in-app minting as
  the default.
- One field selects the mode: **Settings → LiveKit → Guest token issuer URL**.
  Empty (the default) → per-guest direct tokens, unchanged. Set → invitations
  carry a capability instead of a token.
- The capability is `base64url({iss, purpose, room, exp})` signed with
  HMAC-SHA256 under the LiveKit API secret. It confers only this room, until this
  expiry, at this issuer. `token.rs::generate_invite_capability` and the service's
  `verifyInvite` are pinned to each other by a golden-value test in `token.rs`.
- The guest's app redeems the capability at join time
  (`exchange_invite_for_token`) and receives a token with a **fresh identity per
  redemption**, which is what makes one link safe for a group.
- The issuer enforces a per-invitation participant cap (default 50, matching the
  app's invitee cap) and a per-address rate limit (default 30/min), and never
  mints a token that outlives the capability.
- Issuer endpoints must be HTTPS, except loopback/`localhost`/RFC 1918 over HTTP
  for the local stack and LAN testing. The path must end in `/v1/token` and carry
  no query or fragment (`validate_token_issuer_url`).
- The Docker stack runs it behind an `issuer` compose profile
  (`python3 scripts/livekit-local.py up --issuer`), loopback-bound by default.

This supersedes the "remove the external issuer service" bullet of 0004. Nothing
else in 0004 changes: identities, TTL policy, and per-guest links all still apply
in the default mode.

## Consequences

- A single shareable link becomes possible, and shared links stop producing the
  duplicate-identity kick.
- When the mode is used, the API secret lives on a network-reachable host: a
  larger blast radius than the app-only default, and guests cannot join while the
  service is down. Anything beyond a trusted network needs TLS in front of it.
- Guest devices contact the organizer's issuer, so the organizer — not VisualTalk
  — is the party that sees those requests. PRIVACY.md and SUPPORT.md say so.
- `parse_invite_link` must support both link shapes indefinitely.
- The service is a shipped component: it needs the `packages/*` workspace entry,
  third-party notices for `livekit-server-sdk`, and its files in
  `scripts/package-server-stack.py`'s allowlist, or the downloadable server
  bundle ships a compose file whose build context does not exist.
- Pro/E2EE: issuer-minted identities are ephemeral, so a returning guest is a new
  peer and re-imports keys under TOFU. There is no stable identity to pin across
  meetings in this mode.