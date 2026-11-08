# Local Whisper service contract — captured evidence

Contract for the optional local speech-to-text service used by Pro live translation
(`docker compose --profile translation`, ADR
[`0003-translation-architecture.md`](decisions/0003-translation-architecture.md)).
Everything below was captured by running the pinned image and pasting raw output — no
claim here is inferred from an upstream README.

**Capture environment.** 2026-11-08, macOS arm64 (Apple silicon), Docker Desktop daemon
29.9.2. Probe containers run standalone on loopback ports 8090-8092 so the owner's
LiveKit stack was never touched; all three were removed afterwards. Audio samples were
synthesised locally with `say` (voices `Samantha` en_US, `Thomas` fr_FR) and converted
with `ffmpeg -ar 16000 -ac 1`. No credentials were used or recorded.

## 1. Image facts

```text
image      fedirz/faster-whisper-server:0.5.0-cpu
digest     sha256:760e5e43d427dc6cfbbc4731934b908b7de9c7e6d5309c6a1f0c8c923a5b6030
arch       arm64
size       1683468369 bytes ≈ 1.68 GB uncompressed (≈404 MB compressed on the registry)
healthcheck null        <- the image declares none, so compose MUST declare one
exposed    null         <- no EXPOSE; compose `expose: ["8000"]` is cosmetic only
cmd        ["uv","run","uvicorn","--factory","faster_whisper_server.main:create_app"]
env        PATH=…, WHISPER__MODEL=Systran/faster-whisper-small,
           WHISPER__INFERENCE_DEVICE=cpu, UVICORN_HOST=0.0.0.0, UVICORN_PORT=8000
```

Upstream is **archived**: Docker Hub marks `fedirz/faster-whisper-server` as archived
with "The project has moved to: https://github.com/speaches-ai/speaches", last push
roughly two years ago. `latest-cpu`, `0-cpu`, `0.5-cpu`, `0.5.0-cpu` and
`sha-caba05a-cpu` are the same image, so pinning to `0.5.0-cpu` is a no-op today and
protective tomorrow. `GET /` serves an HTML dashboard.

## 2. Routes

From `/openapi.json` (fetched from the running container):

| Route | Methods | Purpose |
| --- | --- | --- |
| `/health` | GET | Liveness. Body is the plain text `OK`, status 200. |
| `/v1/audio/transcriptions` | POST | Speech → text **in the source language**. |
| `/v1/audio/translations` | POST | Speech → text **in English only** (see §5). |
| `/v1/models` | GET | Lists models with their supported language codes. |
| `/v1/models/{model_name}` | GET | Single model. |
| `/api/pull/{model_name}` | POST | Pre-download a model. |
| `/api/ps` | GET | Currently **loaded** models. |
| `/api/ps/{model_name}` | POST, DELETE | Load / unload a model. |

⚠️ **`/openapi.json` is NOT the complete route list.** Two routes are served but
absent from the spec — do not treat the spec as exhaustive:

```text
POST /api/transcribe -> 422 {"detail":[{"type":"missing","loc":["body"],"msg":"Field required","input":null}]}
POST /api/translate  -> 422 {"detail":[{"type":"missing","loc":["body"],"msg":"Field required","input":null}]}
GET  /api/transcribe -> 405   GET /api/translate -> 405   GET /api/ps -> 200
```

Their request shape was not reverse-engineered here (`UNVERIFIED`). A client should use
the documented `/v1/audio/*` endpoints only; these look like a legacy internal API.

## 3. Request contract

Content type: the spec declares `application/x-www-form-urlencoded`, but the working
requests below all use **`multipart/form-data`** (`curl -F`), which is what an
OpenAI-compatible client sends. Use multipart.

`/v1/audio/transcriptions` fields — **required: `file` only**:

| Field | Type / default | Notes |
| --- | --- | --- |
| `file` | binary, required | 16 kHz mono WAV verified. Other formats `UNVERIFIED`. |
| `model` | string, optional | Full HF repo id, e.g. `Systran/faster-whisper-small`. Omit to use the server default. |
| `language` | enum, optional | **100 ISO-639-1 codes** (`af, am, ar, … fr, …`). Source language. Omit for auto-detect (verified working). |
| `response_format` | enum, optional | `text`, `json` (default), `verbose_json`, `srt`, `vtt`. |
| `temperature` | number, default `0.0` | |
| `timestamp_granularities` | array, default `["segment"]` | |
| `stream` | boolean, default `false` | SSE streaming — see §8. |
| `hotwords` | string, optional | Bias vocabulary. `UNVERIFIED`. |
| `vad_filter` | boolean, default `false` | Voice-activity filtering. `UNVERIFIED`. |

