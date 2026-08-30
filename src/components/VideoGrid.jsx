import { For, createEffect, createSignal, onCleanup, Show, createMemo } from "solid-js";

function VideoTile(props) {
  const [el, setEl] = createSignal(null);

  createEffect(() => {
    const currentEl = el();
    if (!currentEl) return;

    if (props.participant.stream) {
      // Direct local MediaStream
      currentEl.srcObject = props.participant.stream;
      currentEl.play().catch((err) => console.warn("Local video play failed:", err));
    } else if (props.participant.videoTrack) {
      const track = props.participant.videoTrack.track || props.participant.videoTrack;
      if (track && typeof track.attach === "function") {
        track.attach(currentEl);
      } else if (track && track.mediaStreamTrack) {
        currentEl.srcObject = new MediaStream([track.mediaStreamTrack]);
        currentEl.play().catch((err) => console.warn("Remote video play failed:", err));
      }
    } else {
      currentEl.srcObject = null;
    }

    onCleanup(() => {
      if (props.participant.videoTrack) {
        const track = props.participant.videoTrack.track || props.participant.videoTrack;
        if (track && typeof track.detach === "function" && currentEl) {
          track.detach(currentEl);
        }
      }
    });
  });

  const isMirror = () => props.participant.isLocal && !props.participant.isScreen;
  const isScreen = () => props.participant.isScreen;

  return (
    <div
      onClick={() => props.onSelect && props.onSelect(props.participant)}
      class={`relative bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800 flex items-center justify-center cursor-pointer transition ${
        props.isFeatured ? "w-full h-full" : "aspect-video w-full h-full hover:border-blue-500/70"
      }`}
    >
      <video
        ref={setEl}
        autoplay
        playsinline
        muted={props.participant.isLocal}
        class={`w-full h-full ${
          isScreen() ? "object-contain bg-black" : "object-cover"
        } ${isMirror() ? "scale-x-[-1]" : ""}`}
      />
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
            class={`grid gap-3 w-full h-full ${
              props.participants.length <= 1
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
          class={`flex w-full h-full gap-3 overflow-hidden ${
            stripPosition() === "left"
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
                      class={`w-full text-left px-3 py-2 hover:bg-[#2c2c2c] flex items-center justify-between transition ${
                        stripPosition() === "right" ? "text-blue-400 font-semibold" : ""
                      }`}
                    >
                      <span>Side (Right)</span>
                      {stripPosition() === "right" && <span>✓</span>}
                    </button>
                    <button
                      onClick={() => setPosition("left")}
                      class={`w-full text-left px-3 py-2 hover:bg-[#2c2c2c] flex items-center justify-between transition ${
                        stripPosition() === "left" ? "text-blue-400 font-semibold" : ""
                      }`}
                    >
                      <span>Side (Left)</span>
                      {stripPosition() === "left" && <span>✓</span>}
                    </button>
                    <button
                      onClick={() => setPosition("top")}
                      class={`w-full text-left px-3 py-2 hover:bg-[#2c2c2c] flex items-center justify-between transition ${
                        stripPosition() === "top" ? "text-blue-400 font-semibold" : ""
                      }`}
                    >
                      <span>Top Strip</span>
                      {stripPosition() === "top" && <span>✓</span>}
                    </button>
                    <button
                      onClick={() => setPosition("bottom")}
                      class={`w-full text-left px-3 py-2 hover:bg-[#2c2c2c] flex items-center justify-between transition ${
                        stripPosition() === "bottom" ? "text-blue-400 font-semibold" : ""
                      }`}
                    >
                      <span>Bottom Strip</span>
                      {stripPosition() === "bottom" && <span>✓</span>}
                    </button>
                    <div class="h-[1px] bg-gray-700/60 my-1"></div>
                    <button
                      onClick={() => setPosition("hide")}
                      class={`w-full text-left px-3 py-2 hover:bg-[#2c2c2c] flex items-center justify-between transition ${
                        stripPosition() === "hide" ? "text-blue-400 font-semibold" : ""
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
              class={`${
                stripPosition() === "right" || stripPosition() === "left"
                  ? "w-56 shrink-0 flex flex-col gap-2.5 overflow-y-auto pr-0.5"
                  : "h-28 shrink-0 flex flex-row gap-2.5 overflow-x-auto pb-0.5"
              }`}
            >
              <For each={thumbnailParticipants()}>
                {(participant) => (
                  <div
                    class={`${
                      stripPosition() === "right" || stripPosition() === "left"
                        ? "w-full aspect-video shrink-0"
                        : "h-full aspect-video shrink-0"
                    }`}
                  >
                    <VideoTile
                      participant={participant}
                      onSelect={(p) => setPinnedId(p.id)}
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