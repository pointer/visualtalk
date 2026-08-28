import { createSignal, onMount } from "solid-js";
import { MainWindow } from "./MainWindow";
import { MeetingView } from "./MeetingView";
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [identity, setIdentity] = createSignal("You");
  const [showMeeting, setShowMeeting] = createSignal(false);
  const [roomName, setRoomName] = createSignal("general");

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'meeting') {
      setShowMeeting(true);
      setRoomName(params.get('room') || 'general');
    } else {
      // Load config for main window
      try {
        const conf = await invoke("get_config");
        setIdentity(conf.identity || "You");
      } catch (err) {
        console.error("Failed to load config:", err);
      }
    }
  });

const joinMeeting = (room) => {
  console.log('joinMeeting called with room:', room);
  const url = new URL(window.location.href);
  url.searchParams.set('mode', 'meeting');
  url.searchParams.set('room', room);
  const label = `meeting-${Date.now()}`;
  console.log('Creating window with URL:', url.toString());
  try {
    const win = new WebviewWindow(label, {
      url: url.toString(),
      width: 1200,
      height: 800,
      title: 'VisualTalk Meeting',
      resizable: true,
      fullscreen: false,
      center: true,
      decorations: false,
    });
    win.once('tauri://error', (err) => console.error('Window error:', err));
  } catch (err) {
    console.error('Error creating window:', err);
  }
};

  return (
    <>
      {showMeeting() ? (
        <MeetingView roomName={roomName()} onLeave={() => {}} />
      ) : (
        <MainWindow onJoinMeeting={joinMeeting} userIdentity={identity()} />
      )}
    </>
  );
}

export default App;