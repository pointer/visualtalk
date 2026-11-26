import { Show } from "solid-js";
import { useI18n } from "../i18n/I18nProvider";

/**
 * Desktop/Pro drill-down for a scheduled meeting: every persisted field plus
 * the meeting's actions in one place. Opened by single-clicking a row.
 *
 * Props:
 *   meeting          — ScheduledMeeting
 *   onStart          — (meeting) => void
 *   onDelete         — (meeting) => void
 *   onCopyInvite     — (meeting) => void
 *   onCopyRoom       — (meeting) => void
 *   onAddToCalendar  — (meeting) => void
 *   onClose          — () => void
 */
export function MeetingDetailModal(props) {
  const { t, locale } = useI18n();
  const m = () => props.meeting;

  const fullWhen = () => {
    const d = new Date(m().start_time);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(locale(), {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  };

  const created = () => {
    const d = new Date(m().created_at);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(locale(), {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  };

  const isUpcoming = () => new Date(m().start_time).getTime() >= Date.now();

  const action =
    "px-3 py-1.5 text-xs font-semibold rounded-md border border-gray-700 text-gray-200 hover:bg-[#2c2c2c] transition";

  return (
    <div
      class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        class="bg-[#1c1c1c] w-full max-w-md rounded-2xl border border-gray-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h3 class="text-lg font-semibold text-white truncate">{m().title}</h3>
            <span
              class={`text-[11px] font-semibold ${isUpcoming() ? "text-blue-400" : "text-gray-500"}`}
            >
              {isUpcoming() ? t("meetings.upcoming") : t("meetings.past")}
            </span>
          </div>
          <button onClick={props.onClose} class="text-gray-400 hover:text-white transition shrink-0">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div class="p-6 flex flex-col space-y-3 text-sm">
          <div class="flex justify-between gap-4">
            <span class="text-gray-400 shrink-0">{t("meetings.when")}</span>
            <span class="text-white text-right">{fullWhen()}</span>
          </div>
          <div class="flex justify-between gap-4">
            <span class="text-gray-400 shrink-0">{t("meetings.room")}</span>
            <span class="text-white font-mono">#{m().room_id}</span>
          </div>
          <div class="flex justify-between gap-4">
            <span class="text-gray-400 shrink-0">{t("meetings.duration")}</span>
            <span class="text-white">{m().duration_minutes} min</span>
          </div>
          <Show when={m().invite_link}>
            <div class="flex justify-between gap-4">
              <span class="text-gray-400 shrink-0">{t("meetings.inviteLink")}</span>
              <span class="text-white text-right break-all font-mono text-xs">{m().invite_link}</span>
            </div>
          </Show>
          <div class="flex justify-between gap-4">
            <span class="text-gray-400 shrink-0">{t("meetings.created")}</span>
            <span class="text-white text-right">{created()}</span>
          </div>
        </div>

        <div class="px-6 py-4 bg-[#181818] border-t border-gray-800 flex flex-wrap justify-end gap-2">
          <button onClick={() => props.onAddToCalendar(m())} class={action}>{t("meetings.addToCalendar")}</button>
          <button onClick={() => props.onCopyRoom(m())} class={action}>{t("meetings.copyRoomCode")}</button>
          <button onClick={() => props.onCopyInvite(m())} class={action}>{t("meetings.copyInvite")}</button>
          <button onClick={() => props.onStart(m())} class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-500 text-white transition">{t("common.start")}</button>
          <button onClick={() => props.onDelete(m())} class="px-3 py-1.5 text-xs font-semibold rounded-md text-red-400 border border-red-900/50 hover:bg-red-500/20 transition">{t("meetings.delete")}</button>
        </div>
      </div>
    </div>
  );
}