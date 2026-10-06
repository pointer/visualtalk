import { For, createEffect, createSignal, onCleanup, Show, createMemo } from "solid-js";
import { IS_WKWEBVIEW_MAC, startCanvasVideo } from "../lib/canvasVideoFallback";

/**
 * Start playback with WKWebView/Safari autoplay fallbacks.
 * If unmuted playback is refused (NotAllowedError), retry muted and report
 * "muted-autoplay" so the tile can offer a tap-to-unmute chip (a user gesture
 * satisfies the autoplay policy). Any other failure is reported via onIssue
 * so the tile shows a diagnostic instead of a silent black box.
 */
function ensurePlaying(el, { mutedFallback, onIssue, onOk }) {
  if (!el) return;
  const fail = (err) => {
    const name = err && err.name ? err.name : String(err);
    // AbortError = a newer play() call superseded this one; playback proceeds.
    if (name === "AbortError") return;
    if (name === "NotAllowedError" && mutedFallback && !el.muted) {
      el.muted = true;
      onIssue("muted-autoplay");
      el.play().then(onOk, () => onIssue("autoplay-blocked"));
    } else if (name === "NotAllowedError") {
      onIssue("autoplay-blocked");
    } else {
      onIssue(`play-failed:${name}`);
    }
  };
  try {
    const p = el.play();
    if (p && typeof p.then === "function") p.then(onOk, fail);
    else onOk();
  } catch (err) {
    fail(err);
  }
}

