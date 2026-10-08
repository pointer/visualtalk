import { Show } from "solid-js";
import { useI18n } from "../i18n/I18nProvider";

/**
 * Persistent "this meeting is being recorded" banner.
 *
 * Shown to *every* participant — the one who pressed Record and everyone who
 * did not — because a recording nobody can see is a covert recording. It is
 * deliberately not dismissible: the notice has to stay up for as long as the
 * recording runs, and it has to reach people who join mid-meeting.
 *
 * @param {boolean}  props.isSelf    true when *this* user started the recording
 * @param {string}   props.startedBy display name of whoever started it
 * @param {Function} [props.duration] accessor returning "mm:ss" (own recordings)
 */
export function RecordingBanner(props) {
  const { t } = useI18n();

  return (
    <div
      role="status"
      aria-live="polite"
      class="shrink-0 flex items-center gap-2.5 px-3 sm:px-4 py-2 bg-red-950/90 border-b border-red-600/50"
    >
      <span class="relative flex w-2.5 h-2.5 shrink-0">
        <span class="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75 animate-ping" />
        <span class="relative inline-flex w-2.5 h-2.5 rounded-full bg-red-500" />
      </span>

      <div class="flex-1 min-w-0 leading-tight">
        <div class="text-xs sm:text-sm font-semibold text-red-100 truncate">
          {t("recording.banner")}
        </div>
        <div class="text-[10px] sm:text-xs text-red-300/90 truncate">
          <Show
            when={props.isSelf}
            fallback={t("recording.startedBy", { name: props.startedBy || "" })}
          >
            {t("recording.startedByYou")}
          </Show>
        </div>
      </div>

      {/* Only render the timer while *this* user is the one recording. */}
      <Show when={props.duration && props.duration()}>
        <span class="shrink-0 text-xs font-medium text-red-200 tabular-nums bg-red-900/60 px-2 py-0.5 rounded-md">
          {props.duration()}
        </span>
      </Show>
    </div>
  );
}
