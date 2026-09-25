import { createSignal, onMount } from "solid-js";
import { MainWindow } from "./MainWindow";
import { MeetingView } from "./MeetingView";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [showMeeting, setShowMeeting] = createSignal(false);

  // Expand state to hold all LiveKit connection details
  const [meetingData, setMeetingData] = createSignal({
    room: "general",
    token: null,
    url: null,
    identity: "Guest"
  });

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "meeting") {
      setShowMeeting(true);

      // Extract everything Rust passed us in the URL
      setMeetingData({
        room: params.get("room") || "general",
        token: params.get("token"),
        url: params.get("url"),
        identity: params.get("identity") || "Guest"
      });
    }
  });

  // UPDATED: Accepts the rich object from MainWindow
  const joinMeeting = async (data) => {
    try {

      console.log("Sending to Rust:", data);

      // Pass the whole object to Rust
      await invoke("open_meeting_window", {
        room: data.room,
        token: data.token,
        url: data.url,
        identity: data.identity
      });
    } catch (err) {
      console.error("Failed to open meeting window via Rust:", err);
    }
  };

  return (
    <>
      {showMeeting() ? (
        // Pass the full meeting data to the MeetingView
        <MeetingView meetingData={meetingData()} />
      ) : (
        <MainWindow onJoinMeeting={joinMeeting} />
      )}
    </>
  );
}

export default App;