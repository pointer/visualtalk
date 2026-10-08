import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

/**
 * Composable for meeting recording — supports both LiveKit Egress
 * (server-side) and local MediaRecorder (browser-based).
 */
export function useRecording() {
  // ── State ──────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = createSignal(false);
  const [isStreaming, setIsStreaming] = createSignal(false);
  const [recordingMode, setRecordingMode] = createSignal(null);
  const [recordingDuration, setRecordingDuration] = createSignal(0);
  const [activeEgressId, setActiveEgressId] = createSignal(null);
  const [ffmpegAvailable, setFfmpegAvailable] = createSignal(false);
  const [recordingError, setRecordingError] = createSignal(null);
  // Absolute path of the most recently finalized recording, exactly as Rust
  // reported it — usable for transcode/delete/reveal, unlike a bare file name.
  const [lastSavedPath, setLastSavedPath] = createSignal(null);

  let mediaRecorder = null;
  let recordingStartTime = null;
  let durationTimer = null;
  let recordingId = null;
  let currentRoomName = null;

  // ── Chunk persistence bookkeeping ──────────────────────────────
  // Tail of the write chain. Every save_recording_chunk call is appended to
  // it so the bytes reach disk in recorder order (see enqueueChunk).
  let writeQueue = Promise.resolve();
  // Incremented *synchronously* in the dataavailable handler — never read
  // from inside an awaited continuation.
  let chunkIndex = 0;
  // Consecutive failed writes; used to report the problem once, not per slice.
  let failedChunks = 0;
  let savedFilePath = null;
  let savedBytes = 0;
  let recordingStartTimestamp = null;

  const checkFfmpeg = async () => {
    try {
      const info = await invoke("check_ffmpeg_available");
      setFfmpegAvailable(info.available);
      return info;
    } catch {
      setFfmpegAvailable(false);
      return { available: false, version: "", path: "" };
    }
  };

  const startDurationTimer = () => {
    recordingStartTime = Date.now();
    durationTimer = setInterval(() => {
      setRecordingDuration(Math.floor((Date.now() - recordingStartTime) / 1000));
    }, 1000);
  };

  const stopDurationTimer = () => {
    if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
    setRecordingDuration(0);
  };

  // Base64-encode recorder bytes for the IPC save call. Spreading a whole
  // chunk into String.fromCharCode() puts every single byte on the call
  // stack, so a ~1 MB timeslice overflows it ("RangeError: Maximum call stack
  // size exceeded"). Convert in 32 KiB slices instead.
  const bytesToBase64 = (bytes) => {
    const SLICE = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += SLICE) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + SLICE));
    }
    return btoa(binary);
  };

  // ── Local Recording (MediaRecorder) ────────────────────────────
  const startLocalRecording = async (room, roomName) => {
    try {
      setRecordingError(null);
      currentRoomName = roomName;
      recordingId = `rec-${Date.now()}`;

      const tracks = [];
      const localP = room.localParticipant;
      if (localP) {
        for (const [, pub] of localP.videoTrackPublications) {
          if (pub.track?.mediaStreamTrack) tracks.push(pub.track.mediaStreamTrack);
        }
        for (const [, pub] of localP.audioTrackPublications) {
          if (pub.track?.mediaStreamTrack) tracks.push(pub.track.mediaStreamTrack);
        }
      }
      for (const [, participant] of room.remoteParticipants) {
        for (const [, pub] of participant.videoTrackPublications) {
          if (pub.track?.mediaStreamTrack) tracks.push(pub.track.mediaStreamTrack);
        }
        for (const [, pub] of participant.audioTrackPublications) {
          if (pub.track?.mediaStreamTrack) tracks.push(pub.track.mediaStreamTrack);
        }
      }

      if (tracks.length === 0) throw new Error("No media tracks available to record.");

      const stream = new MediaStream(tracks);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
          ? "video/webm;codecs=vp8,opus" : "video/webm";

      mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });

      // Reset the per-recording bookkeeping. chunkIndex now lives in the
      // composable scope so stopLocalRecording can await the same queue.
      chunkIndex = 0;
      failedChunks = 0;
      savedFilePath = null;
      savedBytes = 0;
      writeQueue = Promise.resolve();
      recordingStartTimestamp = Math.floor(Date.now() / 1000);
      setLastSavedPath(null);

      mediaRecorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0) return;
        // Read the index SYNCHRONOUSLY. This handler fires on every timeslice
        // and the previous save can still be in flight when the next one
        // arrives; if two continuations both computed `chunkIndex === 0`, Rust
        // would reopen the file with truncate(true) and wipe the recording.
        // Chunks are streamed straight to disk over IPC — keeping the Blobs in
        // memory as well would grow without bound on long recordings.
        enqueueChunk(event.data, chunkIndex++);
      };

      mediaRecorder.start(3000);
      setIsRecording(true);
      setRecordingMode("local");
      startDurationTimer();
      return recordingId;
    } catch (err) {
      setRecordingError(err.message || "Failed to start local recording");
      return null;
    }
  };

  /**
   * Append one recorder timeslice to the write chain.
   *
   * Serialising through a single promise is what guarantees the file on disk
   * is byte-identical to the recorder's output: two concurrent
   * `save_recording_chunk` calls could otherwise be applied out of order (or,
   * worse, both as "first chunk" — see startLocalRecording). `stopLocalRecording`
   * awaits this same queue so no tail is lost.
   */
  const enqueueChunk = (blob, index) => {
    writeQueue = writeQueue.then(async () => {
      try {
        const ab = await blob.arrayBuffer();
        const b64 = bytesToBase64(new Uint8Array(ab));
        const receipt = await invoke("save_recording_chunk", {
          recordingId,
          roomName: currentRoomName,
          chunkBase64: b64,
          isFirstChunk: index === 0,
        });
        // Rust answers with an absolute path + the file's new size. Adopt them
        // so finalize/transcode/delete operate on a path that really exists.
        if (receipt && typeof receipt === "object") {
          if (receipt.file_path) savedFilePath = receipt.file_path;
          if (typeof receipt.total_bytes === "number") savedBytes = receipt.total_bytes;
        } else if (typeof receipt === "string") {
          savedFilePath = receipt;
        }
        failedChunks = 0;
      } catch (err) {
        // A failed chunk must never surface as an unhandled rejection that
        // re-fires on every recorder timeslice — but it must not be silent
        // either: a full disk or an unwritable config dir used to look like a
        // successful recording that simply produced no file.
        failedChunks++;
        const message = typeof err === "string" ? err : (err && err.message) || String(err);
        console.warn(`[recording] chunk ${index} save failed:`, err);
        if (failedChunks === 1) {
          setRecordingError(`Recording is not being saved to disk: ${message}`);
        }
      }
    });
    return writeQueue;
  };

  const stopLocalRecording = async () => {
    const recorder = mediaRecorder;
    if (!recorder || recorder.state === "inactive") return null;

    // stop() emits one final dataavailable, so wait for the recorder to stop
    // AND for the whole write chain to drain before finalizing. Callers must
    // await this before tearing the tracks down or closing the window,
    // otherwise the tail (or, for a short recording, the entire file) is lost.
    await new Promise((resolve) => {
      // Never hang teardown on a recorder that refuses to fire onstop.
      const watchdog = setTimeout(resolve, 5000);
      recorder.onstop = () => { clearTimeout(watchdog); resolve(); };
      try { recorder.stop(); }
      catch (err) { clearTimeout(watchdog); console.warn("[recording] stop() failed:", err); resolve(); }
    });
    await writeQueue;

    stopDurationTimer();

    const fp = savedFilePath || `${currentRoomName}-${recordingId}.webm`;
    let preserved = null;
    try {
      const finalized = await invoke("finalize_recording", {
        recordingId,
        roomName: currentRoomName,
        filePath: fp,
        startedAt: recordingStartTimestamp,
      });
      savedFilePath = (finalized && finalized.file_path) || fp;
      setLastSavedPath(savedFilePath);
      preserved = savedFilePath;
      console.info(`[recording] saved ${savedBytes} bytes → ${savedFilePath}`);
    } catch (err) {
      const message = typeof err === "string" ? err : (err && err.message) || String(err);
      console.warn("[recording] finalize failed:", err);
      // Say so in the UI: a recording that was not preserved must not pass
      // for one that was.
      setRecordingError(message);
      // Rust only rejects finalize when the file is missing or empty, so there
      // is genuinely nothing to hand back. Returning a path here would make the
      // caller show a "saved" toast for a recording that does not exist.
      savedFilePath = null;
      setLastSavedPath(null);
    }

    setIsRecording(false);
    setRecordingMode(null);
    mediaRecorder = null;
    return preserved;
  };

  // ── LiveKit Egress (Server-Side) ───────────────────────────────
  const startEgressRecording = async (roomName, options = {}) => {
    try {
      setRecordingError(null);
      const info = await invoke("start_room_egress", {
        request: {
          room_name: roomName, output_type: "file",
          file_config: options.fileConfig || null, stream_config: null,
          custom_base_url: options.baseUrl || null,
          custom_api_key: options.apiKey || null,
          custom_api_secret: options.apiSecret || null,
        },
      });
      setActiveEgressId(info.egress_id);
      setIsRecording(true);
      setRecordingMode("egress");
      startDurationTimer();
      return info;
    } catch (err) {
      setRecordingError(err || "Failed to start egress recording");
      return null;
    }
  };

  const stopEgressRecording = async (options = {}) => {
    const eid = activeEgressId();
    if (!eid) return null;
    try {
      const info = await invoke("stop_egress", {
        egressId: eid,
        customBaseUrl: options.baseUrl || null,
        customApiKey: options.apiKey || null,
        customApiSecret: options.apiSecret || null,
      });
      setActiveEgressId(null); setIsRecording(false);
      setRecordingMode(null); stopDurationTimer();
      return info;
    } catch (err) {
      setRecordingError(err || "Failed to stop egress");
      return null;
    }
  };

  const startRtmpStream = async (roomName, rtmpUrls, options = {}) => {
    try {
      setRecordingError(null);
      const info = await invoke("start_room_egress", {
        request: {
          room_name: roomName, output_type: "stream", file_config: null,
          stream_config: { urls: rtmpUrls, preset: options.preset || "FULL_HD_1080" },
          custom_base_url: options.baseUrl || null,
          custom_api_key: options.apiKey || null,
          custom_api_secret: options.apiSecret || null,
        },
      });
      setActiveEgressId(info.egress_id);
      setIsStreaming(true); setRecordingMode("egress");
      startDurationTimer();
      return info;
    } catch (err) {
      setRecordingError(err || "Failed to start RTMP stream");
      return null;
    }
  };

  const stopRtmpStream = async (options = {}) => {
    const eid = activeEgressId();
    if (!eid) return null;
    try {
      await invoke("stop_egress", {
        egressId: eid,
        customBaseUrl: options.baseUrl || null,
        customApiKey: options.apiKey || null,
        customApiSecret: options.apiSecret || null,
      });
      setActiveEgressId(null); setIsStreaming(false);
      setRecordingMode(null); stopDurationTimer();
    } catch (err) { setRecordingError(err || "Failed to stop stream"); }
  };

  // ── FFmpeg Post-Processing ─────────────────────────────────────
  const transcodeRecording = async (inputPath, outputPath, options = null) => {
    try {
      setRecordingError(null);
      return await invoke("ffmpeg_transcode", { inputPath, outputPath, options });
    } catch (err) {
      setRecordingError(err || "FFmpeg transcode failed");
      return null;
    }
  };

  const streamToRtmp = async (inputPath, rtmpUrl, options = null) => {
    try {
      setRecordingError(null);
      return await invoke("ffmpeg_stream_to_rtmp", { inputPath, rtmpUrl, options });
    } catch (err) {
      setRecordingError(err || "FFmpeg streaming failed");
      return null;
    }
  };

  // ── Recording Management ───────────────────────────────────────
  const getRecordings = async () => {
    try { return await invoke("get_local_recordings"); }
    catch { return []; }
  };

  const deleteRecording = async (filePath) => {
    try { await invoke("delete_recording", { filePath }); return true; }
    catch { return false; }
  };

  // ── Unified start/stop ─────────────────────────────────────────
  const startRecording = async (room, roomName, mode = "local") => {
    if (mode === "egress") return startEgressRecording(roomName);
    return startLocalRecording(room, roomName);
  };

  const stopRecording = async () => {
    if (recordingMode() === "egress") return stopEgressRecording();
    return stopLocalRecording();
  };

  // ── Format duration ────────────────────────────────────────────
  const formatDuration = () => {
    const secs = recordingDuration();
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return {
    isRecording, isStreaming, recordingMode, recordingDuration,
    activeEgressId, ffmpegAvailable, recordingError, formatDuration,
    lastSavedPath,
    checkFfmpeg, startRecording, stopRecording,
    startLocalRecording, stopLocalRecording,
    startEgressRecording, stopEgressRecording,
    startRtmpStream, stopRtmpStream,
    transcodeRecording, streamToRtmp,
    getRecordings, deleteRecording,
  };
}