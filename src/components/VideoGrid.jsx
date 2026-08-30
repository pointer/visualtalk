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
      <div class="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-md px-2.5 py-0.5 rounded-md text-[11px] text-slate-200 flex items-center gap-1.5 shadow">
        {isScreen() && (
          <span class="text-blue-400 text-xs">🖥</span>
        )}
        <span>{props.participant.name}</span>
        {props.participant.isMuted && <span class="text-red-400">🔇</span>}
      </div>
    </div>
  );
}

export function VideoGrid(props) {
  const [pinnedId, setPinnedId] = createSignal(null);

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
    <div class="w-full h-full bg-[#0d0d0d] p-3 flex flex-col overflow-hidden">
      <Show
        when={featuredParticipant()}
        fallback={
          // Standard Equal Grid View
          <div class={`grid gap-3 w-full h-full ${
            props.participants.length <= 1
              ? "grid-cols-1 max-w-4xl mx-auto"
              : props.participants.length === 2
              ? "grid-cols-1 md:grid-cols-2"
              : props.participants.length <= 4
              ? "grid-cols-2"
              : "grid-cols-2 md:grid-cols-3"
          }`}>
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
        {/* Presentation / Stage Spotlight View */}
        <div class="flex flex-col w-full h-full gap-3">
          {/* Top Filmstrip of Participants */}
          <Show when={thumbnailParticipants().length > 0}>
            <div class="flex items-center gap-3 overflow-x-auto pb-1 shrink-0 h-28 max-w-full">
              <For each={thumbnailParticipants()}>
                {(participant) => (
                  <div class="h-full aspect-video shrink-0">
                    <VideoTile
                      participant={participant}
                      onSelect={(p) => setPinnedId(p.id)}
                    />
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Main Stage Presentation Area */}
          <div class="flex-1 w-full relative min-h-0 bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
            <VideoTile
              participant={featuredParticipant()}
              isFeatured={true}
              onSelect={() => setPinnedId(null)}
            />
            {pinnedId() && (
              <button
                onClick={() => setPinnedId(null)}
                class="absolute top-3 right-3 bg-black/70 hover:bg-black/90 backdrop-blur-md px-3 py-1 rounded-lg text-xs text-gray-300 hover:text-white transition border border-gray-700"
              >
                Reset Layout
              </button>
            )}
          </div>
        </div>
      </Show>
    </div>
  );
}