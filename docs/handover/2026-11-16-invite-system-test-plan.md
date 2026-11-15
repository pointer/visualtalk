# VisualTalk — invite system manual test plan (run 2026-11-16)

Covers everything `cc05e7a` changed that automation could not prove: deep links on
each platform, real mail/SMS delivery, the contacts picker on a device, the
identity migration on an **existing** install, and the two-guests-one-link
scenario that caused the original "everyone but the last guest gets kicked" bug.

Already proven by machine (do not re-test): 92 Rust tests, 14 Node tests,
`pnpm build`, notices/license/i18n/model gates, the macOS bundle's
`CFBundleURLTypes`, the Android manifest patch, the server-bundle zip, and the
issuer container live (two shared-link guests connected at once; a reused token
dropped the first; 401/400/403/429 paths).

**How to use this file.** Work top to bottom. Tick `[x]` as you go, and write
anything unexpected in the "Notes" column at the bottom — a failing item with its
exact error text is worth more than a pass. Items marked **BLOCKER** should stop
a release; the rest are quality gates.

Estimated time: ~45 min for A–D on this Mac, +20 min per extra platform, +30 min
if you test real SMTP/Twilio providers.

---

## 0. Setup (once, ~10 min)

1. Start the local stack with both optional services:
   ```bash
   cd /Users/Kateb/_dev/visualtalk
   python3 scripts/livekit-local.py up --issuer --messaging
   ```
   Expected: livekit + redis healthy, `visualtalk-guest-token-issuer` healthy,
   mailpit listening, and two credential blocks printed (Settings → LiveKit and
   Settings → Invitations).
2. The mail sink needs its self-signed certificate trusted **once**, or every
   send fails TLS validation (the app requires STARTTLS). Run the macOS line the
   script printed:
   ```bash
   security add-trusted-cert -r trustRoot -p ssl \
     -k ~/Library/Keychains/login.keychain-db docker/mailpit/localhost.crt
   ```
3. Build the app you will click links with (a dev run has no `.app` bundle, so
   macOS will not hand it `visualtalk://` URLs):
   ```bash
   pnpm desktop:build
   open src-tauri/target/release/bundle/macos/visualtalk.app
   ```
4. In **Settings → LiveKit**, paste the printed URL / API key / API secret and
   save. Note whether the secret field then shows "Saved — leave blank to keep".
5. For any test needing **two guests at once**, decide your second device now:
   - another computer or a phone on the same Wi-Fi (best), or
   - the same Mac running `pnpm desktop` alongside the bundled app.
     If the second window refuses to open, that is `tauri-plugin-single-instance`
     working as designed — use a phone instead.
   For phones, first widen the bindings and restart:
   ```bash
   # in docker/.env set  LIVEKIT_BIND_ADDR=0.0.0.0  and  TOKEN_ISSUER_BIND_ADDR=0.0.0.0
   python3 scripts/livekit-local.py restart --issuer
   python3 scripts/livekit-local.py creds --issuer     # prints the LAN URLs
   ```
   and in the phone app use `ws://<your Mac's Wi-Fi IP>:7880` plus
   `http://<same IP>:7883/v1/token`.

---

## A. Regression smoke (~10 min)

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| A1 | **BLOCKER** App launches | Open the bundled app | Main window, no error dialog, clock/profile render | ☐ |
| A2 | Settings round-trip | Settings → LiveKit: change the URL, leave the secret blank, save, reopen | Saved; the URL kept your edit and the meeting still joins (secret was preserved, not wiped) | ☐ |
| A3 | Secret never returns | Reopen Settings → LiveKit | The secret field is **empty** with the "Saved — leave blank to keep" hint; no dots, no old value | ☐ |
| A4 | Join by room code | Home → start an instant meeting; second device joins with that room code | Both stay in; each tile shows a different name | ☐ |
| A5 | Media permissions | Allow camera + mic when prompted | Preview shows video, level meter responds | ☐ |
| A6 | Notes/Profile unaffected | Edit a note and your display name | Both persist after restart | ☐ |

## B. Identity fix + migration (~10 min)

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| B1 | **BLOCKER** Legacy identity migrated | On an install that predates the fix, open Settings → Profile (or read `~/Library/Application Support/com.katebg.visualtalk/settings.json`) | `identity` is now `User-` + **12 hex chars**, not `User-1234` | ☐ |
| B2 | Display name followed the identity | Same install, where the display name had never been edited | Display name equals the new identity (no stale `User-1234` label) | ☐ |
| B3 | A chosen name is kept | Set a custom identity/display name, restart | Both unchanged — the migration must not rename what you typed | ☐ |
| B4 | Two fresh installs differ | Install on a second device (or delete the config dir and relaunch twice) | The two `User-…` identities differ | ☐ |
| B5 | No more phantom kicks | Two devices, both joining by room code, 5 min in a meeting | Neither is disconnected | ☐ |