`/v1/audio/translations` fields — **required: `file` only**: `file`, `model`, `prompt`,
`response_format`, `temperature`, `stream`, `vad_filter`.

**There is no `language` field on the translations endpoint at all** — neither source
nor target. See §5.

## 4. Responses (raw captures)

Default `json` — English sample, cold call (includes model download + load):

```console
$ time curl -s -F file=@vt_en.wav -F model=Systran/faster-whisper-small \
      http://127.0.0.1:8090/v1/audio/transcriptions
{"text":"The meeting will start in five minutes and the recording is already running."}
real 11.0s   <- cold; the model was not loaded yet
```

`verbose_json` — French sample. **This is how a client learns the detected source
language**, which the plain `json` format does not return:

```console
$ curl -s -F file=@vt_fr.wav -F response_format=verbose_json \
      http://127.0.0.1:8090/v1/audio/transcriptions | jq -c '{language,duration,text,segments:(.segments|length)}'
{"language":"fr","duration":4.1305625,"text":"La réunion commence dans 5 minutes et l'enregistrement est déjà en cours.","segments":1}
```

`srt` — usable directly as a caption cue list (`vtt` behaves the same, `UNVERIFIED`):

```console
$ curl -s -F file=@vt_en.wav -F response_format=srt http://127.0.0.1:8090/v1/audio/transcriptions
1
00:00:00,000 --> 00:00:03,400
 The meeting will start in five minutes and the recording is already running.
```

Note the transcription normalises spoken numbers ("cinq" → `5`), so caption text is not
a verbatim spelling of the audio.

## 5. Decisive finding: translation is English-only, and target language is not expressible

