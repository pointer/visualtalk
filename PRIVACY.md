VISUALTALK — PRIVACY POLICY

Last Updated: October 13, 2026
Applies to: VisualTalk Community Edition and VisualTalk Pro Edition
            (macOS, Windows, Linux, iOS and Android)


1. THE SHORT VERSION

VisualTalk does not collect your personal data.

  - No user account, no sign-in, no registration.
  - No analytics, no telemetry, no crash reporting, no advertising
    SDKs, and no trackers of any kind are present in the Software.
  - No server operated by Miradata sits in the path of your meetings.
  - Your profile, preferences, notes, meeting list and recordings are
    stored on your own device and are never transmitted to us.

VisualTalk is bring-your-own-server. You tell the app which LiveKit
server to use, and your audio, video, chat and files travel directly
between your device and that server. We never see them and we cannot
access them.


2. WHO IS RESPONSIBLE

Miradata, a simplified joint-stock company with a single
shareholder (société par actions simplifiée)
incorporated under the laws of France, with a share capital of
EUR 1,000.00, registered with the Trade and Companies Register (RCS)
of Bobigny under number 849 735 311, whose registered office is at
12 rue Jacques Catric, 93260 Les Lilas, France, VAT identification
number FR64849735311 (the "Licensor", "we", "us").

Contact for any privacy question: kghemari@yahoo.com

Because the Software transmits no personal data to us, Miradata is not
a data controller for your meetings, your contacts or your content. We
are identified here only for the limited processing described in
Section 8 (app-store distribution) and to answer your questions.

The operator of the LiveKit server you choose is the controller of the
communication data that server processes — see Section 3.


3. BRING-YOUR-OWN-SERVER ARCHITECTURE

  a) You configure your own LiveKit server in Settings → LiveKit by
     entering a server URL, an API key and an API secret.
  b) The Software ships with no default server and no embedded
     credentials. If you have not configured a server, meetings cannot
     start. The app will not silently fall back to any server operated
     by the Licensor.
  c) Connection tokens (JWT) are generated on your own device using the
     credentials you entered, and are valid for 24 hours. They are not
     issued by us and we never see them.
  d) The operator of the server you select — which may be you, your
     employer, or a commercial provider such as LiveKit Cloud — is
     responsible for the data that server processes, for its retention
     policy, and for any server-side recording. Read that operator's
     privacy policy.
  e) When you join a meeting hosted by someone else, the host's
     organisation controls that server and its recording settings.

We deliberately make it impossible for the Licensor to be inserted into
your media path by default.


4. DATA STORED ON YOUR DEVICE

All of the following stays on your device and is never sent to us:

  - Profile: display name, user identity, email address (only if you
    choose to enter one), and your personal meeting ID.
  - Preferences: start-with-video, mute-on-join, use-personal-meeting-
    ID, always-show-preview, and preferred microphone, camera and
    speaker identifiers.
  - Notes you write in the Notes tab.
  - Scheduled meetings and meeting history: title, room identifier,
    start time, duration and timestamps.
  - Your LiveKit server URL, API key and API secret.
  - Optional AI assistant configuration, including its API key
    (see Section 6).
  - Local recordings you make, saved in the app's recordings folder.
  - Calendar (.ics) files you generate, which may contain the email
    addresses of the attendees you invited.

These files live in your operating system's per-user application
configuration directory for VisualTalk.

IMPORTANT — PLAINTEXT STORAGE. These values, including your server API
secret and any AI API key, are stored as plaintext configuration files
and are not held in the operating system keychain. Anyone with access
to your device or user account can read them. Protect your device with
full-disk encryption and a strong login password. We cannot retrieve,
rotate or reset these credentials for you, because we never receive
them.

If you schedule a meeting and add attendees, their email addresses are
written into the generated .ics file on your device and are included in
the invitation you choose to send. You are responsible for having a
lawful basis to share those addresses.

DELETION. This data persists until you remove it. You can delete
individual items in the app (notes, scheduled meetings, recordings),
reset your profile in Settings, or delete everything by removing the
app's configuration directory or uninstalling the Software.


5. DEVICE PERMISSIONS

  - Camera and microphone: requested through your operating system's
    permission prompt and used only while you are in a meeting or in
    the pre-join preview. They are never accessed in the background.
  - Screen sharing: captured only after you explicitly start sharing,
    and stops when you end it.
  - Clipboard: written to only when you copy a meeting ID or invitation.

You can revoke any permission at any time in your operating system's
privacy settings. The Software will continue to run with the affected
feature disabled.


6. OPTIONAL AI ASSISTANT (DISABLED BY DEFAULT)

