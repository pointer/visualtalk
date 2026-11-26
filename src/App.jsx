import { createSignal, onMount, onCleanup, lazy, Suspense, ErrorBoundary } from "solid-js";
import { MainWindow } from "./MainWindow";
import { invoke } from "./lib/ipc";
import { IS_MOBILE } from "./lib/platform";
import { IS_PRO_EDITION } from "./lib/edition";
import { initDeepLinks } from "./lib/deepLink";
import EfficiencyStats from "./components/EfficiencyStats";
import "./App.css";

const MeetingView = lazy(() => import("./MeetingView"));

const FRAME_COLORS = { blue: "#3b82f6", red: "#ef4444", yellow: "#eab308" };

/** Transparent, click-through overlay that frames the shared display. */
function PresentingFrame(props) {
  const color = FRAME_COLORS[props.color] || FRAME_COLORS.blue;
  return (
    <div
      style={{
        position: "fixed",
        inset: "0",
        "pointer-events": "none",
        background: "transparent",
        border: `6px solid ${color}`,
        "box-sizing": "border-box",
      }}
    />
  );
}

function App() {
  const [showMeeting, setShowMeeting] = createSignal(false);
  const [frameColor, setFrameColor] = createSignal("");
  // Set once the deep-link subscription is up; unsubscribes on teardown.
  let stopDeepLinks = () => {};

  // Expand state to hold all LiveKit connection details
  const [meetingData, setMeetingData] = createSignal({
    room: "general",
    token: null,
    url: null,
    identity: "Guest",
    displayName: "Guest",
  });

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "presenting-frame") {
      setFrameColor(params.get("color") || "blue");
      for (const el of [
        document.documentElement,
        document.body,
        document.getElementById("root"),
      ]) {
        if (el) el.style.background = "transparent";
      }
      return;
    }
    if (params.get("mode") === "meeting") {
      setShowMeeting(true);

      // Extract everything Rust passed us in the URL
      setMeetingData({
        room: params.get("room") || "general",
        token: params.get("token"),
        url: params.get("url"),
        identity: params.get("identity") || "Guest",
        displayName: params.get("displayName") || params.get("identity") || "Guest",
      });
      // A meeting window must not steal invite links from the main window.
      return;
    }

    // Main window: `visualtalk://join?…` opens the Join dialog (ADR 0007).
    initDeepLinks().then((stop) => {
      stopDeepLinks = stop;
    });
  });

  onCleanup(() => stopDeepLinks());

  // UPDATED: Accepts the rich object from MainWindow
  const joinMeeting = async (data) => {
    // Android/iOS are single-Activity: Tauri cannot spawn a second window, and
    // the one spawn_meeting_window creates there never surfaces (it rendered
    // as a ghost behind the dashboard). Render MeetingView in place instead -
    // the same component the desktop meeting window loads via ?mode=meeting.
    if (IS_MOBILE) {
      setMeetingData(data);
      setShowMeeting(true);
      return;
    }
    try {
      // Pass the whole object to Rust
      await invoke("open_meeting_window", {
        room: data.room,
        token: data.token,
        url: data.url,
        identity: data.identity,
        displayName: data.displayName,
      });
    } catch (err) {
      console.error("Failed to open meeting window via Rust:", err);
    }
  };

  if (frameColor()) {
    return <PresentingFrame color={frameColor()} />;
  }

  return (
    <>
      {/* Pro-only energy overlay: the Rust command answers on mobile only and
          errors elsewhere, and the CE bundle dead-code-eliminates this node. */}
      {IS_PRO_EDITION ? <EfficiencyStats /> : null}
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
            <MeetingView meetingData={meetingData()} onExit={() => setShowMeeting(false)} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <MainWindow onJoinMeeting={joinMeeting} />
      )}
    </>
  );
}

export default App;