The promised MVP behaviour (`Todo.txt`: "each attendee gets private captions, translated
to that attendee's selected target language") **cannot be met by this service alone.**

Three independent pieces of evidence:

1. **Schema.** `/v1/audio/translations` has no `language` parameter (§3). There is no
   field through which a target language could be requested.
2. **Behaviour.** A French sample translated by the service returns English:

```console
$ curl -s -F file=@vt_fr.wav http://127.0.0.1:8090/v1/audio/transcriptions
{"text":"La réunion commence dans 5 minutes et l'enregistrement est déjà en cours."}

$ curl -s -F file=@vt_fr.wav http://127.0.0.1:8090/v1/audio/translations
{"text":"The meeting starts in 5 minutes and the recording is already in progress."}
```

3. **Silent ignore.** Passing a target language anyway is accepted and discarded — the
   response is identical English, with HTTP **200**, not an error:

```console
$ curl -s -w '%{http_code}' -F file=@vt_fr.wav -F language=de \
      http://127.0.0.1:8090/v1/audio/translations
{"text":"The meeting starts in 5 minutes and the recording is already in progress."}200
```

That third point is the dangerous one: a client that believes it asked for German gets
English and a success code. Any implementation must not rely on the service to reject a
target-language request.

**What this implies (owner decision, not implemented here).** The Docker strategy can
deliver: (a) a transcript in the speaker's own language, or (b) an English transcript or
English translation. Per-attendee non-English captions need a **second machine-translation
hop** after Whisper — e.g. the existing OpenAI-compatible client in `src-tauri/src/ai.rs`
pointed at a translation-capable model, or a cloud translate API (which is Strategy 1 in
ADR 0003 anyway). Options for the owner:

- accept English-only captions for the Docker strategy and say so in the UI and docs;
- add the MT hop (extra dependency, extra latency, and for a self-hosted/"data
  sovereignty" audience an extra outbound call — which undercuts the point of the local
  stack unless the MT model is also local);
- or reconsider Strategy 2's scope in ADR 0003 before anything is advertised.

Until that decision is made, the Translation settings UI must not imply that a
non-English target language works with the Docker provider.

## 6. Model loading and configuration — the compose file's env vars are dead config

Models are loaded **lazily**: `/api/ps` reports nothing until the first request.

```console
$ curl -s http://127.0.0.1:8090/api/ps
{"models":[]}                     # before any request
$ curl -s -F file=@vt_en.wav http://127.0.0.1:8090/v1/audio/transcriptions >/dev/null
$ curl -s http://127.0.0.1:8090/api/ps
{"models":["Systran/faster-whisper-small"]}
```

`GET /v1/models` returns `Systran/faster-whisper-small` with its ~100 supported language
codes. `POST /api/pull/{model_name}` pre-downloads a model (`UNVERIFIED` — not exercised).

**The environment variables `docker/docker-compose.yml` sets for this service do not
exist.** The image is configured with pydantic-settings style **double underscores**:

| Compose sets | Actually read by the image | Effect today |
| --- | --- | --- |
| `WHISPER_MODEL=${WHISPER_MODEL:-small}` | `WHISPER__MODEL` (default `Systran/faster-whisper-small`) | **ignored** |
| `WHISPER_DEVICE=cpu` | `WHISPER__INFERENCE_DEVICE` (default `cpu`) | **ignored** (harmless — the default matches) |

Two controls, both captured:

```console
# negative control: the compose spelling has no effect
$ docker run -d -e WHISPER_MODEL=tiny -p 127.0.0.1:8091:8000 …:0.5.0-cpu
$ curl -s -F file=@vt_en.wav http://127.0.0.1:8091/v1/audio/transcriptions >/dev/null
$ curl -s http://127.0.0.1:8091/api/ps
{"models":["Systran/faster-whisper-small"]}      # still small

# positive control: the double-underscore spelling does
$ docker run -d -e WHISPER__MODEL=Systran/faster-whisper-tiny -p 127.0.0.1:8092:8000 …:0.5.0-cpu
$ curl -s -F file=@vt_en.wav http://127.0.0.1:8092/v1/audio/transcriptions >/dev/null
$ curl -s http://127.0.0.1:8092/api/ps
{"models":["Systran/faster-whisper-tiny"]}       # honoured
```

Note also that the value must be a **full Hugging Face repo id**
(`Systran/faster-whisper-small`), not a bare size name — so `WHISPER_MODEL=small` in
`docker/.env.example` was wrong twice over. Fixing both files is Track 2 of
[`docs/handover/2026-11-08-free-session-tracks.md`](handover/2026-11-08-free-session-tracks.md).

**No volume is mounted for the model cache.** The HF cache lives in the container's
writable layer, so `down` discards it and the next start repeats the cold-download path
in §7. This is read from the compose file, not observed across a recreate cycle
(`UNVERIFIED`); mounting a named volume for the cache is worth considering in Track 2.

## 7. Latency and live-captioning feasibility

Same machine, warm model, CPU only, `small`:

| Audio | Wall clock | Ratio |
| --- | --- | --- |
| 3.6 s en (cold: model download + load) | 11.0 s | 3.1× |
| 4.13 s fr (warm) | 4.74 s | 1.15× |
| 13.22 s fr (warm) | 5.65 s | **0.43×** |

Fitting the two warm points (n=2, this machine, **not a benchmark**):

```text
wall ≈ 4.3 s fixed overhead + 0.10 × audio_seconds
```

The **fixed ~4.3 s per request dominates**. Consequences for a live-caption client:

- Break-even against real time is at roughly **4.8 s of audio per request**. Chunks
  shorter than that fall progressively behind and the caption lag grows without bound.
- A 13 s window already runs at 0.43× real time, i.e. comfortably ahead.
- So the client must **batch ~10-15 s windows per participant**, not stream 1-2 s
  slices. A naive "send every chunk as it arrives" design will not keep up on CPU.
- Cold start costs ~11 s plus whatever the model download takes on a slow link — the
  UI needs a distinct "loading model" state, and a compose `healthcheck` needs a long
  `start_period`.

`UNVERIFIED`: multi-participant concurrency (does one request block another?), `tiny`
vs `small` accuracy trade-off on accented speech, and GPU behaviour.

## 8. Streaming (SSE)

`stream=true` on the transcription endpoint returns Server-Sent Events — incremental
partial transcripts, which is what a caption overlay wants:

```console
$ curl -s -D - -F file=@vt_fr_long.wav -F stream=true \
      http://127.0.0.1:8090/v1/audio/transcriptions
HTTP/1.1 200 OK
server: uvicorn
content-type: text/event-stream; charset=utf-8
Transfer-Encoding: chunked

data: {"text":"Bonjour à tous, la réunion commence dans cinq minutes et l'enregistrement est déjà"}

data: {"text":"en cours."}

data: {"text":"Nous allons discuter du calendrier de publication, des tests sur appareils mobiles, et de la"}

data: {"text":"traduction en direct pendant les réunions."}
```

Four frames for a 13 s clip. Observations a client must handle:

- Frames carry **only `text`** — no timestamps, no detected language, no segment ids.
  If the UI needs timing or the source language, use non-streaming `verbose_json` (§4).
- No `id:` or `event:` fields, and **no explicit end-of-stream marker** was observed;
  the response simply closed (`UNVERIFIED` whether a terminal frame exists on longer
  audio). Detect completion by stream close, not by a sentinel.
- Frames are partial sentences, so the overlay must replace the in-progress line rather
  than append.

## 9. Error behaviour

Captured verbatim:

```console
$ curl -s -w 'status=%{http_code}' -F file=@openapi.json …/v1/audio/transcriptions
status=500  body: Internal Server Error            # non-audio payload

$ curl -s -w 'status=%{http_code}' -X POST …/v1/audio/transcriptions
status=422  body: {"detail":[{"type":"missing","loc":["body","file"],"msg":"Field required","input":null}]}

$ curl -s -w 'status=%{http_code}' -F file=@vt_en.wav -F model=does/not-exist …/v1/audio/transcriptions
status=500  body: Internal Server Error            # bogus model name
```

What a client can and cannot do with this:

- **`422` = our request is malformed** (missing/invalid field), with a JSON `detail`
  array naming the offending field. Treat as a client bug, never retry.
- **`500` = opaque.** The body is the plain-text `Internal Server Error` with no detail,
  and the same status covers undecodable audio *and* an unknown model name. The relay
  must map it to one user-facing "transcription failed" message and log the body; it
  cannot distinguish the causes, so do not promise the user a specific reason.
- No rate-limit headers, no `Retry-After`, no auth errors (there is no auth) — expected
  for a single-user loopback service.
- Connection-refused (service not started) is the most likely real-world failure and is
  distinguishable from all of the above: it never produces an HTTP status.
- `UNVERIFIED`: maximum upload size, behaviour on truncated/partial audio, and
  concurrent-request handling.

## 10. Authentication and security

- **There is no authentication.** Every route above answered without credentials. The
  port must stay loopback-bound — compose already defaults to
  `WHISPER_BIND_ADDR=127.0.0.1`, and that default must not be loosened: anyone who can
  reach the port can transcribe arbitrary audio and load/unload models.
- **Captions are a plaintext surface.** Audio handed to this service is, by definition,
  decrypted. Pro E2EE covers chat and files only, so transcripts/captions are not
  end-to-end encrypted even in a Pro build, and must not be described as such in the UI
  or in `PRIVACY.md`.
- **First run talks to Hugging Face.** Model weights are downloaded on first request, so
  an air-gapped or strict-egress host fails at that point rather than at startup. For
  such hosts, pre-pull with `POST /api/pull/{model_name}` or mount a pre-populated cache
  volume.

## 11. Open questions for the owner

1. **§5 — DECIDED 2026-11-08: English-only for now.** The owner chose to ship
   English-only captions for the Docker strategy and defer the second
   machine-translation hop. Consequence for any implementation: while the Docker
   provider is selected, the target language is effectively fixed to English and the
   UI must not offer or imply a non-English target (§5's silent-ignore behaviour makes
   a wrong target fail invisibly). Revisit the MT hop later; the obvious local candidate
   is the existing OpenAI-compatible client in `src-tauri/src/ai.rs`.
2. Upstream is archived. Migrate to `speaches-ai/speaches` (a different image, almost
   certainly different routes — it would need its own contract capture), or pin
   `0.5.0-cpu` and accept an unmaintained dependency?
3. Default model: `small` (measured here) or `tiny` (faster, unmeasured accuracy)?
4. Mount a named volume for the HF cache so `down`/`up` does not re-download weights?
5. Concurrency is untested: with ~4.3 s of fixed overhead per request, does N-participant
   captioning serialise on one core? This must be measured before multi-participant
   captions are promised in the UI.
6. Should the local strategy be blocked at runtime in app-store builds (ADR 0003 says it
   is not offered there), or is hiding it in the UI enough?



