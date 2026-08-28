import { createSignal, onMount, onCleanup, For, createEffect } from "solid-js";
import { Room, RoomEvent, Track } from "livekit-client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { VideoGrid } from "./components/VideoGrid";

export function MeetingView(props) {
  const ROOM = props.roomName || "general";

  // ---- UI state ----
  const [preJoin, setPreJoin] = createSignal(true);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [showLeaveDialog, setShowLeaveDialog] = createSignal(false);

  // ---- Media devices ----
  const [devices, setDevices] = createSignal({ audio: [], video: [] });
  const [selectedMic, setSelectedMic] = createSignal("");
  const [selectedCam, setSelectedCam] = createSignal("");

  // ---- Preview state ----
  const [previewStream, setPreviewStream] = createSignal(null);
  const [previewAudioEnabled, setPreviewAudioEnabled] = createSignal(true);
  const [previewVideoEnabled, setPreviewVideoEnabled] = createSignal(true);
  const [alwaysShowPreview, setAlwaysShowPreview] = createSignal(true);

  // ---- Meeting state ----
  const [participants, setParticipants] = createSignal([]);
  const [isMuted, setIsMuted] = createSignal(false);
  const [isCameraOff, setIsCameraOff] = createSignal(false);
  const [localStream, setLocalStream] = createSignal(null);
  let room;
  let previewVideoRef = null;

  // ---- Load devices and start preview ----
  onMount(async () => {
    // CRITICAL: startPreview() MUST run before enumerateDevices()
    // Browsers hide device labels until the user has granted permission via getUserMedia()
    await startPreview();
    await loadDevices();
  });

  onCleanup(() => {
    if (room) room.disconnect();
    const stream = localStream();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const pStream = previewStream();
    if (pStream) pStream.getTracks().forEach((t) => t.stop());
  });

  const loadDevices = async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter(d => d.kind === "audioinput");
      const videoInputs = allDevices.filter(d => d.kind === "videoinput");
      setDevices({ audio: audioInputs, video: videoInputs });

      if (audioInputs.length && !selectedMic()) {
        setSelectedMic(audioInputs[0].deviceId);
      }
      if (videoInputs.length && !selectedCam()) {
        setSelectedCam(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.error("Error enumerating devices:", err);
    }
  };

  const startPreview = async () => {
    try {
      const existing = previewStream();
      if (existing) existing.getTracks().forEach(t => t.stop());

      const constraints = {
        video: previewVideoEnabled() && selectedCam()
          ? { deviceId: { exact: selectedCam() } }
          : previewVideoEnabled(),
        audio: previewAudioEnabled() && selectedMic()
          ? { deviceId: { exact: selectedMic() } }
          : previewAudioEnabled(),
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setPreviewStream(stream);
    } catch (err) {
      console.error("Failed to start preview:", err);
    }
  };

  // CRITICAL FIX: Bind stream to video element whenever previewStream changes.
  // SolidJS ref callbacks only fire on mount/unmount, not on signal changes.
  createEffect(() => {
    const stream = previewStream();
    if (previewVideoRef && stream) {
      previewVideoRef.srcObject = stream;
      previewVideoRef.play().catch(() => {});
    }
  });

  const changeDevice = async (type, deviceId) => {
    if (type === "audio") setSelectedMic(deviceId);
    else setSelectedCam(deviceId);
    await startPreview();
  };

  const togglePreviewAudio = async () => {
    const newState = !previewAudioEnabled();
    setPreviewAudioEnabled(newState);
    await startPreview();
  };

  const togglePreviewVideo = async () => {
    const newState = !previewVideoEnabled();
    setPreviewVideoEnabled(newState);
    await startPreview();
  };

  const joinMeeting = async () => {
    setIsConnecting(true);
    setPreJoin(false);

    const pStream = previewStream();
    if (pStream) pStream.getTracks().forEach(t => t.stop());
    setPreviewStream(null);

    let conf;
    try {
      conf = await invoke("get_config");
    } catch (err) {
      console.error("Failed to load config:", err);
      setIsConnecting(false);
      return;
    }

    const LIVEKIT_URL = conf.livekit_url;
    const API_KEY = conf.api_key;
    const IDENTITY = conf.identity;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedCam() ? { deviceId: { exact: selectedCam() } } : true,
        audio: selectedMic() ? { deviceId: { exact: selectedMic() } } : true,
      });
      setLocalStream(stream);
      setParticipants([
        { id: "local", name: "You (Local)", isLocal: true, stream },
      ]);
    } catch (err) {
      console.error("Error starting local stream:", err);
      setIsCameraOff(true);
    }

    let token;
    try {
      token = await invoke("generate_livekit_token", {
        apiKey: API_KEY,
        identity: IDENTITY,
        room: ROOM,
        validForSeconds: 86400,
      });
    } catch (err) {
      console.error("Failed to generate token:", err);
      setIsConnecting(false);
      return;
    }

    room = new Room();

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Video) {
        setParticipants((prev) => [
          ...prev,
          {
            id: participant.identity,
            name: participant.name || participant.identity,
            isLocal: false,
            videoTrack: publication,
          },
        ]);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Video) {
        setParticipants((prev) => prev.filter((p) => p.id !== participant.identity));
      }
    });

    try {
      await room.connect(LIVEKIT_URL, token);
      await room.localParticipant.setCameraEnabled(!isCameraOff());
      await room.localParticipant.setMicrophoneEnabled(!isMuted());
    } catch (err) {
      console.error("Failed to connect:", err);
    }
    setIsConnecting(false);
  };

  const toggleMute = async () => {
    if (!room) return;
    const newMutedState = !isMuted();
    await room.localParticipant.setMicrophoneEnabled(!newMutedState);
    setIsMuted(newMutedState);
  };

  const toggleCamera = async () => {
    if (isCameraOff()) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        setParticipants((prev) => [
          ...prev.filter((p) => p.id !== "local"),
          { id: "local", name: "You (Local)", isLocal: true, stream },
        ]);
        if (room) await room.localParticipant.setCameraEnabled(true);
        setIsCameraOff(false);
      } catch (err) {
        console.error("Failed to restart camera:", err);
      }
    } else {
      const stream = localStream();
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        setLocalStream(null);
      }
      setParticipants((prev) => prev.filter((p) => p.id !== "local"));
      if (room) await room.localParticipant.setCameraEnabled(false);
      setIsCameraOff(true);
    }
  };

  const leaveCall = () => {
    if (room) room.disconnect().catch(() => {});
    const stream = localStream();
    if (stream) stream.getTracks().forEach(t => t.stop());
    const pStream = previewStream();
    if (pStream) pStream.getTracks().forEach(t => t.stop());
    getCurrentWindow().close();
  };

  const handleCloseClick = () => {
    if (preJoin()) {
      leaveCall();
    } else {
      setShowLeaveDialog(true);
    }
  };

  const confirmLeave = () => {
    setShowLeaveDialog(false);
    leaveCall();
  };

  // const minimizeWindow = () => getCurrentWindow().minimize();
  // const maximizeWindow = () => getCurrentWindow().toggleMaximize();

  return (
    <div class="flex flex-col h-screen w-screen bg-[#1a1a1a] text-white select-none overflow-hidden">

      {/* Custom Title Bar — FIXED: added relative positioning, larger traffic lights */}
      <div
        data-tauri-drag-region
        // class="relative h-10 bg-[#1a1a1a] flex items-center justify-between px-4 shrink-0 z-50"
      >
        {/* Traffic lights */}
        {/* <div class="flex items-center space-x-2">
          <button
            onClick={handleCloseClick}
            class="w-3.5 h-3.5 rounded-full bg-[#ff5f57] hover:brightness-110 transition shadow-sm"
            title="Close"
          />
          <button
            onClick={minimizeWindow}
            class="w-3.5 h-3.5 rounded-full bg-[#febc2e] hover:brightness-110 transition shadow-sm"
            title="Minimize"
          />
          <button
            onClick={maximizeWindow}
            class="w-3.5 h-3.5 rounded-full bg-[#28c840] hover:brightness-110 transition shadow-sm"
            title="Maximize"
          />
        </div> */}

        {/* Centered title */}
        <span class="absolute inset-0 flex items-center justify-center text-sm text-gray-300 font-medium pointer-events-none">
          {preJoin() ? `${ROOM}` : "VisualTalk Meeting"}
        </span>

        {/* Spacer to balance flex layout */}
        <div class="w-20" />
      </div>

      {/* ===== Pre-Join Screen ===== */}
      {preJoin() ? (
        <div class="flex flex-1 flex-col items-center justify-center bg-[#1a1a1a] px-8 pb-6">
          {/* Video Preview Container */}
          <div class="relative w-full max-w-3xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl">
            {previewVideoEnabled() ? (
              <video
                autoplay
                playsinline
                muted
                ref={(el) => { previewVideoRef = el; }}
                class="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              <div class="w-full h-full flex items-center justify-center bg-[#2a2a2a]">
                <div class="flex flex-col items-center">
                  <div class="w-20 h-20 rounded-full bg-[#3a3a3a] flex items-center justify-center mb-3">
                    <svg class="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <span class="text-gray-400 text-sm">Camera is off</span>
                </div>
              </div>
            )}

            {/* Floating Audio/Video Controls */}
            <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center space-x-3">
              <button
                onClick={togglePreviewAudio}
                class={`flex flex-col items-center justify-center w-16 h-16 rounded-xl transition backdrop-blur-md ${
                  previewAudioEnabled()
                    ? "bg-black/60 hover:bg-black/80 text-white"
                    : "bg-red-500/90 hover:bg-red-600 text-white"
                }`}
              >
                {previewAudioEnabled() ? (
                  <svg class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                ) : (
                  <svg class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                )}
                <span class="text-[10px] font-medium">Audio</span>
              </button>

              <button
                onClick={togglePreviewVideo}
                class={`flex flex-col items-center justify-center w-16 h-16 rounded-xl transition backdrop-blur-md ${
                  previewVideoEnabled()
                    ? "bg-black/60 hover:bg-black/80 text-white"
                    : "bg-red-500/90 hover:bg-red-600 text-white"
                }`}
              >
                {previewVideoEnabled() ? (
                  <svg class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                )}
                <span class="text-[10px] font-medium">Video</span>
              </button>
            </div>

            {/* Backgrounds Button */}
            <button class="absolute bottom-6 right-6 flex items-center space-x-2 px-4 py-2.5 bg-black/60 hover:bg-black/80 backdrop-blur-md rounded-xl text-white text-sm font-medium transition">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Backgrounds</span>
            </button>
          </div>

          {/* Device Selectors */}
          <div class="w-full max-w-3xl mt-4 grid grid-cols-2 gap-3">
            {/* Microphone */}
            <div class="relative">
              <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <select
                value={selectedMic()}
                onChange={(e) => changeDevice('audio', e.currentTarget.value)}
                class="w-full bg-[#2a2a2a] text-white rounded-xl pl-10 pr-8 py-3 text-sm border border-[#3a3a3a] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none cursor-pointer hover:bg-[#333333] transition"
              >
                <For each={devices().audio}>
                  {(device) => <option value={device.deviceId}>{device.label || device.deviceId}</option>}
                </For>
              </select>
              <div class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Camera */}
            <div class="relative">
              <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <select
                value={selectedCam()}
                onChange={(e) => changeDevice('video', e.currentTarget.value)}
                class="w-full bg-[#2a2a2a] text-white rounded-xl pl-10 pr-8 py-3 text-sm border border-[#3a3a3a] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none cursor-pointer hover:bg-[#333333] transition"
              >
                <For each={devices().video}>
                  {(device) => <option value={device.deviceId}>{device.label || device.deviceId}</option>}
                </For>
              </select>
              <div class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Bottom Row: Checkbox + Start Button */}
          <div class="w-full max-w-3xl mt-4 flex items-center justify-between">
            <label class="flex items-center space-x-2 cursor-pointer group">
              <div class="relative">
                <input
                  type="checkbox"
                  checked={alwaysShowPreview()}
                  onChange={() => setAlwaysShowPreview(!alwaysShowPreview())}
                  class="peer sr-only"
                />
                <div class="w-5 h-5 rounded border border-gray-500 bg-transparent peer-checked:bg-blue-600 peer-checked:border-blue-600 transition flex items-center justify-center">
                  {alwaysShowPreview() && (
                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span class="text-sm text-gray-300 group-hover:text-white transition">Always show this preview when joining</span>
              <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </label>

            <button
              onClick={joinMeeting}
              disabled={isConnecting()}
              class="px-8 py-2.5 bg-[#0E71EB] hover:bg-[#0d65d4] disabled:bg-[#0E71EB]/50 text-white font-semibold text-sm rounded-lg transition shadow-lg"
            >
              {isConnecting() ? 'Connecting...' : 'Start'}
            </button>
          </div>
        </div>
      ) : (
        <div class="flex flex-col flex-1 overflow-hidden">
          <header class="p-4 border-b border-[#2a2a2a] flex justify-between items-center bg-[#1a1a1a]/80 shrink-0">
            <h1 class="text-lg font-semibold tracking-wide">VisualTalk Meeting</h1>
            <div class="text-sm text-gray-400">Room: #{ROOM}</div>
          </header>

          <main class="flex-1 overflow-hidden bg-[#0f0f0f]">
            <VideoGrid participants={participants()} />
          </main>

          <footer class="p-4 border-t border-[#2a2a2a] flex justify-center gap-4 bg-[#1a1a1a] shrink-0">
            <button
              onClick={toggleMute}
              class={`px-5 py-2.5 rounded-xl text-sm font-medium transition flex items-center space-x-2 ${
                isMuted() ? "bg-red-500/90 hover:bg-red-600 text-white" : "bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white"
              }`}
            >
              {isMuted() ? (
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
              <span>{isMuted() ? "Unmute" : "Mute"}</span>
            </button>
            <button
              onClick={toggleCamera}
              class={`px-5 py-2.5 rounded-xl text-sm font-medium transition flex items-center space-x-2 ${
                isCameraOff() ? "bg-red-500/90 hover:bg-red-600 text-white" : "bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white"
              }`}
            >
              {isCameraOff() ? (
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
              <span>{isCameraOff() ? "Start Camera" : "Stop Camera"}</span>
            </button>
            <button
              onClick={handleCloseClick}
              class="px-5 py-2.5 bg-red-500/90 hover:bg-red-600 rounded-xl text-sm font-medium transition text-white flex items-center space-x-2"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Leave Call</span>
            </button>
          </footer>
        </div>
      )}

      {/* Leave Confirmation Dialog */}
      {showLeaveDialog() && (
        <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
          <div class="bg-[#2a2a2a] rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-[#3a3a3a]">
            <h3 class="text-lg font-semibold text-white">Leave meeting?</h3>
            <p class="text-sm text-gray-400 mt-2">Are you sure you want to leave this meeting?</p>
            <div class="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowLeaveDialog(false)}
                class="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded-xl text-sm text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmLeave}
                class="px-4 py-2 bg-red-500/90 hover:bg-red-600 rounded-xl text-sm text-white transition"
              >
                Leave meeting
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}