function VideoTile(props) {
  const [el, setEl] = createSignal(null);
  const [playIssue, setPlayIssue] = createSignal("");
  const [needUnmute, setNeedUnmute] = createSignal(false);
  const [frameIssue, setFrameIssue] = createSignal("");
  const [canvasEl, setCanvasEl] = createSignal(null);

  const markOk = () => {
    setPlayIssue("");
    setFrameIssue("");
  };

  createEffect(() => {
    const currentEl = el();
    if (!currentEl) return;
    const participant = props.participant;

    setPlayIssue("");
    setFrameIssue("");
    setNeedUnmute(false);
    currentEl.autoplay = true;

    const onIssue = (issue) => {
      setPlayIssue(issue);
      if (issue === "muted-autoplay") setNeedUnmute(true);
    };

    let sourceTrack = null;

    if (participant.stream) {
      // Direct local MediaStream
      currentEl.muted = !!participant.isLocal;
      currentEl.srcObject = participant.stream;
      sourceTrack = participant.stream.getVideoTracks()[0] || null;
      ensurePlaying(currentEl, { mutedFallback: false, onIssue, onOk: markOk });
    } else if (participant.videoTrack) {
      const track = participant.videoTrack.track || participant.videoTrack;
      if (track && typeof track.attach === "function") {
        track.attach(currentEl);
        sourceTrack = track.mediaStreamTrack || null;
        // Local previews must stay muted (echo); remote tiles keep audio.
        if (participant.isLocal) currentEl.muted = true;
        ensurePlaying(currentEl, {
          mutedFallback: !participant.isLocal,
          onIssue,
          onOk: markOk,
        });
      } else if (track && track.mediaStreamTrack) {
        sourceTrack = track.mediaStreamTrack;
        currentEl.srcObject = new MediaStream([track.mediaStreamTrack]);
        if (participant.isLocal) currentEl.muted = true;
        ensurePlaying(currentEl, {
          mutedFallback: !participant.isLocal,
          onIssue,
          onOk: markOk,
        });
      }
    } else {
      currentEl.srcObject = null;
    }

    // WKWebView on macOS may decode frames fine but never composite the
    // native <video> layer on screen (black tile). Mirror the frames into
    // the canvas overlay, which uses the regular paint path.
    let stopCanvas = null;
    if (IS_WKWEBVIEW_MAC) {
      stopCanvas = startCanvasVideo(currentEl, canvasEl(), {
        mirror: isMirror(),
        contain: isScreen(),
      });
    }

    // ---- Diagnostics: never leave a silent black tile ----
    const onEnded = () => setFrameIssue("track ended");
    const onPlaying = () => markOk();
    if (sourceTrack) sourceTrack.addEventListener("ended", onEnded);
    currentEl.addEventListener("playing", onPlaying);

    const timer = setTimeout(() => {
      if (!currentEl.isConnected) return;
      // Nothing expected yet (participant without a video track).
      if (!participant.stream && !participant.videoTrack) return;
      if (!currentEl.paused && currentEl.readyState >= 2 && currentEl.videoWidth > 0) return;
      if (sourceTrack && sourceTrack.readyState === "ended") {
        setFrameIssue("track ended");
      } else if (currentEl.paused) {
        if (!playIssue()) setPlayIssue("paused");
      } else if (currentEl.videoWidth === 0) {
        setFrameIssue("no video frames");
      } else {
        setFrameIssue("stalled");
      }
    }, 3000);

    onCleanup(() => {
      clearTimeout(timer);
      if (stopCanvas) stopCanvas();
      if (sourceTrack) sourceTrack.removeEventListener("ended", onEnded);
      currentEl.removeEventListener("playing", onPlaying);
      if (participant.videoTrack) {
        const track = participant.videoTrack.track || participant.videoTrack;
        if (track && typeof track.detach === "function") {
          track.detach(currentEl);
        }
      }
    });
  });

  const retryPlay = () => {
    const currentEl = el();
    if (!currentEl) return;
    ensurePlaying(currentEl, {
      mutedFallback: !props.participant.isLocal,
      onIssue: (issue) => {
        setPlayIssue(issue);
        if (issue === "muted-autoplay") setNeedUnmute(true);
      },
      onOk: () => {
        markOk();
        setNeedUnmute(false);
      },
    });
  };

  const unmute = () => {
    const currentEl = el();
    if (!currentEl) return;
    currentEl.muted = false;
    currentEl.play().catch(() => {});
    setNeedUnmute(false);
  };

  const isMirror = () => props.participant.isLocal && !props.participant.isScreen;
  const isScreen = () => props.participant.isScreen;

  return (
    <div
      onClick={() => props.onSelect && props.onSelect(props.participant)}
      class={`relative bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800 flex items-center justify-center cursor-pointer transition ${props.isFeatured ? "w-full h-full" : "aspect-video w-full h-full hover:border-blue-500/70"
        }`}
    >
      <video
        ref={setEl}
        autoplay
        playsinline
        muted={props.participant.isLocal}
        style={{
          "-webkit-transform": isMirror() ? "scaleX(-1)" : "none",
          transform: isMirror() ? "scaleX(-1)" : "none",
        }}
        class={
          IS_WKWEBVIEW_MAC
            ? "absolute inset-0 w-full h-full opacity-0 pointer-events-none"
            : `w-full h-full ${isScreen() ? "object-contain bg-black" : "object-cover"}`
        }
      />
      {/* Canvas mirror for WKWebView macOS (native video layer never composites) */}
      <Show when={IS_WKWEBVIEW_MAC}>
        <canvas
          ref={setCanvasEl}
          class="absolute inset-0 w-full h-full pointer-events-none"
        />
      </Show>
      {/* Hand raise indicator */}
      <Show when={props.raisedHands && props.raisedHands.includes(props.participant.name)}>
        <div class="absolute top-2 right-2 bg-yellow-500/90 backdrop-blur-md w-8 h-8 rounded-full flex items-center justify-center shadow-lg animate-bounce text-base">
          ✋
        </div>
      </Show>
      {/* Playback blocked overlay — click is a user gesture, which satisfies
          WKWebView/Safari autoplay policy. */}
      <Show when={playIssue() === "autoplay-blocked" || playIssue() === "paused"}>
        <button
          onClick={retryPlay}
          class="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-black/60 text-slate-100 text-xs sm:text-sm border-none cursor-pointer"
        >
          <span class="text-lg">▶</span> Tap to enable video
        </button>
      </Show>
      {/* Autoplay forced us to mute — offer sound back via a gesture. */}
      <Show when={needUnmute()}>
        <button
          onClick={unmute}
          class="absolute bottom-2 right-2 z-10 bg-slate-900/85 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] text-slate-100 flex items-center gap-1.5 shadow border border-slate-700 cursor-pointer"
        >
          🔇 Muted by autoplay — tap for sound
        </button>
      </Show>
      {/* Frame-level diagnostic badge (track ended / no frames / stalled). */}
      <Show when={frameIssue()}>
        <div class="absolute top-2 left-2 z-10 bg-red-950/90 border border-red-700/60 text-red-100 px-2 py-0.5 rounded-md text-[10px]">
          ⚠ {frameIssue()}
        </div>
      </Show>
      <div class="absolute bottom-2 left-2 bg-slate-900/85 backdrop-blur-md px-2.5 py-0.5 rounded-md text-[11px] text-slate-200 flex items-center gap-1.5 shadow">
        {isScreen() && <span class="text-blue-400 text-xs">🖥</span>}
        <span>{props.participant.name}</span>
        {props.participant.isMuted && <span class="text-red-400">🔇</span>}
      </div>
    </div>
  );
}

