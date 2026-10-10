import { createSignal, Show } from "solid-js";
import { SettingsTab } from "./components/SettingsTab";
import { NotesTab } from "./components/NotesTab";
import { HomeTab } from "./components/HomeTab";
import { MeetingsTab } from "./components/MeetingsTab";
import { useI18n } from "./i18n/I18nProvider";

/**
 * Main-window shell: sidebar + bottom tab bar and tab routing only.
 * Every feature lives in its own component (HomeTab, MeetingsTab, NotesTab,
 * SettingsTab) and owns its own backend state / event subscriptions.
 */
export function MainWindow(props) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = createSignal("home");

  return (
    <div class="flex h-screen bg-[#111111] text-white select-none overflow-hidden">
      {/* Sidebar */}
      <aside class="hidden md:flex w-16 bg-[#1c1c1c] flex-col items-center justify-between py-5 border-r border-gray-800/40 shrink-0">
        <div class="flex flex-col items-center space-y-5">
          <button
            onClick={() => setActiveTab("home")}
            class={`flex items-center justify-center w-14 h-14 rounded-xl transition focus:outline-none border ${activeTab() === "home"
              ? "border-blue-500 bg-blue-600/20 text-blue-400"
              : "border-transparent text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
          >
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 00-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </button>

          <button
            onClick={() => setActiveTab("meetings")}
            class={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition group focus:outline-none border ${activeTab() === "meetings"
              ? "text-blue-400"
              : "text-gray-400 hover:text-white"
              }`}
          >
            <div
              class={`p-1.5 rounded-xl mb-0.5 transition ${activeTab() === "meetings"
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
            <span class="text-[9px] font-medium">{t("sidebar.meetings")}</span>
          </button>

          <button
            onClick={() => setActiveTab("hub")}
            class={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition group focus:outline-none border ${activeTab() === "hub"
              ? "text-blue-400"
              : "text-gray-400 hover:text-white"
              }`}
          >
            <div
              class={`p-1.5 rounded-xl mb-0.5 transition ${activeTab() === "hub"
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
            class={`p-2 rounded-xl transition focus:outline-none ${activeTab() === "settings"
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
      <main class="flex-1 flex flex-col overflow-y-auto bg-[#111111] pb-16 md:pb-0">
        <Show
          when={activeTab() === "settings"}
          fallback={
            <Show
              when={activeTab() === "notes"}
              fallback={
                <Show
                  when={activeTab() === "meetings"}
                  fallback={
                    <HomeTab onJoinMeeting={props.onJoinMeeting} onNavigate={setActiveTab} />
                  }
                >
                  <MeetingsTab onJoinMeeting={props.onJoinMeeting} />
                </Show>
              }
            >
              <NotesTab onSaveComplete={() => setActiveTab("home")} />
            </Show>
          }
        >
          <SettingsTab />
        </Show>
      </main>

      {/* ===== BOTTOM TAB BAR (mobile) ===== */}
      <div class="md:hidden fixed bottom-0 left-0 right-0 bg-[#1c1c1c] border-t border-gray-800/40 flex justify-around items-center py-2 z-50">
        <button
          onClick={() => setActiveTab("home")}
          class={`flex flex-col items-center p-2 rounded-lg transition ${activeTab() === "home" ? "text-blue-400" : "text-gray-400"
            }`}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 00-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
          <span class="text-[8px] font-medium">{t("sidebar.home")}</span>
        </button>
        <button
          onClick={() => setActiveTab("meetings")}
          class={`flex flex-col items-center p-2 rounded-lg transition ${activeTab() === "meetings" ? "text-blue-400" : "text-gray-400"
            }`}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          <span class="text-[8px] font-medium">{t("sidebar.meetings")}</span>
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          class={`flex flex-col items-center p-2 rounded-lg transition ${activeTab() === "settings" ? "text-blue-400" : "text-gray-400"
            }`}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
          <span class="text-[8px] font-medium">{t("sidebar.settings")}</span>
        </button>
      </div>
    </div>
  );
}
