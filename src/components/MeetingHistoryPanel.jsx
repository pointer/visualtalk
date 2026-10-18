import { For, Show } from "solid-js";
import { useI18n } from "../i18n/I18nProvider";

/**
 * Presentational list of recently opened rooms (used by MeetingsTab).
 *
 * Read-only by design: a history row carries only a room id and a timestamp —
 * no token and no LiveKit URL — so there is nothing here that could re-join
 * the room. Joining stays the Join flow's job (paste an invite link).
 *
 * Props:
 *   history — array of { room_id, timestamp }, newest first, one row per room
 */
export function MeetingHistoryPanel(props) {
  const { t, locale } = useI18n();

  // "Jun 10 • 14:00", local, always 24h — same convention as MeetingsPanel,
  // plus the year whenever the room is not from the current one (past entries
  // would otherwise be ambiguous).
  const formatWhen = (timestamp) => {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return "";
    const day = d.toLocaleDateString(locale(), { month: "short", day: "numeric" });
    const year =
      d.getFullYear() === new Date().getFullYear()
        ? ""
        : ` ${d.toLocaleDateString(locale(), { year: "numeric" })}`;
    const time = d.toLocaleTimeString(locale(), {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    return `${day}${year} • ${time}`;
  };

  return (
    <div class="max-w-2xl mx-auto w-full bg-[#1c1c1c] rounded-xl border border-gray-800/60 shadow-lg overflow-hidden mt-3">
      <div class="px-4 py-3 flex items-center justify-between border-b border-gray-800/40">
        <div class="flex items-center space-x-1 text-xs font-medium text-white">
          <span>{t("mainWindow.recentMeetings")}</span>
        </div>
        <Show when={props.history.length > 0}>
          <span class="text-[11px] font-medium text-gray-400">
            {t("mainWindow.recentCount", { count: props.history.length })}
          </span>
        </Show>
      </div>

      <div class="p-4">
        <Show
          when={props.history.length > 0}
          fallback={
            <p class="text-xs text-gray-500 font-medium text-center py-2">
              {t("mainWindow.recentEmpty")}
            </p>
          }
        >
          <div class="flex flex-col space-y-2">
            <For each={props.history}>
              {(r) => (
                <div class="flex items-center justify-between p-3 rounded-lg bg-[#242424]">
                  <div class="flex flex-col min-w-0">
                    <span class="text-sm font-medium text-white truncate">
                      {t("mainWindow.recentRoom", { room: r.room_id })}
                    </span>
                    <Show when={formatWhen(r.timestamp)}>
                      <span class="text-xs text-gray-400">{formatWhen(r.timestamp)}</span>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
