import { For, Show } from "solid-js";
import { useI18n } from "../i18n/I18nProvider";

/**
 * Presentational list of scheduled meetings (used by HomeTab and MeetingsTab).
 *
 * Props:
 *   meetings       — array of scheduled meeting objects
 *   onStart        — (meeting) => void
 *   onDelete       — (event, meetingId) => void
 *   onCopy         — (meeting) => void
 *   onScheduleClick — () => void (optional; hides the "+" shortcut when omitted)
 */
export function MeetingsPanel(props) {
  const { t, locale } = useI18n();

  const getFormattedDate = (date) =>
    date.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });

  const getFormattedTime = (date) =>
    // hourCycle "h23" guarantees a true 24h clock (00–23).
    date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  // "Jun 10 • 14:00" — local, always 24h, from the stored UTC ISO start_time.
  const formatMeetingWhen = (meeting) => {
    const d = new Date(meeting.start_time);
    if (Number.isNaN(d.getTime())) return "";
    const day = d.toLocaleDateString(locale(), { month: "short", day: "numeric" });
    return `${day} • ${getFormattedTime(d)}`;
  };

  return (
    <div class="max-w-2xl mx-auto w-full bg-[#1c1c1c] rounded-xl border border-gray-800/60 shadow-lg overflow-hidden mt-3">
      <div class="px-4 py-3 flex items-center justify-between border-b border-gray-800/40">
        <div class="flex items-center space-x-2">
          <Show when={props.onScheduleClick}>
            <button
              onClick={() => props.onScheduleClick()}
              class="w-6 h-6 bg-gray-800 hover:bg-gray-700 rounded-md flex items-center justify-center text-gray-300 transition"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            </button>
          </Show>
          <div class="flex items-center space-x-1 text-xs font-medium text-white cursor-pointer hover:text-gray-300">
            <span>{getFormattedDate(new Date())}</span>
          </div>
        </div>
        <div class="flex items-center space-x-2 text-gray-400">
          <span class="text-[11px] font-medium text-gray-400">
            {props.meetings.length} scheduled
          </span>
        </div>
      </div>

      <div class="p-4">
        {props.meetings.length === 0 ? (
          <div class="flex flex-col items-center justify-center py-6">
            <div class="w-24 h-18 mb-2 flex items-center justify-center">
              <svg viewBox="0 0 200 140" class="w-full h-full drop-shadow-sm" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="100" cy="115" rx="45" ry="12" fill="#2d3342" opacity="0.6" />
                <path d="M75 105 L125 105 L135 115 L65 115 Z" fill="#64748b" />
                <rect x="85" y="95" width="30" height="12" rx="4" fill="#94a3b8" transform="rotate(-15 100 100)" />
                <line x1="100" y1="65" x2="100" y2="110" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round" />
                <path d="M50 70 Q100 35 150 70 Q125 60 100 65 Q75 60 50 70 Z" fill="#f8fafc" />
                <path d="M65 67 Q100 40 135 67 Q100 60 65 67 Z" fill="#cbd5e1" />
              </svg>
            </div>
            <p class="text-xs text-gray-400 font-medium">{t("mainWindow.noMeetings")}</p>
          </div>
        ) : (
          <div class="flex flex-col space-y-2">
            <For each={props.meetings}>
              {(m) => (
                <div class="flex items-center justify-between p-3 rounded-lg bg-[#242424] hover:bg-[#2a2a2a] transition">
                  <div class="flex flex-col">
                    <span class="text-sm font-medium text-white">{m.title}</span>
                    <span class="text-xs text-gray-400">{formatMeetingWhen(m) ? `${formatMeetingWhen(m)} • ` : ""}Room: #{m.room_id} • {m.duration_minutes} mins</span>
                  </div>
                  <div class="flex items-center space-x-2">
                    <button
                      onClick={() => props.onCopy(m)}
                      class="px-3 py-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-gray-700 text-xs font-semibold rounded-md transition text-gray-200"
                      title={t("mainWindow.copyInviteLink")}
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                    <button
                      onClick={() => props.onStart(m)}
                      class="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-xs font-semibold rounded-md transition text-white"
                    >
                      {t("common.start")}
                    </button>
                    <button
                      onClick={(e) => props.onDelete(e, m.id)}
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
  );
}
