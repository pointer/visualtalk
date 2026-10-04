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

  let mediaRecorder = null;
  let recordingChunks = [];
  let recordingStartTime = null;
  let durationTimer = null;
  let recordingId = null;
  let currentRoomName = null;

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
      recordingChunks = [];
      let chunkIndex = 0;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          recordingChunks.push(event.data);
          const ab = await event.data.arrayBuffer();
          const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
          try {
            await invoke("save_recording_chunk", {
              recordingId, roomName: currentRoomName, chunkBase64: b64, isFirstChunk: chunkIndex === 0,
            });
          } catch (err) { console.warn("Chunk save failed:", err); }
          chunkIndex++;
        }
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

  const stopLocalRecording = async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") return null;
    return new Promise((resolve) => {
      mediaRecorder.onstop = async () => {
        stopDurationTimer();
        const fp = `${currentRoomName}-${recordingId}.webm`;
        try { await invoke("finalize_recording", { recordingId, roomName: currentRoomName, filePath: fp }); }
        catch (err) { console.warn("Finalize failed:", err); }
        setIsRecording(false);
        setRecordingMode(null);
        mediaRecorder = null;
        recordingChunks = [];
        resolve(fp);
      };
      mediaRecorder.stop();
    });
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
    checkFfmpeg, startRecording, stopRecording,
    startLocalRecording, stopLocalRecording,
    startEgressRecording, stopEgressRecording,
    startRtmpStream, stopRtmpStream,
    transcodeRecording, streamToRtmp,
    getRecordings, deleteRecording,
  };
}