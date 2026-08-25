import { createSignal, onCleanup } from "solid-js";

export function MainWindow(props) {
  const [activeTab, setActiveTab] = createSignal("home");

  // Helper to get formatted date and time
  const getFormattedDate = (date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  const getFormattedTime = (date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const [currentTime, setCurrentTime] = createSignal(new Date());

  // Update time every second
  const timer = setInterval(() => setCurrentTime(new Date()), 1000);
  onCleanup(() => clearInterval(timer));

  // Handle Join button click – prompt for room code
  const handleJoinClick = () => {
    const room = prompt("Enter room code to join:");
    if (room && room.trim()) {
      props.onJoinMeeting(room.trim());
    }
  };

  return (
    <div class="flex h-screen bg-[#111111] text-white select-none overflow-hidden">
      
      {/* Sidebar Navigation - unchanged */}
      <aside class="w-16 bg-[#1c1c1c] flex flex-col items-center justify-between py-5 border-r border-gray-800/40 shrink-0">
        <div class="flex flex-col items-center space-y-5">
          <button class="flex flex-col items-center text-blue-400 group focus:outline-none">
            <div class="p-1.5 rounded-xl bg-blue-600/20 text-blue-400 mb-0.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
            </div>
            <span class="text-[9px] font-medium">Home</span>
          </button>
          <button class="flex flex-col items-center text-gray-400 hover:text-white transition group">
            <div class="p-1.5 rounded-xl hover:bg-gray-800 mb-0.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </div>
            <span class="text-[9px] font-medium">Meetings</span>
          </button>
          <button class="flex flex-col items-center text-gray-400 hover:text-white transition group">
            <div class="p-1.5 rounded-xl hover:bg-gray-800 mb-0.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
            </div>
            <span class="text-[9px] font-medium">Chat</span>
          </button>
          <button class="flex flex-col items-center text-gray-400 hover:text-white transition group">
            <div class="p-1.5 rounded-xl hover:bg-gray-800 mb-0.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
            </div>
            <span class="text-[9px] font-medium">Hub</span>
          </button>
          <button class="flex flex-col items-center text-gray-400 hover:text-white transition group">
            <div class="p-1.5 rounded-xl hover:bg-gray-800 mb-0.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"/></svg>
            </div>
            <span class="text-[9px] font-medium">More</span>
          </button>
        </div>

        <div class="flex flex-col items-center">
          <button class="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main class="flex-1 flex flex-col px-6 py-4 overflow-y-auto">

      <header class="flex items-center justify-between px-6 py-2 border-b border-gray-800/40 shrink-0 bg-[#111111]">
        {/* Right: Time, Bell, Avatar */}
        <div class="flex items-center space-x-4">
          {/* <span class="text-sm font-medium text-gray-400">{getFormattedTime(currentTime())}</span> */}
          <button class="text-gray-400 hover:text-white transition">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
            </svg>
          </button>
          <img
            src="https://ui-avatars.com/api/?name=You&background=4F46E5&color=fff&size=32"
            alt="Profile"
            class="w-8 h-8 rounded-full bg-gray-700"
          />
        </div>
      </header>

        {/* Top Header AI Sparkle
        <div class="flex justify-end items-center mb-1">
          <button class="w-8 h-8 bg-[#222222] hover:bg-[#2a2a2a] rounded-full flex items-center justify-center text-gray-300 transition shadow-inner">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
          </button>
        </div> */}

        {/* Clock & Date */}
        <div class="flex flex-col items-center justify-center my-2">
          <h1 class="text-4xl font-semibold tracking-tight text-white mb-0.5">
            {getFormattedTime(currentTime())}
          </h1>
          <p class="text-xs font-medium text-gray-400">
            {getFormattedDate(currentTime())}
          </p>
        </div>

        {/* Action Grid */}
        <div class="grid grid-cols-5 gap-2.5 max-w-2xl mx-auto w-full my-3">
          
          {/* New Meeting */}
          <button 
            onClick={() => props.onJoinMeeting("general")}
            class="flex flex-col items-center justify-center py-2.5 bg-transparent hover:bg-[#1c1c1c] rounded-xl transition group"
          >
            <div class="w-12 h-12 bg-[#FF7429] rounded-2xl flex items-center justify-center mb-1.5 shadow-md group-hover:scale-105 transition">
              <svg viewBox="0 0 512 512" class="w-7 h-7" xmlns="http://www.w3.org/2000/svg">
                <rect x="110" y="176" width="180" height="160" rx="40" fill="#FFFFFF"/>
                <path d="M330 200 L410 150 C422 142 438 151 438 166 V346 C438 361 422 370 410 362 L330 312 Z" fill="#FFFFFF"/>
              </svg>
            </div>
            <div class="flex items-center space-x-1 text-[11px] font-medium text-gray-300">
              <span>New meeting</span>
              <svg class="w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </div>
          </button>

          {/* Join Button - now a single button with prompt */}
          <button
            onClick={handleJoinClick}
            class="flex flex-col items-center justify-center py-2.5 bg-transparent hover:bg-[#1c1c1c] rounded-xl transition group"
          >
            <div class="w-12 h-12 bg-[#0E71EB] rounded-2xl flex items-center justify-center mb-1.5 shadow-md group-hover:scale-105 transition">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
              </svg>
            </div>
            <span class="text-[11px] font-medium text-gray-300">Join</span>
          </button>

          {/* Schedule */}
          <button class="flex flex-col items-center justify-center py-2.5 bg-transparent hover:bg-[#1c1c1c] rounded-xl transition group">
            <div class="w-12 h-12 bg-[#0E71EB] rounded-2xl flex items-center justify-center mb-1.5 shadow-md group-hover:scale-105 transition">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            </div>
            <span class="text-[11px] font-medium text-gray-300">Schedule</span>
          </button>

          {/* Share Screen */}
          <button class="flex flex-col items-center justify-center py-2.5 bg-transparent hover:bg-[#1c1c1c] rounded-xl transition group">
            <div class="w-12 h-12 bg-[#0E71EB] rounded-2xl flex items-center justify-center mb-1.5 shadow-md group-hover:scale-105 transition">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            </div>
            <span class="text-[11px] font-medium text-gray-300">Share screen</span>
          </button>

          {/* My Notes */}
          <button class="flex flex-col items-center justify-center py-2.5 bg-transparent hover:bg-[#1c1c1c] rounded-xl transition group">
            <div class="w-12 h-12 bg-[#0E71EB] rounded-2xl flex items-center justify-center mb-1.5 shadow-md group-hover:scale-105 transition">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </div>
            <span class="text-[11px] font-medium text-gray-300">My Notes</span>
          </button>
        </div>

        {/* Meetings Panel */}
        <div class="max-w-2xl mx-auto w-full bg-[#1c1c1c] rounded-xl border border-gray-800/60 shadow-lg overflow-hidden mt-1">
          <div class="px-4 py-3 flex items-center justify-between border-b border-gray-800/40">
            <div class="flex items-center space-x-2">
              <button class="w-6 h-6 bg-gray-800 hover:bg-gray-700 rounded-md flex items-center justify-center text-gray-300 transition">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              </button>
              <div class="flex items-center space-x-1 text-xs font-medium text-white cursor-pointer hover:text-gray-300">
                <span>{getFormattedDate(currentTime())}</span>
                <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>
            <div class="flex items-center space-x-2 text-gray-400">
              <button class="px-2.5 py-0.5 bg-gray-800 hover:bg-gray-700 text-[11px] text-white rounded transition">Today</button>
              <button class="hover:text-white"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg></button>
              <button class="hover:text-white"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg></button>
              <button class="hover:text-white"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h.01M12 12h.01M19 12h.01"/></svg></button>
            </div>
          </div>

          <div class="flex flex-col items-center justify-center py-6 px-4">
            <div class="w-24 h-18 mb-2 flex items-center justify-center">
              <svg viewBox="0 0 200 140" class="w-full h-full drop-shadow-sm" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="100" cy="115" rx="45" ry="12" fill="#2d3342" opacity="0.6"/>
                <path d="M75 105 L125 105 L135 115 L65 115 Z" fill="#64748b"/>
                <rect x="85" y="95" width="30" height="12" rx="4" fill="#94a3b8" transform="rotate(-15 100 100)"/>
                <line x1="100" y1="65" x2="100" y2="110" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/>
                <path d="M50 70 Q100 35 150 70 Q125 60 100 65 Q75 60 50 70 Z" fill="#f8fafc"/>
                <path d="M65 67 Q100 40 135 67 Q100 60 65 67 Z" fill="#cbd5e1"/>
              </svg>
            </div>
            <p class="text-xs text-gray-400 font-medium">No meetings scheduled.</p>
          </div>

          <div class="px-4 py-2.5 border-t border-gray-800/40 bg-[#171717]/50 flex items-center justify-between text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer">
            <span class="font-medium">Open recordings</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div>
        </div>

      </main>
    </div>
  );
}