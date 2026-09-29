import { For, Show, createEffect } from "solid-js";

/**
 * Pre-join screen with video preview, device selection, and join button.
 * All signal props are SolidJS accessor functions.
 */
export function PreJoinScreen(props) {
  let videoRef = null;

  // Attach preview stream to video element whenever it changes
  createEffect(() => {
    const stream = props.previewStream();
    if (videoRef && stream) {
      videoRef.srcObject = stream;
      videoRef.play().catch(() => {});
    }
  });

  return (
    <div class="flex flex-col h-screen w-full bg-[#1a1a1a] overflow-hidden" style="height: 100dvh;">
      {/* Video Preview Area */}
      <div class="relative flex-1 w-full px-2 sm:px-4 py-2 overflow-hidden flex items-center justify-center" style="max-height: 65vh;">

        {/* Video Preview Container */}
        <div class="relative w-full h-full bg-black rounded-2xl overflow-hidden shadow-2xl max-w-3xl">
          <Show when={props.previewVideoEnabled()} fallback={
            <div class="w-full h-full flex items-center justify-center bg-[#2a2a2a]">
              <div class="flex flex-col items-center">
                <div class="w-16 h-16 rounded-full bg-[#3a3a3a] flex items-center justify-center mb-2">
                  <svg class="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <span class="text-gray-400 text-sm">Camera is off</span>
              </div>
            </div>
          }>
            <video
              autoplay
              playsinline
              muted
              ref={(el) => {
                videoRef = el;
                if (props.onVideoRef) props.onVideoRef(el);
              }}
              style="transform: scaleX(1); -webkit-transform: scaleX(1);"
              class="w-full h-full object-cover"
            />
          </Show>

          {/* Floating control panel */}
          <div class="absolute bottom-3 inset-x-0 flex items-center justify-center space-x-6 z-20">

            {/* Audio Toggle */}
            <button
              onClick={props.onTogglePreviewAudio}
              class={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition border-none bg-transparent !bg-transparent outline-none p-0 ${
                props.previewAudioEnabled() ? "text-white" : "text-red-500"
              }`}
            >
              <div class={`w-10 h-10 rounded-full flex items-center justify-center mb-0.5 shadow-md ${
                props.previewAudioEnabled() ? 'bg-black/60 backdrop-blur-md' : 'bg-red-500'
              }`}>
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <span class="text-[9px] font-semibold text-white drop-shadow-md">Audio</span>
            </button>

            {/* Video Toggle */}
            <button
              onClick={props.onTogglePreviewVideo}
              class={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition border-none bg-transparent !bg-transparent outline-none p-0 ${
                props.previewVideoEnabled() ? "text-white" : "text-red-500"
              }`}
            >
              <div class={`w-10 h-10 rounded-full flex items-center justify-center mb-0.5 shadow-md ${
                props.previewVideoEnabled() ? 'bg-black/60 backdrop-blur-md' : 'bg-red-500'
              }`}>
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <span class="text-[9px] font-semibold text-white drop-shadow-md">Video</span>
            </button>

            {/* Background Button */}
            <button
              onClick={props.onToggleBackgrounds}
              class="flex flex-col items-center justify-center w-14 h-14 rounded-xl transition border-none bg-transparent !bg-transparent outline-none p-0 text-white"
            >
              <div class="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center mb-0.5 shadow-md">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span class="text-[9px] font-semibold text-white drop-shadow-md">BG</span>
            </button>

          </div>

          {/* Background Panel */}
          <Show when={props.backgroundsOpen()}>
            <div class="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md p-4 rounded-b-2xl">
              <h3 class="text-sm font-semibold text-white mb-3">Background</h3>
              <div class="grid grid-cols-3 gap-3">
                <button
                  onClick={() => props.onSelectBackground({ enabled: false, kind: { type: "none" } })}
                  class="flex flex-col items-center"
                >
                  <div class="aspect-video w-full rounded-lg bg-[#3a3a3a] flex items-center justify-center border-2 border-transparent hover:border-blue-500 transition">
                    <span class="text-xs text-gray-300">None</span>
                  </div>
                </button>
                <button
                  onClick={() => props.onSelectBackground({ enabled: true, kind: { type: "blur" } })}
                  class="flex flex-col items-center"
                >
                  <div class="aspect-video w-full rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center border-2 border-transparent hover:border-blue-500 transition">
                    <span class="text-xs text-white">Blur</span>
                  </div>
                </button>
                <button
                  onClick={() => props.onSelectBackground({ enabled: true, kind: { type: "color", value: "#2563eb" } })}
                  class="flex flex-col items-center"
                >
                  <div class="aspect-video w-full rounded-lg bg-blue-600 flex items-center justify-center border-2 border-transparent hover:border-blue-500 transition">
                    <span class="text-xs text-white">Blue</span>
                  </div>
                </button>
              </div>
            </div>
          </Show>

        </div>
      </div>

      {/* Device Selection & Join */}
      <div class="shrink-0 px-4 pb-6 pt-2 space-y-3">
        <div class="max-w-md mx-auto space-y-3">

          {/* Microphone Select */}
          <div class="relative w-full">
            <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <select
              value={props.selectedMic()}
              onChange={(e) => props.onDeviceChange('audio', e.currentTarget.value)}
              class="w-full bg-[#2a2a2a] text-white rounded-xl pl-10 pr-10 py-2 sm:py-2.5 text-xs sm:text-sm border border-[#3a3a3a] outline-none appearance-none cursor-pointer"
            >
              <For each={props.devices().audio}>
                {(device) => <option value={device.deviceId}>{device.label || device.deviceId}</option>}
              </For>
            </select>
            <div class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>

          {/* Camera Select */}
          <div class="relative w-full">
            <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <select
              value={props.selectedCam()}
              onChange={(e) => props.onDeviceChange('video', e.currentTarget.value)}
              class="w-full bg-[#2a2a2a] text-white rounded-xl pl-10 pr-10 py-2 sm:py-2.5 text-xs sm:text-sm border border-[#3a3a3a] outline-none appearance-none cursor-pointer"
            >
              <For each={props.devices().video}>
                {(device) => <option value={device.deviceId}>{device.label || device.deviceId}</option>}
              </For>
            </select>
            <div class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
          </div>

          {/* Checkbox and Join Button */}
          <div class="w-full flex flex-col space-y-2">
            <label class="flex items-center space-x-1.5 sm:space-x-2 cursor-pointer group select-none px-0.5 sm:px-1">
              <div class="relative shrink-0">
                <input
                  type="checkbox"
                  checked={props.alwaysShowPreview()}
                  onChange={props.onToggleAlwaysShow}
                  class="peer sr-only"
                />
                <div class="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border border-gray-500 bg-transparent peer-checked:bg-blue-600 peer-checked:border-blue-600 transition flex items-center justify-center">
                  <Show when={props.alwaysShowPreview()}>
                    <svg class="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </Show>
                </div>
              </div>
              <span class="text-xs sm:text-sm text-gray-300 group-hover:text-white transition">Always show preview</span>
            </label>

            {/* Join Button */}
            <button
              onClick={props.onJoin}
              disabled={props.isConnecting()}
              class="w-full py-2.5 sm:py-3 bg-[#0E71EB] hover:bg-[#0d65d4] disabled:bg-[#0E71EB]/50 text-white font-semibold text-xs sm:text-sm rounded-xl transition shadow-lg border-none outline-none"
            >
              {props.isConnecting() ? 'Connecting...' : 'Start'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
