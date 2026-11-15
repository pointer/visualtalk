# 0005: Provider-backed email and SMS invitations

- Date: 2026-11-15
- Status: accepted

## Context

The individual LiveKit invite design in decision 0004 produced separate links,
but opening a mail or SMS composer left delivery to another app. Organizers
need to send each invitation from VisualTalk after configuring their own
delivery services.

## Decision

- Rust sends email through the organizer's SMTP server using TLS.
- On mobile, Rust sends SMS through the organizer's Twilio account over HTTPS.
- The Schedule screen sends one invitation only after the organizer taps its
  Send action; creating or scheduling a meeting never sends messages.
- SMTP passwords and Twilio auth tokens are stored in the operating-system
  credential store. Non-secret provider settings remain in app settings.
- Contact access is used only when the user explicitly chooses contacts.

This decision supersedes the email-draft-only delivery choice in decision 0004.

## Consequences

- The organizer must provide working SMTP settings to send email and a Twilio
  account, sender number, and country-coded recipient numbers to send SMS.
- SMTP and Twilio providers receive the invitation contents and recipient
  details; they are not operated by VisualTalk or Miradata.
- Sending can incur charges from the organizer's providers. Failed sends are
  reported and are not represented as successful.
- `lettre` supplies standard SMTP message construction and TLS transport;
  `keyring` supplies platform credential stores; the existing `reqwest`
  dependency sends Twilio API requests.
