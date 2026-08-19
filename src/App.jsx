import { createSignal, onMount, onCleanup } from "solid-js";
import { VideoGrid } from "./components/VideoGrid";
import "./App.css";

function App() {
  const [participants, setParticipants] = createSignal([]);
  let localStream = null;

  onMount(async () => {
    try {
      // Request camera and microphone permissions
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      // Add yourself to the participants list with the live stream
      setParticipants([
        {
          id: "local",
          name: "You (Local)",
          isLocal: true,
          isMuted: false,
          stream: localStream,
        },
      ]);
    } catch (err) {
      console.error("Error accessing media devices:", err);
    }
  });

  // Clean up tracks when app closes so the webcam light turns off
  onCleanup(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
  });

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
        <button class="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition">
          Mute
        </button>
        <button class="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition">
          Stop Camera
        </button>
        <button 
          onClick={() => window.close()}
          class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition"
        >
          Leave Call
        </button>
      </footer>
    </div>
  );
}

export default App;