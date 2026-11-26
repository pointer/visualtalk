import { createSignal, Show } from "solid-js";
import { useI18n } from "../i18n/I18nProvider";
import { useScheduledMeetings } from "../lib/useScheduledMeetings";
import { useMeetingHistory } from "../lib/useMeetingHistory";
import { MeetingsPanel } from "./MeetingsPanel";
import { MeetingHistoryPanel } from "./MeetingHistoryPanel";
import SchedulePanel from "./SchedulePanel";
import { MeetingDetailModal } from "./MeetingDetailModal";
import { MeetingContextMenu } from "./MeetingContextMenu";
import { IS_PRO_EDITION } from "../lib/edition";
import { IS_MOBILE } from "../lib/platform";
import { invoke } from "@tauri-apps/api/core";

/**
 * Meetings feature: full list of scheduled meetings with start / delete /
 * copy-invite actions, the read-only list of recently opened rooms below it,
 * and a shortcut to schedule a new one.
 *
 * Props:
 *   onJoinMeeting — (joinData) => void  (hands off to the window spawner)
 */
export function MeetingsTab(props) {
  const { t } = useI18n();
  const { meetings, profile, startMeeting, deleteMeeting, copyInvite, moveMeeting } =
    useScheduledMeetings({ onJoinMeeting: props.onJoinMeeting });
  const { history } = useMeetingHistory();
  const [showScheduleModal, setShowScheduleModal] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [selectedMeeting, setSelectedMeeting] = createSignal(null);
  const [contextMenu, setContextMenu] = createSignal(null);

  // Drill-down, right-click menu and calendar export are a Pro *desktop* surface.
  // Mobile and Community stay on sort/search/reorder.
  const PRO_DESKTOP = IS_PRO_EDITION && !IS_MOBILE;

  const closeOverlays = () => {
    setSelectedMeeting(null);
    setContextMenu(null);
  };

  const handleDelete = (m) => {
    closeOverlays();
    deleteMeeting(null, m.id);
  };

  const openDetail = (m) => setSelectedMeeting(m);

  const openContext = (e, m) => {
    e.preventDefault();
    // Clamp the menu inside the viewport so a right-click near an edge does not
    // push it off-screen.
    const menuWidth = 224;
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - menuWidth - 8));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - 300));
    setContextMenu({ x, y, meeting: m });
  };

  const copyRoomCode = async (m) => {
    try {
      await navigator.clipboard.writeText(m.room_id);
      alert(t("meetings.roomCodeCopied"));
    } catch (err) {
      console.error("Failed to copy room code:", err);
    }
  };

  const copySummary = async (m) => {
    const d = new Date(m.start_time);
    const when = Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
    const summary = `${m.title} — ${when} — Room: #${m.room_id}${m.invite_link ? ` — ${m.invite_link}` : ""}`;
    try {
      await navigator.clipboard.writeText(summary);
      alert(t("meetings.summaryCopied"));
    } catch (err) {
      console.error("Failed to copy summary:", err);
    }
  };

  const addToCalendar = async (m) => {
    const d = new Date(m.start_time);
    if (Number.isNaN(d.getTime())) return;
    const pad = (n) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    try {
      const path = await invoke("create_icalendar_event", {
        ics: {
          ics_id: `${m.room_id}-${Date.now()}`,
          ics_organizer: profile().email || "",
          ics_attendees: [],
          ics_room: m.room_id,
          ics_title: m.title,
          ics_summary: m.title,
          ics_description: `VisualTalk meeting: ${m.title}`,
          ics_start_date: date,
          ics_start_time: time,
          ics_duration_minutes: m.duration_minutes,
          ics_invite_link: m.invite_link || "",
        },
      });
      alert(`${t("meetings.calendarSaved")} ${path}`);
    } catch (err) {
      console.error("Failed to add to calendar:", err);
      alert(t("meetings.calendarFailed"));
    }
  };

  // Client-side search: case-insensitive match on title or room code. The list
  // is small (a handful scheduled), so no backend round-trip is worth it.
  const filtered = () => {
    const q = query().trim().toLowerCase();
    if (!q) return meetings();
    return meetings().filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.room_id.toLowerCase().includes(q)
    );
  };

  return (
    <>
      <header class="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-800/40 shrink-0 bg-[#111111]">
        <h1 class="text-lg font-semibold text-white shrink-0">{t("sidebar.meetings")}</h1>
        <input
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder={t("meetings.searchPlaceholder")}
          class="flex-1 max-w-xs px-3 py-2 rounded-lg bg-[#242424] border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          onClick={() => setShowScheduleModal(true)}
          class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shrink-0"
        >
          + {t("mainWindow.schedule")}
        </button>
      </header>

      <div class="px-4 pb-6">
        <MeetingsPanel
          meetings={filtered()}
          onStart={startMeeting}
          onDelete={deleteMeeting}
          onCopy={copyInvite}
          onScheduleClick={() => setShowScheduleModal(true)}
          onMove={moveMeeting}
          reorderEnabled={query().trim() === ""}
          onOpen={PRO_DESKTOP ? openDetail : undefined}
          onContext={PRO_DESKTOP ? openContext : undefined}
        />

        {/* Rooms this device has opened, newest first. Local-only, like the
            scheduled list above: nothing here is synced from an organizer. */}
        <MeetingHistoryPanel history={history()} />
      </div>

      <Show when={showScheduleModal()}>
        <SchedulePanel onClose={() => setShowScheduleModal(false)} />
      </Show>

      <Show when={PRO_DESKTOP && selectedMeeting()}>
        <MeetingDetailModal
          meeting={selectedMeeting()}
          onClose={() => setSelectedMeeting(null)}
          onStart={startMeeting}
          onDelete={handleDelete}
          onCopyInvite={copyInvite}
          onCopyRoom={copyRoomCode}
          onAddToCalendar={addToCalendar}
        />
      </Show>

      <Show when={PRO_DESKTOP && contextMenu()}>
        <MeetingContextMenu
          x={contextMenu().x}
          y={contextMenu().y}
          meeting={contextMenu().meeting}
          onClose={() => setContextMenu(null)}
          onOpen={openDetail}
          onStart={startMeeting}
          onCopyInvite={copyInvite}
          onCopyRoom={copyRoomCode}
          onCopySummary={copySummary}
          onCalendar={addToCalendar}
          onDelete={handleDelete}
        />
      </Show>
    </>
  );
}