export function VideoGrid(props) {
  const [pinnedId, setPinnedId] = createSignal(null);

  // Layout position for the participant filmstrip: 'right', 'left', 'top', 'bottom', 'hide'
  const [stripPosition, setStripPosition] = createSignal(
    localStorage.getItem("visualtalk_strip_position") || "right"
  );

  const [showLayoutMenu, setShowLayoutMenu] = createSignal(false);

  const setPosition = (pos) => {
    setStripPosition(pos);
    localStorage.setItem("visualtalk_strip_position", pos);
    setShowLayoutMenu(false);
  };

  // Automatically find active screen share if present
  const screenShareParticipant = createMemo(() => {
    return props.participants.find((p) => p.isScreen);
  });

  // Find the primary featured item (either manually pinned or active screen share)
  const featuredParticipant = createMemo(() => {
    if (pinnedId()) {
      const found = props.participants.find((p) => p.id === pinnedId());
      if (found) return found;
    }
    return screenShareParticipant();
  });

  // Other participants for the filmstrip
  const thumbnailParticipants = createMemo(() => {
    const featured = featuredParticipant();
    if (!featured) return [];
    return props.participants.filter((p) => p.id !== featured.id);
  });

  return (
    <div class="w-full h-full bg-[#0d0d0d] p-3 flex flex-col overflow-hidden relative">
      <Show
        when={featuredParticipant()}
        fallback={
          // Standard Equal Grid View (No screen share or spotlight)
          <div
            class={`grid gap-3 w-full h-full ${props.participants.length <= 1
                ? "grid-cols-1 max-w-4xl mx-auto"
                : props.participants.length === 2
                  ? "grid-cols-1 md:grid-cols-2"
                  : props.participants.length <= 4
                    ? "grid-cols-2"
                    : "grid-cols-2 md:grid-cols-3"
              }`}
          >
            <For each={props.participants}>
              {(participant) => (
                <VideoTile
                  participant={participant}
                  onSelect={(p) => setPinnedId(p.id)}
                />
              )}
            </For>
          </div>
        }
      >
        {/* Presentation / Stage View Container */}
        <div
          class={`flex w-full h-full gap-3 overflow-hidden ${stripPosition() === "left"
              ? "flex-row-reverse"
              : stripPosition() === "right"
                ? "flex-row"
                : stripPosition() === "top"
                  ? "flex-col-reverse"
                  : stripPosition() === "bottom"
                    ? "flex-col"
                    : "flex-col" // 'hide'
            }`}
        >
          {/* Main Stage Presentation Area */}
          <div class="flex-1 relative min-w-0 min-h-0 bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
            <VideoTile
              participant={featuredParticipant()}
              isFeatured={true}
              onSelect={() => setPinnedId(null)}
              raisedHands={props.raisedHands}
            />

            {/* Stage Controls: View Mode & Reset Pin */}
            <div class="absolute top-3 right-3 flex items-center space-x-2 z-20">
              {pinnedId() && (
                <button
                  onClick={() => setPinnedId(null)}
                  class="bg-black/75 hover:bg-black/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-medium text-gray-200 hover:text-white transition border border-gray-700 shadow"
                >
                  Unpin
                </button>
              )}

              {/* Layout Switcher Dropdown */}
              <div class="relative">
                <button
                  onClick={() => setShowLayoutMenu(!showLayoutMenu())}
                  class="bg-black/75 hover:bg-black/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-medium text-gray-200 hover:text-white transition border border-gray-700 shadow flex items-center space-x-1.5 cursor-pointer"
                  title="Change participant strip position"
                >
                  <svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
                  </svg>
                  <span class="capitalize">Layout: {stripPosition()}</span>
                  <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showLayoutMenu() && (
                  <div class="absolute right-0 mt-1.5 w-44 bg-[#1e1e1e] rounded-xl shadow-2xl border border-gray-700 py-1.5 z-30 text-xs text-gray-200">
                    <div class="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-gray-400">
                      Participants Position
                    </div>
                    <button
                      onClick={() => setPosition("right")}
                      class={`w-full text-left px-3 py-2 hover:bg-[#2c2c2c] flex items-center justify-between transition ${stripPosition() === "right" ? "text-blue-400 font-semibold" : ""
                        }`}
                    >
                      <span>Side (Right)</span>
                      {stripPosition() === "right" && <span>✓</span>}
                    </button>
                    <button
                      onClick={() => setPosition("left")}
                      class={`w-full text-left px-3 py-2 hover:bg-[#2c2c2c] flex items-center justify-between transition ${stripPosition() === "left" ? "text-blue-400 font-semibold" : ""
                        }`}
                    >
                      <span>Side (Left)</span>
                      {stripPosition() === "left" && <span>✓</span>}
                    </button>
                    <button
                      onClick={() => setPosition("top")}
                      class={`w-full text-left px-3 py-2 hover:bg-[#2c2c2c] flex items-center justify-between transition ${stripPosition() === "top" ? "text-blue-400 font-semibold" : ""
                        }`}
                    >
                      <span>Top Strip</span>
                      {stripPosition() === "top" && <span>✓</span>}
                    </button>
                    <button
                      onClick={() => setPosition("bottom")}
                      class={`w-full text-left px-3 py-2 hover:bg-[#2c2c2c] flex items-center justify-between transition ${stripPosition() === "bottom" ? "text-blue-400 font-semibold" : ""
                        }`}
                    >
                      <span>Bottom Strip</span>
                      {stripPosition() === "bottom" && <span>✓</span>}
                    </button>
                    <div class="h-[1px] bg-gray-700/60 my-1"></div>
                    <button
                      onClick={() => setPosition("hide")}
                      class={`w-full text-left px-3 py-2 hover:bg-[#2c2c2c] flex items-center justify-between transition ${stripPosition() === "hide" ? "text-blue-400 font-semibold" : ""
                        }`}
                    >
                      <span>Hide Participants</span>
                      {stripPosition() === "hide" && <span>✓</span>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Participant Thumbnail Strip (Positioned based on user preference) */}
          <Show when={stripPosition() !== "hide" && thumbnailParticipants().length > 0}>
            <div
              class={`${stripPosition() === "right" || stripPosition() === "left"
                  ? "w-56 shrink-0 flex flex-col gap-2.5 overflow-y-auto pr-0.5"
                  : "h-28 shrink-0 flex flex-row gap-2.5 overflow-x-auto pb-0.5"
                }`}
            >
              <For each={thumbnailParticipants()}>
                {(participant) => (
                  <div
                    class={`${stripPosition() === "right" || stripPosition() === "left"
                        ? "w-full aspect-video shrink-0"
                        : "h-full aspect-video shrink-0"
                      }`}
                  >
                    <VideoTile
                      participant={participant}
                      onSelect={(p) => setPinnedId(p.id)}
                      raisedHands={props.raisedHands}
                    />
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}