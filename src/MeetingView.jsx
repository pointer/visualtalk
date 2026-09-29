import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useMediaDevices } from "./lib/useMediaDevices";
import { useLiveKitRoom } from "./lib/useLiveKitRoom";
import { useBackgroundEffects } from "./lib/useBackgroundEffects";
import { requestMediaPermissions } from "./components/Permissions";
import { PreJoinScreen } from "./components/PreJoinScreen";
import { MeetingToolbar } from "./components/MeetingToolbar";
import { LeaveConfirmDialog } from "./components/LeaveConfirmDialog";
import { VideoGrid } from "./components/VideoGrid";
import { ChatPanel } from "./components/ChatPanel";

/**
 * MeetingView — clean orchestrator.
 * Delegates all heavy logic to composables and renders extracted UI components.
 */
export function MeetingView(props) {
  const { room: roomName, token, url, identity } = props.meetingData;

  // ---- UI state (owned by this component) ----
  const [preJoin, setPreJoin] = createSignal(true);
  const [isConnecting, setIsConnecting] = createSignal(false);
  const [showLeaveDialog, setShowLeaveDialog] = createSignal(false);
  const [chatOpen, setChatOpen] = createSignal(false);
  const [alwaysShowPreview, setAlwaysShowPreview] = createSignal(true);

  // ---- Composables ----
  const media = useMediaDevices();
  const room = useLiveKitRoom();
  const bg = useBackgroundEffects();

  // ---- DOM ref for background effect preview ----
  let previewVideoEl = null;

  // ---- Lifecycle ----
  onMount(async () => {
    const status = await requestMediaPermissions();
    if (!status.camera || !status.microphone) {
      console.error("Permissions required");
      return;
    }
    await room.startPreview(media.selectedMic(), media.selectedCam());
    await media.loadDevices();
    bg.loadSavedBackground(previewVideoEl);
  });

  onCleanup(() => {
    room.stopAllStreams();
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
      });
    } catch (err) {
      console.error("Failed to join meeting:", err);
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

  // ---- Render ----
  return (
    <div class="flex flex-col h-screen w-full bg-[#1a1a1a] text-white select-none overflow-hidden">
      <Show when={preJoin()} fallback={
        /* ===== In-Meeting View ===== */
        <div class="flex flex-1 overflow-hidden">
          {/* Video Grid + Toolbar */}
          <div class="flex-1 flex flex-col overflow-hidden bg-[#0f0f0f]">
            <header class="px-3 sm:px-4 py-2 sm:py-4 border-b border-[#2a2a2a] flex justify-between items-center bg-[#1a1a1a]/80 shrink-0">
              <h1 class="text-base sm:text-lg font-semibold tracking-wide">VisualTalk Meeting</h1>
              <div class="text-xs sm:text-sm text-gray-400">#{roomName}</div>
              <span class="text-sm text-gray-400">Joined as: {identity}</span>
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
                onToggleMute={room.toggleMute}
                onToggleCamera={room.toggleCamera}
                onToggleScreenShare={room.toggleScreenShare}
                onToggleHand={() => room.toggleHand(identity)}
                onToggleChat={toggleChat}
                onLeave={handleCloseClick}
              />
            </footer>
          </div>

          {/* Chat Sidebar */}
          <Show when={chatOpen()}>
            <ChatPanel room={room.lkRoom()} onClose={toggleChat} displayName={identity} />
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
    </div>
  );
}

