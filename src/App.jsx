import conf from "../conf.json";
import { createSignal, onMount, onCleanup } from "solid-js";
import { Room, RoomEvent, Track } from "livekit-client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { VideoGrid } from "./components/VideoGrid";
import "./App.css";

function App() {
  const [participants, setParticipants] = createSignal([]);
  const [isMuted, setIsMuted] = createSignal(false);
  const [isCameraOff, setIsCameraOff] = createSignal(false);
  const [localStream, setLocalStream] = createSignal(null); // 👈 direct stream for preview
  let room;

  const LIVEKIT_URL = conf.LIVEKIT_URL;
  const TOKEN = conf.TOKEN;

  // Function to get a fresh local stream
  const getLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      return stream;
    } catch (err) {
      console.error("Failed to get local media:", err);
      throw err;
    }
  };

  // Start/stop local preview (independent of LiveKit)
  const startLocalPreview = async () => {
    try {
      const stream = await getLocalMedia();
      setLocalStream(stream);
      // Add/update local participant in the grid
      setParticipants((prev) => {
        const existing = prev.find(p => p.id === 'local');
        if (existing) {
          return prev.map(p => p.id === 'local' ? { ...p, stream } : p);
        }
        return [...prev, { id: 'local', name: 'You (Local)', isLocal: true, stream }];
      });
      setIsCameraOff(false);
    } catch (err) {
      console.error("Error starting local preview:", err);
      setIsCameraOff(true);
    }
  };

  const stopLocalPreview = () => {
    const stream = localStream();
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    // Remove local participant from grid
    setParticipants(prev => prev.filter(p => p.id !== 'local'));
    setIsCameraOff(true);
  };

  onMount(async () => {
    // Start local preview immediately
    await startLocalPreview();

    // Connect to LiveKit
    room = new Room();

    // Only handle remote participants – local is handled separately
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
      await room.connect(LIVEKIT_URL, TOKEN);
      // Enable camera & mic for publishing to others (not for preview)
      await room.localParticipant.setCameraEnabled(true);
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (err) {
      console.error("Failed to connect to LiveKit room:", err);
    }
  });

  onCleanup(() => {
    // Clean up local stream
    const stream = localStream();
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (room) {
      room.disconnect();
    }
  });

  // --- Button Handlers ---

  const toggleMute = async () => {
    if (!room) return;
    const newMutedState = !isMuted();
    await room.localParticipant.setMicrophoneEnabled(!newMutedState);
    setIsMuted(newMutedState);
  };

  const toggleCamera = async () => {
    if (isCameraOff()) {
      // Turn on: start preview and also enable LiveKit camera
      await startLocalPreview();
      if (room) {
        await room.localParticipant.setCameraEnabled(true);
      }
    } else {
      // Turn off: stop preview and disable LiveKit camera
      stopLocalPreview();
      if (room) {
        await room.localParticipant.setCameraEnabled(false);
      }
    }
  };

  const leaveCall = async () => {
    if (room) {
      try { await room.disconnect(); } catch (e) {}
    }
    const stream = localStream();
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    try {
      await getCurrentWindow().close();
    } catch (e) {
      window.close();
    }
  };

  return (
    <div class="flex flex-col h-screen w-screen bg-slate-950 text-white select-none">
      <header class="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
        <h1 class="text-lg font-semibold tracking-wide">VisualTalk Meeting</h1>
        <div class="text-sm text-slate-400">Room: #general</div>
      </header>

      <main class="flex-1 overflow-hidden">
        <VideoGrid participants={participants()} />
      </main>

      <footer class="p-4 border-t border-slate-800 flex justify-center gap-4 bg-slate-900">
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

export default App;