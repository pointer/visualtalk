import { createSignal, onMount, onCleanup } from "solid-js";
import { Room, RoomEvent, Track } from "livekit-client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { VideoGrid } from "./components/VideoGrid";

export function MeetingView(props) {
  const [participants, setParticipants] = createSignal([]);
  const [isMuted, setIsMuted] = createSignal(false);
  const [isCameraOff, setIsCameraOff] = createSignal(false);
  const [localStream, setLocalStream] = createSignal(null);
  let room;

  const ROOM = props.roomName || "general";

  onMount(async () => {
    let conf;
    try {
      conf = await invoke("get_config");
      console.log("✅ Config loaded:", conf);
    } catch (err) {
      console.error("❌ Failed to load config:", err);
      return;
    }

    const LIVEKIT_URL = conf.livekit_url;
    const API_KEY = conf.livekit_api_key;
    const IDENTITY = conf.identity;

    // Start local preview
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setParticipants([
        { id: "local", name: "You (Local)", isLocal: true, stream },
      ]);
    } catch (err) {
      console.error("❌ Error starting local preview:", err);
      setIsCameraOff(true);
    }

    // Request token from Rust
    let token;
    try {
      token = await invoke("generate_livekit_token", {
        apiKey: API_KEY,
        identity: IDENTITY,
        room: ROOM,
        validForSeconds: 86400,
      });
      console.log("✅ Token generated successfully");
    } catch (err) {
      console.error("❌ Failed to generate token:", err);
      return;
    }

    // Connect to LiveKit
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
      await room.localParticipant.setCameraEnabled(true);
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (err) {
      console.error("❌ Failed to connect to LiveKit room:", err);
    }
  });

  onCleanup(() => {
    if (room) room.disconnect();
    const stream = localStream();
    if (stream) stream.getTracks().forEach((track) => track.stop());
  });

  // --- Button handlers ---
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
        console.error("❌ Failed to restart camera:", err);
      }
    } else {
      const stream = localStream();
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setLocalStream(null);
      }
      setParticipants((prev) => prev.filter((p) => p.id !== "local"));
      if (room) await room.localParticipant.setCameraEnabled(false);
      setIsCameraOff(true);
    }
  };

  // ----- Leave Call: close the window directly -----
  const leaveCall = () => {
    // Cleanup
    if (room) room.disconnect().catch(() => {});
    const stream = localStream();
    if (stream) stream.getTracks().forEach((track) => track.stop());
    // Close the current window
    getCurrentWindow().close();
  };

  // ----- Window control functions (for custom title bar) -----
  const minimizeWindow = () => {
    getCurrentWindow().minimize();
  };
  const maximizeWindow = () => {
    getCurrentWindow().toggleMaximize();
  };
  const closeWindow = () => {
    // Same cleanup as leaveCall
    if (room) room.disconnect().catch(() => {});
    const stream = localStream();
    if (stream) stream.getTracks().forEach((track) => track.stop());
    getCurrentWindow().close();
  };

  return (
    <div class="flex flex-col h-screen w-screen bg-slate-950 text-white select-none overflow-hidden">
      
      {/* ----- Custom Title Bar (for window without decorations) ----- */}
      <div 
        data-tauri-drag-region 
        class="h-10 bg-slate-950 flex items-center justify-between px-3 shrink-0 border-b border-slate-800/50"
      >
        <span class="text-xs text-gray-400 font-medium">VisualTalk Meeting</span>
        <div class="flex items-center space-x-2">
          <button 
            onClick={minimizeWindow}
            class="w-3.5 h-3.5 rounded-full bg-yellow-400 hover:bg-yellow-500 transition focus:outline-none"
            title="Minimize"
          />
          <button 
            onClick={maximizeWindow}
            class="w-3.5 h-3.5 rounded-full bg-green-400 hover:bg-green-500 transition focus:outline-none"
            title="Maximize"
          />
          <button 
            onClick={closeWindow}
            class="w-3.5 h-3.5 rounded-full bg-red-400 hover:bg-red-500 transition focus:outline-none"
            title="Close"
          />
        </div>
      </div>

      {/* ----- Existing Header (room info) ----- */}
      <header class="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 shrink-0">
        <h1 class="text-lg font-semibold tracking-wide">VisualTalk Meeting</h1>
        <div class="text-sm text-slate-400">Room: #{ROOM}</div>
      </header>

      {/* ----- Video Grid (main area) ----- */}
      <main class="flex-1 overflow-hidden">
        <VideoGrid participants={participants()} />
      </main>

      {/* ----- Footer Controls ----- */}
      <footer class="p-4 border-t border-slate-800 flex justify-center gap-4 bg-slate-900 shrink-0">
        <button
          onClick={toggleMute}
          class={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            isMuted() ? "bg-red-600 hover:bg-red-500" : "bg-slate-800 hover:bg-slate-700"
          }`}
        >
          {isMuted() ? "Unmute" : "Mute"}
        </button>
        <button
          onClick={toggleCamera}
          class={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            isCameraOff() ? "bg-red-600 hover:bg-red-500" : "bg-slate-800 hover:bg-slate-700"
          }`}
        >
          {isCameraOff() ? "Start Camera" : "Stop Camera"}
        </button>
        <button
          onClick={leaveCall}
          class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition"
        >
          Leave Call
        </button>
      </footer>
    </div>
  );
}