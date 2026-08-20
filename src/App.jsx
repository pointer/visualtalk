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
  // ⚠️ REPLACE THIS with a secure token generator as soon as possible
  const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJBUElzakphYnFxVHhTbWgiLCJzdWIiOiJsb2NhbCIsImV4cCI6MTc4NzMxOTc1NSwibmJmIjoxNzg3MjI5NzU1LCJpYXQiOjE3ODcyMjk3NTUsImlkZW50aXR5IjoibG9jYWwiLCJ2aWRlbyI6eyJyb29tSm9pbiI6dHJ1ZSwicm9vbSI6ImdlbmVyYWwiLCJjYW5QdWJsaXNoIjp0cnVlLCJjYW5TdWJzY3JpYmUiOnRydWUsImNhblB1Ymxpc2hEYXRhIjp0cnVlfX0.Sv3mK0QPH_kQHAIq9t5lhajwXSmNf5GNPRh6irYJFfA";

  onMount(async () => {
    room = new Room();

    // --- Handle local track publishing to add yourself to grid ---
    room.on(RoomEvent.LocalTrackPublished, (track) => {
      if (track.kind === Track.Kind.Video) {
        setParticipants((prev) => [
          ...prev,
          {
            id: "local",
            name: "You (Local)",
            isLocal: true,
            videoTrack: track,
          },
        ]);
      }
    });

    // --- Handle remote participant video ---
    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Video) {
        setParticipants((prev) => [
          ...prev,
          {
            id: participant.identity,
            name: participant.name || participant.identity,
            isLocal: false,
            videoTrack: track,
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
      // Enable camera and mic
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

  // --- Button handlers ---
  const toggleMute = async () => {
    const micTrack = room.localParticipant.microphoneTrack;
    if (micTrack) {
      const newState = !micTrack.isEnabled;
      await micTrack.setEnabled(newState);
      setIsMuted(!newState); // true = muted
    }
  };

  const toggleCamera = async () => {
    const videoTrack = room.localParticipant.videoTrack;
    if (videoTrack) {
      const newState = !videoTrack.isEnabled;
      await videoTrack.setEnabled(newState);
      setIsCameraOff(!newState); // true = camera off
    }
  };

  const leaveCall = () => {
    getCurrentWindow().close();
  };

  return (
    <div class="flex flex-col h-screen w-screen bg-slate-950 text-white select-none">
      <header class="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
        <h1 class="text-lg font-semibold tracking-wide">VisualTalk Meeting</h1>
        <div class="text-sm text-slate-400">Room: general</div>
      </header>

      <main class="flex-1 overflow-hidden">
        <VideoGrid participants={participants()} />
      </main>

      <footer class="p-4 border-t border-slate-800 flex justify-center gap-4 bg-slate-900">
        <button
          onClick={toggleMute}
          class={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            isMuted()
              ? "bg-red-600 hover:bg-red-500"
              : "bg-slate-800 hover:bg-slate-700"
          }`}
        >
          {isMuted() ? "Unmute" : "Mute"}
        </button>
        <button
          onClick={toggleCamera}
          class={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            isCameraOff()
              ? "bg-red-600 hover:bg-red-500"
              : "bg-slate-800 hover:bg-slate-700"
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