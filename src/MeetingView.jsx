import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useMediaDevices } from "./lib/useMediaDevices";
import { useLiveKitRoom } from "./lib/useLiveKitRoom";
import { useBackgroundEffects } from "./lib/useBackgroundEffects";
import { useRecording } from "./lib/useRecording";
import { requestMediaPermissions } from "./components/Permissions";
import { PreJoinScreen } from "./components/PreJoinScreen";
import { MeetingToolbar } from "./components/MeetingToolbar";
import { LeaveConfirmDialog } from "./components/LeaveConfirmDialog";
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

  onCleanup(() => {
    media.stopWatching();
    room.stopAllStreams();
    if (rec.isRecording()) rec.stopRecording();
    if (room.lkRoom()) room.lkRoom().disconnect();
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

  const confirmLeave = () => {
    setShowLeaveDialog(false);
    room.leaveCall();
  };

  const toggleChat = () => setChatOpen(!chatOpen());

  // ---- Recording handlers ----
  const handleStartRecording = async () => {
    const lkRoom = room.lkRoom();
    if (!lkRoom) return;
    await rec.startLocalRecording(lkRoom, roomName);
  };

  const handleStopRecording = async () => {
    await rec.stopRecording();
  };

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

      {/* Recording Error Toast */}
      <Show when={rec.recordingError()}>
        <div class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 text-red-200 text-sm px-4 py-2 rounded-lg shadow-lg border border-red-700/50 max-w-sm">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{rec.recordingError()}</span>
          </div>
        </div>
      </Show>
    </div>
  );
}

