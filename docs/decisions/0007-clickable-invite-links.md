# 0007: Clickable invite links (`visualtalk://` deep links)

- Date: 2026-11-15
- Status: accepted

## Context

Until now `visualtalk://join?…` was a paste-only envelope: nothing in the repo
registered the scheme, so a guest had to copy the link out of their mail or chat
app and paste it into the Join dialog. That friction is the main practical cost
of the per-guest link model in decision 0004, and it makes shared links more
likely (people forward what they cannot click).

## Decision

- Register `visualtalk` as an application URL scheme with
  `tauri-plugin-deep-link`, in the four places that must agree:
  `tauri.conf.json` (`plugins.deep-link.desktop.schemes` and `.mobile`),
  `Info.plist` / `Info-pro.plist` (`CFBundleURLTypes`), and the Android
  intent-filter added by `scripts/fix-android-project.py`.
- Add `tauri-plugin-single-instance` (desktop only, `deep-link` feature,
  registered **first**): on Windows and Linux the OS launches a new process for a
  deep link instead of messaging the running one, so the second process must
  forward the URL and focus the existing window rather than open a second app.
- A clicked link opens the Join dialog with the link pre-filled and parsed. It
  does **not** auto-connect: the guest still sees the room code and types a
  display name first.
- Only the main window subscribes; the meeting window ignores deep links.
- The URL is untrusted input. It goes to `parse_invite_link` and nothing else —
  LiveKit still validates a direct token, or the organizer's issuer validates a
  capability (decision 0006), before anyone enters a room.

## Consequences

- Invite links are clickable in mail, chat and browsers on every platform, which
  removes the copy-paste step and the "is this link broken?" support load.
- **A custom scheme can be registered by any app.** On Android any installed app
  can claim `visualtalk://`; on Windows and Linux the last registration wins. A
  malicious app could therefore read an invite link — which is a bearer
  credential — before VisualTalk sees it. Mitigations, in order of strength:
  prefer issuer-mode links (short-lived capability, participant cap, rate
  limited) over direct-token links for anything shared beyond a trusted circle;
  keep the confirmation step in the Join dialog; and never log the URL. Moving to
  HTTPS universal links / App Links (with `visualtalk.app`) would remove the
  squatting risk entirely, but needs a hosted association file per platform.
- The scheme is also a fingerprint: a browser can attempt navigation to
  `visualtalk://` to detect that the app is installed.
- Permission plumbing grew: `Info.plist`, `Info-pro.plist`,
  `capabilities/default.json` (`deep-link:default`), `tauri.conf.json` and the
  Android manifest patch must stay in sync (AGENTS.md lists this as a
  non-negotiable). The mobile `gen/` projects need regenerating or re-patching
  after any change here.
- A second instance no longer starts on desktop; launching the app while it runs
  focuses the existing window.