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

  // We'll use the room name from props
  const ROOM = props.roomName || "general";

  onMount(async () => {
    // --- Load config from Rust ---
    let conf;
    try {
      conf = await invoke("get_config");
      console.log("✅ Config loaded:", conf);
    } catch (err) {
      console.error("❌ Failed to load config:", err);
      return;
    }

    const LIVEKIT_URL = conf.livekit_url;
    const API_KEY = conf.api_key;
    const IDENTITY = conf.identity;

    // --- Start local preview ---
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

    // --- Request token from Rust ---
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

    // --- Connect to LiveKit ---
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

  const leaveCall = () => {
    // Cleanup and return to main window
    if (room) room.disconnect().catch(() => {});
    const stream = localStream();
    if (stream) stream.getTracks().forEach((track) => track.stop());
    props.onLeave(); // 👈 call the parent's handler to switch view
  };

  return (
    <div class="flex flex-col h-screen w-screen bg-slate-950 text-white select-none">
      <header class="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
        <h1 class="text-lg font-semibold tracking-wide">VisualTalk Meeting</h1>
        <div class="text-sm text-slate-400">Room: #{ROOM}</div>
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