## C. Direct per-guest invites — issuer field left EMPTY (~15 min)

Confirm **Settings → LiveKit → Guest token issuer URL** is blank for this block.

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| C1 | **BLOCKER** One link per guest | Schedule a meeting with two guest emails | Two rows, each with a **different** `visualtalk://join?…token=…` link | ☐ |
| C2 | **BLOCKER** Copy works | Press **Copy** on a row | Button turns green/"Copied!" and the clipboard holds that guest's text (this was silently broken before) | ☐ |
| C3 | Link is paste-joinable | Join Meeting → paste a copied link → Continue | Room code shown, name step reached | ☐ |
| C4 | No secret in the link | Inspect the copied text | Contains `room`, `url`, `token` — never the API secret | ☐ |
| C5 | Expiry wording | Read the note under the list | "Each link admits one guest…"; for a scheduled meeting it mentions the +2 h / 24 h / 30-day rule | ☐ |
| C6 | 30-day cap | Schedule a meeting 40 days out | Refused with the "must be within the next 30 days" message | ☐ |
| C7 | .ics has no shared link | Download the `.ics` for the 2-guest meeting and open it in a text editor | `ATTENDEE:` lines present, **no** `URL:` line, and the UI showed the "no shared link" note | ☐ |
| C8 | Instant invite | Home → "Copy a single-guest invite" | Text says the link is for one guest only and expires in 24 h | ☐ |
| C9 | Spoofed identity ignored | Append `&identity=hacker` to a link, then paste-join | Joins with the token's own `guest-…` identity, not `hacker` | ☐ |

## D. Clickable invite links (deep links) (~20 min per platform)

Test with a **real** link copied from Schedule (C1) so the token is valid.

### D-mac (this machine)

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| D1 | **BLOCKER** Warm click | With the app open, run `open "<paste the link>"` in Terminal (or click it in Mail/Notes) | App focuses, Join dialog opens **already on the name step** with the room code shown | ☐ |
| D2 | Cold start | Quit the app, then click the link | App launches and lands in the Join dialog with the link parsed | ☐ |
| D3 | From another tab | Sit on Settings, then click a link | App switches to Home and opens the Join dialog | ☐ |
| D4 | Second link while open | With the dialog open, click a *different* guest's link | Dialog re-parses to the new room; no stale state | ☐ |
| D5 | No auto-join | After D1, do nothing | Nothing connects until you type a name and press Join — this is deliberate (another app could claim the scheme) | ☐ |
| D6 | Garbage link | `open "visualtalk://join?room=x"` | Friendly parse error in the dialog, app does not crash | ☐ |
| D7 | Wrong scheme | `open "https://visualtalk.app/j/?room=x"` | Opens the browser, not the app (we register only `visualtalk`) | ☐ |
| D8 | In a meeting | Join a meeting, then click another invite link | The meeting window keeps running; the main window shows the dialog (or nothing steals focus mid-call) — note what actually happens | ☐ |

### D-win / D-linux (when you next have that machine)

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| D9 | Install registers the scheme | Install the MSI/AppImage, then open a link from a browser | App opens the Join dialog | ☐ |
| D10 | **BLOCKER** No second instance | With the app already running, click a link | The **existing** window focuses and shows the dialog — a second app window must NOT appear (that is `tauri-plugin-single-instance`) | ☐ |
| D11 | Minimized window | Minimize, then click a link | Window restores and focuses | ☐ |

### D-android

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| D12 | Manifest shipped | After `pnpm android:build`, check `gen/android/.../AndroidManifest.xml` | Contains `<data android:scheme="visualtalk" />`; `python3 scripts/fix-android-project.py --check` says all patches applied | ☐ |
| D13 | Click from another app | Send the link to yourself (Telegram/Drive/Notes) and tap it on the phone | VisualTalk opens at the Join dialog with the link parsed | ☐ |
| D14 | adb fallback | `adb shell am start -a android.intent.action.VIEW -d "visualtalk://join?room=demo&url=ws%3A%2F%2F10.0.2.2%3A7880&token=x"` | App opens and reports a malformed token (routing works) | ☐ |
| D15 | **Contacts button** | Schedule → look beside the recipient field | Note whether "Choose contacts" appears at all — see block H | ☐ |

### D-ios

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| D16 | Project carries the scheme | `grep -c CFBundleURLTypes src-tauri/gen/apple/visualtalk_iOS/Info.plist` | `1` (I patched it; a fresh `pnpm ios:clean && pnpm ios:init` must reproduce it from `src-tauri/Info.plist` — verify after regenerating) | ☐ |
| D17 | Simulator click | `xcrun simctl openurl booted "visualtalk://join?room=demo&url=ws%3A%2F%2F127.0.0.1%3A7880&token=x"` | App opens at the Join dialog with a token error | ☐ |
| D18 | Device click | AirDrop/Mail the link to the device, tap it | VisualTalk opens, dialog pre-filled | ☐ |

