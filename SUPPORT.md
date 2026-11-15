# VisualTalk — Support & Help

VisualTalk Community Edition (the free edition, including the App Store build) is
open-source software licensed under the PolyForm Noncommercial License 1.0.0.
Support for it is provided **free of charge, on a best-effort basis**, by the
maintainers and the community through the channels below.

## Get help

- **Bug reports and feature requests:** open an issue at
  <https://github.com/pointer/visualtalk/issues>. Please search existing issues
  first, and include:
  - the VisualTalk version (see the release notes at
    <https://github.com/pointer/visualtalk/releases>),
  - your operating system and version (iOS, macOS, Windows or Linux),
  - the exact steps to reproduce the problem, and
  - any error message or screenshot that shows it.
- **Installation and setup questions:** the Quickstart section of the README
  (<https://github.com/pointer/visualtalk#readme>) covers building and installing
  VisualTalk on every supported platform. The App Store build is functionally
  identical to the Community Edition distributed on GitHub.
- **Anything else, including security reports:** email
  <kghemari@yahoo.com>. Security reports are handled confidentially.

## Using your own meeting server (self-hosting)

VisualTalk ships no default meeting server: you connect it either to a LiveKit
Cloud project or to the free server bundle on the downloads page
(<https://visualtalk.app/downloads/>). If "API key" and "API secret" sound
intimidating, here is the plain-words version:

- The **server address** is the server's phone number. On the same computer it
  is `ws://localhost:7880`; from a phone on the same home Wi-Fi it is
  `ws://<that computer's Wi-Fi address>:7880`.
- The **API key** and **API secret** are a card-and-PIN pair the server creates
  by itself on first start and keeps in a file named `docker/.env`. You never
  invent them — you copy them.
- The bundle prints all three values ready to copy: run
  `python3 scripts/livekit-local.py creds` inside the bundle folder, then paste
  them in VisualTalk under **Settings → LiveKit** and press
  **Save Configuration**.

The bundle's README carries the full step-by-step in plain words ("Connecting
the app to this server — in plain words"), including the fixes for the two
classic mistakes: the wrong address for phones, and a hand-retyped secret. The
secret is a password — never share it in chats, screenshots or emails.

## Invitations: one link per guest

When you schedule a meeting, VisualTalk creates a **separate invite link for
each guest**. That is deliberate, not a limitation:

- Each link carries its own signed pass (a LiveKit participant token) for one
  randomly generated guest identity, plus your server address and the room
  code. It never contains your API secret.
- Your server — not VisualTalk — validates that pass when a guest connects:
  its signature, its expiry, and the single room it allows.
- The name a guest types when joining is only a label shown to the others. It
  is not a login, and it does not change who the link belongs to.

**Treat each link like a password.** Whoever holds it can join that room as
that guest until it expires — including before your meeting starts and after it
ends. Do not forward another guest's link, do not paste one into a group chat,
and do not reuse a single link for several people; use the per-guest list in the
Schedule dialog.

If two people do use the same link, the meeting looks broken rather than full:
a LiveKit server allows only one connection per identity, so the earlier guest
is dropped with *"another participant joined with the same identity"* and only
the most recent one stays in. Send that guest their own link and they can rejoin.

### Or share one link with the whole group

If you would rather send a single link that anyone can use, run the optional
**guest token issuer** that ships with the self-hosted server bundle and put its
address in **Settings → LiveKit → Guest token issuer URL**. Invitations then
carry a capability instead of a pass: every guest who opens the link is given
their own pass and their own identity as they join, so nobody is dropped and the
link is safe to post in a group chat. The bundle README explains how to start it
("Sharing one invite link") and how to make it reachable from phones or from the
internet; the issuer holds your API key and secret, so keep it on hardware you
control. Leave that field empty to keep one link per guest, which needs no extra
service at all.

| Invite | Valid for |
| --- | --- |
| Instant invite (Home → "Copy a single-guest invite") | 24 hours |
| Scheduled meeting | through the meeting plus two hours after it ends; never less than 24 hours, and the meeting and its grace period must fall within the next 30 days |

Ways to hand a guest their link:

- **Copy** puts that one guest's invite on the clipboard, ready to paste into
  any messenger.
- **Send email** / **Send SMS** deliver that one guest's invitation from inside
  VisualTalk, through the SMTP server or the Twilio account you configure in
  **Settings → Invitations**. Those are your own services: VisualTalk operates
  no mail or SMS server, cannot see what you send, and your provider may charge
  you for it. Scheduling a meeting never sends anything — a message goes out
  only when you press Send on that guest's row.
- The **.ics** calendar file lists your guests so their calendar apps can
  invite them, but it deliberately carries no link when there is more than one
  guest: no single link would be safe to share between them.

Opening a link is enough — no copying required. `visualtalk://` is registered
with the operating system, so a clicked invite launches VisualTalk and drops the
guest into the Join dialog with the room already filled in; they still type their
name and confirm before anything connects. If clicking does nothing, the app is
not installed on that device (or, on Windows and Linux, another program claimed
the scheme): copy the link and paste it into **Join Meeting** instead.

If a link reaches the wrong person, that one link cannot be withdrawn. Your
options are to schedule a new meeting (fresh room code, fresh links) or to
change the API key and secret on your LiveKit server, which invalidates
**every** token for that project — including your own, so you must then paste
the new pair into **Settings → LiveKit**. Blocking a participant hides them on
your devices; it does not cancel a link they already hold.

## Acceptable use and content reporting

VisualTalk transmits user-generated content (chat messages, shared files, display
names, audio and video) between meeting participants. By using VisualTalk you
agree not to create, share, or link to content that is unlawful, defamatory,
harassing, abusive, discriminatory, sexually explicit, or that infringes the
rights of others, and not to use the app to harm minors or to distribute malware.

Because VisualTalk is bring-your-own-server, the publisher never sees meeting
content and cannot moderate it. Moderation tools therefore live where the content
is visible:

- **Report:** every chat message has a Report action that sends the message
  excerpt, sender identity, room and timestamp to the meeting organizer's report
  address (Settings → Profile).
- **Block:** Settings → Profile → Blocked Participants hides a participant's chat,
  files and video on your device; the list is remembered for future meetings and
  you can unblock at any time.
- **Leaving:** any participant can leave at any time, and closing the meeting
  window ends it for you. VisualTalk has no administrative access to your
  server, so it cannot eject a guest from it: for an unwanted guest, block them
  and, while their invite link is still valid, follow the withdrawal steps in
  "Invitations: one link per guest" above.

Reports about content are handled by the organizer of the meeting in which the
content appeared; reports about the app itself go to the support address above.

## System requirements

See the README (<https://github.com/pointer/visualtalk#readme>) for the current
list of supported platforms and versions. The iOS build requires iOS 15.0 or later.

## Commercial licensing and paid support

The VisualTalk app distributed through app stores is the free Community
Edition: it has no In-App Purchase, no subscription and no paid features, and
no account is required to use it.

VisualTalk Pro is a separate application, and commercial licensing of the source
code (including paid support agreements) is described in the `EULA-PRO` file in
the repository; contact <kghemari@yahoo.com>.
