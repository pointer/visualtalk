import { For, createEffect } from "solid-js";

export function VideoGrid(props) {
  // props.participants will be a reactive array of participant objects
  
  return (
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 w-full h-full bg-slate-950 overflow-y-auto">
      <For each={props.participants}>
        {(participant) => {
          let videoRef;

          // Attach the video track element when it renders or updates
          createEffect(() => {
            const videoTrack = participant.videoTrack;
            if (videoTrack && videoRef) {
              videoTrack.attach(videoRef);
            }
          });

          return (
            <div class="relative bg-slate-900 rounded-xl overflow-hidden shadow-lg border border-slate-800 aspect-video flex items-center justify-center">
              <video
                ref={videoRef}
                autoplay
                playsinline
                muted={participant.isLocal} // Mute local audio to prevent feedback loops
                class="w-full h-full object-cover"
              />
              <div class="absolute bottom-3 left-3 bg-slate-900/70 backdrop-blur-md px-3 py-1 rounded-md text-xs text-slate-200 flex items-center gap-2">
                <span>{participant.name || "Participant"}</span>
                {participant.isMuted && <span class="text-red-400">🔇</span>}
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}