## E. Issuer mode — one shareable link (~20 min)

Set **Settings → LiveKit → Guest token issuer URL** to
`http://127.0.0.1:7883/v1/token` (`…creds --issuer` prints it), save, then:

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| E1 | Link shape changes | Schedule a meeting with two guests | Both rows show the **same** link, containing `issuer=` and `invite=` and **no** `token=` | ☐ |
| E2 | Wording changes | Read the note under the list | "One link for every guest…" (not "Each link admits one guest") | ☐ |
| E3 | .ics carries the link | Download the `.ics` | A `URL:` property is present now, since the link is genuinely shareable | ☐ |
| E4 | **BLOCKER** Two guests, one link | Guest A joins via the link; guest B joins via the **same** link (second device) | **Both stay in the meeting.** Tiles show two different names. This is the bug that started all of it | ☐ |
| E5 | Identities are distinct | Compare the two `guest-…` identities (roster/notes or the issuer log: `python3 scripts/livekit-local.py logs token-issuer`) | Different UUIDs | ☐ |
| E6 | Display name lands | Guest B types "Zoe" | The tile reads "Zoe" (the issuer writes the name into the token) | ☐ |
| E7 | Third guest | A third person uses the same link | Joins fine; all three coexist | ☐ |
| E8 | Participant cap | Redeem the same link 51+ times (script it, or lower `TOKEN_ISSUER_MAX_TOKENS_PER_INVITE=3` in `docker/.env` and `restart --issuer`) | Further attempts fail with "participant limit"; the app shows that message rather than a spinner | ☐ |
| E9 | Rate limit | Fire >30 requests in a minute | HTTP 429 surfaces as a readable error in the Join dialog | ☐ |
| E10 | Expired capability | Wait out a short-lived link (or set a meeting far in the past within the 24 h floor) | "Invalid or expired invitation", no crash | ☐ |
| E11 | Issuer down | `docker compose -f docker/docker-compose.yml --profile issuer stop token-issuer`, then try to join | Clear "could not contact the guest token issuer" error; restart it afterwards | ☐ |
| E12 | HTTPS rule | Type `http://example.com/v1/token` into the issuer field and save, then create an invite | Rejected: HTTPS required off localhost/LAN | ☐ |
| E13 | LAN phone | Phone app with `http://<Mac Wi-Fi IP>:7883/v1/token` | Joins (private-range HTTP is allowed by design) | ☐ |
| E14 | Switch back | Clear the issuer field, save, schedule again | Back to per-guest `token=` links — the two modes coexist | ☐ |
| E15 | Old link still works | Paste a **direct** `token=` link while issuer mode is on | Still joins (both shapes stay supported) | ☐ |

## F. Duplicate-identity messaging (~10 min)

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| F1 | **BLOCKER** Readable kick | Issuer field empty. Copy ONE direct link, use it on two devices | The first guest is disconnected with a sentence naming "another participant joined with the same identity" and telling them what to do — never a bare "(2)" | ☐ |
| F2 | Recovery | The kicked guest pastes their own separate link | Rejoins and stays | ☐ |
| F3 | Other reasons | Kill the server mid-meeting (`docker compose stop livekit`) | Message says the server shut down / connection lost — still words, not a number | ☐ |

## G. Sending invitations (~15 min local, +20 min with real providers)

Local sink (no cost, tests the whole SMTP path):

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| G1 | Settings | Settings → Invitations: host `localhost`, port `1025`, STARTTLS, user `dev`, password `dev`, from `dev@visualtalk.local`, save | Saves without error | ☐ |
| G2 | **BLOCKER** Email delivered | Schedule with one guest, press **Send email** | Row shows "Invitation sent"; the message appears at <http://127.0.0.1:8025> | ☐ |
| G3 | Message content | Open it in the mailpit UI | Exactly one recipient, the subject is the meeting title, the body holds **that** guest's link, room, date/time — and no API secret | ☐ |
| G4 | Per-guest links | Two guests, send both | Two separate messages, each with a different link (direct mode) | ☐ |
| G5 | Nothing sent on schedule | Schedule without pressing Send | Mailpit inbox stays empty | ☐ |
| G6 | Failure is honest | Change the SMTP password to `wrong`, save, send | The row shows an authentication error — never "Invitation sent" | ☐ |
| G7 | Unconfigured | Clear the SMTP host, send | "Configure the SMTP server…" message | ☐ |
| G8 | Secret storage | Check the saved settings file | `~/Library/Application Support/com.katebg.visualtalk/settings.json` has **no** `smtp_password`; it lives in Keychain (`security find-generic-password -s com.katebg.visualtalk.messaging`) | ☐ |

