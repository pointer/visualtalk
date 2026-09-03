import { createSignal, onMount } from "solid-js";
import {MainWindow} from "./MainWindow";
import { MeetingView } from "./MeetingView";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [showMeeting, setShowMeeting] = createSignal(false);
  const [roomName, setRoomName] = createSignal("general");

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "meeting") {
      setShowMeeting(true);
      setRoomName(params.get("room") || "general");
    }
  });

  const joinMeeting = async (room) => {
    try {
      await invoke("open_meeting_window", { room });
    } catch (err) {
      console.error("Failed to open meeting window via Rust:", err);
    }
  };

  return (
    <>
      {showMeeting() ? (
        <MeetingView roomName={roomName()} />
      ) : (
        <MainWindow onJoinMeeting={joinMeeting} />
      )}
    </>
  );
}

export default App;