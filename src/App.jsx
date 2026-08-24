import { createSignal } from "solid-js";
import { MainWindow } from "./MainWindow";
import { MeetingView } from "./MeetingView";
import "./App.css";

function App() {
  const [view, setView] = createSignal("main"); // "main" | "meeting"
  const [roomName, setRoomName] = createSignal("general");

  // Functions to switch views
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
        <MainWindow onJoinMeeting={joinMeeting} />
      ) : (
        <MeetingView roomName={roomName()} onLeave={leaveMeeting} />
      )}
    </>
  );
}

export default App;