import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { useTauriEvents } from "./useTauriEvents";
import { useI18n } from "../i18n/I18nProvider";

/**
 * SolidJS composable that owns the scheduled-meetings feature state:
 * loads the list + profile from Rust, keeps them in sync via push events,
 * and exposes start / delete / copy-invite actions.
 *
 * Usage:
 *   const { meetings, profile, startMeeting, deleteMeeting, copyInvite } =
 *     useScheduledMeetings({ onJoinMeeting });
 */
export function useScheduledMeetings(options = {}) {
  const { t } = useI18n();
  const { subscribe } = useTauriEvents();

  const [meetings, setMeetings] = createSignal([]);
  const [profile, setProfile] = createSignal({
    identity: "",
    display_name: "",
    email: "",
    pmi: "",
  });

  const reloadMeetings = async () => {
    try {
      const m = await invoke("get_scheduled_meetings");
      setMeetings(m);
    } catch (err) {
      console.error("Failed to load scheduled meetings:", err);
    }
  };

  const reload = async () => {
    await reloadMeetings();

    try {
      const p = await invoke("get_user_profile");
      setProfile(p);
    } catch (err) {
      console.error("Failed to load user profile:", err);
    }
  };

  onMount(reload);

  // A new meeting can land anywhere in the upcoming-first order (positions are
  // renumbered server-side), so reload the authoritative list rather than append.
  subscribe("meeting-scheduled", () => reloadMeetings());

  // Idempotent — filtering an already-filtered list is safe.
  subscribe("meeting-deleted", (payload) => {
    setMeetings((prev) => prev.filter((m) => m.id !== payload.id));
  });

  // Another window reordered the list; reload the authoritative order.
  subscribe("meetings-reordered", () => reloadMeetings());

  subscribe("profile-updated", (payload) => {
    setProfile(payload.profile);
  });

  // Ask Rust for the Host token / LiveKit URL, then hand a clean join object
  // to the window spawner.
  const startMeeting = async (meeting) => {
    try {
      const hostData = await invoke("get_host_meeting_data", { room: meeting.room_id });
      options.onJoinMeeting?.({
        room: meeting.room_id,
        token: hostData.token,
        url: hostData.url,
        identity: profile().identity || "Host",
      });
    } catch (err) {
      console.error("Failed to start meeting:", err);
      alert(t("mainWindow.startErrorDetailed", { error: err }));
    }
  };

  const deleteMeeting = async (e, id) => {
    e?.stopPropagation();
    try {
      await invoke("delete_scheduled_meeting", { id });
      setMeetings((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("Failed to delete meeting:", err);
    }
  };

  const copyInvite = async (meeting) => {
    try {
      const invite = await invoke("get_meeting_invite", { room: meeting.room_id });
      await navigator.clipboard.writeText(invite);
      alert(t("mainWindow.inviteCopied"));
    } catch (err) {
      console.error("Failed to copy invite link:", err);
    }
  };

  // Swap a meeting with its neighbour, then persist the new order optimistically;
  // fall back to a reload if the backend rejects the write.
  const moveMeeting = async (id, direction) => {
    const current = meetings();
    const idx = current.findIndex((m) => m.id === id);
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || target < 0 || target >= current.length) return;

    const next = [...current];
    [next[idx], next[target]] = [next[target], next[idx]];
    setMeetings(next);

    try {
      const persisted = await invoke("reorder_scheduled_meetings", {
        orderedIds: next.map((m) => m.id),
      });
      setMeetings(persisted);
    } catch (err) {
      console.error("Failed to reorder meetings:", err);
      await reloadMeetings();
    }
  };

  return {
    meetings,
    profile,
    reload,
    startMeeting,
    deleteMeeting,
    copyInvite,
    moveMeeting,
  };
}
