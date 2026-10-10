import { createSignal, Show, onMount, onCleanup } from "solid-js";
import { useI18n } from "../i18n/I18nProvider";

/**
 * "New meeting" action button with its dropdown menu (video/PMI toggles) and
 * the nested PMI submenu (copy link / copy ID / copy invitation / PMI settings).
 *
 * Props:
 *   profile         — user profile object (pmi, ...)
 *   settings        — user settings object (start_with_video, use_pmi, ...)
 *   onStartMeeting  — () => void   (orange button: start an instant meeting)
 *   onToggleSetting — (key) => void
 *   onAction        — (action) => void  ("Copy ID" | "Copy meeting link" | ...)
 */
export function NewMeetingMenu(props) {
  const { t } = useI18n();
  const [showNewMeetingMenu, setShowNewMeetingMenu] = createSignal(false);
  const [showPmiSubMenu, setShowPmiSubMenu] = createSignal(false);

  onMount(() => {
    const handleClickOutside = (e) => {
      const dropdownContainer = document.querySelector(".new-meeting-dropdown-container");
      if (dropdownContainer && !dropdownContainer.contains(e.target)) {
        setShowNewMeetingMenu(false);
        setShowPmiSubMenu(false);
      }
    };
    window.addEventListener("click", handleClickOutside);
    onCleanup(() => window.removeEventListener("click", handleClickOutside));
  });

  const toggleNewMeetingMenu = (e) => {
    e.stopPropagation();
    setShowNewMeetingMenu(!showNewMeetingMenu());
    if (showNewMeetingMenu()) setShowPmiSubMenu(false);
  };

  const togglePmiSubMenu = (e) => {
    e.stopPropagation();
    setShowPmiSubMenu(!showPmiSubMenu());
  };

  return (
    <div class="new-meeting-dropdown-container relative flex flex-col items-center w-full bg-transparent group">
      <button
        onClick={props.onStartMeeting}
        style="background-color: #FF7429;"
        class="w-13 h-13 sm:w-16 sm:h-16 rounded-[20px] sm:rounded-[22px] flex items-center justify-center mb-1.5 shadow-lg group-hover:scale-105 group-hover:-translate-y-1.5 transition-transform duration-200 ease-out cursor-pointer !bg-[#FF7429]"
      >
        <svg class="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
        </svg>
      </button>

      <div
        onClick={toggleNewMeetingMenu}
        class="flex items-center justify-center space-x-0.5 text-[10px] sm:text-[11px] font-medium text-gray-300 cursor-pointer hover:text-white w-full text-center"
      >
        <span class="truncate">{t("mainWindow.newMeeting")}</span>
        <svg class="w-2.5 h-2.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
      </div>

      {/* Main Dropdown */}
      <Show when={showNewMeetingMenu()}>
        <div class="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 sm:w-72 bg-[#222222] rounded-xl shadow-2xl border border-gray-700/80 overflow-visible z-50 py-1.5 text-white">
          <div
            class="flex items-center px-4 py-2.5 hover:bg-[#2c2c2c] transition cursor-pointer"
            onClick={() => props.onToggleSetting("start_with_video")}
          >
            <div class={`w-4 h-4 rounded flex items-center justify-center mr-3 border ${props.settings.start_with_video ? "bg-blue-600 border-blue-600 text-white" : "border-gray-500 bg-transparent"}`}>
              <Show when={props.settings.start_with_video}>
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </Show>
            </div>
            <span class="text-sm text-gray-200">Start with video</span>
          </div>
          <div class="h-[1px] bg-gray-700/50 my-1"></div>
          <div
            class="flex items-center px-4 py-2.5 hover:bg-[#2c2c2c] transition cursor-pointer"
            onClick={() => props.onToggleSetting("use_pmi")}
          >
            <div class={`w-4 h-4 rounded flex items-center justify-center mr-3 border ${props.settings.use_pmi ? "bg-blue-600 border-blue-600 text-white" : "border-gray-500 bg-transparent"}`}>
              <Show when={props.settings.use_pmi}>
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </Show>
            </div>
            <span class="text-sm text-gray-200">{t("mainWindow.usePmi")}</span>
          </div>
          <div
            class={`relative px-4 py-2.5 transition cursor-pointer flex items-center justify-between ${showPmiSubMenu() ? "bg-[#0E71EB] text-white" : "hover:bg-[#2c2c2c] text-gray-200"}`}
            onClick={togglePmiSubMenu}
          >
            <span class="text-sm font-medium tracking-wide">{props.profile.pmi}</span>
            <svg class="w-4 h-4 opacity-75" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <Show when={showPmiSubMenu()}>
              <div class="absolute left-full top-0 ml-1.5 w-56 bg-[#222222] rounded-xl shadow-2xl border border-gray-700/80 overflow-hidden z-50 py-1 text-white">
                <button onClick={() => props.onAction("Copy meeting link")} class="w-full text-left px-4 py-2.5 text-sm hover:bg-[#2c2c2c] transition text-gray-200">{t("mainWindow.copyMeetingLink")}</button>
                <button onClick={() => props.onAction("Copy ID")} class="w-full text-left px-4 py-2.5 text-sm hover:bg-[#2c2c2c] transition text-gray-200">{t("mainWindow.copyId")}</button>
                <button onClick={() => props.onAction("Copy invitation")} class="w-full text-left px-4 py-2.5 text-sm bg-[#0E71EB] hover:bg-blue-600 transition text-white">{t("mainWindow.copyInvitation")}</button>
                <button onClick={() => props.onAction("PMI settings")} class="w-full text-left px-4 py-2.5 text-sm hover:bg-[#2c2c2c] transition text-gray-200">{t("mainWindow.pmiSettings")}</button>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