The AI chat assistant is turned off unless you enable it in
Settings → AI Assistant.

  - When enabled, it sends your prompt together with the last 20 chat
    turns of the meeting as context to the endpoint you configure.
  - The default configuration points at a server running on your own
    machine (http://localhost:11434/v1, for example Ollama or
    LM Studio). With a local endpoint your conversation never leaves
    your device.
  - If you point the assistant at a cloud provider such as OpenAI or
    OpenRouter, that provider receives your prompt and chat history and
    processes it under its own privacy policy. Miradata is not involved
    in that exchange, has no relationship with that provider, and
    receives nothing.
  - Because this is a meaningful disclosure, the Software shows a
    one-time consent prompt when the configured endpoint is not on
    localhost.
  - Your AI API key is stored locally on your device (see Section 4).


7. ENCRYPTION

Pro Edition — End-to-End Encryption. E2EE covers chat messages and file
transfers: they are encrypted on your device before transmission and
can only be decrypted by meeting participants who have completed the
key exchange. The server operator cannot read that content. The
cryptographic stack is ECDH P-256 for key exchange, HKDF-SHA-256 for
key derivation, and AES-256-GCM for symmetric encryption.

IMPORTANT — AUDIO AND VIDEO ARE NOT END-TO-END ENCRYPTED. In both
editions, audio and video streams are protected in transit by the
LiveKit server's transport security (TLS and DTLS-SRTP) but are
processable by the operator of the server you chose. If you require
media that the server operator cannot access, VisualTalk is not the
right tool today.

Community Edition — no E2EE. Chat messages are not end-to-end
encrypted and are processable by the operator of the server you chose.


8. APP STORES AND PURCHASES

When you buy VisualTalk Pro through the Apple App Store or Google Play:

  - Apple and Google act as merchant of record. They process your
    payment, handle billing and issue refunds under their own terms and
    privacy policies.
  - We do not receive your name, payment instrument, billing address or
    Apple/Google account identifier.
  - We may see aggregated, anonymous download and sales statistics in
    the store vendor dashboards. These cannot be linked to you.
  - The store platforms themselves may collect device, usage and
    diagnostic data under their own privacy policies. Operating-system
    crash diagnostics are shared with Apple or Google only if you
    enable that feature in your device settings; they are never sent to
    Miradata.

You are not required to create an account with us, and we cannot
restore a purchase from our side — refunds and purchase recovery are
handled by the store that sold it to you.


9. WHAT WE NEVER DO

  - We never sell your personal data.
  - We never share your data for advertising or marketing.
  - We never build profiles of you or run automated decision-making.
  - We never embed third-party trackers or advertising identifiers.
  - We never operate a relay for your meetings.
  - We never compile credentials into the distributed application.


10. INTERNATIONAL TRANSFERS

Miradata receives no personal data from the Software, and therefore
makes no international transfer of your data.

The LiveKit server and any AI endpoint you configure may be hosted in
any country. Any transfer that results is between you and that
provider, and is governed by that provider's terms. If you use
VisualTalk for work, your organisation should verify that the server it
selects offers appropriate safeguards under GDPR Chapter V.


11. CHILDREN

VisualTalk is not directed at children under the age of 15 in France
(or the equivalent age of digital majority in your country). We collect
no personal data from any user, of any age.


12. YOUR RIGHTS

Under the GDPR and French law you have the right to:

  - access, rectify and erase your personal data;
  - restrict or object to processing;
  - data portability;
  - withdraw consent at any time, without retroactive effect;
  - define post-mortem directives for your data (Article 40-1 of the
    French Data Protection Act);
  - lodge a complaint with the CNIL (Commission Nationale de
    l'Informatique et des Libertés, www.cnil.fr) or with the
    supervisory authority of your country of residence.

Because Miradata holds no personal data about you, these rights are in
practice exercised directly on your device by deleting the app's data,
or directed to the operator of the LiveKit server you used. To exercise
any right, or to ask us anything about this policy, write to
kghemari@yahoo.com. We answer within one month as required by
Article 12 GDPR.


13. SECURITY

  - No credentials are embedded in the distributed application. A
    signing secret compiled into a shipped binary is recoverable by
    anyone, so the Software requires you to supply your own and keeps
    them on your device.
  - Connections to your LiveKit server use encrypted transport
    (wss:// over TLS).
  - Connection tokens are generated locally and expire after 24 hours.
  - Recording files are confined to the app's own recordings directory.

The security of your stored credentials ultimately depends on the
security of your device — see the plaintext-storage warning in
Section 4.


14. CHANGES TO THIS POLICY

We may update this policy to reflect changes in the Software or in the
law. The copy bundled with your installation — visible in the app under
License Information → Privacy — is the version that applies to that
build. The same text is maintained as PRIVACY.md in the VisualTalk
source repository. The "Last Updated" date at the top tells you how
current it is.


15. CONTACT

Miradata \
12 rue Jacques Catric \
93260 Les Lilas \
France

RCS Bobigny 849 735 311 \
VAT FR64849735311 \
Email: kghemari@yahoo.com


