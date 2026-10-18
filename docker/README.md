# Local LiveKit stack for VisualTalk

A self-hosted LiveKit server (+ optional Egress recorder) that runs entirely on
your machine in Docker. VisualTalk is bring-your-own-server: it ships no default
server and no embedded credentials, so this stack is what you point it at during
development.

Everything here is loopback-only by default, nothing is committed to git
(`docker/.env`, `docker/recordings/`), and no cloud service is involved — the
server is configured with no public STUN servers and `use_external_ip: false`.

```
┌─ your machine ────────────────────────────────────────────────────────────┐
│  VisualTalk (Tauri)                                                       │
│    │ ws://127.0.0.1:7880  (signalling)                                    │
│    │ udp://127.0.0.1:7882 (media, single muxed port)                      │
│    ▼                                                                      │
│  ┌─ docker network "visualtalk-livekit" ───────────────────────────────┐  │
│  │  livekit (server)  ◀── redis (room state + PSRPC job dispatch)      │  │
│  │      ▲                   ▲                                          │  │
│  │      │ ws://livekit:7880 │ redis:6379                               │  │
│  │  egress (recorder, opt-in via the "recording" profile)              │  │
│  └─────────────────────────────────────────────┬───────────────────────┘  │
│                                                ▼                          │
│                              docker/recordings/<room>-<timestamp>.mp4     │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Quick start

```bash
./scripts/livekit-local.sh up --recording     # start server + redis + egress
./scripts/livekit-local.sh creds              # print what to paste into the app
./scripts/livekit-local.sh smoke --recording  # optional: prove it end to end
```

On the first run the script creates `docker/.env` from `docker/.env.example`
with a **fresh random API key pair** (mode `600`), creates `docker/recordings/`,
builds the server image, and waits for the healthchecks. Then paste the three
printed values into **VisualTalk ▸ Settings ▸ LiveKit**:

| Field | Default value |
| --- | --- |
| URL | `ws://127.0.0.1:7880` |
| API key | `devkey` (or the generated `vt-xxxxxxxx`) |
| API secret | the generated secret (≥ 32 chars) |

The app stores them in its Tauri store (`livekit.json` in the app config
directory) and mints its own room tokens from that pair — environment variables
are deliberately not consulted (see `src-tauri/src/egress.rs::resolve_credentials`).

Without recording (signalling + media only, ~no compositor overhead):

```bash
./scripts/livekit-local.sh up
```

### Requirements

- Docker Engine with the **Compose v2 plugin** (`docker compose version`),
  running. The wrapper rejects standalone `docker-compose` v1.
  `compose.host.yml` additionally needs Compose ≥ 2.24.4 for its `!reset` tags
  (verified here with v5.0.2).
- `openssl` (first run only, to generate the key pair).
- Optional: the **`lk` CLI** (`brew install livekit/tap/livekit-cli`) — used by
  `smoke` and by the recording table in `status`. Both degrade gracefully
  without it.
- Optional: `ffprobe` (ffmpeg) — `smoke` uses it to describe the recording.

---

