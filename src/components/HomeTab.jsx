import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n/I18nProvider";
import { useTauriEvents } from "../lib/useTauriEvents";
import { useScheduledMeetings } from "../lib/useScheduledMeetings";
import { NewMeetingMenu } from "./NewMeetingMenu";
import { MeetingsPanel } from "./MeetingsPanel";
import JoinMeetingModal from "./JoinMeeting";
import Schedule from "./Schedule";

/**
 * Home feature: clock, profile header, meeting actions (new / join / schedule
 * / notes) and the upcoming-meetings panel. Owns all of its backend state.
 *
 * Props:
 *   onJoinMeeting — (joinData) => void  (hands off to the window spawner)
 *   onNavigate    — (tab) => void       (switch main-window tabs)
 */
export function HomeTab(props) {
  const { t, locale } = useI18n();
  const { subscribe } = useTauriEvents();
  const { meetings, profile, startMeeting, deleteMeeting, copyInvite } =
    useScheduledMeetings({ onJoinMeeting: props.onJoinMeeting });

  const [settings, setSettings] = createSignal({
    start_with_video: true,
    use_pmi: false,
    always_show_preview: true,
    mute_on_join: false,
  });
  const [showJoinModal, setShowJoinModal] = createSignal(false);
  const [showScheduleModal, setShowScheduleModal] = createSignal(false);

  const [currentTime, setCurrentTime] = createSignal(new Date());
  const timer = setInterval(() => setCurrentTime(new Date()), 1000);
  onCleanup(() => clearInterval(timer));

  onMount(async () => {
    try {
      const s = await invoke("get_user_settings");
      setSettings(s);
    } catch (err) {
      console.error("Failed to load user settings:", err);
    }
  });

  subscribe("settings-updated", (payload) => {
    setSettings(payload.settings);
  });

  const getFormattedDate = (date) =>
    date.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });

  const getFormattedTime = (date) =>
    // hourCycle "h23" guarantees a true 24h clock (00–23). Unlike
    // hour12: false, it can never resolve to the h24 cycle where
    // midnight renders as "24:00".
    date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

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

  // Instant meeting: ask Rust for the host token/url of the active room.
  const handleNewMeetingClick = async () => {
    try {
      const room = settings().use_pmi ? profile().pmi.replace(/\s+/g, "") : "general";
      const hostData = await invoke("get_host_meeting_data", { room });
      props.onJoinMeeting({
        room,
        token: hostData.token,
        url: hostData.url,
        identity: profile().identity || "Host",
      });
    } catch (err) {
      console.error("Failed to start instant meeting:", err);
      alert(t("mainWindow.startError"));
    }
  };

  const handleNewMeetingAction = async (action) => {
    const activeRoom = profile().pmi.replace(/\s+/g, "");

    if (action === "Copy ID") {
      await navigator.clipboard.writeText(profile().pmi);
      alert(t("mainWindow.copiedPmi", { pmi: profile().pmi }));
    } else if (action === "Copy meeting link") {
      const link = `https://visualtalk.app/j/${activeRoom}`;
      await navigator.clipboard.writeText(link);
      alert(t("mainWindow.copiedLink", { link }));
    } else if (action === "Copy invitation") {
      try {
        const inviteText = await invoke("get_meeting_invite", { room: activeRoom });
        await navigator.clipboard.writeText(inviteText);
        alert(t("mainWindow.invitationCopied"));
      } catch (err) {
        console.error("Failed to copy invite:", err);
      }
    } else if (action === "PMI settings") {
      const newPmi = prompt(t("mainWindow.enterPmi"), profile().pmi);
      if (newPmi && newPmi.trim()) {
        const updatedProfile = { ...profile(), pmi: newPmi.trim() };
        try {
          await invoke("update_user_profile", { profile: updatedProfile });
          alert(t("mainWindow.pmiUpdated"));
        } catch (err) {
          console.error("Failed to update PMI:", err);
        }
      }
    }
  };

  return (
    <>
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
        <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-0.5">
          {getFormattedTime(currentTime())}
        </h1>
        <p class="text-xs font-medium text-gray-400">
          {getFormattedDate(currentTime())}
        </p>
      </div>

      {/* Action Buttons Panel - 4 items strictly forced onto a single clean row */}
      <div class="max-w-xl mx-auto w-full my-4 px-3">
        <div class="grid grid-cols-4 gap-x-1 sm:gap-6 justify-items-center items-start">

          {/* 1. New Meeting with dropdown */}
          <NewMeetingMenu
            profile={profile()}
            settings={settings()}
            onStartMeeting={handleNewMeetingClick}
            onToggleSetting={toggleSetting}
            onAction={handleNewMeetingAction}
          />

          {/* 2. Join */}
          <button
            onClick={() => setShowJoinModal(true)}
            class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0"
          >
            <div class="w-13 h-13 sm:w-16 sm:h-16 bg-[#0E71EB] rounded-[20px] sm:rounded-[22px] flex items-center justify-center mb-1.5 shadow-md group-hover:scale-105 group-hover:-translate-y-1.5 transition-transform duration-200 ease-out">
              <svg class="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span class="text-[10px] sm:text-[11px] font-medium text-gray-300 text-center truncate w-full">{t("common.join")}</span>
          </button>

          {/* 3. Schedule */}
          <button
            onClick={() => setShowScheduleModal(true)}
            class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0"
          >
            <div class="w-13 h-13 sm:w-16 sm:h-16 bg-[#0E71EB] rounded-[20px] sm:rounded-[22px] flex items-center justify-center mb-1.5 shadow-md group-hover:scale-105 group-hover:-translate-y-1.5 transition-transform duration-200 ease-out">
              <svg class="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <span class="text-[10px] sm:text-[11px] font-medium text-gray-300 text-center truncate w-full">{t("mainWindow.schedule")}</span>
          </button>

          {/* 4. My Notes */}
          <button
            onClick={() => props.onNavigate("notes")}
            class="flex flex-col items-center w-full !bg-transparent group border-none outline-none shadow-none p-0"
          >
            <div class="w-13 h-13 sm:w-16 sm:h-16 rounded-[20px] sm:rounded-[22px] flex items-center justify-center mb-1.5 shadow-md group-hover:scale-105 group-hover:-translate-y-1.5 transition-transform duration-200 ease-out bg-[#0E71EB]">
              <svg class="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </div>
            <span class="text-[10px] sm:text-[11px] font-medium text-gray-300 text-center truncate w-full">{t("sidebar.notes")}</span>
          </button>

        </div>
      </div>

      {/* Meetings Panel */}
      <MeetingsPanel
        meetings={meetings()}
        onStart={startMeeting}
        onDelete={deleteMeeting}
        onCopy={copyInvite}
        onScheduleClick={() => setShowScheduleModal(true)}
      />

      {/* Modals */}
      <Show when={showJoinModal()}>
        <JoinMeetingModal
          onClose={() => setShowJoinModal(false)}
          onJoinSuccess={props.onJoinMeeting}
        />
      </Show>

      <Show when={showScheduleModal()}>
        <Schedule onClose={() => setShowScheduleModal(false)} />
      </Show>
    </>
  );
}
