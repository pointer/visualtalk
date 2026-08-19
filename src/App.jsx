import { createSignal } from "solid-js";
import logo from "./assets/logo.svg";
import { invoke } from "@tauri-apps/api/core";
import { VideoGrid } from "./components/VideoGrid";
import "./App.css";

function App() {
  // Mock participants to test the grid layout
  const [participants, setParticipants] = createSignal([
    { id: "1", name: "You (Local)", isLocal: true, isMuted: false },
    { id: "2", name: "Jane Doe", isLocal: false, isMuted: true },
  ]);

  return (
    <div class="flex flex-col h-screen w-screen bg-slate-950 text-white">
      <header class="p-4 border-b border-slate-800 flex justify-between items-center">
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
        <button class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm font-medium transition">
          Leave Call
        </button>
      </footer>
    </div>
  );
}

export default App;