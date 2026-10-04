import { createSignal } from "solid-js";
import { Room, RoomEvent, Track } from "livekit-client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

/**
 * Composable for LiveKit Room lifecycle, participants, and meeting actions.
 * Owns all Room-related state and all in-meeting toggle actions.
 */
export function useLiveKitRoom() {
  // ---- Room & participant signals ----
  const [lkRoom, setLkRoom] = createSignal(null);
  const [participants, setParticipants] = createSignal([]);
  const [localStream, setLocalStream] = createSignal(null);
  const [previewStream, setPreviewStream] = createSignal(null);

  // ---- Preview toggle signals ----
  const [previewAudioEnabled, setPreviewAudioEnabled] = createSignal(true);
  const [previewVideoEnabled, setPreviewVideoEnabled] = createSignal(true);

  // ---- In-meeting state signals ----
  const [isMuted, setIsMuted] = createSignal(false);
  const [isCameraOff, setIsCameraOff] = createSignal(false);
  const [isSharingScreen, setIsSharingScreen] = createSignal(false);
  const [isHandRaised, setIsHandRaised] = createSignal(false);
  const [raisedHands, setRaisedHands] = createSignal([]);

  // Track current room name so leaveCall can emit the meeting-ended event.
  const [currentRoom, setCurrentRoom] = createSignal(null);

  // ---- Preview: get a local MediaStream for the pre-join video preview ----
  const startPreview = async (micId, camId) => {
    try {
      const existing = previewStream();
      if (existing) existing.getTracks().forEach((t) => t.stop());

      const constraints = {
        video: previewVideoEnabled() && camId
          ? { deviceId: { exact: camId } }
          : previewVideoEnabled(),
        audio: previewAudioEnabled() && micId
          ? { deviceId: { exact: micId } }
          : previewAudioEnabled(),
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setPreviewStream(stream);
    } catch (err) {
      console.error("Failed to start preview:", err);
    }
  };

  // ---- Toggle preview audio (pre-join only) ----
  const togglePreviewAudio = async (micId, camId) => {
    const newState = !previewAudioEnabled();
    setPreviewAudioEnabled(newState);
    await startPreview(micId, camId);
  };

  // ---- Toggle preview video (pre-join only) ----
  const togglePreviewVideo = async (micId, camId) => {
    const newState = !previewVideoEnabled();
    setPreviewVideoEnabled(newState);
    await startPreview(micId, camId);
  };

  // ---- Connect to LiveKit meeting ----
  const connectToMeeting = async ({ identity, roomName, micId, camId }) => {
    // Store room name for the meeting-ended event on leave.
    setCurrentRoom(roomName);
    // Stop preview stream
    const pStream = previewStream();
    if (pStream) pStream.getTracks().forEach((t) => t.stop());
    setPreviewStream(null);

    // Get config from Rust backend
    const conf = await invoke("get_config");
    const LIVEKIT_URL = conf.livekit_url;
    const API_KEY = conf.api_key;

    // Create local media stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camId ? { deviceId: { exact: camId } } : true,
        audio: micId ? { deviceId: { exact: micId } } : true,
      });
      setLocalStream(stream);
      setParticipants([{ id: "local", name: "You (Local)", isLocal: true, stream }]);
    } catch (err) {
      console.error("Error starting local stream:", err);
      setIsCameraOff(true);
    }

    // Generate LiveKit token via Rust
    const token = await invoke("generate_livekit_token", {
      apiKey: API_KEY,
      identity: identity,
      room: roomName,
      validForSeconds: 86400,
    });

    // Create Room and wire event handlers
    const newRoom = new Room();
    setLkRoom(newRoom);

    // ---- Remote tracks subscribed ----
    newRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Video) {
        const isScreen = publication.source === Track.Source.ScreenShare;
        setParticipants((prev) => [
          ...prev,
          {
            id: isScreen ? `${participant.identity}-screen` : participant.identity,
            name: isScreen
              ? `${participant.name || participant.identity}'s Screen`
              : participant.name || participant.identity,
            isLocal: false,
            isScreen,
            videoTrack: track,
          },
        ]);
      } else if (track.kind === Track.Kind.Audio) {
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === participant.identity ? { ...p, audioTrack: track } : p
          )
        );
      }
    });

    // ---- Remote track unsubscribed ----
    newRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (publication.source === Track.Source.ScreenShare) {
        setParticipants((prev) =>
          prev.filter((p) => p.id !== `${participant.identity}-screen`)
        );
      } else {
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === participant.identity
              ? { ...p, videoTrack: null, audioTrack: null }
              : p
          )
        );
      }
    });

    // ---- Participant connected ----
    newRoom.on(RoomEvent.ParticipantConnected, (participant) => {
      setParticipants((prev) => {
        if (prev.find((p) => p.id === participant.identity)) return prev;
        return [
          ...prev,
          {
            id: participant.identity,
            name: participant.name || participant.identity,
            isLocal: false,
            videoTrack: null,
            audioTrack: null,
          },
        ];
      });
    });

    // ---- Participant disconnected ----
    newRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
      setParticipants((prev) =>
        prev.filter(
          (p) =>
            p.id !== participant.identity &&
            p.id !== `${participant.identity}-screen`
        )
      );
      setRaisedHands((prev) => prev.filter((id) => id !== participant.identity));
    });

    // ---- Local screen share published ----
    newRoom.on(RoomEvent.LocalTrackPublished, (track) => {
      if (track.kind === Track.Kind.Video && track.source === Track.Source.ScreenShare) {
        setIsSharingScreen(true);
        setParticipants((prev) => {
          const filtered = prev.filter((p) => p.id !== "local-screen");
          return [
            ...filtered,
            {
              id: "local-screen",
              name: "Your Screen",
              isLocal: true,
              isScreen: true,
              videoTrack: track,
            },
          ];
        });
      }
    });

    // ---- Local screen share unpublished ----
    newRoom.on(RoomEvent.LocalTrackUnpublished, (track) => {
      if (track.kind === Track.Kind.Video && track.source === Track.Source.ScreenShare) {
        setIsSharingScreen(false);
        setParticipants((prev) => prev.filter((p) => p.id !== "local-screen"));
      }
    });

    // ---- Raise hand: listen for remote hand raise/lower ----
    newRoom.on(RoomEvent.DataReceived, (payload, participant) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (data.type === "RAISE_HAND") {
          setRaisedHands((prev) => [...new Set([...prev, data.identity])]);
        }
        if (data.type === "LOWER_HAND") {
          setRaisedHands((prev) => prev.filter((id) => id !== data.identity));
        }
      } catch (e) {
        // Non-JSON data packets are handled by ChatPanel
      }
    });

    // ---- Connect ----
    await newRoom.connect(LIVEKIT_URL, token);
    await newRoom.localParticipant.setCameraEnabled(!isCameraOff());
    await newRoom.localParticipant.setMicrophoneEnabled(!isMuted());

    return newRoom;
  };

  // ---- Leave call: disconnect, stop streams, close window ----
  const leaveCall = async () => {
    if (lkRoom()) lkRoom().disconnect().catch(() => {});
    const stream = localStream();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const pStream = previewStream();
    if (pStream) pStream.getTracks().forEach((t) => t.stop());

    // Notify the main window that this meeting has ended, so it can
    // update its state without polling.
    // [CONCERN: If the invoke fails (e.g. IPC already torn down), the
    //  main window never gets the event.  The fallback is the
    //  tauri://window-destroyed listener mentioned in lib.rs.]
    const room = currentRoom();
    if (room) {
      try {
        await invoke("notify_meeting_ended", { room });
      } catch (err) {
        console.warn("[leaveCall] Failed to emit meeting-ended event:", err);
      }
    }

    getCurrentWindow().close();
  };

  // ---- Stop all streams (for cleanup without closing window) ----
  const stopAllStreams = () => {
    const stream = localStream();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const pStream = previewStream();
    if (pStream) pStream.getTracks().forEach((t) => t.stop());
  };

  // ---- In-meeting: Toggle mute ----
  const toggleMute = async () => {
    if (!lkRoom()) return;
    const newMutedState = !isMuted();
    await lkRoom().localParticipant.setMicrophoneEnabled(!newMutedState);
    setIsMuted(newMutedState);
  };

  // ---- In-meeting: Toggle camera ----
  const toggleCamera = async () => {
    if (isCameraOff()) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        setParticipants((prev) => [
          ...prev.filter((p) => p.id !== "local"),
          { id: "local", name: "You (Local)", isLocal: true, stream },
        ]);
        if (lkRoom()) await lkRoom().localParticipant.setCameraEnabled(true);
        setIsCameraOff(false);
      } catch (err) {
        console.error("Failed to restart camera:", err);
      }
    } else {
      const stream = localStream();
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        setLocalStream(null);
      }
      setParticipants((prev) => prev.filter((p) => p.id !== "local"));
      if (lkRoom()) await lkRoom().localParticipant.setCameraEnabled(false);
      setIsCameraOff(true);
    }
  };

  // ---- In-meeting: Toggle screen share ----
  const toggleScreenShare = async () => {
    if (!lkRoom()) return;
    if (isSharingScreen()) {
      await lkRoom().localParticipant.setScreenShareEnabled(false);
    } else {
      try {
        await lkRoom().localParticipant.setScreenShareEnabled(true);
      } catch (err) {
        console.error("Failed to start screen share:", err);
        alert("Screen sharing was cancelled or failed.");
      }
    }
  };

  // ---- In-meeting: Toggle hand raise ----
  const toggleHand = async (identity) => {
    if (!lkRoom()) return;
    const newState = !isHandRaised();
    setIsHandRaised(newState);
    const payload = new TextEncoder().encode(
      JSON.stringify({
        type: newState ? "RAISE_HAND" : "LOWER_HAND",
        identity: identity,
      })
    );
    await lkRoom().localParticipant.publishData(payload, { reliable: true });
  };

  return {
    // Signals
    lkRoom,
    participants,
    localStream,
    previewStream,
    previewAudioEnabled,
    setPreviewAudioEnabled,
    previewVideoEnabled,
    setPreviewVideoEnabled,
    isMuted,
    isCameraOff,
    isSharingScreen,
    isHandRaised,
    raisedHands,
    // Actions
    startPreview,
    connectToMeeting,
    leaveCall,
    stopAllStreams,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    toggleHand,
    togglePreviewAudio,
    togglePreviewVideo,
  };
}
