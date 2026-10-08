import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMediaDevices } from "./lib/useMediaDevices";
import { useLiveKitRoom } from "./lib/useLiveKitRoom";
import { useBackgroundEffects } from "./lib/useBackgroundEffects";
import { useRecording } from "./lib/useRecording";
import { requestMediaPermissions } from "./components/Permissions";
import { PreJoinScreen } from "./components/PreJoinScreen";
import { MeetingToolbar } from "./components/MeetingToolbar";
import { LeaveConfirmDialog } from "./components/LeaveConfirmDialog";
import { RecordConfirmDialog } from "./components/RecordConfirmDialog";
import { RecordingBanner } from "./components/RecordingBanner";
import { VideoGrid } from "./components/VideoGrid";
import { ChatPanel } from "./components/ChatPanel";
import { useI18n } from "./i18n/I18nProvider";

/**
 * MeetingView — clean orchestrator.
 * Delegates all heavy logic to composables and renders extracted UI components.
 */
export function MeetingView(props) {
  const { t, locale } = useI18n();
  const { room: roomName, token, url, identity } = props.meetingData;

  // ---- UI state (owned by this component) ----
  const [preJoin, setPreJoin] = createSignal(true);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [showLeaveDialog, setShowLeaveDialog] = createSignal(false);
  const [chatOpen, setChatOpen] = createSignal(false);
  const [alwaysShowPreview, setAlwaysShowPreview] = createSignal(true);
  const [e2eeActive, setE2eeActive] = createSignal(false);
  const [permissionError, setPermissionError] = createSignal("");
  // Recording consent dialog + "saved to disk" confirmation.
  const [recordDialogOpen, setRecordDialogOpen] = createSignal(false);
  const [recordingSaved, setRecordingSaved] = createSignal("");
  // True when a recording we were making did not survive to disk.
  const [recordingFailed, setRecordingFailed] = createSignal(false);
  let savedToastTimer = null;
  // Id of the recording we started; needed to withdraw the notice on stop.
  let activeRecordingId = null;

  // ---- Composables ----
  const media = useMediaDevices();
  const room = useLiveKitRoom();
  const bg = useBackgroundEffects();
  const rec = useRecording();

  // ---- DOM ref for background effect preview ----
  let previewVideoEl = null;

  // ---- Lifecycle ----
  onMount(async () => {
    const status = await requestMediaPermissions();
    if (!status.camera || !status.microphone) {
      // Show the reason instead of leaving the user staring at a black preview.
      console.error("Media permission problem:", status);
      setPermissionError(
        status.message ||
          `Missing permission: ${!status.camera ? "camera " : ""}${!status.microphone ? "microphone" : ""}`
      );
    }
    // Enumerate first so the preview uses real selected device ids.
    await media.loadDevices();
    await room.startPreview(media.selectedMic(), media.selectedCam());
    bg.loadSavedBackground(previewVideoEl);
    rec.checkFfmpeg();
  });

  // ---- Window close ----
  // Closing the window (traffic-light button, Cmd+W, Alt+F4) destroys the
  // webview immediately. That used to discard the recorder's final
  // dataavailable chunk and skip finalize_recording entirely, so a recording
  // made right before closing simply did not exist afterwards. Intercept the
  // close, flush the recording to disk, and only then really close.
  let unlistenClose = null;
  let closing = false;

  onMount(() => {
    try {
      unlistenClose = getCurrentWindow().onCloseRequested(async (event) => {
        if (closing) return; // second pass — let the window go
        if (!rec.isRecording()) return; // nothing to flush, close normally

        event.preventDefault();
        closing = true;
        try {
          // Bounded so a wedged recorder can never trap the user in a window
          // that refuses to close.
          await Promise.race([
            stopRecordingAndNotify(),
            new Promise((resolve) => setTimeout(resolve, 8000)),
          ]);
        } catch (err) {
          console.error("[recording] flush on window close failed:", err);
        }
        // destroy() does not re-emit close-requested, so this cannot loop.
        // Requires core:window:allow-destroy in src-tauri/capabilities;
        // Tauri's onCloseRequested wrapper also falls back to destroy() for
        // any close we do not prevent, so the permission is mandatory here.
        try {
          await getCurrentWindow().destroy();
        } catch (err) {
          console.error("[meeting] window destroy denied/failed:", err);
        }
      });
    } catch (err) {
      // Non-Tauri context (plain browser dev): nothing to intercept.
      console.warn("[meeting] window close handler unavailable:", err);
    }
  });

  onCleanup(() => {
    // Last-resort teardown for unmounts that did not go through confirmLeave().
    // Nothing can be awaited here, but the order still matters a great deal:
    // stopAllStreams() kills the very tracks the recorder reads from, so it has
    // to run *after* the recorder has emitted and flushed its final chunk.
    if (rec.isRecording()) rec.stopRecording();
    media.stopWatching();
    room.stopAllStreams();
    if (room.lkRoom()) room.lkRoom().disconnect();
    if (savedToastTimer) clearTimeout(savedToastTimer);
    // onCloseRequested() resolves to the unlisten function, not to one directly.
    if (unlistenClose) {
      Promise.resolve(unlistenClose)
        .then((un) => un && un())
        .catch(() => {});
    }
  });

  // ---- Event handlers ----
  const handleDeviceChange = async (type, deviceId) => {
    if (type === "audio") media.setSelectedMic(deviceId);
    else media.setSelectedCam(deviceId);
    await room.startPreview(media.selectedMic(), media.selectedCam());
  };

  const handleJoin = async () => {
    setIsConnecting(true);
    setPreJoin(false);
    try {
      await room.connectToMeeting({
        identity,
        roomName,
        micId: media.selectedMic(),
        camId: media.selectedCam(),
        token,
        url,
      });
      // Join succeeded — clear stale permission warnings.
      setPermissionError("");
    } catch (err) {
      console.error("Failed to join meeting:", err);
      // connectToMeeting sets room.connectionError() for known failure modes;
      // this catches anything that slipped through.
      if (!room.connectionError()) {
        room.setConnectionError(
          `Failed to join the meeting: ${err && err.message ? err.message : err}`
        );
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCloseClick = () => {
    if (preJoin()) {
      room.leaveCall();
    } else {
      setShowLeaveDialog(true);
    }
  };

  const confirmLeave = async () => {
    setShowLeaveDialog(false);
    // Flush the recording while its tracks are still live. leaveCall() closes
    // this window, and a closed window cannot finish an async recorder stop.
    await stopRecordingAndNotify();
    await room.leaveCall();
  };

  const toggleChat = () => setChatOpen(!chatOpen());

  // ---- Recording handlers ----
  // Recording always goes through two steps: tell the person pressing the
  // button what is about to happen, then tell the room that it is happening.

  /** Surface the absolute path of a preserved recording for a few seconds. */
  const announceSavedRecording = (path) => {
    setRecordingSaved(path);
    if (savedToastTimer) clearTimeout(savedToastTimer);
    savedToastTimer = setTimeout(() => setRecordingSaved(""), 6000);
  };

  /**
   * Stop the recorder, wait for the tail of the file to reach disk, then
   * withdraw the "being recorded" notice in everyone else's client.
   *
   * This has to run before the media tracks are stopped and before the webview
   * closes: stopAllStreams() kills the very tracks the recorder reads from, and
   * a closing window discards the recorder's final dataavailable chunk and
   * skips finalize_recording entirely — which is why recordings used to vanish.
   */
  const stopRecordingAndNotify = async () => {
    if (!rec.isRecording()) return null;
    const lkRoom = room.lkRoom();
    const mode = rec.recordingMode();

    const savedTo = await rec.stopRecording();
    // stopRecording() returns an absolute path for local recordings and an
    // egress info object for server-side ones — only a path is worth showing.
    if (typeof savedTo === "string" && savedTo) {
      announceSavedRecording(savedTo);
      setRecordingFailed(false);
    } else {
      // Nothing came back: the recording was not preserved. useRecording has
      // usually set a technical reason already; the toast falls back to the
      // localized message when it has not.
      setRecordingFailed(true);
    }

    if (lkRoom) {
      await room.broadcastRecording(false, {
        recordingId: activeRecordingId,
        mode: mode || "local",
        startedBy: identity,
        name: identity,
      });
    }
    activeRecordingId = null;
    return savedTo;
  };

  const handleStartRecording = () => setRecordDialogOpen(true);

  const confirmStartRecording = async () => {
    setRecordDialogOpen(false);
    const lkRoom = room.lkRoom();
    if (!lkRoom) return;

    const id = await rec.startLocalRecording(lkRoom, roomName);
    if (!id) return; // startLocalRecording already surfaced the reason

    setRecordingFailed(false);
    activeRecordingId = id;
    // Inform the room. useLiveKitRoom replays this to anyone who joins later and
    // raises connectionError if the notice could not be delivered at all.
    await room.broadcastRecording(true, {
      recordingId: id,
      mode: "local",
      startedBy: identity,
      name: identity,
    });
  };

  const handleStopRecording = () => stopRecordingAndNotify();

  // ---- Render ----
  return (
    <div class="flex flex-col h-screen w-full bg-[#1a1a1a] text-white select-none overflow-hidden">
      <Show when={preJoin()} fallback={
        /* ===== In-Meeting View ===== */
        <div class="flex flex-1 overflow-hidden">
          {/* Video Grid + Toolbar */}
          <div class="flex-1 flex flex-col overflow-hidden bg-[#0f0f0f]">
            <header class="px-3 sm:px-4 py-2 sm:py-4 border-b border-[#2a2a2a] flex justify-between items-center bg-[#1a1a1a]/80 shrink-0">
              <h1 class="text-base sm:text-lg font-semibold tracking-wide">{t("meeting.title")}</h1>
              <div class="flex items-center gap-3">
                <Show when={rec.isRecording()}>
                  <div class="flex items-center gap-1.5 px-2 py-0.5 bg-red-600/20 rounded-full border border-red-500/30">
                    <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span class="text-xs text-red-400 font-medium tabular-nums">{rec.formatDuration()}</span>
                  </div>
                </Show>
                <div class="text-xs sm:text-sm text-gray-400">#{roomName}</div>
              </div>
              <span class="text-sm text-gray-400">{t("meeting.joinedAs")} {identity}</span>
            </header>

            {/* Recording notice. Shown to every participant — including the one
                who pressed Record and anyone who joins mid-meeting — because a
                recording nobody can see is a covert recording. Deliberately not
                dismissible, so it stays up for as long as the file grows. */}
            <Show when={rec.isRecording() || room.remoteRecording()}>
              <RecordingBanner
                isSelf={rec.isRecording()}
                startedBy={room.remoteRecording()?.name}
                duration={rec.formatDuration}
              />
            </Show>

            <main class="flex-1 overflow-hidden">
              <VideoGrid participants={room.participants()} raisedHands={room.raisedHands()} />
            </main>

            {/* Action Bar */}
            <footer class="border-t border-[#2a2a2a] bg-[#1c1c1c] shrink-0 w-full px-1 pt-3 pb-[4rem] sm:py-4 shadow-xl z-10">
              <MeetingToolbar
                isMuted={room.isMuted}
                isCameraOff={room.isCameraOff}
                isSharingScreen={room.isSharingScreen}
                isHandRaised={room.isHandRaised}
                chatOpen={chatOpen}
                e2eeActive={e2eeActive}
                isRecording={rec.isRecording}
                recordingDuration={rec.formatDuration}
                onToggleMute={room.toggleMute}
                onToggleCamera={room.toggleCamera}
                onToggleScreenShare={room.toggleScreenShare}
                onToggleHand={() => room.toggleHand(identity)}
                onToggleChat={toggleChat}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                onLeave={handleCloseClick}
              />
            </footer>
          </div>

          {/* Chat Sidebar */}
          <Show when={chatOpen()}>
            <ChatPanel room={room.lkRoom()} onClose={toggleChat} displayName={identity} onE2EEStatus={setE2eeActive} />
          </Show>
        </div>
      }>
        {/* ===== Pre-Join Screen ===== */}
        <PreJoinScreen
          onVideoRef={(el) => { previewVideoEl = el; }}
          previewVideoEnabled={room.previewVideoEnabled}
          previewAudioEnabled={room.previewAudioEnabled}
          previewStream={room.previewStream}
          devices={media.devices}
          selectedMic={media.selectedMic}
          selectedCam={media.selectedCam}
          alwaysShowPreview={alwaysShowPreview}
          isConnecting={isConnecting}
          identity={identity}
          backgroundsOpen={bg.backgroundsOpen}
          background={bg.background}
          onTogglePreviewAudio={() => room.togglePreviewAudio(media.selectedMic(), media.selectedCam())}
          onTogglePreviewVideo={() => room.togglePreviewVideo(media.selectedMic(), media.selectedCam())}
          onDeviceChange={handleDeviceChange}
          onToggleAlwaysShow={() => setAlwaysShowPreview(!alwaysShowPreview())}
          onJoin={handleJoin}
          onToggleBackgrounds={bg.toggleBackgroundsPanel}
          onSelectBackground={(effect) => bg.selectBackground(effect, previewVideoEl)}
        />
      </Show>

      {/* Leave Confirmation Dialog */}
      <Show when={showLeaveDialog()}>
        <LeaveConfirmDialog
          onCancel={() => setShowLeaveDialog(false)}
          onConfirm={confirmLeave}
        />
      </Show>

      {/* Recording Consent Dialog — spells out that every participant will be
          notified before the recorder actually starts. */}
      <Show when={recordDialogOpen()}>
        <RecordConfirmDialog
          onCancel={() => setRecordDialogOpen(false)}
          onConfirm={confirmStartRecording}
        />
      </Show>

      {/* Permission / Connection Error Banner */}
      <Show when={permissionError() || room.connectionError() || media.deviceError()}>
        <div class="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-[92%] max-w-2xl bg-red-950/95 text-red-100 text-xs sm:text-sm px-4 py-2.5 rounded-lg shadow-xl border border-red-700/60 flex items-start gap-2">
          <span class="shrink-0 leading-5">⚠️</span>
          <div class="flex-1 leading-5">
            {room.connectionError() || permissionError() || media.deviceError()}
          </div>
          <button
            onClick={() => {
              setPermissionError("");
              room.clearConnectionError();
            }}
            class="shrink-0 text-red-300 hover:text-white text-base leading-none px-1"
          >
            ✕
          </button>
        </div>
      </Show>

      {/* Autoplay-blocked prompt: WKWebView/Safari refuse to play remote audio
          until the page has seen a user gesture — clicking this retries it. */}
      <Show when={!preJoin() && room.audioBlocked()}>
        <div class="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] w-[92%] max-w-sm">
          <button
            type="button"
            onClick={() => room.resumeAudio()}
            class="w-full flex items-center justify-center gap-2 bg-amber-600/95 hover:bg-amber-500 text-white text-xs sm:text-sm font-medium px-4 py-2.5 rounded-lg shadow-xl border border-amber-400/60"
          >
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M9 15H5a1 1 0 01-1-1v-4a1 1 0 011-1h4l4-4v14l-4-4z" />
            </svg>
            <span>{t("meeting.audioBlocked")}</span>
            <span class="underline">{t("meeting.enableAudio")}</span>
          </button>
        </div>
      </Show>

      {/* Recording Error Toast */}
      <Show when={rec.recordingError() || recordingFailed()}>
        <div class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 text-red-200 text-sm px-4 py-2 rounded-lg shadow-lg border border-red-700/50 max-w-sm">
          <div class="flex items-start gap-2">
            <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="leading-5">
              {/* The technical reason wins when we have one; otherwise say plainly
                  that the recording was not preserved. */}
              {rec.recordingError() || t("recording.notPreserved")}
            </span>
          </div>
        </div>
      </Show>
      {/* Recording Saved Confirmation — positive proof the file was preserved,
          with the absolute path so the user can actually find it. */}
      <Show when={recordingSaved()}>
        <div class="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 bg-[#1c1c1c] text-gray-200 text-xs px-4 py-2.5 rounded-lg shadow-lg border border-emerald-600/40 max-w-md">
          <div class="flex items-start gap-2">
            <svg class="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <span class="leading-5 break-all">
              {t("recording.saved")}{" "}
              <span class="text-emerald-300">{recordingSaved()}</span>
            </span>
          </div>
        </div>
      </Show>
    </div>
  );
}

