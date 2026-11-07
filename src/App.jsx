import { createSignal, onMount, lazy, Suspense, ErrorBoundary } from "solid-js";
import { MainWindow } from "./MainWindow";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

const MeetingView = lazy(() => import("./MeetingView"));

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
        <ErrorBoundary
          fallback={(error) => (
            <div class="flex h-full flex-col items-center justify-center gap-3 bg-[#111111] p-6 text-center text-white">
              <p>Could not load the meeting.</p>
              <p class="text-sm text-gray-400">{String(error)}</p>
              <button
                onClick={() => window.location.reload()}
                class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700"
              >
                Reload
              </button>
            </div>
          )}
        >
          <Suspense
            fallback={
              <div class="flex h-full items-center justify-center bg-[#111111] text-gray-300">
                Loading meeting…
              </div>
            }
          >
            <MeetingView meetingData={meetingData()} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <MainWindow onJoinMeeting={joinMeeting} />
      )}
    </>
  );
}

export default App;