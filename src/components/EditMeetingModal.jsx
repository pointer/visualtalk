import { createSignal } from "solid-js";
import { useI18n } from "../i18n/I18nProvider";

/**
 * Minimal reschedule/edit form for a scheduled meeting (title, date, time,
 * duration). The room id is fixed — it is bound to invite links and signed
 * tokens, so it is not editable here.
 *
 * Props:
 *   meeting — ScheduledMeeting
 *   onSave  — (id, { title, start_time, duration_minutes }) => void
 *   onClose — () => void
 */
export function EditMeetingModal(props) {
  const { t } = useI18n();

  const pad = (n) => String(n).padStart(2, "0");

  const toParts = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: "", time: "" };
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  };

  const init = toParts(props.meeting.start_time);
  const [title, setTitle] = createSignal(props.meeting.title);
  const [date, setDate] = createSignal(init.date);
  const [time, setTime] = createSignal(init.time);
  const [duration, setDuration] = createSignal(String(props.meeting.duration_minutes));

  const save = () => {
    const d = new Date(`${date()}T${time()}:00`);
    if (!title().trim() || Number.isNaN(d.getTime())) {
      alert(t("meetings.invalidTime"));
      return;
    }
    const minutes = Math.round(Number(duration()));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      alert(t("meetings.invalidTime"));
      return;
    }
    props.onSave(props.meeting.id, {
      title: title().trim(),
      start_time: d.toISOString(),
      duration_minutes: minutes,
    });
  };

  const field =
    "w-full px-3 py-2 rounded-lg bg-[#242424] border border-gray-700 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors";
  const label = "text-xs font-medium text-gray-400 mb-1 block";

  return (
    <div
      class="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        class="bg-[#1c1c1c] w-full max-w-sm rounded-2xl border border-gray-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-white">{t("meetings.editMeeting")}</h3>
          <button onClick={props.onClose} class="text-gray-400 hover:text-white transition shrink-0">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div class="p-6 flex flex-col space-y-4">
          <div>
            <label class={label}>{t("mainWindow.meetingTitle")}</label>
            <input value={title()} onInput={(e) => setTitle(e.currentTarget.value)} class={field} />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class={label}>{t("mainWindow.date")}</label>
              <input type="date" value={date()} onInput={(e) => setDate(e.currentTarget.value)} class={field} />
            </div>
            <div>
              <label class={label}>{t("mainWindow.time")}</label>
              <input type="time" value={time()} onInput={(e) => setTime(e.currentTarget.value)} class={field} />
            </div>
          </div>
          <div>
            <label class={label}>{t("mainWindow.durationMinutes")}</label>
            <input type="number" min="1" value={duration()} onInput={(e) => setDuration(e.currentTarget.value)} class={field} />
          </div>
        </div>

        <div class="px-6 py-4 bg-[#181818] border-t border-gray-800 flex justify-end gap-2">
          <button onClick={props.onClose} class="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition">{t("common.cancel")}</button>
          <button onClick={save} class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition shadow-md">{t("meetings.save")}</button>
        </div>
      </div>
    </div>
  );
}