## Files in this directory

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | The stack: `livekit` + `redis`, plus `egress` behind the `recording` profile. Bridge networking, ports bound to `127.0.0.1`. |
| `compose.host.yml` | Optional override: host networking + the full UDP range (see [Networking](#networking)). |
| `Dockerfile` | Builds `visualtalk/livekit-server:<version>-local`: the official release binary in a minimal non-root Alpine runtime, with `livekit.yaml` baked in. Can build from source instead. |
| `livekit.yaml` | Server config: port, logging, `rtc` (TCP port, **mDNS**, no STUN), room defaults. Bind-mounted read-only, so edits need only a restart. |
| `egress.yaml` | Recorder config: redis, logging, CPU admission costs, compositor choice (`enable_template_sdk`). Bind-mounted read-only. |
| `.env.example` | Documented template for every tunable. **This is the file you commit.** |
| `.env` | Your real values, including credentials. **Git-ignored, never commit.** |
| `recordings/` | Egress output. **Git-ignored.** |
| `README.md` | This file. |

Credentials and every tunable live in `.env`; nothing secret is baked into the
image, the configs, or compose. `livekit-server` refuses to start without a key
pair, so a misconfigured container fails loudly instead of serving media under a
well-known dev secret.

---

## What runs

| Service | Image | Container | Ports on host | Notes |
| --- | --- | --- | --- | --- |
| `livekit` | `visualtalk/livekit-server:v1.13.10-local` (built locally) | `visualtalk-livekit` | `7880/tcp` HTTP API + WebSocket signalling, `7881/tcp` ICE/TCP fallback, `7882/udp` ICE/UDP (muxed) | Runs as uid 10001 (non-root), has a healthcheck. All bound to `LIVEKIT_BIND_ADDR` (`127.0.0.1` by default). |
| `redis` | `redis:7-alpine` | `visualtalk-livekit-redis` | none | Room state for the server **and** the PSRPC channel egress receives jobs on. Ephemeral (`--save "" --appendonly no`): local room state must not survive a rebuild. |
| `egress` | `livekit/egress:v1.15.0` | `visualtalk-egress` | none | Opt-in via the `recording` compose profile. Writes to the bind-mounted `/recordings`. Runs as uid 1001. `cap_add: [SYS_ADMIN]` + `shm_size: 1gb` are only needed for the Chrome-based paths. |

A single muxed UDP port (7882) is used because Docker's bridge networking cannot
publish the 50000–60000 range LiveKit uses by default. Host networking
(`--host`) removes that constraint.

All three services use `restart: unless-stopped`, so the stack comes back with
Docker after a reboot, and container logs are capped (`json-file`, 10 MB × 3
files) so a long `debug` logging session cannot fill your disk. `livekit` and
`redis` have healthchecks (and compose waits on them: egress only starts once
both are healthy); `egress` itself has none — use `status`, which also lists
egress jobs and the files on disk, or `logs egress`.

---

## Day-to-day commands

The wrapper is the recommended entry point (`./scripts/livekit-local.sh --help`
for the full text). Raw `docker compose` equivalents are shown for reference —
run them from `docker/`, and remember compose needs `LIVEKIT_API_KEY` /
`LIVEKIT_API_SECRET` in the environment or in `docker/.env`.

| Task | Wrapper | Raw compose (from `docker/`) |
| --- | --- | --- |
| Start (no recording) | `up` | `docker compose up -d` |
| Start + egress | `up --recording` | `docker compose --profile recording up -d` |
| Stop & remove | `down` | `docker compose --profile recording down --remove-orphans` |
| Apply config/`.env` edits | `restart --recording` | `docker compose --profile recording up -d --force-recreate` |
| Rebuild the server image | `docker compose build livekit`, then `restart --recording` | same |
| Container states + recordings | `status` | `docker compose ps` |
| Logs | `logs -f egress` | `docker compose logs -f egress` |
| Print app credentials | `creds` | `grep -E 'LIVEKIT_(API_KEY\|API_SECRET\|PORT)' .env` |
| End-to-end test | `smoke --recording` | see [Verifying](#verifying-a-recording) |
| Host networking | `up --host --recording` | `docker compose -f docker-compose.yml -f compose.host.yml --profile recording up -d` |

Notes:

- `restart` is what picks up edits to `livekit.yaml`, `egress.yaml`, `.env` and
  `docker-compose.yml`. Both YAML configs are bind-mounted read-only, so a
  restart is enough — no rebuild needed. **The Dockerfile is the exception**:
  rebuild first, then restart (compose only recreates a container when the image
  ID actually changed, which is also how a stale image keeps running after an
  edit).
- `down` never touches `docker/recordings/`; `creds` and `status` start nothing,
  and both will create `docker/.env` (with a random key pair) and
  `docker/recordings/` on a fresh clone.
- The wrapper validates `.env` before starting: empty credentials, a secret
  shorter than 32 characters, `:`/`#` inside a credential (they are parsed as
  YAML `key: secret`), and the "exposed to the LAN but advertising 127.0.0.1"
  combination are all rejected with an explanation instead of failing later in
  obscure ways.

---

## Configuration

`.env.example` documents every variable inline; this is the short version.

| Variable | Default | Meaning |
| --- | --- | --- |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | `devkey` / placeholder | The only credentials the server accepts. Same pair goes into the app. Secret must be ≥ 32 chars; neither may contain `:` or `#`. |
| `LIVEKIT_VERSION` | `v1.13.10` | Server version. One knob for the source tag, the upstream release image, the OCI label and the local image tag (`…-local`). |
| `EGRESS_VERSION` | `v1.15.0` | Recorder image tag. Pinned: a floating tag would silently swap the recording pipeline. |
| `REDIS_VERSION` | `7-alpine` | Redis image tag. |
| `LIVEKIT_BIND_ADDR` | `127.0.0.1` | Host address the published ports bind to. `0.0.0.0` exposes the server to your LAN — then `LIVEKIT_NODE_IP` must be a real LAN address. |
| `LIVEKIT_NODE_IP` | `127.0.0.1` | **The IP advertised to clients as a WebRTC ICE candidate.** Must be reachable *from the client*. The single most common source of "stuck on connecting". |
| `LIVEKIT_PORT` / `LIVEKIT_RTC_TCP_PORT` / `LIVEKIT_UDP_PORT` | `7880` / `7881` / `7882` | Host-side port mappings. `LIVEKIT_UDP_PORT` is also what the container listens on (bridge mode needs one muxed port). |
| `LIVEKIT_LOG_LEVEL` | `info` | Set `debug` to see ICE negotiation on the server side. |
| `LIVEKIT_RECORDINGS_DIR` | `./recordings` | Host directory mounted at `/recordings` in the egress container. Relative paths resolve against `docker/`, exactly like compose does. |

Two deliberate design points in `livekit.yaml`:

- `node_ip` / `udp_port` are **not** in the config file. A `node_ip` present
  there takes precedence over both the `--node-ip` flag and the `NODE_IP`
  environment variable in livekit-server 1.13.x, which would make the `.env`
  knob silently ineffective. Compose supplies them, so one source of truth.
- `stun_servers: []` and `use_external_ip: false`: no outbound dependency, host
  candidates only. Correct for local development; change it if you ever expose
  the server to the internet.

---

## Recording (Egress)

### How a recording job is issued

`src-tauri/src/egress.rs` exposes three Tauri commands — `start_room_egress`,
`stop_egress`, `list_egress` — via the official `livekit-api` crate's
`EgressClient`, which mints a short-lived server token per request.
`src/lib/useRecording.js` wraps them (`startEgressRecording`,
`stopEgressRecording`, `startRecording(…, mode: "egress")`). A file recording is
a **room composite** with:

> ⚠️ **Nothing in the shipped UI calls that wrapper yet** — see
> [Not yet reachable from the app UI](#not-yet-reachable-from-the-app-ui). The
> payload below is what `egress.rs` builds and what `smoke --recording` sends,
> not what the Record button does today.

```jsonc
{
  "room_name": "<room>",
  "layout": "grid",                 // RoomCompositeOptions.layout
  "file_outputs": [{
    "filepath": "/recordings/<room>-<unix timestamp>.mp4",
    "file_type": "MP4"              // MP4 or OGG
  }]
}
```

`/recordings/...` is a path **inside the egress container** — the bind-mounted
`LIVEKIT_RECORDINGS_DIR` — so the file lands in
`docker/recordings/<room>-<timestamp>.mp4` on your machine. The JS wrapper passes
`file_config: null` unless a caller overrides it, so the Rust command builds
exactly that path.

RTMP streaming uses the same command with `output_type: "stream"`, a list of
`urls` and a preset (`FULL_HD_1080` default → `H264_1080P_30`, `HD_720` →
`H264_720P_30`). Streaming needs egress too, so start the stack with
`--recording`. Like file recording, this is reachable only from code — see
[Not yet reachable from the app UI](#not-yet-reachable-from-the-app-ui).

Egress jobs reach the recorder over **redis (PSRPC)**, not HTTP: egress must
share the redis instance the server uses (`redis:6379` in `egress.yaml`,
`REDIS_HOST` for the server). That is why redis is always part of the stack.

### Not yet reachable from the app UI

The egress commands above are implemented in Rust and wrapped in JS, but **no UI
control invokes them**. Pressing Record in a meeting takes the client-side path:

- `MeetingToolbar.jsx:155` → `handleStartRecording` (`MeetingView.jsx:246`) →
  the consent dialog → `confirmStartRecording`, which calls
  `rec.startLocalRecording(lkRoom, roomName)` (`MeetingView.jsx:253`) and
  broadcasts `mode: "local"` (`MeetingView.jsx:262`). That is a **MediaRecorder**
  capture inside the webview, transcoded by ffmpeg into the app's own recordings
  directory. It never touches this stack's egress container.
- `useRecording.js:353` defines `startRecording(room, roomName, mode = "local")`
  with an `"egress"` branch, and exports `startEgressRecording`,
  `stopEgressRecording`, `startRtmpStream` and `streamToRtmp` (`:377-381`) — none
  of them has a caller anywhere in `src/`. There is no recording-mode setting
  either: `LiveKitSettings` is only `url` / `api_key` / `api_secret` / `identity`
  (`commands.rs:12-17`), and `settings.rs` has no such field.
- Even if a job were started, its output would be invisible to the app: egress
  writes to `docker/recordings/`, while `get_local_recordings`
  (`recording.rs:299`) lists only the app's own recording directory, and the
  "saved to" toast requires a string path (`MeetingView.jsx:224`) whereas the
  command returns an `EgressInfo` object. The stop side is already mode-aware
  (`MeetingView.jsx:216-232`), so it needs less work than the start side.

So today the recorder is exercised by the smoke test, or by hand with the same
`lk` call the script makes (`scripts/livekit-local.sh:368-378`):

```bash
KEY="$(grep '^LIVEKIT_API_KEY=' docker/.env | cut -d= -f2-)"
SECRET="$(grep '^LIVEKIT_API_SECRET=' docker/.env | cut -d= -f2-)"

lk egress start --type room-composite --url http://127.0.0.1:7880 \
  --api-key "$KEY" --api-secret "$SECRET" \
  '{"room_name":"my-room","layout":"grid","file_outputs":[{"filepath":"/recordings/my-room-1.mp4","file_type":"MP4"}]}'

lk egress stop --id EG_xxxxxxxxxx --url http://127.0.0.1:7880 \
  --api-key "$KEY" --api-secret "$SECRET"
```

(`./scripts/livekit-local.sh creds` prints the same two values. The secret is
`openssl rand -hex 32`, so it contains no characters that need shell quoting.)

There is no devtools shortcut: `withGlobalTauri` is not set in
`src-tauri/tauri.conf.json`, so `window.__TAURI__.core.invoke(…)` from a webview
console will not work.

### Which compositor renders your recording

`egress.yaml` sets `enable_template_sdk: true`, routing room composites that use
a **default layout** (`grid`, `speaker` — exactly what `egress.rs` asks for)
through GStreamer + the Go SDK instead of headless Chrome:

| | SDK compositor (default here) | Headless Chrome |
| --- | --- | --- |
| Memory | ~200 MB | ~1.5 GB reserved (`shm_size: 1gb` + renderer) |
| CPU (observed, 1–2 participants) | ~0.4 core | several cores |
| Startup | no page load / template fetch | loads a template page |
| ICE behaviour | plain Go client | Chromium obfuscates host candidates into mDNS |
| Used when | default layouts | `enable_template_sdk: false`, custom template URLs, web egress |

Both paths are verified working with this configuration. If you switch to Chrome
(`enable_template_sdk: false`), keep `rtc.use_mdns: true` in `livekit.yaml` (see
[mDNS](#why-rtcuse_mdns-true-matters)) and keep `cap_add: [SYS_ADMIN]`: since
egress v1.7.6 Chrome switches kernel namespaces and fails with "chrome failed to
start" without it. `enable_chrome_sandbox` stays `false` because enabling it
additionally requires upstream's seccomp profile.

`cpu_cost` keeps admission conservative (`max_cpu_utilization: 0.8`,
`room_composite_cpu_cost: 4`): a laptop can realistically run one room composite
at a time, and extra requests should queue rather than thrash the machine.

### Verifying a recording

```bash
./scripts/livekit-local.sh smoke --recording
```

publishes a demo participant with the `lk` CLI into a throwaway room
(`vt-smoke-<timestamp>`), asserts `smoke-pub` actually joined, starts a room
composite with the payload `src-tauri/src/egress.rs` builds, records for 20 s,
stops the job, then waits for `docker/recordings/smoke-<timestamp>.mp4` and
prints its streams. Run without `--recording` (or with egress stopped) it
verifies signalling + media only, and says so. A healthy run ends with:

```
[livekit] 2/3 verifying the participant joined and is active
    smoke-pub (ACTIVE)	 tracks: 1
[livekit] 3/3 recording the room (grid layout) to /recordings/smoke-1792321465.mp4
[livekit]     EG_K4ecoQ9gZNbQ started - recording for 20s
[livekit] recording OK: .../docker/recordings/smoke-1792321465.mp4 (6.0M)
    codec_name=aac
    codec_name=h264
    width=1280
    height=720
    duration=19.833333
[livekit] smoke test passed (signalling + media + recording)
```

It cleans up after itself — the publisher is killed and the throwaway room is
deleted — but deliberately leaves the `.mp4` behind so you can play it. On
failure it prints the egress job state and the last error lines from the
container log before exiting non-zero.

Manual equivalents:

```bash
ffprobe -v error -show_streams -show_format docker/recordings/<file>.mp4
./scripts/livekit-local.sh status        # egress job states + files on disk
lk egress list --url http://127.0.0.1:7880 --api-key <key> --api-secret <secret>
```

Egress also drops a metadata sidecar next to each recording —
`docker/recordings/<egressID>.json`:

```json
{"egress_id":"EG_K4ecoQ9gZNbQ","room_id":"RM_VUmeydhDehNe",
 "room_name":"vt-smoke-1792321455","started_at":1792321465757462512,
 "ended_at":1792321485906366174,
 "files":[{"filename":"/recordings/smoke-1792321465.mp4",
           "location":"/recordings/smoke-1792321465.mp4"}]}
```

That is what egress believes it produced (`*_at` are nanoseconds since the
epoch), so it is the quickest way to correlate a job with the file on disk — and
an `EG_*.json` whose listed `.mp4` is missing or 0 bytes means the media never
flowed even though the job was accepted.

`EGRESS_COMPLETE` with a non-empty `.mp4` is success. `EGRESS_FAILED` /
`EGRESS_ABORTED`, or a 0-byte file, means media never flowed — start with
[Troubleshooting](#troubleshooting).

---

## Networking

### Default: bridge networking, loopback only

`LIVEKIT_BIND_ADDR=127.0.0.1`, `LIVEKIT_NODE_IP=127.0.0.1`, single muxed UDP port
7882. Clients on this machine connect to `ws://127.0.0.1:7880` and send/receive
media to `127.0.0.1:7882`. Nothing is reachable from outside the machine.

### LAN mode (phones/tablets joining a meeting)

In `docker/.env`:

```bash
LIVEKIT_BIND_ADDR=0.0.0.0                 # publish on all interfaces
LIVEKIT_NODE_IP=<this machine's LAN IP>   # what clients will connect to
```

```bash
ipconfig getifaddr en0                     # macOS
hostname -I | awk '{print $1}'             # Linux
```

Then `restart` and use `ws://<LAN IP>:7880` in the app on the other device, with
the same API key/secret. Leave `LIVEKIT_NODE_IP=127.0.0.1` in this mode and
remote clients will hang on "connecting": they receive `127.0.0.1` as the ICE
candidate and try to reach *their own* loopback. `scripts/livekit-local.sh up`
refuses that combination outright.

`LIVEKIT_NODE_IP` is an **advertisement**, not a bind address: the server listens
on every interface in the container regardless, and Docker forwards from the host
port. It must be the address that is reachable *from the client's point of view*.
Leaving it empty lets livekit-server auto-detect an interface, which on a laptop
with VPN/Docker/bridge adapters frequently picks the wrong one (e.g.
`192.168.252.1`).

### Host networking

```bash
./scripts/livekit-local.sh up --host --recording
# or: docker compose -f docker-compose.yml -f compose.host.yml --profile recording up -d
```

`compose.host.yml` puts livekit, redis and egress on the host network: no NAT,
the full `50000-60000` UDP range instead of one muxed port, and redis re-bound to
`127.0.0.1` (host networking would otherwise expose it on every interface).
`LIVEKIT_NODE_IP` becomes mandatory and is enforced with a descriptive error.

Requirements: Linux, or Docker Desktop ≥ 4.34 with host networking enabled
(Settings ▸ Resources ▸ Network); Compose ≥ 2.24.4 for the `!reset` tags.
Nothing is "published" in this mode — the processes bind the host's own
interfaces — so open `7880/tcp`, `7881/tcp` and the UDP range in your firewall,
and remember the server is then reachable from your whole LAN.

### Why `rtc.use_mdns: true` matters

This is the root cause of the "recording fails / file is empty" class of bug, so
it is worth spelling out.

A browser (and headless Chrome, which egress uses for templates and web egress)
**obfuscates its host ICE candidates** as `<uuid>.local` mDNS names for privacy
reasons. Resolving those requires mDNS; the server does it only when
`rtc.use_mdns: true`. Without it the server simply drops the candidate, and a
client that cannot reach the advertised `NODE_IP` has no working candidate pair
left. Symptoms in the egress logs: no "Found valid candidate pair", then
"Start signal not received", an aborted egress, and a missing or 0-byte file.

It also explains why the default bridge configuration works despite
`NODE_IP=127.0.0.1`. The server advertises only `127.0.0.1` as its candidate,
which egress (inside the `visualtalk-livekit` network) cannot reach — but media
still flows because the server is the one initiating ICE checks toward egress's
bridge-network candidate. With debug logging:

```
level=debug msg="Found valid candidate pair" local="iceufrag:<…> udp4 host 172.18.0.4:56361" remote="udp4 prflx 172.18.0.3:7882"
```

The practical rule: keep `use_mdns: true`, and set `LIVEKIT_NODE_IP` to something
the *client* can reach. mDNS is enabled here so the Chrome-based paths work too,
not because the SDK compositor needs it.

---

## The server image

`docker/Dockerfile` produces `visualtalk/livekit-server:<LIVEKIT_VERSION>-local`.
The `-local` suffix keeps it distinct from upstream `livekit/livekit-server` tags
so a stale local image can never be mistaken for an official one; the build
label (`org.opencontainers.image.version`) carries the plain version.

By default it copies the official release binary out of
`livekit/livekit-server:${LIVEKIT_VERSION}` (that build argument is *derived* from
`LIVEKIT_VERSION`, so the release binary and a source build of the same version
cannot drift apart) into a minimal Alpine runtime. Alpine's minimal base ships no
CA bundle, so `ca-certificates` is installed explicitly — the server needs it for
outbound TLS (webhooks, TURN over TLS) and for autocert should you ever enable
TLS on its HTTP router. `livekit.yaml` is also baked in as a fallback, though
compose bind-mounts the repo copy over it.

Auditable source build, if you prefer to see what runs — select the other binary
stage:

```bash
cd docker
docker compose build --build-arg BINARY_STAGE=build-from-source livekit
./scripts/livekit-local.sh restart --recording
docker compose exec livekit livekit-server --version
docker image inspect visualtalk/livekit-server:v1.13.10-local \
  --format '{{index .Config.Labels "dev.visualtalk.binary-stage"}}'   # -> build-from-source
```

That stage clones the pinned tag from the public GitHub repo and builds with Go
(`golang:1.26-alpine`, `CGO_ENABLED=0`, `-trimpath`, `-ldflags="-s -w"`), then
runs `--version` as a build-time sanity check. The first build downloads the
toolchain and modules; afterwards the source layer is cached, so editing only the
YAML files does not retrigger it. The `dev.visualtalk.binary-stage` label records
which stage supplied the binary, so an audited build is distinguishable from an
upstream one at a glance.

Other runtime details: Alpine 3.24 base, `USER livekit` (uid/gid 10001 — every
port is > 1024, so no privilege is needed), a `HEALTHCHECK` using busybox `wget`
against `http://127.0.0.1:7880/`, env defaults that make the image runnable
standalone (`NODE_IP=127.0.0.1`, `UDP_PORT=7882`, `LIVEKIT_LOGGING_LEVEL=info`),
and `ENTRYPOINT ["/usr/local/bin/livekit-server"]` with
`CMD ["--config", "/etc/livekit.yaml"]`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| App hangs on "connecting"; participant never appears | `LIVEKIT_NODE_IP` is not reachable *from the client* (classic: left at `127.0.0.1` while a phone joins), or `LIVEKIT_BIND_ADDR` is still loopback | Set `NODE_IP` to a client-reachable IP; for LAN devices also `LIVEKIT_BIND_ADDR=0.0.0.0`; allow UDP `7882` (or the range in host mode) through the firewall; `restart` |
| Recording never appears; `EGRESS_ABORTED` / `EGRESS_FAILED`; egress logs "Start signal not received" | Media never reached egress — ICE failure. Usually `rtc.use_mdns: false`, or an unreachable `NODE_IP` in host mode | Keep `use_mdns: true` in `livekit.yaml`; see [mDNS](#why-rtcuse_mdns-true-matters). Then set `LIVEKIT_LOG_LEVEL=debug` and `logging.level: debug` in `egress.yaml` and look for "Found valid candidate pair" |
| Recording file is 0 bytes | Same as above: the job started, media never flowed, the pipeline finalised an empty file | Same fix; check what the participant actually published with `lk room participants list <room> --url http://127.0.0.1:7880 --api-key <key> --api-secret <secret>` (the `tracks:` count) |
| `error="Local upload failed ... no such file or directory"` | The host `recordings/` directory was deleted or recreated while the stack was running — the container still holds the old inode | `restart` (or `down` + `up`). Never delete the directory while the stack is up; delete *files* inside it instead |
| Permission denied writing `/recordings` (Linux) | The egress container runs as uid 1001 and the host directory is not writable by it | `sudo chown -R 1001:0 docker/recordings`. `up`/`creds`/`status` detect the mismatch and print this exact command as a warning, but cannot fix an existing directory they do not own |
| `chrome failed to start` | `cap_add: [SYS_ADMIN]` missing (egress ≥ v1.7.6 needs it for Chrome's namespace switch), or `enable_chrome_sandbox: true` without upstream's seccomp profile | Restore the capability; keep the sandbox disabled |
| `failed to load template ... unexpected token '{'` | `template_port` (7980) is served by an unrelated process — only possible in host networking, where everything shares the host's ports | Move the other process, or change `template_port` in `egress.yaml` |
| `egress` container does not exist | The service is behind the `recording` compose profile | `up --recording` (or `--profile recording`) |
| Egress is healthy but never receives jobs | Egress and the server are using different redis instances | `egress.yaml: redis.address` and the server's `REDIS_HOST` must match (`redis:6379` in bridge mode) |
| Server exits: `must provide api key` / `invalid keys` | `LIVEKIT_KEYS` empty — `.env` missing or credentials blank | `up` regenerates a `.env` with a random pair; `creds` shows what is expected |
| `secret must be at least 32 characters` | Placeholder or short secret | Generate a real one (the wrapper does this for you) |
| `Port 7880 is already in use` | Another process, or a second copy of this stack | Change `LIVEKIT_PORT` **and** the URL in the app, or stop the other process |
| Config edits have no effect | The container was not recreated — `up` skips unchanged containers | Use `restart`; after editing `Dockerfile`, run `docker compose build livekit` first |
| Missing CA bundle / outbound TLS fails (webhooks, TURN over TLS) | Alpine's minimal runtime ships no `/etc/ssl/certs/ca-certificates.crt` | Rebuild the image; the Dockerfile installs `ca-certificates` for exactly this reason |
| `!reset` unknown tag / `docker compose: not found` | Compose v1, or v2 older than 2.24.4 | Upgrade to Compose v2 ≥ 2.24.4 (only needed for `compose.host.yml`) |
| Recording stalls with "max cpu utilization reached" | Egress CPU admission refused the job | Finish the running recording first, or lower `room_composite_cpu_cost` / raise `max_cpu_utilization` in `egress.yaml` |

### Debugging

```bash
./scripts/livekit-local.sh logs -f livekit     # or egress / redis
docker compose logs --since 10m egress | grep -i 'candidate\|ice\|egress\|error'
lk room join --url ws://127.0.0.1:7880 --api-key <key> --api-secret <secret> \
  --identity echo --room testroom --publish-demo
lk egress list --url http://127.0.0.1:7880 --api-key <key> --api-secret <secret>
```

`lk room join --publish-demo` is the fastest way to separate a signalling problem
from a media problem: if that works but the app does not, compare the URL and
credentials in **Settings ▸ LiveKit** with `creds`. For ICE detail set
`LIVEKIT_LOG_LEVEL=debug` *and* `logging.level: debug` in `egress.yaml` (adding
`pion_level: debug` shows individual candidates).

---

## Security

- **Loopback by default.** Ports bind to `127.0.0.1`; redis and egress are not
  published at all. Nothing leaves the machine, and the server runs with no STUN
  servers and `use_external_ip: false`.
- **No credentials in git.** `.gitignore` covers `.env*` (so `docker/.env` is
  never committed) and `docker/recordings/`; `.env.example` is the placeholder
  template that *is* meant to be committed. `up` generates a random key pair with
  `chmod 600`. The `devkey` /
  `devsecret…` values in `.env.example` are placeholders — replace them before
  binding to anything other than loopback.
- **Exposing this beyond your LAN is out of scope.** There is no TLS termination
  for media, no TURN server, and one permissive API key. For real multi-network
  use, put it behind a reverse proxy with TLS, add a `turn:` block to
  `livekit.yaml`, and scope the API key down.
- **Recordings are unencrypted** in `docker/recordings/` and contain everything
  participants published. They are git-ignored; handle them like any meeting
  recording.
- Both containers run as non-root (server uid 10001, egress uid 1001) and both
  config files are mounted read-only. The only privileged knob is egress's
  `SYS_ADMIN` capability, which Chrome requires.

---

## Verified configuration

Validated end to end on macOS 27.0.1 (Apple Silicon, arm64) with Docker Compose
v5.0.2:

| Component | Version | Source |
| --- | --- | --- |
| livekit-server | `v1.13.10` | image `visualtalk/livekit-server:v1.13.10-local`, label `dev.visualtalk.binary-stage=upstream-image`; `livekit-server --version` inside the container reports `1.13.10` |
| egress | `v1.15.0` | image `livekit/egress:v1.15.0` (revision `171423b`) |
| redis | `7-alpine` | upstream image |

What was verified against a running stack:

- `up --recording` → all healthchecks green; an `lk`-published participant
  reaches `ACTIVE` (signalling + media over the muxed UDP port).
- Room composite using `egress.rs`'s exact payload (`layout=grid`, `MP4`,
  `/recordings/<room>-<unix ts>.mp4`) produces a playable `h264 1280x720 + aac`
  file whose duration matches the recording window (19.8 s for a 20 s window) —
  with **one** participant (6.0 MB) and with **two** (8.5 MB / 24.8 s), i.e. the
  grid layout composites both.
- `smoke --recording` passes end to end and cleans up after itself.
- Both compositor paths work: `enable_template_sdk: true` (default) and `false`
  (headless Chrome). The SDK path is markedly lighter; the Chrome path
  additionally requires `rtc.use_mdns: true`, `cap_add: [SYS_ADMIN]` and a free
  `template_port`.
- Bridge networking with `NODE_IP=127.0.0.1`: media reaches egress over the
  compose network (server-initiated ICE toward egress's `prflx` candidate).
- **Not verified — and not currently possible:** the app UI triggering egress
  (see [Not yet reachable from the app UI](#not-yet-reachable-from-the-app-ui)).
  What was verified is the server + recorder half, driven by `smoke --recording`
  and `lk egress start`.

---

## Cleanup

```bash
./scripts/livekit-local.sh down                       # stop and remove containers
cd docker && docker compose --profile recording down -v   # ...and the redis volume
rm -rf docker/recordings/*                            # recordings are never removed for you
docker rmi visualtalk/livekit-server:v1.13.10-local   # the built server image
```

Related docs: the repository [`README.md`](../README.md) (what VisualTalk is,
how to run the app) and `scripts/livekit-local.sh --help`.
