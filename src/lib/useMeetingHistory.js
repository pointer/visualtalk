import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { useTauriEvents } from "./useTauriEvents";

/**
 * SolidJS composable that owns the meeting-history read side.
 *
 * History is already written by the backend: `get_meeting_session` appends a
 * MeetingRecord on every join and `MeetingStore::add_history` caps the list at
 * the 50 most recent entries (src-tauri/src/meeting.rs), persisted to
 * <config_dir>/meetings.json. Until now nothing read it back — this composable
 * is the missing consumer of the existing `get_meeting_history` command.
 *
 * Usage:
 *   const { history, reload } = useMeetingHistory();
 */

/**
 * Rows to surface. The store keeps up to 50 records, which is more than the
 * Meetings tab should scroll through, so only the most recent slice is shown.
 */
const MAX_VISIBLE = 10;

/** `Date.parse` with a 0 fallback, so a malformed timestamp sorts last
 *  instead of poisoning the comparison with NaN. */
const ts = (record) => Date.parse(record?.timestamp) || 0;

/**
 * Collapse the raw record list to one row per room.
 *
 * The same room can appear several times: `get_meeting_session` is called on
 * every connect (so a reconnect adds another row), and `add_history` runs
 * before `create_session` can fail, so a room is recorded even when the join
 * never completes. Keeping the most recent timestamp per room makes the list
 * read as "rooms this device has opened, newest first".
 */
function collapseByRoom(records) {
  const byRoom = new Map();
  for (const record of records || []) {
    if (!record?.room_id) continue;
    const existing = byRoom.get(record.room_id);
    if (!existing || ts(record) > ts(existing)) byRoom.set(record.room_id, record);
  }
  return [...byRoom.values()]
    .sort((a, b) => ts(b) - ts(a))
    .slice(0, MAX_VISIBLE);
}

export function useMeetingHistory() {
  const { subscribe } = useTauriEvents();

  const [history, setHistory] = createSignal([]);

  const reload = async () => {
    try {
      const records = await invoke("get_meeting_history");
      setHistory(collapseByRoom(records));
    } catch (err) {
      // Not fatal: the scheduled list is the primary content of this tab.
      console.error("Failed to load meeting history:", err);
    }
  };

  onMount(reload);

  // A row is added when a meeting window *opens*, but the main window is
  // usually behind it at that moment and no event is emitted for the insert.
  // `meeting-ended` fires when that window closes (see window.rs), so
  // reloading there is what makes the new row appear without leaving the tab.
  // Tabs also remount on navigation (MainWindow routes with nested <Show>),
  // which covers the case where this tab was not mounted at the time.
  subscribe("meeting-ended", reload);

  return { history, reload };
}
