
import { createSignal, onMount, onCleanup } from "solid-js";
import { Room, RoomEvent, Track } from "livekit-client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { VideoGrid } from "./components/VideoGrid";
import "./App.css";

function App() {
  const [participants, setParticipants] = createSignal([]);
  const [isMuted, setIsMuted] = createSignal(false);
  const [isCameraOff, setIsCameraOff] = createSignal(false);
  let room;

  const LIVEKIT_URL = "wss://visual-talk-84j2fcwy.livekit.cloud";
  const TOKEN = "YOUR OWN TOKEB";

  onMount(async () => {
    room = new Room();

    // --- Local participant preview ---
    room.on(RoomEvent.LocalTrackPublished, (track) => {
      if (track.kind === Track.Kind.Video) {
        setParticipants((prev) => {
          if (prev.some(p => p.id === 'local')) return prev;
          return [...prev, {
            id: 'local',
            name: 'You (Local)',
            isLocal: true,
            videoTrack: track, // publication
          }];
        });
      }
    });

    // --- Remote participants ---
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
      await room.localParticipant.setCameraEnabled(true);
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (err) {
      console.error("Failed to connect to LiveKit room:", err);
    }
  });

  onCleanup(() => {
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
    if (!room) return;
    const newOffState = !isCameraOff();
    // Toggle camera state
    await room.localParticipant.setCameraEnabled(!newOffState);
    setIsCameraOff(newOffState);

    // 🔥 Refresh local participant entry to force video re-attachment
    const currentVideoPub = room.localParticipant.videoTrack; // get fresh publication
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === 'local'
          ? { ...p, videoTrack: currentVideoPub } // new object -> triggers re-render
          : p
      )
    );
  };

  const leaveCall = async () => {
    if (room) {
      try { await room.disconnect(); } catch (e) {}
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