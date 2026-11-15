# 0004: Rust-minted individual LiveKit invites

- Date: 2026-11-15
- Status: accepted

## Context

Invitees must reach the organizer's configured LiveKit deployment, which may be
LiveKit Cloud or a self-hosted server. A service embedded in the organizer's
desktop app is not a remotely reachable token issuer. Reusing one signed
participant token for a group would also reuse its LiveKit identity.

## Decision

- Rust signs a direct LiveKit participant token from the credentials saved in
  the app's local LiveKit store; API secrets never enter the webview.
- Create a distinct random identity and link for each scheduled attendee.
  A link without an attendee address is explicitly for one guest only.
- Scheduled tokens remain valid through the meeting and two hours afterward,
  with a 24-hour minimum; the meeting and its grace period must fit within
  30 days of invite creation. Instant invites last 24 hours.
- The identity is fixed by the signed token. A guest-chosen display name is
  separate, user-supplied metadata broadcast in the room and is not an
  authenticated identity.
- Remove the external issuer service and its Settings/Docker configuration.

## Consequences

- The same link must not be sent to a group; use the per-attendee links in the
  Schedule dialog. Links are bearer credentials and can be used by whoever
  receives them until expiry.
- Schedule accepts manually entered addresses and exposes the privacy-preserving
  Web Contact Picker when the platform webview supports it. The user selects
  only email fields; unsupported platforms retain manual entry.
- Email actions open a separate draft in the system's default mail app for each
  attendee. VisualTalk does not send mail or store email-provider credentials.
- Previously issued issuer-based links are incompatible; organizers must send
  new links.
- This requires no public token-issuer endpoint and works with any LiveKit
  server whose credentials are configured in the app.
