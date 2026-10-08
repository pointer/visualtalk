import { createSignal } from "solid-js";
import { Room, RoomEvent, Track, supportsAudioOutputSelection } from "livekit-client";
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

  // ---- Recording notice ----
  // Recording is only legitimate if everyone in the room can see that it is
  // happening. `remoteRecording` is the notice for *this* user: it is set when
  // somebody else starts recording, and MeetingView renders a banner from it.
  // Shape: { startedBy, name, recordingId, mode, at } or null.
  const [remoteRecording, setRemoteRecording] = createSignal(null);
  // Remote recordings keyed by recordingId. Two participants can record at
  // once, so one of them stopping must not clear the other's notice.
  let remoteRecordings = new Map();
  // Our own active announcement, replayed to everyone who joins mid-recording
  // so a late joiner is never recorded without being told.
  let activeRecordingNotices = new Map();
  const RECORDING_TOPIC = "vt-recording";

  /** Surface the most recent live remote notice, or null when nobody records. */
  const refreshRemoteRecording = () => {
    let latest = null;
    for (const notice of remoteRecordings.values()) {
      if (!latest || (notice.at || 0) > (latest.at || 0)) latest = notice;
    }
    setRemoteRecording(latest);
  };

  /** Forget every remote notice owned by a participant (they left). */
  const dropRemoteRecordingsFor = (identity) => {
    if (!identity) return;
    for (const [key, notice] of [...remoteRecordings.entries()]) {
      if (notice.startedBy === identity) remoteRecordings.delete(key);
    }
    refreshRemoteRecording();
  };

  // Visible error for join/connection failures (rendered as a banner in MeetingView).
  const [connectionError, setConnectionError] = createSignal("");

  // Track current room name so leaveCall can emit the meeting-ended event.
  const [currentRoom, setCurrentRoom] = createSignal(null);

  // ---- Remote audio playback ----
  // LiveKit does NOT play remote audio by itself: every subscribed audio track
  // has to be attached to an <audio> element by us, otherwise the meeting is
  // completely silent even though the tracks arrive fine. The elements are
  // hidden (they take no part in the layout) and are removed again as soon as
  // the track goes away. Keyed by track.sid → { track, element, identity }.
  const attachedAudioElements = new Map();
  // True while the webview refuses to play audio (autoplay policy). Surfaced in
  // MeetingView as a "tap to enable sound" prompt.
  const [audioBlocked, setAudioBlocked] = createSignal(false);
  let audioGestureHandler = null;
  // Speaker chosen in Settings → Audio/Video (empty = system default).
  let preferredSpeakerId = "";
  // WebKit exposes setSinkId() on media elements but only lets it run inside a
  // user gesture, and LiveKit's switchActiveDevice() refuses Safari-based
  // engines entirely — so speaker routing is applied per <audio> element and,
  // when the webview demands a gesture, retried from the next click/keypress.
  let sinkGestureHandler = null;
  let sinkWarned = false;

  const removeSinkGestureHandler = () => {
    if (!sinkGestureHandler) return;
    document.removeEventListener("pointerdown", sinkGestureHandler);
    document.removeEventListener("keydown", sinkGestureHandler);
    sinkGestureHandler = null;
  };

  // Best-effort speaker routing for one element. A NotAllowedError means the
  // webview wants a user gesture first — the retry is deferred to one.
  const applySinkId = (element) => {
    if (!preferredSpeakerId || !element || typeof element.setSinkId !== "function") return;
    element.setSinkId(preferredSpeakerId).catch((err) => {
      if (err && err.name === "NotAllowedError") {
        requestSinkUnlock();
        return;
      }
      if (!sinkWarned) {
        sinkWarned = true;
        console.warn("[audio] setSinkId failed, keeping the default output:", err);
      }
    });
  };

  const applySinkToAllAttached = () => {
    for (const { element } of attachedAudioElements.values()) applySinkId(element);
  };

  // One-shot gesture listener that retries the speaker switch from inside a
  // real user gesture (the only context WebKit allows it in).
  const requestSinkUnlock = () => {
    if (sinkGestureHandler || typeof document === "undefined") return;
    sinkGestureHandler = () => {
      removeSinkGestureHandler();
      applySinkToAllAttached();
    };
    document.addEventListener("pointerdown", sinkGestureHandler);
    document.addEventListener("keydown", sinkGestureHandler);
  };

  // ---- Autoplay unlock helpers (Safari/WKWebView need a user gesture) ----
  const removeAudioGestureHandler = () => {
    if (!audioGestureHandler) return;
    document.removeEventListener("pointerdown", audioGestureHandler);
    document.removeEventListener("keydown", audioGestureHandler);
    audioGestureHandler = null;
  };

  // Re-try playback from inside a real user gesture and clear the prompt.
  const resumeAudio = async () => {
    const room = lkRoom();
    if (!room) return false;
    try {
      await room.startAudio();
      setAudioBlocked(false);
      removeAudioGestureHandler();
      // We are inside a user gesture here — the one context WebKit also allows
      // a speaker switch in, so retry routing while the opportunity is open.
      applySinkToAllAttached();
      return true;
    } catch (err) {
      console.warn("[audio] startAudio() was refused — still waiting for a user gesture:", err);
      setAudioBlocked(true);
      requestAudioUnlock();
      return false;
    }
  };

  // Any click/keypress unlocks audio once the webview is ready for it.
  const requestAudioUnlock = () => {
    if (audioGestureHandler || typeof document === "undefined") return;
    audioGestureHandler = () => {
      resumeAudio();
    };
    document.addEventListener("pointerdown", audioGestureHandler);
    document.addEventListener("keydown", audioGestureHandler);
  };

  // LiveKit also reports "playback blocked" when its helper AudioContext stays
  // suspended (or is unsupported) although the <audio> elements play fine, so
  // only trust that signal when a real element is actually paused.
  const audioReallyBlocked = (room) => {
    if (!room || room.canPlaybackAudio) return false;
    const entries = [...attachedAudioElements.values()];
    // Nothing attached yet → nothing can make sound, treat it as blocked.
    if (entries.length === 0) return true;
    return entries.some(({ element }) => element.paused);
  };

  // ---- Attach one remote audio track so it is actually audible ----
  const attachRemoteAudio = (track, participant) => {
    if (!track || track.kind !== Track.Kind.Audio) return;
    if (attachedAudioElements.has(track.sid)) return; // already playing
    try {
      // track.attach() creates (or recycles) an <audio> element, wires the
      // MediaStream into it and calls play().
      const element = track.attach();
      element.autoplay = true;
      element.muted = false; // recycled elements may still be muted
      element.volume = 1;
      element.hidden = true;
      element.setAttribute("data-visualtalk-audio", track.sid);
      // Keep it in the document: WebKit plays elements that are part of the DOM
      // tree far more reliably than detached ones.
      if (!element.parentElement) document.body.appendChild(element);

      // Once this element makes sound, audio is clearly not blocked — clears a
      // stale prompt produced by the AudioContext heuristic above.
      const onPlaying = () => {
        if (audioBlocked()) {
          setAudioBlocked(false);
          removeAudioGestureHandler();
        }
      };
      element.addEventListener("playing", onPlaying);

      attachedAudioElements.set(track.sid, {
        track,
        element,
        onPlaying,
        identity: participant ? participant.identity : null,
      });

      // Route to the speaker picked in Settings (best effort — see applySinkId:
      // WebKit needs a user gesture, engines without setSinkId keep the default).
      applySinkId(element);
    } catch (err) {
      console.error("[audio] Failed to attach remote audio track:", err);
    }
  };

  // ---- Detach helpers ----
  const detachRemoteAudio = (track) => {
    const entry = track ? attachedAudioElements.get(track.sid) : null;
    if (!entry) return;
    attachedAudioElements.delete(entry.track.sid);
    try {
      entry.element.removeEventListener("playing", entry.onPlaying);
      entry.track.detach(entry.element);
    } catch {
      // The track is already gone — the element is cleaned up regardless.
    }
    entry.element.remove();
  };

  const detachParticipantAudio = (identity) => {
    if (!identity) return;
    for (const entry of [...attachedAudioElements.values()]) {
      if (entry.identity === identity) detachRemoteAudio(entry.track);
    }
  };

  const detachAllAudio = () => {
    for (const entry of [...attachedAudioElements.values()]) detachRemoteAudio(entry.track);
    attachedAudioElements.clear();
    setAudioBlocked(false);
    removeAudioGestureHandler();
    removeSinkGestureHandler();
  };

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
    // Fresh meeting: no stale recording notices from a previous room.
    remoteRecordings.clear();
    refreshRemoteRecording();
    activeRecordingNotices.clear();
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
        // CRITICAL: without this attach() call the remote voice is never routed
        // to an <audio> element and the meeting stays silent.
        attachRemoteAudio(track, participant);
        setParticipants((prev) => {
          if (prev.some((p) => p.id === id)) {
            return prev.map((p) => (p.id === id ? { ...p, audioTrack: track } : p));
          }
          // Shared-screen audio arriving before the video track must not create
          // an empty tile — the <audio> element above plays it anyway.
          if (isScreen) return prev;
          return [...prev, { id, name, isLocal: false, audioTrack: track }];
        });
      }
    });

    // ---- Remote track unsubscribed ----
    newRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      // Stop playing (and drop) the <audio> element of a track that went away.
      if (track.kind === Track.Kind.Audio) detachRemoteAudio(track);

      if (publication.source === Track.Source.ScreenShare) {
        setParticipants((prev) =>
          prev.filter((p) => p.id !== `${participant.identity}-screen`)
        );
      } else {
        // Only clear the kind that actually unsubscribed — clearing both made a
        // participant's video vanish whenever their mic track was republished.
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === participant.identity
              ? {
                  ...p,
                  videoTrack: track.kind === Track.Kind.Video ? null : p.videoTrack,
                  audioTrack: track.kind === Track.Kind.Audio ? null : p.audioTrack,
                }
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
      // Someone who joins mid-recording has to be told too — otherwise they
      // are recorded from the first second without ever seeing a notice.
      replayRecordingNoticesTo(participant);
    });

    // ---- Participant disconnected ----
    newRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
      // Their <audio> elements must go, otherwise a stale voice keeps playing.
      detachParticipantAudio(participant.identity);
      setParticipants((prev) =>
        prev.filter(
          (p) =>
            p.id !== participant.identity &&
            p.id !== `${participant.identity}-screen`
        )
      );
      setRaisedHands((prev) => prev.filter((id) => id !== participant.identity));
      // Their recorder is gone, so the "being recorded" banner must go with it
      // instead of staying up for the rest of the meeting.
      dropRemoteRecordingsFor(participant.identity);
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

    // ---- Audio playback blocked by the webview's autoplay policy ----
    // LiveKit emits this when an <audio> element's play() was refused. The Join
    // click normally satisfies the policy, but WKWebView/iOS can still refuse;
    // MeetingView then shows a "tap to enable sound" prompt.
    newRoom.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      const blocked = audioReallyBlocked(newRoom);
      setAudioBlocked(blocked);
      if (blocked) requestAudioUnlock();
      else removeAudioGestureHandler();
    });

    // ---- Keep our mic button in sync with the real track state ----
    // (covers host-mute, device swaps and failed re-publishes)
    newRoom.on(RoomEvent.TrackMuted, (publication, participant) => {
      if (participant && participant.isLocal && publication.kind === Track.Kind.Audio) {
        setIsMuted(true);
      }
    });
    newRoom.on(RoomEvent.TrackUnmuted, (publication, participant) => {
      if (participant && participant.isLocal && publication.kind === Track.Kind.Audio) {
        setIsMuted(false);
      }
    });

    // ---- Mic/camera lost mid-meeting (unplugged, denied, busy) ----
    newRoom.on(RoomEvent.MediaDevicesError, (error) => {
      console.error("[connectToMeeting] media device error:", error);
      setConnectionError(describeMediaError(error));
    });

    // ---- Raise hand + recording notices: listen for remote signals ----
    newRoom.on(RoomEvent.DataReceived, (payload, participant) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (data.type === "RAISE_HAND") {
          setRaisedHands((prev) => [...new Set([...prev, data.identity])]);
        }
        if (data.type === "LOWER_HAND") {
          setRaisedHands((prev) => prev.filter((id) => id !== data.identity));
        }

        // A recording notice from somebody else. This is what makes the
        // recording visible to participants who did not press Record.
        const senderIdentity =
          data.startedBy || (participant && participant.identity) || "unknown";

        if (data.type === "RECORDING_STARTED") {
          const id = data.recordingId || senderIdentity;
          remoteRecordings.set(id, {
            recordingId: id,
            startedBy: senderIdentity,
            name:
              data.name ||
              (participant && participant.name) ||
              senderIdentity,
            mode: data.mode || "local",
            at: data.at || Date.now(),
          });
          refreshRemoteRecording();
        }

        if (data.type === "RECORDING_STOPPED") {
          if (data.recordingId) {
            remoteRecordings.delete(data.recordingId);
          } else {
            // No id in the notice — drop everything that sender owns.
            for (const [key, notice] of [...remoteRecordings.entries()]) {
              if (notice.startedBy === senderIdentity) remoteRecordings.delete(key);
            }
          }
          refreshRemoteRecording();
        }
      } catch (e) {
        // Non-JSON data packets are handled by ChatPanel
      }
    });

    // ---- Connection lost (kick / network drop) must be visible ----
    newRoom.on(RoomEvent.Disconnected, (reason) => {
      // No room, no remote voices: drop every attached <audio> element.
      detachAllAudio();
      // And no meeting, no recording to announce or be warned about.
      remoteRecordings.clear();
      refreshRemoteRecording();
      activeRecordingNotices.clear();
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
    // Each device is switched independently: a stale camera id used to throw
    // and skip the microphone switch as well.
    const selectCaptureDevice = async (kind, deviceId) => {
      if (!deviceId) return;
      try {
        await newRoom.switchActiveDevice(kind, deviceId, true);
      } catch (err) {
        // An unplugged/unknown device must not cost us the whole mic or camera —
        // LiveKit restores the previous default when the switch fails.
        console.warn(`[media] ${kind} "${deviceId}" unavailable, keeping the default device:`, err);
      }
    };
    await selectCaptureDevice("videoinput", camId);
    await selectCaptureDevice("audioinput", micId);

    // Remember the speaker chosen in Settings → Audio/Video. LiveKit's own
    // device switch only runs where LiveKit supports sink selection
    // (Chrome/Edge); on Safari-based engines it throws "does not support it",
    // so there every attached <audio> element is routed by applySinkId().
    try {
      const speaker = await invoke("get_preferred_speaker");
      preferredSpeakerId = speaker && speaker.id ? speaker.id : "";
      if (preferredSpeakerId && supportsAudioOutputSelection()) {
        await newRoom.switchActiveDevice("audiooutput", preferredSpeakerId, false);
      }
    } catch (err) {
      console.warn("[audio] Could not apply the preferred speaker:", err);
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
      // This used to fail silently: the toolbar showed a muted mic and nobody
      // could hear you, with no clue why.
      setConnectionError(`Your microphone could not be started: ${describeMediaError(err)}`);
    }

    // Start remote audio playback. Safari/WKWebView can refuse until the page
    // has seen a user gesture — resumeAudio() then installs a one-shot
    // click/keypress unlock and MeetingView shows the "enable sound" prompt.
    await resumeAudio();

    return newRoom;
  };

  // ---- Leave call: disconnect, stop streams, close window ----
  const leaveCall = async () => {
    if (lkRoom()) lkRoom().disconnect().catch(() => {});
    detachAllAudio();
    // Clear recording notices deterministically — the Disconnected handler may
    // never run because the window closes right after this call.
    remoteRecordings.clear();
    refreshRemoteRecording();
    activeRecordingNotices.clear();
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
    detachAllAudio();
    const stream = localStream();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const pStream = previewStream();
    if (pStream) pStream.getTracks().forEach((t) => t.stop());
  };

  // ---- In-meeting: Toggle mute ----
  const toggleMute = async () => {
    const room = lkRoom();
    if (!room) return;
    const newMutedState = !isMuted();
    try {
      await room.localParticipant.setMicrophoneEnabled(!newMutedState);
      setIsMuted(newMutedState);
      // Unmuting is also a chance to get blocked audio moving again.
      if (!newMutedState && audioBlocked()) await resumeAudio();
    } catch (err) {
      console.error("Failed to toggle microphone:", err);
      setConnectionError(
        `Your microphone could not be ${newMutedState ? "muted" : "restarted"}: ${describeMediaError(err)}`
      );
    }
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

  // ---- In-meeting: recording notice ----
  // Recording a call that nobody knows about is covert recording. Whoever
  // starts it broadcasts a notice on the data channel; every client renders it
  // as a banner, and it is replayed to anyone who joins later so that "I wasn't
  // in the room when it started" can never happen.

  /** Publish one notice, optionally addressed to specific participants only. */
  const publishRecordingNotice = (notice, destinationIdentities) => {
    const room = lkRoom();
    if (!room || !room.localParticipant) return Promise.resolve(false);

    const options = { reliable: true, topic: RECORDING_TOPIC };
    if (destinationIdentities && destinationIdentities.length > 0) {
      options.destinationIdentities = destinationIdentities;
    }

    return room.localParticipant
      .publishData(new TextEncoder().encode(JSON.stringify(notice)), options)
      .then(() => true)
      .catch((err) => {
        // The notice is mandatory, so a failed publish must be loud: a
        // recording that could not be announced must not look like one that was.
        console.error("[recording] could not notify participants:", err);
        setConnectionError(
          "The other participants could not be told that this meeting is being recorded. " +
          "Check your connection and stop the recording, or tell them yourself."
        );
        return false;
      });
  };

  /**
   * Announce that recording started (active=true) or stopped (active=false).
   *
   * @param {boolean} active
   * @param {{recordingId?: string|null, mode?: string, startedBy?: string, name?: string}} meta
   * @returns {Promise<boolean>} whether the notice was delivered to the room
   */
  const broadcastRecording = async (active, meta = {}) => {
    const startedBy = meta.startedBy || "unknown";
    const recordingId = meta.recordingId || null;
    const key = recordingId || "default";

    const notice = {
      type: active ? "RECORDING_STARTED" : "RECORDING_STOPPED",
      recordingId,
      startedBy,
      name: meta.name || startedBy,
      mode: meta.mode || "local",
      at: Date.now(),
    };

    if (active) activeRecordingNotices.set(key, notice);
    else activeRecordingNotices.delete(key);

    return publishRecordingNotice(notice);
  };

  /**
   * Re-send every live recording notice to one participant. Called on
   * ParticipantConnected so a late joiner is informed immediately.
   */
  const replayRecordingNoticesTo = (participant) => {
    const identity = participant && participant.identity;
    if (!identity || activeRecordingNotices.size === 0) return;
    for (const notice of activeRecordingNotices.values()) {
      publishRecordingNotice(notice, [identity]);
    }
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
    // Recording notice from another participant (null when nobody records)
    remoteRecording,
    connectionError,
    setConnectionError,
    clearConnectionError: () => setConnectionError(""),
    // Remote audio playback (true while the webview blocks autoplay)
    audioBlocked,
    resumeAudio,
    // Actions
    startPreview,
    connectToMeeting,
    leaveCall,
    stopAllStreams,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    toggleHand,
    broadcastRecording,
    togglePreviewAudio,
    togglePreviewVideo,
  };
}
