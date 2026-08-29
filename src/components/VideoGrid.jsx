import { For, createEffect, createSignal, onCleanup } from "solid-js";

export function VideoGrid(props) {
  return (
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 w-full h-full bg-slate-950 overflow-y-auto">
      <For each={props.participants}>
        {(participant) => {
          const [el, setEl] = createSignal(null);

          createEffect(() => {
            const currentEl = el();
            if (!currentEl) return;

            if (participant.stream) {
              // Direct local MediaStream
              currentEl.srcObject = participant.stream;
              currentEl.play().catch((err) => console.warn("Local video play failed:", err));
            } else if (participant.videoTrack) {
              const track = participant.videoTrack.track || participant.videoTrack;
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
              if (participant.videoTrack) {
                const track = participant.videoTrack.track || participant.videoTrack;
                if (track && typeof track.detach === "function" && currentEl) {
                  track.detach(currentEl);
                }
              }
            });
          });

          return (
            <div class="relative bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800 aspect-video flex items-center justify-center">
              <video
                ref={setEl}
                autoplay
                playsinline
                muted={participant.isLocal}
                class={`w-full h-full object-cover ${participant.isLocal && !participant.isScreen ? "scale-x-[-1]" : ""}`}
              />
              <div class="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-md text-xs text-slate-200 flex items-center gap-2">
                <span>{participant.name}</span>
                {participant.isMuted && <span class="text-red-400">🔇</span>}
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}