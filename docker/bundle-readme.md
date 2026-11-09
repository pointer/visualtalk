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
