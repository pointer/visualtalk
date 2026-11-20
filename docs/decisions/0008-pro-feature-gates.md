# 0008: Pro edition gates — recording, backgrounds, AI assistant

- Date: 2026-11-20
- Status: accepted

## Context

End-to-end encryption alone was not enough to make the Pro edition appealing,
while several fully built features shipped free in the Community Edition: the
AI assistant (`ai.rs`), camera backgrounds (`backgrounds.rs`) and both recording
paths (local MediaRecorder + FFmpeg in `recording.rs`, server-side egress file
recording in `egress.rs`). Separately, `recording::ffmpeg_stream_to_rtmp` was an
ungated `#[tauri::command]`, so a Community binary could still broadcast to RTMP
by driving IPC directly — bypassing the streaming gate of ADR 0002, which
promises that a Community binary carries no streaming code path at all.

## Decision

All four become paid Pro features, gated at compile time on the `pro` edition
switch (`#[cfg(feature = "pro")]` in Rust, `IS_PRO_EDITION` in JSX):

- the seven `recording::*` commands, including `ffmpeg_stream_to_rtmp`, which
  closes the ADR 0002 bypass;
- the egress file-recording path: `start_room_egress` returns a "Pro only"
  error in Community builds and the real body lives in
  `start_room_egress_pro`, so no egress-start code path exists in CE;
- the whole `ai` and `backgrounds` modules, not just their commands;
- the matching UI (Record button, recordings and AI settings screens, pre-join
  background picker) is hidden in Community builds so no button can call a
  command that does not exist;
- Community builds show a one-line "what Pro adds" note at the top of Settings.

This reverses the November 2026 note that CE egress *file* recording stays
ungated; only the broadcast was gated back then.

## Consequences

- Community users lose recording, the AI assistant and backgrounds. Store
  listings, EULA and SUPPORT feature text must be re-synced before the next
  submission.
- Community binaries no longer contain the AI client, the background state or
  the egress-start/FFmpeg code paths, which is the point of `#[cfg]` gating.
- Report & block, scheduling, joining, chat and file transfer stay free in every
  edition: Apple UGC guideline 1.2 requires the safety tools, and the free tier
  must remain genuinely usable.
- Existing `settings.json` files keep loading: the `ai` field is `#[serde(default)]`
  and unknown keys are ignored.
