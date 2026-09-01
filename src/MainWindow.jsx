import { createSignal, onCleanup, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { SettingsTab } from "./components/SettingsTab";
import { NotesTab } from "./components/NotesTab";
import { Modal } from "./components/Modal";

export function MainWindow(props) {
  const [activeTab, setActiveTab] = createSignal("home");
  const [showNewMeetingMenu, setShowNewMeetingMenu] = createSignal(false);
  const [showPmiSubMenu, setShowPmiSubMenu] = createSignal(false);

  // Backed by Rust State
  const [profile, setProfile] = createSignal({
    identity: "User1",
    display_name: "You",
    email: "user@visualtalk.local",
    pmi: "231 809 1164",
  });
  const [settings, setSettings] = createSignal({
    start_with_video: true,
    use_pmi: false,
    always_show_preview: true,
    mute_on_join: false,
  });
  const [scheduledMeetings, setScheduledMeetings] = createSignal([]);
  const [showJoinModal, setShowJoinModal] = createSignal(false);
  const [joinRoomCode, setJoinRoomCode] = createSignal("");
  const [showScheduleModal, setShowScheduleModal] = createSignal(false);
  const [scheduleData, setScheduleData] = createSignal({
    title: "Team Sync",
    room: "",
    date: new Date().toISOString().split("T")[0],
    time: "10:00",
  });

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
  const timer = setInterval(() => setCurrentTime(new Date()), 1000);
  onCleanup(() => clearInterval(timer));

  // Load state from Rust backend
  const loadBackendState = async () => {
    try {
      const p = await invoke("get_user_profile");
      setProfile(p);
    } catch (err) {
      console.error("Failed to load user profile:", err);
    }

    try {
      const s = await invoke("get_user_settings");
      setSettings(s);
    } catch (err) {
      console.error("Failed to load user settings:", err);
    }

    try {
      const m = await invoke("get_scheduled_meetings");
      setScheduledMeetings(m);
    } catch (err) {
      console.error("Failed to load scheduled meetings:", err);
    }
  };

  onMount(() => {
    loadBackendState();

    const handleClickOutside = (e) => {
      const dropdownContainer = document.querySelector('.new-meeting-dropdown-container');
      if (dropdownContainer && !dropdownContainer.contains(e.target)) {
        setShowNewMeetingMenu(false);
        setShowPmiSubMenu(false);
      }
    };
    window.addEventListener('click', handleClickOutside);
    onCleanup(() => window.removeEventListener('click', handleClickOutside));
  });

  const getInitials = (name) => {
    if (!name) return "VT";
    const trimmed = name.trim();
    if (trimmed.length === 0) return "VT";
    const parts = trimmed.split(" ");
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  };

  const toggleNewMeetingMenu = (e) => {
    e.stopPropagation();
    setShowNewMeetingMenu(!showNewMeetingMenu());
    if (showNewMeetingMenu()) setShowPmiSubMenu(false);
  };

  const togglePmiSubMenu = (e) => {
    e.stopPropagation();
    setShowPmiSubMenu(!showPmiSubMenu());
  };

  const toggleSetting = async (key) => {
    const current = settings();
    const updated = { ...current, [key]: !current[key] };
    setSettings(updated);
    try {
      await invoke("update_user_settings", { settings: updated });
    } catch (err) {
      console.error(`Failed to update ${key}:`, err);
    }
  };

  const handleStartMeeting = () => {
    const room = settings().use_pmi
      ? profile().pmi.replace(/\s+/g, "")
      : "general";
    props.onJoinMeeting(room);
  };

  const handleJoinClick = () => {
    setJoinRoomCode("");
    setShowJoinModal(true);
  };

  const handleJoinConfirm = () => {
    const room = joinRoomCode().trim();
    if (room) {
      props.onJoinMeeting(room);
      setShowJoinModal(false);
    }
  };

  const handleNewMeetingAction = async (action) => {
    setShowNewMeetingMenu(false);
    setShowPmiSubMenu(false);

    const activeRoom = profile().pmi.replace(/\s+/g, "");

    if (action === "Copy ID") {
      await navigator.clipboard.writeText(profile().pmi);
      alert(`Copied PMI: ${profile().pmi}`);
    } else if (action === "Copy meeting link") {
      const link = `https://visualtalk.app/j/${activeRoom}`;
      await navigator.clipboard.writeText(link);
      alert(`Copied meeting link: ${link}`);
    } else if (action === "Copy invitation") {
      try {
        const inviteText = await invoke("get_meeting_invite", { room: activeRoom });
        await navigator.clipboard.writeText(inviteText);
        alert("Meeting invitation copied to clipboard!");
      } catch (err) {
        console.error("Failed to copy invite:", err);
      }
    } else if (action === "PMI settings") {
      const newPmi = prompt("Enter new Personal Meeting ID:", profile().pmi);
      if (newPmi && newPmi.trim()) {
        const updatedProfile = { ...profile(), pmi: newPmi.trim() };
        try {
          await invoke("update_user_profile", { profile: updatedProfile });
          setProfile(updatedProfile);
          alert("PMI updated successfully!");
        } catch (err) {
          console.error("Failed to update PMI:", err);
        }
      }
    }
  };

  const handleScheduleClick = () => {
    setScheduleData({
      title: "Team Sync",
      room: `room-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().split("T")[0],
      time: "10:00",
    });
    setShowScheduleModal(true);
  };

  const handleScheduleConfirm = async () => {
    const { title, room, date, time } = scheduleData();
    if (!title.trim() || !room.trim()) return;

    try {
      const startISO = new Date(`${date}T${time}`).toISOString();
      const newMeeting = await invoke("schedule_meeting", {
        title: title.trim(),
        roomId: room.trim(),
        startTime: startISO,
        durationMinutes: 30,
      });
      setScheduledMeetings((prev) => [...prev, newMeeting]);
      setShowScheduleModal(false);
    } catch (err) {
      console.error("Failed to schedule meeting:", err);
      alert("Failed to schedule meeting.");
    }
  };

  const handleDeleteMeeting = async (e, id) => {
    e.stopPropagation();
    try {
      await invoke("delete_scheduled_meeting", { id });
      setScheduledMeetings((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("Failed to delete meeting:", err);
    }
  };

  return (
    <div class="flex h-screen bg-[#111111] text-white select-none overflow-hidden">
      {/* Sidebar */}
      <aside class="w-16 bg-[#1c1c1c] flex flex-col items-center justify-between py-5 border-r border-gray-800/40 shrink-0">
        <div class="flex flex-col items-center space-y-5">
          <button
            onClick={() => setActiveTab("home")}
            class={`flex flex-col items-center transition group focus:outline-none ${
              activeTab() === "home"
                ? "text-blue-400"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <div
              class={`p-1.5 rounded-xl mb-0.5 transition ${
                activeTab() === "home"
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-gray-400 group-hover:bg-gray-800"
              }`}
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
            </div>
            <span class="text-[9px] font-medium">Home</span>
          </button>

          <button
            onClick={() => setActiveTab("meetings")}
            class={`flex flex-col items-center transition group focus:outline-none ${
              activeTab() === "meetings"
                ? "text-blue-400"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <div
              class={`p-1.5 rounded-xl mb-0.5 transition ${
                activeTab() === "meetings"
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-gray-400 group-hover:bg-gray-800"
              }`}
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span class="text-[9px] font-medium">Meetings</span>
          </button>

          <button
            onClick={() => setActiveTab("chat")}
            class={`flex flex-col items-center transition group focus:outline-none ${
              activeTab() === "chat"
                ? "text-blue-400"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <div
              class={`p-1.5 rounded-xl mb-0.5 transition ${
                activeTab() === "chat"
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-gray-400 group-hover:bg-gray-800"
              }`}
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
            </div>
            <span class="text-[9px] font-medium">Chat</span>
          </button>

          <button
            onClick={() => setActiveTab("hub")}
            class={`flex flex-col items-center transition group focus:outline-none ${
              activeTab() === "hub"
                ? "text-blue-400"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <div
              class={`p-1.5 rounded-xl mb-0.5 transition ${
                activeTab() === "hub"
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-gray-400 group-hover:bg-gray-800"
              }`}
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <span class="text-[9px] font-medium">Hub</span>
          </button>
        </div>

        <div class="flex flex-col items-center">
          <button
            onClick={() => setActiveTab("settings")}
            class={`p-2 rounded-xl transition focus:outline-none ${
              activeTab() === "settings"
                ? "bg-blue-600/20 text-blue-400"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main class="flex-1 flex flex-col overflow-y-auto bg-[#111111]">
        <Show
          when={activeTab() !== "settings" && activeTab() !== "notes"}
          fallback={<Show when={activeTab() === "settings"} fallback={<NotesTab onSaveComplete={() => setActiveTab("home")} />}>
            <SettingsTab profile={profile()} settings={settings()} />
          </Show>}
        >
          {/* Top Bar */}
          <header class="flex items-center justify-end px-6 py-2 border-b border-gray-800/40 shrink-0 bg-[#111111]">
          <div class="flex items-center space-x-4">
            <button class="text-gray-400 hover:text-white transition">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
              </svg>
            </button>
            <div class="w-8 h-8 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-xs font-semibold shadow">
              {getInitials(profile().display_name || profile().identity)}
            </div>
          </div>
        </header>

        {/* Clock & Date */}
        <div class="flex flex-col items-center justify-center my-3">
          <h1 class="text-4xl font-semibold tracking-tight text-white mb-0.5">
            {getFormattedTime(currentTime())}
          </h1>
          <p class="text-xs font-medium text-gray-400">
            {getFormattedDate(currentTime())}
          </p>
        </div>

        {/* Action Buttons */}
        <div class="max-w-2xl mx-auto w-full my-3">
          <div class="grid grid-cols-5 gap-2.5">
            {/* New Meeting with dropdown */}
            <div class="new-meeting-dropdown-container relative flex flex-col items-center justify-center py-2.5 bg-transparent group">
              <div class="relative flex items-center">
                <button
                  onClick={handleStartMeeting}
                  style="background-color: #FF7429;"
                  class="w-16 h-16 rounded-[22px] flex items-center justify-center mb-1.5 shadow-lg hover:brightness-110 transition cursor-pointer"
                >
                  <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45-1-1v-3.5l4 4v-11l-4 4z"/>
                  </svg>
                </button>
              </div>

              <div
                onClick={toggleNewMeetingMenu}
                class="flex items-center space-x-1 text-[11px] font-medium text-gray-300 cursor-pointer hover:text-white"
              >
                <span>New meeting</span>
                <svg class="w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </div>

              {/* Main Dropdown */}
              {showNewMeetingMenu() && (
                <div class="absolute top-full left-0 mt-2 w-72 bg-[#222222] rounded-xl shadow-2xl border border-gray-700/80 overflow-visible z-50 py-1.5">
                  {/* Start with video */}
                  <div
                    class="flex items-center px-4 py-2.5 hover:bg-[#2c2c2c] transition cursor-pointer"
                    onClick={() => toggleSetting("start_with_video")}
                  >
                    <div class={`w-4 h-4 rounded flex items-center justify-center mr-3 border ${settings().start_with_video ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-500 bg-transparent'}`}>
                      {settings().start_with_video && (
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span class="text-sm text-gray-200">Start with video</span>
                  </div>

                  <div class="h-[1px] bg-gray-700/50 my-1"></div>

                  {/* Use my personal meeting ID (PMI) */}
                  <div
                    class="flex items-center px-4 py-2.5 hover:bg-[#2c2c2c] transition cursor-pointer"
                    onClick={() => toggleSetting("use_pmi")}
                  >
                    <div class={`w-4 h-4 rounded flex items-center justify-center mr-3 border ${settings().use_pmi ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-500 bg-transparent'}`}>
                      {settings().use_pmi && (
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span class="text-sm text-gray-200">Use my personal meeting ID (PMI)</span>
                  </div>

                  {/* PMI number row */}
                  <div
                    class={`relative px-4 py-2.5 transition cursor-pointer flex items-center justify-between ${showPmiSubMenu() ? 'bg-[#0E71EB] text-white' : 'hover:bg-[#2c2c2c] text-gray-200'}`}
                    onClick={togglePmiSubMenu}
                  >
                    <span class="text-sm font-medium tracking-wide">{profile().pmi}</span>
                    <svg class="w-4 h-4 opacity-75" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                    </svg>

                    {/* Flyout Sub-menu */}
                    {showPmiSubMenu() && (
                      <div class="absolute left-full top-0 ml-1.5 w-56 bg-[#222222] rounded-xl shadow-2xl border border-gray-700/80 overflow-hidden z-50 py-1 text-white">
                        <button
                          onClick={() => handleNewMeetingAction("Copy meeting link")}
                          class="w-full text-left px-4 py-2.5 text-sm hover:bg-[#2c2c2c] transition text-gray-200"
                        >
                          Copy meeting link
                        </button>
                        <button
                          onClick={() => handleNewMeetingAction("Copy ID")}
                          class="w-full text-left px-4 py-2.5 text-sm hover:bg-[#2c2c2c] transition text-gray-200"
                        >
                          Copy ID
                        </button>
                        <button
                          onClick={() => handleNewMeetingAction("Copy invitation")}
                          class="w-full text-left px-4 py-2.5 text-sm bg-[#0E71EB] hover:bg-blue-600 transition text-white"
                        >
                          Copy invitation
                        </button>
                        <button
                          onClick={() => handleNewMeetingAction("PMI settings")}
                          class="w-full text-left px-4 py-2.5 text-sm hover:bg-[#2c2c2c] transition text-gray-200"
                        >
                          PMI settings
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Join */}
            <button
              onClick={handleJoinClick}
              class="flex flex-col items-center justify-center py-2.5 bg-transparent group"
            >
              <div class="w-16 h-16 bg-[#0E71EB] rounded-[22px] flex items-center justify-center mb-1.5 shadow-md group-hover:scale-105 transition">
                <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                </svg>
              </div>
              <span class="text-[11px] font-medium text-gray-300">Join</span>
            </button>

            {/* Schedule */}
            <button
              onClick={handleScheduleClick}
              class="flex flex-col items-center justify-center py-2.5 bg-transparent group"
            >
              <div class="w-16 h-16 bg-[#0E71EB] rounded-[22px] flex items-center justify-center mb-1.5 shadow-md group-hover:scale-105 transition">
                <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <span class="text-[11px] font-medium text-gray-300">Schedule</span>
            </button>

            {/* Share Screen */}
            <button
              onClick={handleStartMeeting}
              class="flex flex-col items-center justify-center py-2.5 bg-transparent group"
            >
              <div class="w-16 h-16 bg-[#0E71EB] rounded-[22px] flex items-center justify-center mb-1.5 shadow-md group-hover:scale-105 transition">
                <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              </div>
              <span class="text-[11px] font-medium text-gray-300">Share screen</span>
            </button>

            {/* My Notes */}
            <button
              onClick={() => setActiveTab("notes")}
              class={`flex flex-col items-center justify-center py-2.5 bg-transparent group ${
                activeTab() === "notes" ? "text-blue-400" : ""
              }`}
            >
              <div class={`w-16 h-16 rounded-[22px] flex items-center justify-center mb-1.5 shadow-md group-hover:scale-105 transition ${
                activeTab() === "notes" ? "bg-blue-600" : "bg-[#0E71EB]"
              }`}>
                <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
              </div>
              <span class="text-[11px] font-medium text-gray-300">My Notes</span>
            </button>
          </div>
        </div>

        {/* Meetings Panel */}
        <div class="max-w-2xl mx-auto w-full bg-[#1c1c1c] rounded-xl border border-gray-800/60 shadow-lg overflow-hidden mt-3">
          <div class="px-4 py-3 flex items-center justify-between border-b border-gray-800/40">
            <div class="flex items-center space-x-2">
              <button
                onClick={handleScheduleClick}
                class="w-6 h-6 bg-gray-800 hover:bg-gray-700 rounded-md flex items-center justify-center text-gray-300 transition"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
              </button>
              <div class="flex items-center space-x-1 text-xs font-medium text-white cursor-pointer hover:text-gray-300">
                <span>{getFormattedDate(currentTime())}</span>
              </div>
            </div>
            <div class="flex items-center space-x-2 text-gray-400">
              <span class="text-[11px] font-medium text-gray-400">
                {scheduledMeetings().length} scheduled
              </span>
            </div>
          </div>

          <div class="p-4">
            {scheduledMeetings().length === 0 ? (
              <div class="flex flex-col items-center justify-center py-6">
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
            ) : (
              <div class="flex flex-col space-y-2">
                <For each={scheduledMeetings()}>
                  {(m) => (
                    <div class="flex items-center justify-between p-3 rounded-lg bg-[#242424] hover:bg-[#2a2a2a] transition">
                      <div class="flex flex-col">
                        <span class="text-sm font-medium text-white">{m.title}</span>
                        <span class="text-xs text-gray-400">Room: #{m.room_id} • {m.duration_minutes} mins</span>
                      </div>
                      <div class="flex items-center space-x-2">
                        <button
                          onClick={() => props.onJoinMeeting(m.room_id)}
                          class="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-xs font-semibold rounded-md transition text-white"
                        >
                          Start
                        </button>
                        <button
                          onClick={(e) => handleDeleteMeeting(e, m.id)}
                          class="p-1 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded transition"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            )}
          </div>
        </div>
        </Show>

        {/* Modals */}
        <Show when={showJoinModal()}>
          <Modal
            title="Join Meeting"
            confirmText="Join"
            onClose={() => setShowJoinModal(false)}
            onConfirm={handleJoinConfirm}
          >
            <div class="flex flex-col space-y-4">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1.5">Room Code</label>
                <input
                  type="text"
                  value={joinRoomCode()}
                  onInput={(e) => setJoinRoomCode(e.currentTarget.value)}
                  class="w-full px-3 py-2 rounded-lg bg-[#111111] border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-600/50"
                  placeholder="e.g. general"
                />
              </div>
            </div>
          </Modal>
        </Show>

        <Show when={showScheduleModal()}>
          <Modal
            title="Schedule Meeting"
            confirmText="Schedule"
            onClose={() => setShowScheduleModal(false)}
            onConfirm={handleScheduleConfirm}
          >
            <div class="flex flex-col space-y-4">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1.5">Meeting Title</label>
                <input
                  type="text"
                  value={scheduleData().title}
                  onInput={(e) => setScheduleData({ ...scheduleData(), title: e.currentTarget.value })}
                  class="w-full px-3 py-2 rounded-lg bg-[#111111] border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-600/50"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1.5">Room Code</label>
                <input
                  type="text"
                  value={scheduleData().room}
                  onInput={(e) => setScheduleData({ ...scheduleData(), room: e.currentTarget.value })}
                  class="w-full px-3 py-2 rounded-lg bg-[#111111] border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-600/50"
                />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-gray-400 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={scheduleData().date}
                    onInput={(e) => setScheduleData({ ...scheduleData(), date: e.currentTarget.value })}
                    class="w-full px-3 py-2 rounded-lg bg-[#111111] border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-600/50"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-400 mb-1.5">Time</label>
                  <input
                    type="time"
                    value={scheduleData().time}
                    onInput={(e) => setScheduleData({ ...scheduleData(), time: e.currentTarget.value })}
                    class="w-full px-3 py-2 rounded-lg bg-[#111111] border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-600/50"
                  />
                </div>
              </div>
            </div>
          </Modal>
        </Show>
      </main>
    </div>
  );
}
