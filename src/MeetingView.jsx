import { createSignal, onMount, onCleanup, For, createEffect } from "solid-js";
import { Room, RoomEvent, Track, DataPacket_Kind } from "livekit-client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { VideoGrid } from "./components/VideoGrid";
import { requestMediaPermissions } from "./components/Permissions";

export function MeetingView(props) {
  const ROOM = props.roomName || "general";

  // ---- UI state ----
  const [preJoin, setPreJoin] = createSignal(true);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [showLeaveDialog, setShowLeaveDialog] = createSignal(false);

  // ---- Chat state ----
  const [chatOpen, setChatOpen] = createSignal(false);
  const [messages, setMessages] = createSignal([]);
  const [messageInput, setMessageInput] = createSignal("");
  const [unreadCount, setUnreadCount] = createSignal(0);
  let identity = "";

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
  const [isSharingScreen, setIsSharingScreen] = createSignal(false);
  const [localStream, setLocalStream] = createSignal(null);
  let room;
  let previewVideoRef = null;

  // ---- Load devices and start preview ----
  onMount(async () => {
    const status = await requestMediaPermissions();
    if (!status.camera || !status.microphone) {
      setError('Permissions required');
      return;
    }
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

  createEffect(() => {
    const stream = previewStream();
    if (previewVideoRef && stream) {
      previewVideoRef.srcObject = stream;
      previewVideoRef.play().catch(() => { });
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

  // ---- Join meeting ----
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
    identity = conf.identity;

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
        identity: identity,
        room: ROOM,
        validForSeconds: 86400,
      });
    } catch (err) {
      console.error("Failed to generate token:", err);
      setIsConnecting(false);
      return;
    }

    room = new Room();

    // ---- Remote tracks ----
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Video) {
        const isScreen = publication.source === Track.Source.ScreenShare;
        setParticipants((prev) => [
          ...prev,
          {
            id: isScreen ? `${participant.identity}-screen` : participant.identity,
            name: isScreen
              ? `${participant.name || participant.identity}'s Screen`
              : (participant.name || participant.identity),
            isLocal: false,
            isScreen,
            videoTrack: publication,
          },
        ]);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Video) {
        const isScreen = publication.source === Track.Source.ScreenShare;
        const id = isScreen ? `${participant.identity}-screen` : participant.identity;
        setParticipants((prev) => prev.filter((p) => p.id !== id));
      }
    });

    // ---- Local screen share ----
    room.on(RoomEvent.LocalTrackPublished, (track) => {
      if (track.kind === Track.Kind.Video && track.source === Track.Source.ScreenShare) {
        setIsSharingScreen(true);
        setParticipants((prev) => {
          const filtered = prev.filter(p => p.id !== "local-screen");
          return [
            ...filtered,
            {
              id: "local-screen",
              name: "Your Screen",
              isLocal: true,
              isScreen: true,
              videoTrack: track,
            }
          ];
        });
      }
    });

    room.on(RoomEvent.LocalTrackUnpublished, (track) => {
      if (track.kind === Track.Kind.Video && track.source === Track.Source.ScreenShare) {
        setIsSharingScreen(false);
        setParticipants((prev) => prev.filter(p => p.id !== "local-screen"));
      }
    });

    // ---- Chat: listen for incoming data packets ----
    room.on(RoomEvent.DataPacketReceived, (payload, participant) => {
      console.log("📨 Data packet received from:", participant?.identity, "payload:", payload);
      try {
        const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
        console.log("📨 Parsed data:", data);
        if (data.type === 'chat' && data.payload) {
          const msg = {
            id: Date.now() + Math.random(),
            sender: data.payload.sender || participant?.identity || 'Unknown',
            text: data.payload.text,
            timestamp: data.payload.timestamp || Date.now(),
          };
          console.log("💬 New chat message:", msg);
          setMessages((prev) => {
            console.log("💬 Previous messages:", prev);
            return [...prev, msg];
          });
          if (!chatOpen()) {
            setUnreadCount((c) => c + 1);
            console.log("🔔 Unread count incremented:", unreadCount() + 1);
          }
        }
      } catch (e) {
        console.warn("⚠️ Failed to parse data packet:", e);
      }
    });

    // ---- Connect ----
    try {
      await room.connect(LIVEKIT_URL, token);
      await room.localParticipant.setCameraEnabled(!isCameraOff());
      await room.localParticipant.setMicrophoneEnabled(!isMuted());
    } catch (err) {
      console.error("Failed to connect:", err);
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

  const toggleScreenShare = async () => {
    if (!room) return;
    if (isSharingScreen()) {
      await room.localParticipant.setScreenShareEnabled(false);
    } else {
      try {
        await room.localParticipant.setScreenShareEnabled(true);
      } catch (err) {
        console.error("Failed to start screen share:", err);
        alert("Screen sharing was cancelled or failed.");
      }
    }
  };

  // ---- Chat functions ----
  const toggleChat = () => {
    console.log("💬 Toggling chat, current state:", chatOpen());
    setChatOpen(!chatOpen());
    if (!chatOpen()) {
      setUnreadCount(0);
    }
  };

  const sendMessage = async () => {
    const text = messageInput().trim();
    console.log("📤 Send button clicked, text:", text);

    if (!text) {
      console.log("⚠️ Message empty, ignoring");
      return;
    }

    if (!room) {
      console.error("❌ Room is undefined! Cannot send message.");
      return;
    }

    console.log("✅ Room exists, localParticipant:", room.localParticipant);

    const payload = {
      type: 'chat',
      payload: {
        sender: identity || 'You',
        text: text,
        timestamp: Date.now(),
      },
    };

    try {
      console.log("📤 Publishing data:", payload);
      await room.localParticipant.publishData(JSON.stringify(payload), DataPacket_Kind.RELIABLE);
      console.log("✅ Message published successfully");

      // Add to local messages
      setMessages((prev) => {
        const newMsg = {
          id: Date.now(),
          sender: identity || 'You',
          text: text,
          timestamp: Date.now(),
          local: true,
        };
        console.log("💬 Adding local message:", newMsg);
        return [...prev, newMsg];
      });
      setMessageInput('');
    } catch (err) {
      console.error("❌ Failed to send message:", err);
    }
  };


  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ---- Leave / close ----
  const leaveCall = () => {
    if (room) room.disconnect().catch(() => { });
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

  // ---- Format time ----
  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div class="flex flex-col h-screen w-screen bg-[#1a1a1a] text-white select-none overflow-hidden">

      {/* ===== Pre-Join Screen (Mobile-optimized) ===== */}
      {/* ===== Pre-Join Screen (Mobile & iOS Fixed Layout) ===== */}
      {preJoin() ? (
        <div class="flex flex-col h-screen w-full bg-[#1a1a1a] overflow-hidden" style="height: 100dvh;">
          {/* Video Preview Area - Use grid to control height distribution */}
          <div class="relative flex-1 w-full px-2 sm:px-4 py-2 overflow-hidden flex items-center justify-center">

            {/* Video Preview Container */}
            <div class="relative w-full h-full bg-black rounded-2xl overflow-hidden shadow-2xl max-w-3xl">
              {previewVideoEnabled() ? (
                <video
                  autoplay
                  playsinline
                  muted
                  ref={(el) => { previewVideoRef = el; }}
                  style="transform: scaleX(1); -webkit-transform: scaleX(1);"
                  class="w-full h-full object-cover"
                />
              ) : (
                <div class="w-full h-full flex items-center justify-center bg-[#2a2a2a]">
                  <div class="flex flex-col items-center">
                    <div class="w-16 h-16 rounded-full bg-[#3a3a3a] flex items-center justify-center mb-2">
                      <svg class="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <span class="text-gray-400 text-sm">Camera is off</span>
                  </div>
                </div>
              )}

              {/* FIX: Absolute control panel position bounded cleanly across mobile widths */}
              <div class="absolute bottom-3 inset-x-0 flex items-center justify-center space-x-6 z-20">

                {/* Audio Toggle */}
                <button
                  onClick={togglePreviewAudio}
                  class={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition border-none bg-transparent !bg-transparent outline-none p-0 ${previewAudioEnabled() ? "text-white" : "text-red-500"
                    }`}
                >
                  <div class={`w-10 h-10 rounded-full flex items-center justify-center mb-0.5 shadow-md ${previewAudioEnabled() ? 'bg-black/60 backdrop-blur-md' : 'bg-red-500'}`}>
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <span class="text-[9px] font-semibold text-white drop-shadow-md">Audio</span>
                </button>

                {/* Video Toggle */}
                <button
                  onClick={togglePreviewVideo}
                  class={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition border-none bg-transparent !bg-transparent outline-none p-0 ${previewVideoEnabled() ? "text-white" : "text-red-500"
                    }`}
                >
                  <div class={`w-10 h-10 rounded-full flex items-center justify-center mb-0.5 shadow-md ${previewVideoEnabled() ? 'bg-black/60 backdrop-blur-md' : 'bg-red-500'}`}>
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span class="text-[9px] font-semibold text-white drop-shadow-md">Video</span>
                </button>

              </div>
            </div>

          </div>

          {/* Fixed Bottom Controls Section */}
          <div class="shrink-0 bg-[#1a1a1a] border-t border-[#2a2a2a] px-2 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-2.5 w-full">
            <div class="max-w-3xl mx-auto w-full flex flex-col space-y-2 sm:space-y-2.5">
              {/* Microphone */}
              <div class="relative w-full">
                <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <select
                  value={selectedMic()}
                  onChange={(e) => changeDevice('audio', e.currentTarget.value)}
                  class="w-full bg-[#2a2a2a] text-white rounded-xl pl-10 pr-10 py-2 sm:py-2.5 text-xs sm:text-sm border border-[#3a3a3a] outline-none appearance-none cursor-pointer"
                >
                  <For each={devices().audio}>
                    {(device) => <option value={device.deviceId}>{device.label || device.deviceId}</option>}
                  </For>
                </select>
                <div class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>

              {/* Camera */}
              <div class="relative w-full">
                <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <select
                  value={selectedCam()}
                  onChange={(e) => changeDevice('video', e.currentTarget.value)}
                  class="w-full bg-[#2a2a2a] text-white rounded-xl pl-10 pr-10 py-2 sm:py-2.5 text-xs sm:text-sm border border-[#3a3a3a] outline-none appearance-none cursor-pointer"
                >
                  <For each={devices().video}>
                    {(device) => <option value={device.deviceId}>{device.label || device.deviceId}</option>}
                  </For>
                </select>
                <div class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>

              {/* Checkbox and Button Row */}
              <div class="w-full flex flex-col space-y-2">
                <label class="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer group select-none px-0.5 sm:px-1">
                  <div class="relative shrink-0">
                    <input
                      type="checkbox"
                      checked={alwaysShowPreview()}
                      onChange={() => setAlwaysShowPreview(!alwaysShowPreview())}
                      class="peer sr-only"
                    />
                    <div class="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border border-gray-500 bg-transparent peer-checked:bg-blue-600 peer-checked:border-blue-600 transition flex items-center justify-center">
                      {alwaysShowPreview() && (
                        <svg class="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span class="text-xs sm:text-sm text-gray-300 group-hover:text-white transition">Always show preview</span>
                </label>

                {/* Start Button */}
                <button
                  onClick={joinMeeting}
                  disabled={isConnecting()}
                  class="w-full py-2.5 sm:py-3 bg-[#0E71EB] hover:bg-[#0d65d4] disabled:bg-[#0E71EB]/50 text-white font-semibold text-xs sm:text-sm rounded-xl transition shadow-lg border-none outline-none"
                >
                  {isConnecting() ? 'Connecting...' : 'Start'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // ===== In-Meeting View with Chat =====
        <div class="flex flex-1 overflow-hidden">
          {/* Video Grid Container */}
          <div class="flex-1 flex flex-col overflow-hidden bg-[#0f0f0f]">
            <header class="px-3 sm:px-4 py-2 sm:py-4 border-b border-[#2a2a2a] flex justify-between items-center bg-[#1a1a1a]/80 shrink-0">
              <h1 class="text-base sm:text-lg font-semibold tracking-wide">VisualTalk Meeting</h1>
              <div class="text-xs sm:text-sm text-gray-400">#{ROOM}</div>
            </header>

            <main class="flex-1 overflow-hidden">
              <VideoGrid participants={participants()} />
            </main>

            {/* ===== RESTYLED 5-BUTTON PREMIUM MEETING ACTION BAR ===== */}
            <footer class="border-t border-[#2a2a2a] bg-[#1c1c1c] shrink-0 w-full px-1 pt-3 pb-5 sm:py-4 shadow-xl z-10">
              {/* Enforced 5-column grid system keeping all tools balanced inline */}
              <div class="max-w-md mx-auto grid grid-cols-5 gap-x-0.5 justify-items-center items-start">

                {/* 1. Mute Action Button */}
                <button
                  onClick={toggleMute}
                  class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0 select-none"
                >
                  <div class={`w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] flex items-center justify-center mb-1 shadow-md transition-all duration-200 active:scale-95 ${isMuted() ? "bg-red-500 text-white" : "bg-[#2a2a2a] text-gray-200 group-hover:bg-[#3a3a3a]"
                    }`}>
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
                  </div>
                  <span class={`text-[9px] sm:text-[10px] font-medium tracking-wide truncate w-full text-center ${isMuted() ? "text-red-400" : "text-gray-400"}`}>
                    {isMuted() ? "Unmute" : "Mute"}
                  </span>
                </button>

                {/* 2. Camera Action Button */}
                <button
                  onClick={toggleCamera}
                  class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0 select-none"
                >
                  <div class={`w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] flex items-center justify-center mb-1 shadow-md transition-all duration-200 active:scale-95 ${isCameraOff() ? "bg-red-500 text-white" : "bg-[#2a2a2a] text-gray-200 group-hover:bg-[#3a3a3a]"
                    }`}>
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
                  </div>
                  <span class={`text-[9px] sm:text-[10px] font-medium tracking-wide truncate w-full text-center ${isCameraOff() ? "text-red-400" : "text-gray-400"}`}>
                    Camera
                  </span>
                </button>

                {/* 3. Restyled Share Screen Button */}
                <button
                  onClick={toggleScreenShare}
                  class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0 select-none"
                >
                  <div class={`w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] flex items-center justify-center mb-1 shadow-md transition-all duration-200 active:scale-95 ${isSharingScreen() ? "bg-green-600 text-white" : "bg-[#2a2a2a] text-gray-200 group-hover:bg-[#3a3a3a]"
                    }`}>
                    {isSharingScreen() ? (
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    ) : (
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    )}
                  </div>
                  <span class={`text-[9px] sm:text-[10px] font-medium tracking-wide truncate w-full text-center ${isSharingScreen() ? "text-green-400" : "text-gray-400"}`}>
                    Share
                  </span>
                </button>

                {/* 4. Chat Action Button */}
                <button
                  onClick={toggleChat}
                  class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0 relative select-none"
                >
                  <div class={`w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] flex items-center justify-center mb-1 shadow-md transition-all duration-200 active:scale-95 ${chatOpen() ? "bg-blue-600 text-white" : "bg-[#2a2a2a] text-gray-200 group-hover:bg-[#3a3a3a]"
                    }`}>
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  {unreadCount() > 0 && !chatOpen() && (
                    <span class="absolute top-0 right-2 bg-red-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center animate-pulse">
                      {unreadCount()}
                    </span>
                  )}
                  <span class="text-[9px] sm:text-[10px] font-medium tracking-wide text-gray-400 text-center truncate w-full">
                    Chat
                  </span>
                </button>

                {/* 5. End Call/Leave Button */}
                <button
                  onClick={handleCloseClick}
                  class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0 select-none"
                >
                  <div class="w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] bg-red-600 hover:bg-red-700 text-white flex items-center justify-center mb-1 shadow-md transition-all duration-200 active:scale-95">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </div>
                  <span class="text-[9px] sm:text-[10px] font-medium tracking-wide text-red-500 text-center truncate w-full">
                    Leave
                  </span>
                </button>

              </div>
            </footer>

          </div>

          {/* Chat Sidebar (mobile: full width overlay) */}
          {chatOpen() && (
            <div class="fixed inset-0 bg-[#1a1a1a] z-50 flex flex-col md:relative md:inset-auto md:w-80 md:bg-[#1a1a1a] md:border-l md:border-[#2a2a2a]">
              <div class="p-3 border-b border-[#2a2a2a] flex items-center justify-between">
                <h2 class="text-sm font-semibold text-white">Chat</h2>
                <button onClick={toggleChat} class="text-gray-400 hover:text-white transition">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div class="flex-1 overflow-y-auto p-3 space-y-3">
                <For each={messages()}>
                  {(msg) => (
                    <div class={`flex flex-col ${msg.local ? 'items-end' : 'items-start'}`}>
                      <div class={`max-w-[80%] rounded-xl px-3 py-2 ${msg.local ? 'bg-blue-600 text-white' : 'bg-[#2a2a2a] text-gray-200'}`}>
                        <div class="text-xs font-semibold text-opacity-70">{msg.sender}</div>
                        <div class="text-sm break-words">{msg.text}</div>
                        <div class="text-[10px] text-opacity-50 text-right mt-0.5">{formatTime(msg.timestamp)}</div>
                      </div>
                    </div>
                  )}
                </For>
                {messages().length === 0 && (
                  <div class="text-center text-gray-500 text-sm mt-10">No messages yet</div>
                )}
              </div>

              <div class="p-2 border-t border-[#2a2a2a]">
                <div class="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={messageInput()}
                    onInput={(e) => setMessageInput(e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                    class="flex-1 bg-[#2a2a2a] text-white rounded-xl px-3 py-2 text-sm border border-[#3a3a3a] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!messageInput().trim()}
                    class="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition flex items-center"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
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