import { createEffect, onCleanup } from "solid-js";
import { useI18n } from "../i18n/I18nProvider";

/**
 * Right-click context menu for a scheduled meeting row (desktop/Pro). A single
 * full-viewport overlay captures "click anywhere else" to dismiss, and Escape
 * closes it too. Every action closes the menu before running.
 *
 * Props:
 *   x, y          — viewport coords for the menu's top-left corner
 *   meeting       — ScheduledMeeting
 *   onOpen        — (meeting) => void  (View details)
 *   onStart, onCopyInvite, onCopyRoom, onCopySummary, onCalendar, onDelete
 *   onClose       — () => void
 */
export function MeetingContextMenu(props) {
  const { t } = useI18n();

  createEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  const run = (fn, ...args) => {
    props.onClose();
    fn(...args);
  };

  const item = "w-full text-left px-3 py-2 hover:bg-[#2c2c2c] text-sm text-gray-200 transition";

  return (
    <div
      class="fixed inset-0 z-[90]"
      onClick={props.onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        props.onClose();
      }}
    >
      <div
        class="fixed w-56 bg-[#1e1e1e] rounded-xl shadow-2xl border border-gray-700 py-1.5 z-[95]"
        style={{ left: `${props.x}px`, top: `${props.y}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <button class={`${item} text-blue-400 font-semibold`} onClick={() => run(props.onStart, props.meeting)}>
          {t("common.start")}
        </button>
        <button class={item} onClick={() => run(props.onOpen, props.meeting)}>
          {t("meetings.viewDetails")}
        </button>
        <div class="h-[1px] bg-gray-700/60 my-1"></div>
        <button class={item} onClick={() => run(props.onCopyInvite, props.meeting)}>
          {t("meetings.copyInvite")}
        </button>
        <button class={item} onClick={() => run(props.onCopyRoom, props.meeting)}>
          {t("meetings.copyRoomCode")}
        </button>
        <button class={item} onClick={() => run(props.onCopySummary, props.meeting)}>
          {t("meetings.copySummary")}
        </button>
        <button class={item} onClick={() => run(props.onCalendar, props.meeting)}>
          {t("meetings.addToCalendar")}
        </button>
        <div class="h-[1px] bg-gray-700/60 my-1"></div>
        <button class={`${item} text-red-400`} onClick={() => run(props.onDelete, props.meeting)}>
          {t("meetings.delete")}
        </button>
      </div>
    </div>
  );
}