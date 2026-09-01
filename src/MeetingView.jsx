import { createSignal, onMount, onCleanup, For, createEffect, Show } from "solid-js";
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
  const [backgroundMode, setBackgroundMode] = createSignal("none"); // "none", "blur", "image"
  const [backgroundImageUrl, setBackgroundImageUrl] = createSignal("");
  const [showBackgroundsModal, setShowBackgroundsModal] = createSignal(false);

  // ---- Meeting state ----
  const [participants, setParticipants] = createSignal([]);
  const [isMuted, setIsMuted] = createSignal(false);
  const [isCameraOff, setIsCameraOff] = createSignal(false);
  const [isSharingScreen, setIsSharingScreen] = createSignal(false);
  const [localStream, setLocalStream] = createSignal(null);
  let room;
  let previewVideoRef = null;
  const attachedAudioElements = new Map();

  // ---- Load preferences and devices ----
  onMount(async () => {
    try {
      const settings = await invoke("get_user_settings");
      setPreviewVideoEnabled(settings.start_with_video);
      setPreviewAudioEnabled(!settings.mute_on_join);
      setAlwaysShowPreview(settings.always_show_preview);
      if (settings.preferred_mic_id) setSelectedMic(settings.preferred_mic_id);
      if (settings.preferred_cam_id) setSelectedCam(settings.preferred_cam_id);
    } catch (err) {
      console.warn("Could not load user settings from Rust:", err);
    }

    await startPreview();
    await loadDevices();
  });

  onCleanup(() => {
    if (room) room.disconnect();
    attachedAudioElements.forEach((el) => el.remove());
    attachedAudioElements.clear();
    const stream = localStream();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const pStream = previewStream();
    if (pStream) pStream.getTracks().forEach((t) => t.stop());
  });

  const loadDevices = async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter((d) => d.kind === "audioinput");
      const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
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
      if (existing) existing.getTracks().forEach((t) => t.stop());

      const constraints = {
        video:
          previewVideoEnabled() && selectedCam()
            ? { deviceId: { exact: selectedCam() } }
            : previewVideoEnabled(),
        audio:
          previewAudioEnabled() && selectedMic()
            ? { deviceId: { exact: selectedMic() } }
            : previewAudioEnabled(),
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setPreviewStream(stream);
    } catch (err) {
      console.error("Failed to start preview:", err);
    }
  };

  createEffect(() => {
    const stream = previewStream();
    if (previewVideoRef && stream) {
      previewVideoRef.srcObject = stream;
      previewVideoRef.play().catch(() => {});
    }
  });

  const changeDevice = async (type, deviceId) => {
    if (type === "audio") {
      setSelectedMic(deviceId);
      try {
        const settings = await invoke("get_user_settings");
        await invoke("update_user_settings", {
          settings: { ...settings, preferred_mic_id: deviceId },
        });
      } catch (err) {
        console.warn("Failed to persist mic preference:", err);
      }
    } else {
      setSelectedCam(deviceId);
      try {
        const settings = await invoke("get_user_settings");
        await invoke("update_user_settings", {
          settings: { ...settings, preferred_cam_id: deviceId },
        });
      } catch (err) {
        console.warn("Failed to persist cam preference:", err);
      }
    }
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

  const toggleAlwaysPreview = async () => {
    const newVal = !alwaysShowPreview();
    setAlwaysShowPreview(newVal);
    try {
      const settings = await invoke("get_user_settings");
      await invoke("update_user_settings", {
        settings: { ...settings, always_show_preview: newVal },
      });
    } catch (err) {
      console.warn("Failed to persist preview preference:", err);
    }
  };

  const handleTrackSubscribed = (track, publication, participant) => {
    if (track.kind === Track.Kind.Video) {
      const isScreen = publication.source === Track.Source.ScreenShare;
      const trackId = isScreen ? `${participant.identity}-screen` : participant.identity;

      setParticipants((prev) => {
        const filtered = prev.filter((p) => p.id !== trackId);
        return [
          ...filtered,
          {
            id: trackId,
            name: isScreen
              ? `${participant.name || participant.identity}'s Screen`
              : participant.name || participant.identity,
            isLocal: false,
            isScreen,
            videoTrack: track,
          },
        ];
      });
    } else if (track.kind === Track.Kind.Audio) {
      // Auto-attach remote audio so participants can hear each other
      const audioEl = track.attach();
      attachedAudioElements.set(track.sid, audioEl);
    }
  };

  const handleTrackUnsubscribed = (track, publication, participant) => {
    if (track.kind === Track.Kind.Video) {
      const isScreen = publication.source === Track.Source.ScreenShare;
      const trackId = isScreen ? `${participant.identity}-screen` : participant.identity;
      setParticipants((prev) => prev.filter((p) => p.id !== trackId));
    } else if (track.kind === Track.Kind.Audio) {
      const audioEl = attachedAudioElements.get(track.sid);
      if (audioEl) {
        track.detach(audioEl);
        audioEl.remove();
        attachedAudioElements.delete(track.sid);
      }
    }
  };

  // ---- Unified Meeting Join via Rust Meeting Session ----
  const joinMeeting = async () => {
    setIsConnecting(true);
    setPreJoin(false);

    const pStream = previewStream();
    if (pStream) pStream.getTracks().forEach((t) => t.stop());
    setPreviewStream(null);

    let session;
    try {
      session = await invoke("get_meeting_session", { room: ROOM });
    } catch (err) {
      console.error("Failed to obtain meeting session from Rust backend:", err);
      alert(`Could not join meeting: ${err}`);
      setIsConnecting(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedCam() ? { deviceId: { exact: selectedCam() } } : true,
        audio: selectedMic() ? { deviceId: { exact: selectedMic() } } : true,
      });
      setLocalStream(stream);
      setParticipants([
        {
          id: "local",
          name: `${session.display_name || session.identity} (You)`,
          isLocal: true,
          stream,
        },
      ]);
    } catch (err) {
      console.error("Error starting local stream:", err);
      setIsCameraOff(true);
    }

    room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    // Remote track subscription events
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      handleTrackSubscribed(track, publication, participant);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      handleTrackUnsubscribed(track, publication, participant);
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      setParticipants((prev) =>
        prev.filter(
          (p) =>
            p.id !== participant.identity &&
            p.id !== `${participant.identity}-screen`
        )
      );
    });

    // Handle local screen sharing
    room.on(RoomEvent.LocalTrackPublished, (publication) => {
      const track = publication.track || publication;
      if (track.kind === Track.Kind.Video && track.source === Track.Source.ScreenShare) {
        setIsSharingScreen(true);
      }
    });

    room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      const track = publication.track || publication;
      if (track.kind === Track.Kind.Video && track.source === Track.Source.ScreenShare) {
        setIsSharingScreen(false);
      }
    });

    try {
      await room.connect(session.livekit_url, session.token);

      // Publish local media
      await room.localParticipant.setCameraEnabled(previewVideoEnabled());
      await room.localParticipant.setMicrophoneEnabled(previewAudioEnabled());

      setIsCameraOff(!previewVideoEnabled());
      setIsMuted(!previewAudioEnabled());

      // Catch up with any remote participants already publishing
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((pub) => {
          if (pub.isSubscribed && pub.track) {
            handleTrackSubscribed(pub.track, pub, participant);
          }
        });
      });
    } catch (err) {
      console.error("Failed to connect to LiveKit server:", err);
      alert(`LiveKit Connection Failed: ${err.message || err}`);
    }
    setIsConnecting(false);
  };

  // ---- In-meeting controls ----
  const toggleMute = async () => {
    if (!room) return;
    const newMutedState = !isMuted();
    await room.localParticipant.setMicrophoneEnabled(!newMutedState);
    setIsMuted(newMutedState);
  };

  const toggleCamera = async () => {
    if (isCameraOff()) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
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
        stream.getTracks().forEach((t) => t.stop());
        setLocalStream(null);
      }
      setParticipants((prev) => prev.filter((p) => p.id !== "local"));
      if (room) await room.localParticipant.setCameraEnabled(false);
      setIsCameraOff(true);
    }
  };

  const toggleScreenShare = async () => {
    if (!room) return;
    if (isSharingScreen()) {
      try {
        await room.localParticipant.setScreenShareEnabled(false);
        setIsSharingScreen(false);
      } catch (err) {
        console.error("Failed to stop screen share:", err);
      }
    } else {
      try {
        await room.localParticipant.setScreenShareEnabled(true, {
          audio: false,
          selfBrowserSurface: "exclude",
          surfaceSwitching: "include",
        });
        setIsSharingScreen(true);
      } catch (err) {
        console.error("Failed to start screen share:", err);
      }
    }
  };

  // ---- Leave / close ----
  const leaveCall = () => {
    if (room) room.disconnect().catch(() => {});
    attachedAudioElements.forEach((el) => el.remove());
    attachedAudioElements.clear();
    const stream = localStream();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const pStream = previewStream();
    if (pStream) pStream.getTracks().forEach((t) => t.stop());
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

  return (
    <div class="flex flex-col h-screen w-screen bg-[#1a1a1a] text-white select-none overflow-hidden">
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
                ref={(el) => {
                  previewVideoRef = el;
                }}
                class={`w-full h-full object-cover scale-x-[-1] transition-all duration-300 ${
                  backgroundMode() === "blur" ? "blur-md" : ""
                }`}
                style={{
                  backgroundImage: backgroundMode() === "image" ? `url(${backgroundImageUrl()})` : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            ) : (
              <div class="w-full h-full flex items-center justify-center bg-[#2a2a2a]">
                <div class="flex flex-col items-center">
                  <div class="w-20 h-20 rounded-full bg-[#3a3a3a] flex items-center justify-center mb-3">
                    <svg
                      class="w-10 h-10 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
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
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                ) : (
                  <svg class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                    />
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
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                ) : (
                  <svg class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                    />
                  </svg>
                )}
                <span class="text-[10px] font-medium">Video</span>
              </button>

              <button
                onClick={() => setShowBackgroundsModal(true)}
                class={`flex flex-col items-center justify-center w-16 h-16 rounded-xl transition backdrop-blur-md ${
                  backgroundMode() !== "none"
                    ? "bg-blue-600/90 hover:bg-blue-700 text-white"
                    : "bg-black/60 hover:bg-black/80 text-white"
                }`}
              >
                <svg class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span class="text-[10px] font-medium">Backgrounds</span>
              </button>
            </div>
          </div>

          {/* Device Selectors */}
          <div class="w-full max-w-3xl mt-4 grid grid-cols-2 gap-3">
            <div class="relative">
              <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
              <select
                value={selectedMic()}
                onChange={(e) => changeDevice("audio", e.currentTarget.value)}
                class="w-full bg-[#2a2a2a] text-white rounded-xl pl-10 pr-8 py-3 text-sm border border-[#3a3a3a] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none cursor-pointer hover:bg-[#333333] transition"
              >
                <For each={devices().audio}>
                  {(device) => (
                    <option value={device.deviceId}>{device.label || device.deviceId}</option>
                  )}
                </For>
              </select>
            </div>

            <div class="relative">
              <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <select
                value={selectedCam()}
                onChange={(e) => changeDevice("video", e.currentTarget.value)}
                class="w-full bg-[#2a2a2a] text-white rounded-xl pl-10 pr-8 py-3 text-sm border border-[#3a3a3a] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none cursor-pointer hover:bg-[#333333] transition"
              >
                <For each={devices().video}>
                  {(device) => (
                    <option value={device.deviceId}>{device.label || device.deviceId}</option>
                  )}
                </For>
              </select>
            </div>
          </div>

          {/* Bottom Row */}
          <div class="w-full max-w-3xl mt-4 flex items-center justify-between">
            <label class="flex items-center space-x-2 cursor-pointer group">
              <div class="relative">
                <input
                  type="checkbox"
                  checked={alwaysShowPreview()}
                  onChange={toggleAlwaysPreview}
                  class="peer sr-only"
                />
                <div class="w-5 h-5 rounded border border-gray-500 bg-transparent peer-checked:bg-blue-600 peer-checked:border-blue-600 transition flex items-center justify-center">
                  {alwaysShowPreview() && (
                    <svg
                      class="w-3.5 h-3.5 text-white"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </div>
              <span class="text-sm text-gray-300 group-hover:text-white transition">
                Always show this preview when joining
              </span>
            </label>

            <button
              onClick={joinMeeting}
              disabled={isConnecting()}
              class="px-8 py-2.5 bg-[#0E71EB] hover:bg-[#0d65d4] disabled:bg-[#0E71EB]/50 text-white font-semibold text-sm rounded-lg transition shadow-lg"
            >
              {isConnecting() ? "Connecting..." : "Start"}
            </button>
          </div>
        </div>
      ) : (
        <div class="flex flex-col flex-1 overflow-hidden">
          {/* Background Selection Modal */}
          {showBackgroundsModal() && (
            <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
              <div class="bg-[#2a2a2a] rounded-2xl shadow-2xl p-6 max-w-md w-full border border-[#3a3a3a]">
                <h3 class="text-lg font-semibold text-white mb-4">Select Background</h3>
                <div class="grid grid-cols-3 gap-3 mb-6">
                  <button
                    onClick={() => { setBackgroundMode("none"); setShowBackgroundsModal(false); }}
                    class={`aspect-square rounded-lg border-2 transition flex flex-col items-center justify-center p-2 ${
                      backgroundMode() === "none" ? "border-blue-500 bg-blue-500/20" : "border-gray-700 hover:border-gray-500 bg-[#1a1a1a]"
                    }`}
                  >
                    <svg class="w-6 h-6 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0L4 4m5 0L9 4M//... (Simplified icon)" />
                    </svg>
                    <span class="text-[10px] text-gray-300">None</span>
                  </button>
                  <button
                    onClick={() => { setBackgroundMode("blur"); setShowBackgroundsModal(false); }}
                    class={`aspect-square rounded-lg border-2 transition flex flex-col items-center justify-center p-2 ${
                      backgroundMode() === "blur" ? "border-blue-500 bg-blue-500/20" : "border-gray-700 hover:border-gray-500 bg-[#1a1a1a]"
                    }`}
                  >
                    <div class="w-6 h-6 rounded-full bg-gray-500 blur-[2px] mb-1"></div>
                    <span class="text-[10px] text-gray-300">Blur</span>
                  </button>
                  <button
                    onClick={() => {
                      const url = prompt("Enter image URL for background:", "https://images.unsplash.com/photo-1497366216548-37526070297c");
                      if (url) {
                        setBackgroundImageUrl(url);
                        setBackgroundMode("image");
                      }
                      setShowBackgroundsModal(false);
                    }}
                    class={`aspect-square rounded-lg border-2 transition flex flex-col items-center justify-center p-2 ${
                      backgroundMode() === "image" ? "border-blue-500 bg-blue-500/20" : "border-gray-700 hover:border-gray-500 bg-[#1a1a1a]"
                    }`}
                  >
                    <svg class="w-6 h-6 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span class="text-[10px] text-gray-300">Custom</span>
                  </button>
                </div>
                <div class="flex justify-end">
                  <button
                    onClick={() => setShowBackgroundsModal(false)}
                    class="px-4 py-2 bg-[#3a3a3a] hover:bg-[#4a4a4a] rounded-xl text-sm text-white transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Presenter Banner */}
          <Show when={isSharingScreen()}>
            <div class="bg-emerald-600 px-4 py-2 flex items-center justify-between text-xs font-semibold text-white shadow-md shrink-0">
              <div class="flex items-center space-x-2">
                <span class="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                <span>You are sharing your screen</span>
              </div>
              <button
                onClick={toggleScreenShare}
                class="px-3 py-1 bg-black/40 hover:bg-black/60 rounded-md text-xs text-white transition cursor-pointer"
              >
                Stop Sharing
              </button>
            </div>
          </Show>

          <header class="px-4 py-3 border-b border-[#2a2a2a] flex justify-between items-center bg-[#1a1a1a]/80 shrink-0">
            <h1 class="text-base font-semibold tracking-wide">VisualTalk Meeting</h1>
            <div class="text-xs text-gray-400">Room: #{ROOM}</div>
          </header>

          <main class="flex-1 overflow-hidden bg-[#0f0f0f]">
            <VideoGrid participants={participants()} />
          </main>

          <footer class="p-3 border-t border-[#2a2a2a] flex justify-center gap-3 bg-[#1a1a1a] shrink-0 flex-wrap">
            <button
              onClick={toggleMute}
              class={`px-4 py-2 rounded-xl text-sm font-medium transition flex items-center space-x-2 ${
                isMuted()
                  ? "bg-red-500/90 hover:bg-red-600 text-white"
                  : "bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white"
              }`}
            >
              {isMuted() ? (
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              ) : (
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              )}
              <span>{isMuted() ? "Unmute" : "Mute"}</span>
            </button>

            <button
              onClick={toggleCamera}
              class={`px-4 py-2 rounded-xl text-sm font-medium transition flex items-center space-x-2 ${
                isCameraOff()
                  ? "bg-red-500/90 hover:bg-red-600 text-white"
                  : "bg-[#2a2a2a] hover:bg-[#3a3a3a] text-white"
              }`}
            >
              {isCameraOff() ? (
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              ) : (
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
              <span>{isCameraOff() ? "Start Camera" : "Stop Camera"}</span>
            </button>

            <button
              onClick={toggleScreenShare}
              class={`px-4 py-2 rounded-xl text-sm font-medium transition flex items-center space-x-2 ${
                isSharingScreen()
                  ? "bg-red-500/90 hover:bg-red-600 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }`}
            >
              {isSharingScreen() ? (
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  />
                </svg>
              ) : (
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9.75 17L15 12.75 9.75 8.5M4.5 4.5h15v15h-15z"
                  />
                </svg>
              )}
              <span>{isSharingScreen() ? "Stop Sharing" : "Share Screen"}</span>
            </button>

            <button
              onClick={handleCloseClick}
              class="px-4 py-2 bg-red-500/90 hover:bg-red-600 rounded-xl text-sm font-medium transition text-white flex items-center space-x-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
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