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

  const reload = async () => {
    try {
      const m = await invoke("get_scheduled_meetings");
      setMeetings(m);
    } catch (err) {
      console.error("Failed to load scheduled meetings:", err);
    }

    try {
      const p = await invoke("get_user_profile");
      setProfile(p);
    } catch (err) {
      console.error("Failed to load user profile:", err);
    }
  };

  onMount(reload);

  // Idempotent upsert — skip if this window already added the meeting locally.
  subscribe("meeting-scheduled", (payload) => {
    setMeetings((prev) => {
      if (prev.find((m) => m.id === payload.meeting.id)) return prev;
      return [...prev, payload.meeting];
    });
  });

  // Idempotent — filtering an already-filtered list is safe.
  subscribe("meeting-deleted", (payload) => {
    setMeetings((prev) => prev.filter((m) => m.id !== payload.id));
  });

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
      await navigator.clipboard.writeText(meeting.invite_link);
      alert(t("mainWindow.inviteCopied"));
    } catch (err) {
      console.error("Failed to copy invite link:", err);
    }
  };

  return { meetings, profile, reload, startMeeting, deleteMeeting, copyInvite };
}
