import { createSignal, onMount } from "solid-js";
import { MainWindow } from "./MainWindow";
import { MeetingView } from "./MeetingView";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [view, setView] = createSignal("main");
  const [roomName, setRoomName] = createSignal("general");
  const [identity, setIdentity] = createSignal("You");

  onMount(async () => {
    try {
      const conf = await invoke("get_config");
      setIdentity(conf.identity || "You");
    } catch (err) {
      console.error("Failed to load config:", err);
    }
  });

  const joinMeeting = (room) => {
    setRoomName(room);
    setView("meeting");
  };

  const leaveMeeting = () => {
    setView("main");
  };

  return (
    <>
      {view() === "main" ? (
        <MainWindow onJoinMeeting={joinMeeting} userIdentity={identity()} />
      ) : (
        <MeetingView roomName={roomName()} onLeave={leaveMeeting} />
      )}
    </>
  );
}

export default App;