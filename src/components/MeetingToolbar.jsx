/**
 * Meeting action toolbar with 6 buttons:
 * Mute, Camera, Screen Share, Raise Hand, Chat, Leave.
 * All state props are SolidJS signal accessors.
 */
export function MeetingToolbar(props) {
  return (
    <div class="max-w-lg mx-auto grid grid-cols-6 gap-x-0.5 justify-items-center items-start">

      {/* 1. Mute */}
      <button
        onClick={props.onToggleMute}
        class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0 select-none"
      >
        <div class={`w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] flex items-center justify-center mb-1 shadow-md transition-all duration-200 active:scale-95 ${
          props.isMuted()
            ? "bg-red-500 text-white"
            : "bg-[#2a2a2a] text-gray-200 group-hover:bg-[#3a3a3a]"
        }`}>
          {props.isMuted() ? (
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </div>
        <span class={`text-[9px] sm:text-[10px] font-medium tracking-wide truncate w-full text-center ${
          props.isMuted() ? "text-red-400" : "text-gray-400"
        }`}>
          {props.isMuted() ? "Unmute" : "Mute"}
        </span>
      </button>

      {/* 2. Camera */}
      <button
        onClick={props.onToggleCamera}
        class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0 select-none"
      >
        <div class={`w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] flex items-center justify-center mb-1 shadow-md transition-all duration-200 active:scale-95 ${
          props.isCameraOff()
            ? "bg-red-500 text-white"
            : "bg-[#2a2a2a] text-gray-200 group-hover:bg-[#3a3a3a]"
        }`}>
          {props.isCameraOff() ? (
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          ) : (
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </div>
        <span class={`text-[9px] sm:text-[10px] font-medium tracking-wide truncate w-full text-center ${
          props.isCameraOff() ? "text-red-400" : "text-gray-400"
        }`}>
          {props.isCameraOff() ? "Start Video" : "Stop Video"}
        </span>
      </button>

      {/* 3. Screen Share */}
      <button
        onClick={props.onToggleScreenShare}
        class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0 select-none"
      >
        <div class={`w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] flex items-center justify-center mb-1 shadow-md transition-all duration-200 active:scale-95 ${
          props.isSharingScreen()
            ? "bg-green-600 text-white"
            : "bg-[#2a2a2a] text-gray-200 group-hover:bg-[#3a3a3a]"
        }`}>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <span class={`text-[9px] sm:text-[10px] font-medium tracking-wide truncate w-full text-center ${
          props.isSharingScreen() ? "text-green-400" : "text-gray-400"
        }`}>
          {props.isSharingScreen() ? "Stop Share" : "Share"}
        </span>
      </button>

      {/* 4. Raise Hand */}
      <button
        onClick={props.onToggleHand}
        class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0 select-none"
      >
        <div class={`w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] flex items-center justify-center mb-1 shadow-md transition-all duration-200 active:scale-95 ${
          props.isHandRaised()
            ? "bg-yellow-500 text-white"
            : "bg-[#2a2a2a] text-gray-200 group-hover:bg-[#3a3a3a]"
        }`}>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
          </svg>
        </div>
        <span class={`text-[9px] sm:text-[10px] font-medium tracking-wide truncate w-full text-center ${
          props.isHandRaised() ? "text-yellow-400" : "text-gray-400"
        }`}>
          {props.isHandRaised() ? "Lower" : "Raise"}
        </span>
      </button>

      {/* 5. Chat */}
      <button
        onClick={props.onToggleChat}
        class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0 relative select-none"
      >
        <div class={`w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] flex items-center justify-center mb-1 shadow-md transition-all duration-200 active:scale-95 ${
          props.chatOpen()
            ? "bg-blue-600 text-white"
            : "bg-[#2a2a2a] text-gray-200 group-hover:bg-[#3a3a3a]"
        }`}>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <span class="text-[9px] sm:text-[10px] font-medium tracking-wide text-gray-400 text-center truncate w-full">
          Chat
        </span>
      </button>

      {/* 6. Leave */}
      <button
        onClick={props.onLeave}
        class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0 select-none"
      >
        <div class="w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[18px] bg-red-600 hover:bg-red-700 text-white flex items-center justify-center mb-1 shadow-md transition-all duration-200 active:scale-95">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </div>
        <span class="text-[9px] sm:text-[10px] font-medium tracking-wide text-red-500 text-center truncate w-full">
          Leave
        </span>
      </button>

    </div>
  );
}
