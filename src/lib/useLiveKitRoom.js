import { createSignal } from "solid-js";
import { Room, RoomEvent, Track } from "livekit-client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { describeMediaError } from "../components/Permissions";

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

  // Visible error for join/connection failures (rendered as a banner in MeetingView).
  const [connectionError, setConnectionError] = createSignal("");

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
  const connectToMeeting = async ({ identity, roomName, micId, camId, token: providedToken, url: providedUrl }) => {
    setConnectionError("");
    // Store room name for the meeting-ended event on leave.
    setCurrentRoom(roomName);
    // Stop preview stream
    const pStream = previewStream();
    if (pStream) pStream.getTracks().forEach((t) => t.stop());
    setPreviewStream(null);

    // Reserve the local tile immediately. The video track itself is attached
    // when LiveKit publishes it (LocalTrackPublished). Opening the camera a
    // second time here (raw getUserMedia + LiveKit's own capture) starves the
    // first consumer on macOS WebKit and renders a black local tile, so the
    // published LiveKit track is the single source of truth for the tile.
    setLocalStream(null);
    setParticipants([{ id: "local", name: "You (Local)", isLocal: true, videoTrack: null }]);

    // Resolve LiveKit server URL + token:
    //   1) get_config + generate_livekit_token (dev: values come from .env)
    //   2) get_meeting_session                 (packaged builds: Rust defaults)
    //   3) token/url passed down from the main window via query params
    let LIVEKIT_URL = providedUrl || null;
    let token = null;
    try {
      const conf = await invoke("get_config");
      LIVEKIT_URL = LIVEKIT_URL || conf.livekit_url;
      token = await invoke("generate_livekit_token", {
        apiKey: conf.api_key,
        identity: identity,
        room: roomName,
        validForSeconds: 86400,
      });
    } catch (err) {
      console.warn("[connectToMeeting] get_config/generate_livekit_token failed, falling back:", err);
      try {
        const session = await invoke("get_meeting_session", { room: roomName });
        LIVEKIT_URL = LIVEKIT_URL || session.livekit_url;
        token = session.token;
      } catch (err2) {
        if (providedToken) {
          token = providedToken; // last resort: token minted by the main window
        } else {
          const msg = `Could not obtain a LiveKit token: ${err2 && err2.message ? err2.message : err2}`;
          console.error("[connectToMeeting]", msg);
          setConnectionError(msg);
          throw new Error(msg);
        }
      }
    }
    if (!LIVEKIT_URL) {
      const msg = "No LiveKit server URL configured (set it in Settings → LiveKit).";
      setConnectionError(msg);
      throw new Error(msg);
    }

    // Create Room and wire event handlers
    const newRoom = new Room();
    setLkRoom(newRoom);

    // ---- Remote tracks subscribed ----
    newRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      const isScreen = publication.source === Track.Source.ScreenShare;
      const id = isScreen ? `${participant.identity}-screen` : participant.identity;
      const name = isScreen
        ? `${participant.name || participant.identity}'s Screen`
        : participant.name || participant.identity;

      if (track.kind === Track.Kind.Video) {
        // UPSERT: ParticipantConnected may have already added this identity —
        // pushing again would render a duplicate black tile.
        setParticipants((prev) => {
          const entry = { id, name, isLocal: false, isScreen, videoTrack: track };
          return prev.some((p) => p.id === id)
            ? prev.map((p) => (p.id === id ? { ...p, ...entry } : p))
            : [...prev, entry];
        });
      } else if (track.kind === Track.Kind.Audio) {
        setParticipants((prev) => {
          if (prev.some((p) => p.id === id)) {
            return prev.map((p) => (p.id === id ? { ...p, audioTrack: track } : p));
          }
          return [...prev, { id, name, isLocal: false, audioTrack: track }];
        });
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

    // ---- Local track published (camera or screen share) ----
    // NOTE: LiveKit passes (publication, participant) — the media track lives
    // on publication.track, not on the second argument.
    newRoom.on(RoomEvent.LocalTrackPublished, (publication) => {
      if (publication.kind !== Track.Kind.Video) return;
      if (publication.source === Track.Source.ScreenShare) {
        setIsSharingScreen(true);
        setParticipants((prev) => [
          ...prev.filter((p) => p.id !== "local-screen"),
          {
            id: "local-screen",
            name: "Your Screen",
            isLocal: true,
            isScreen: true,
            videoTrack: publication.track,
          },
        ]);
      } else if (publication.source === Track.Source.Camera) {
        setIsCameraOff(false);
        setParticipants((prev) => {
          const entry = {
            id: "local",
            name: "You (Local)",
            isLocal: true,
            videoTrack: publication.track,
          };
          return prev.some((p) => p.id === "local")
            ? prev.map((p) => (p.id === "local" ? { ...p, ...entry } : p))
            : [...prev, entry];
        });
      }
    });

    // ---- Local track unpublished ----
    newRoom.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      if (publication.kind === Track.Kind.Video && publication.source === Track.Source.ScreenShare) {
        setIsSharingScreen(false);
        setParticipants((prev) => prev.filter((p) => p.id !== "local-screen"));
      } else if (publication.source === Track.Source.Camera) {
        setParticipants((prev) =>
          prev.map((p) => (p.id === "local" ? { ...p, videoTrack: null } : p))
        );
      }
    });

    // ---- Subscription failures must be visible, not a silent black tile ----
    newRoom.on(RoomEvent.TrackSubscriptionFailed, (trackSid, participant, reason) => {
      const who = participant && (participant.name || participant.identity) ? participant.name || participant.identity : "A participant";
      const msg = `Could not subscribe to ${who}'s media track (${trackSid}): ${reason || "unknown reason"}`;
      console.error("[connectToMeeting]", msg);
      setConnectionError(msg);
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

    // ---- Connection lost (kick / network drop) must be visible ----
    newRoom.on(RoomEvent.Disconnected, (reason) => {
      setConnectionError(
        `Disconnected from the meeting${reason ? ` (${reason})` : ""}. ` +
        "If this happened right after another device joined, both may share the same " +
        "identity — LiveKit kicks the older connection."
      );
    });

    // ---- Connect ----
    try {
      await newRoom.connect(LIVEKIT_URL, token);
    } catch (err) {
      const msg = `Failed to connect to the LiveKit server (${LIVEKIT_URL}): ${err && err.message ? err.message : err}`;
      console.error("[connectToMeeting]", msg);
      setConnectionError(msg);
      throw err;
    }

    // Publish local tracks individually — a camera failure must not abort audio.
    // Honor the devices selected in Settings/pre-join first: point LiveKit's
    // capture at them before publishing (single capture, correct device).
    try {
      if (camId) await newRoom.switchActiveDevice("videoinput", camId, true);
      if (micId) await newRoom.switchActiveDevice("audioinput", micId, true);
    } catch (err) {
      console.warn("switchActiveDevice failed, falling back to default devices:", err);
    }
    try {
      await newRoom.localParticipant.setCameraEnabled(!isCameraOff());
    } catch (err) {
      console.error("setCameraEnabled failed:", err);
      setIsCameraOff(true);
      setConnectionError(`Your video could not be published: ${describeMediaError(err)}`);
    }
    try {
      await newRoom.localParticipant.setMicrophoneEnabled(!isMuted());
    } catch (err) {
      console.error("setMicrophoneEnabled failed:", err);
      setIsMuted(true);
    }

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
  // The LocalTrackPublished/LocalTrackUnpublished handlers keep the local tile
  // in sync, so no extra getUserMedia capture is needed here (a second capture
  // of the same camera starves the published one on macOS WebKit).
  const toggleCamera = async () => {
    if (!lkRoom()) return;
    const enable = isCameraOff();
    try {
      await lkRoom().localParticipant.setCameraEnabled(enable);
      setIsCameraOff(!enable);
    } catch (err) {
      console.error("Failed to toggle camera:", err);
      setConnectionError(
        `Your video could not be ${enable ? "restored" : "stopped"}: ${describeMediaError(err)}`
      );
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
    connectionError,
    setConnectionError,
    clearConnectionError: () => setConnectionError(""),
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
