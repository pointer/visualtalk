# VisualTalk Server Stack {{VERSION}}

The self-hosted real-time stack that VisualTalk connects to: a loopback-only
LiveKit server, redis, an optional Egress recorder and an optional local Whisper
speech-to-text service. VisualTalk is bring-your-own-server; this bundle is that
server, ready to run.

## Requirements

- Docker with the **Compose v2 plugin** (`docker compose version`). Docker
  Desktop on macOS/Windows, docker.io + compose plugin on Linux.
- `openssl` (first run only — generates the API key pair).
- Optional: the `lk` CLI and `ffprobe`, used by the `smoke` end-to-end check.

Nothing here phones home. Container **images** are not included: redis and the
LiveKit egress image are pulled from Docker Hub, and the LiveKit server image is
**built from source** by the included `Dockerfile` (pinned tag, auditable build).
The Whisper service downloads its model weights on first use.

## Quick start

```bash
cd visualtalk-server-{{VERSION}}
python3 scripts/livekit-local.py up --recording   # server + redis + egress
python3 scripts/livekit-local.py creds            # what to paste into the app
```

Then in VisualTalk: **Settings → LiveKit**, paste the URL, API key and API
secret. The stack writes its own `docker/.env` (mode 600, random key pair) on
first run and never commits or transmits it.

Without recording (signalling + media only): `python3 scripts/livekit-local.py up`.
Add local speech-to-text: `--translation` (see below).
Phones/tablets on your Wi-Fi: `--host`, then set `LIVEKIT_NODE_IP` in
`docker/.env` to this machine's LAN IP first.

Prove it end to end: `python3 scripts/livekit-local.py smoke --recording`.

## Connecting the app to this server — in plain words

Think of it like this: the **address** is the server's phone number, the
**API key** is a membership-card number, and the **API secret** is the PIN for
that card. When the server starts for the first time it creates the card and
the PIN by itself and writes them into its own notebook — a file called
`docker/.env`. Everything the app will ever ask you for is already written
there; your job is only to copy three values.

**Step 1 — ask the notebook out loud.** In this folder, run:

```bash
python3 scripts/livekit-local.py creds
```

It prints exactly what to paste, for example:

```
LiveKit credentials (docker/.env):
  url (this machine):      ws://localhost:7880
  url (android emulator):  ws://10.0.2.2:7880
  LIVEKIT_NODE_IP:         127.0.0.1
  LIVEKIT_API_KEY:         vt-xxxxxxxx
  LIVEKIT_API_SECRET:      <a long scrambled string>
```

Prefer no commands at all? Open the `docker` folder and open the file named
`.env` in any text editor (TextEdit, Notepad). It is a hidden file: on a Mac
press Cmd+Shift+. (Command + Shift + period) in Finder once to reveal hidden
files; on Windows tick View → "Hidden items". The values sit after the `=` on
the lines starting `LIVEKIT_API_KEY=` and `LIVEKIT_API_SECRET=`.

**Step 2 — pick the address that matches where the app runs.**

| The app runs on… | Paste this address |
| --- | --- |
| The same computer as the server | `ws://localhost:7880` (same as `ws://127.0.0.1:7880` — both mean "this computer") |
| An Android emulator on the server computer | `ws://10.0.2.2:7880` |
| A phone or tablet on your home Wi-Fi | `ws://<the server computer's Wi-Fi address>:7880`, e.g. `ws://192.168.1.20:7880`. Find it — Mac: System Settings → Wi-Fi → Details… → IP Address. Windows: Settings → Network & Internet → your connection → IPv4 address. The server must have been started with `--host` so phones can reach it. |

**Step 3 — paste into the app.** In VisualTalk: **Settings → LiveKit**, fill
the three boxes (address, API key, API secret), press **Save Configuration**.
No account, no cloud, nothing leaves your home. The secret is a password:
never paste it into chats, screenshots or emails.

**If it misbehaves (plain-words fixes):**

- The phone spins on "Connecting…" forever → you pasted the "this computer"
  address; a phone needs the Wi-Fi address from the table above.
- "Unauthorized" or an auth error → the key or secret was retyped by hand and
  has a typo; copy-paste instead. Neither value contains spaces.
- It worked yesterday but not today → the server is asleep: run
  `python3 scripts/livekit-local.py up` again. The address and the credentials
  never change unless you delete `docker/.env`.

## What is in the box

| Path | Purpose |
| --- | --- |
| `docker/docker-compose.yml` | livekit + redis, plus `recording` and `translation` profiles |
| `docker/compose.host.yml` | host-networking overlay for LAN use |
| `docker/livekit.yaml`, `docker/egress.yaml` | server and recorder configuration |
| `docker/Dockerfile` | auditable source build of the pinned LiveKit server |
| `docker/.env.example` | every tunable, with defaults and comments |
| `scripts/livekit-local.py` | up / down / restart / status / logs / creds / smoke |
| `README.md` | this file |

Recordings land in `docker/recordings/` on this machine and nowhere else.

## Local speech-to-text (translation profile)

`--translation` starts a Whisper container on `127.0.0.1:8080`. It has **no
authentication**, so keep it loopback-bound, and note it translates into
**English only** — captions in other target languages are not supported by this
service. Details and measured limits: the contract document in the VisualTalk
source repository.

## Privacy and support

The stack is loopback-only by default and holds no accounts, analytics or
telemetry. VisualTalk's privacy policy: <https://visualtalk.app/privacy>.
Support: kghemari@yahoo.com. The LiveKit server is Apache-2.0; everything else
here ships under the same terms as the VisualTalk Community Edition.