Real providers (only if you want to spend the money/time):

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| G9 | Real SMTP | Point Settings → Invitations at a real mailbox (e.g. an app password), send to yourself | Arrives, not in spam, sender name shows | ☐ |
| G10 | Twilio SMS | Configure SID/token/E.164 sender, switch a phone to SMS mode, send | SMS arrives with the link; tap it on the phone → D13 behaviour | ☐ |
| G11 | SMS validation | Enter a number without a country code | Rejected with the "+country code" message | ☐ |

## H. Contacts picker — decide whether to keep the permissions (~10 min)

The button only renders when the webview actually exposes the Contact Picker API.
Nobody has confirmed that on a device yet, and both `READ_CONTACTS` (Android) and
`NSContactsUsageDescription` (iOS) are already declared — an unused sensitive
permission costs you a Play data-safety declaration and App Store privacy-label
questions for nothing.

| # | Test | Steps | Expected / decision | Pass |
|---|---|---|---|---|
| H1 | Android | Schedule screen on an Android build | Does "Choose contacts" appear? If yes, pick two contacts and check the recipient field fills with valid numbers/emails | ☐ |
| H2 | iOS | Same on an iOS build | Almost certainly absent (WKWebView). Confirm and note it | ☐ |
| H3 | Desktop | Same on macOS/Windows | Absent. Manual paste is the path | ☐ |
| H4 | **Decision** | If H1 shows no button anywhere | Either (a) drop `READ_CONTACTS` from `scripts/fix-android-project.py` and `NSContactsUsageDescription` from both Info.plists, or (b) keep them and add a vCard/CSV import via the already-granted `dialog` permission. Record the choice here: ____________ | ☐ |
| H5 | Fallback copy | With no picker, enter `alice@example.com; bob@example.com` and schedule | Both accepted, deduped, invalid addresses rejected with a clear message | ☐ |
| H6 | 50 cap | Paste 51 addresses | Refused with the invitee-limit message | ☐ |

## I. Editions and store readiness (~15 min)

| # | Test | Steps | Expected | Pass |
|---|---|---|---|---|
| I1 | CE frontend | `pnpm build` | Clean | ☐ |
| I2 | Pro frontend | `pnpm build:pro` | Clean; Licence screen shows the Pro EULA | ☐ |
| I3 | Pro desktop bundle | `pnpm desktop:build:pro` | Builds; then `plutil -p "src-tauri/target/release/bundle/macos/VisualTalk Pro.app/Contents/Info.plist" \| grep -A6 CFBundleURLTypes` shows URL name `com.katebg.visualtalk.pro.invite` and scheme `visualtalk` | ☐ |
| I4 | Pro click test | `open "…/VisualTalk Pro.app"` once, then click an invite link | The **Pro** app answers the scheme (both editions register `visualtalk` — note which one wins when both are installed; that is expected OS behaviour) | ☐ |
| I5 | Gates | `cd src-tauri && cargo test`; `pnpm test`; `pnpm license:check`; `pnpm i18n:check`; `python3 scripts/verify_models.py`; `python3 scripts/check_jsx_refs.py` | 92 Rust, 14 Node, all OK | ☐ |
| I6 | Android AAB | `pnpm android:build:aab` (or your usual command) | Builds with the patched manifest; `fix-android-project.py --check` reports all patches applied | ☐ |
| I7 | e2ee stub intact | `git status --short src-tauri/src/e2ee.rs` | Empty — never commit the Pro implementation | ☐ |

## J. Cleanup afterwards

```bash
docker compose -f docker/docker-compose.yml --profile issuer --profile messaging stop token-issuer mailpit
# put docker/.env back to LIVEKIT_BIND_ADDR=127.0.0.1 / TOKEN_ISSUER_BIND_ADDR=127.0.0.1
# optional: remove the dev certificate from your keychain and disk
security delete-certificate -c localhost ~/Library/Keychains/login.keychain-db
rm -rf docker/mailpit          # regenerated on the next `up --messaging`
# clear the test SMTP/Twilio values in Settings → Invitations if you entered real ones
```

---

## Notes / failures

| Item | What happened (exact error text, device, OS build) |
|---|---|
| | |
| | |
| | |
| | |
| | |

**Sign-off.** Blockers passed: ____ / 9 (A1, B1, C1, C2, D1, D10, E4, F1, G2).
Result: ☐ ship-ready ☐ ship with notes ☐ blocked — fix list above.

Two things to re-read if anything in D or E surprises you:
`docs/decisions/0006-optional-guest-token-issuer.md` and
`docs/decisions/0007-clickable-invite-links.md`.
