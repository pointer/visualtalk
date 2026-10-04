//! Push event channel for VisualTalk.
//!
//! Emits typed events from the Rust backend to all webview windows so the
//! SolidJS frontend can react to state changes without polling.
//!
//! Design: a single event name (`visualtalk://state-change`) carries a tagged
//! enum payload.  The frontend dispatches by `type`.  This is simpler than
//! managing N separate listeners and well-suited to the app's modest event
//! volume.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::meeting::ScheduledMeeting;
use crate::participant::Participant;
use crate::settings::{UserProfile, UserSettings};

/// All push events the Rust backend can emit.
///
/// Each variant becomes a `{ "type": "<kebab-case>", "payload": { … } }`
/// JSON object on the JS side thanks to the serde attributes.
///
/// [CONCERN: Adding a new variant here requires a matching `case` in every
///  JS listener.  Forgetting one silently drops that event type on the floor
///  because the default branch is a no-op.  Consider logging unknown types
///  in the JS listener to catch this.]
#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "payload", rename_all = "kebab-case")]
pub enum VtEvent {
    /// User profile was updated via `update_user_profile`.
    ProfileUpdated { profile: UserProfile },

    /// User settings were updated via `update_user_settings`.
    SettingsUpdated { settings: UserSettings },

    /// User notes were updated via `update_user_notes`.
    NotesUpdated { notes: String },

    /// A new meeting was scheduled.
    MeetingScheduled { meeting: ScheduledMeeting },

    /// A scheduled meeting was deleted.
    MeetingDeleted { id: String },

    /// A meeting window was opened.
    MeetingStarted { room: String },

    /// A meeting window was closed (fired by `notify_meeting_ended`).
    MeetingEnded { room: String },

    /// A participant was added, removed, or had a property toggled.
    ///
    /// [CONCERN: Rapid participant changes (e.g. 20 users joining at once)
    ///  could flood the event bus.  The JS side should debounce or batch
    ///  these if participant-list re-renders become expensive.]
    ParticipantChanged {
        action: String,
        participant: Option<Participant>,
    },
}

/// Emit a typed event to all webview windows.
///
/// Failures are silently ignored — if no window is listening (e.g. the
/// meeting window already closed), the emit is a no-op.
///
/// [CONCERN: `app.emit()` serializes the payload to JSON.  For large
///  participant lists this is cheap, but if a future event carries a big
///  blob (e.g. a screenshot), consider Tauri Channels instead.]
pub fn emit(app: &AppHandle, event: VtEvent) {
    if let Err(e) = app.emit("visualtalk://state-change", &event) {
        // [CONCERN: We swallow emit errors here.  In practice this only
        //  happens if the IPC channel is torn down (app shutting down).
        //  During development you may want to `eprintln!` this to catch
        //  serialization bugs in new event variants.]
        eprintln!("[events] Failed to emit {:?}: {}", event_name(&event), e);
    }
}

/// Human-readable event name for debug logging.
fn event_name(event: &VtEvent) -> &'static str {
    match event {
        VtEvent::ProfileUpdated { .. } => "profile-updated",
        VtEvent::SettingsUpdated { .. } => "settings-updated",
        VtEvent::NotesUpdated { .. } => "notes-updated",
        VtEvent::MeetingScheduled { .. } => "meeting-scheduled",
        VtEvent::MeetingDeleted { .. } => "meeting-deleted",
        VtEvent::MeetingStarted { .. } => "meeting-started",
        VtEvent::MeetingEnded { .. } => "meeting-ended",
        VtEvent::ParticipantChanged { .. } => "participant-changed",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meeting::ScheduledMeeting;
    use crate::participant::Participant;
    use crate::settings::{UserProfile, UserSettings};

    #[test]
    fn profile_updated_serialization() {
        let profile = UserProfile {
            identity: "user123".to_string(),
            display_name: "Test User".to_string(),
            email: "test@example.com".to_string(),
            pmi: "123 456 7890".to_string(),
        };

        let event = VtEvent::ProfileUpdated { profile };
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "profile-updated");
        assert_eq!(json["payload"]["profile"]["identity"], "user123");
        assert_eq!(json["payload"]["profile"]["display_name"], "Test User");
        assert_eq!(json["payload"]["profile"]["email"], "test@example.com");
        assert_eq!(json["payload"]["profile"]["pmi"], "123 456 7890");
    }

    #[test]
    fn settings_updated_serialization() {
        let settings = UserSettings {
            start_with_video: true,
            use_pmi: false,
            always_show_preview: true,
            mute_on_join: false,
            preferred_mic_id: Some("mic-123".to_string()),
            preferred_cam_id: None,
        };

        let event = VtEvent::SettingsUpdated { settings };
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "settings-updated");
        assert_eq!(json["payload"]["settings"]["start_with_video"], true);
        assert_eq!(json["payload"]["settings"]["use_pmi"], false);
        assert_eq!(json["payload"]["settings"]["always_show_preview"], true);
        assert_eq!(json["payload"]["settings"]["mute_on_join"], false);
        assert_eq!(json["payload"]["settings"]["preferred_mic_id"], "mic-123");
        assert!(json["payload"]["settings"]["preferred_cam_id"].is_null());
    }

    #[test]
    fn notes_updated_serialization() {
        let event = VtEvent::NotesUpdated {
            notes: "Important meeting notes".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "notes-updated");
        assert_eq!(json["payload"]["notes"], "Important meeting notes");
    }

    #[test]
    fn meeting_scheduled_serialization() {
        let meeting = ScheduledMeeting {
            id: "meeting-456".to_string(),
            title: "Team Standup".to_string(),
            room_id: "room-789".to_string(),
            invite_link: "https://example.com/invite".to_string(),
            start_time: "2026-10-04T10:00:00Z".to_string(),
            duration_minutes: 30,
            created_at: "2026-10-04T09:00:00Z".to_string(),
        };

        let event = VtEvent::MeetingScheduled { meeting };
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "meeting-scheduled");
        assert_eq!(json["payload"]["meeting"]["id"], "meeting-456");
        assert_eq!(json["payload"]["meeting"]["title"], "Team Standup");
        assert_eq!(json["payload"]["meeting"]["room_id"], "room-789");
        assert_eq!(json["payload"]["meeting"]["duration_minutes"], 30);
    }

    #[test]
    fn meeting_deleted_serialization() {
        let event = VtEvent::MeetingDeleted {
            id: "deleted-123".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "meeting-deleted");
        assert_eq!(json["payload"]["id"], "deleted-123");
    }

    #[test]
    fn meeting_started_serialization() {
        let event = VtEvent::MeetingStarted {
            room: "room-abc".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "meeting-started");
        assert_eq!(json["payload"]["room"], "room-abc");
    }

    #[test]
    fn meeting_ended_serialization() {
        let event = VtEvent::MeetingEnded {
            room: "room-xyz".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "meeting-ended");
        assert_eq!(json["payload"]["room"], "room-xyz");
    }

    #[test]
    fn participant_changed_with_participant() {
        let participant = Participant {
            id: "p-001".to_string(),
            name: "Alice".to_string(),
            is_local: false,
            is_screen: false,
            is_muted: true,
            video_enabled: true,
            audio_enabled: true,
        };

        let event = VtEvent::ParticipantChanged {
            action: "added".to_string(),
            participant: Some(participant),
        };
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "participant-changed");
        assert_eq!(json["payload"]["action"], "added");
        assert_eq!(json["payload"]["participant"]["id"], "p-001");
        assert_eq!(json["payload"]["participant"]["name"], "Alice");
        assert_eq!(json["payload"]["participant"]["is_muted"], true);
    }

    #[test]
    fn participant_changed_without_participant() {
        let event = VtEvent::ParticipantChanged {
            action: "cleared".to_string(),
            participant: None,
        };
        let json = serde_json::to_value(&event).unwrap();

        assert_eq!(json["type"], "participant-changed");
        assert_eq!(json["payload"]["action"], "cleared");
        assert!(json["payload"]["participant"].is_null());
    }

    #[test]
    fn event_name_coverage() {
        let profile = UserProfile {
            identity: "u1".to_string(),
            display_name: "U".to_string(),
            email: "u@u.u".to_string(),
            pmi: "0".to_string(),
        };

        let settings = UserSettings {
            start_with_video: false,
            use_pmi: false,
            always_show_preview: false,
            mute_on_join: false,
            preferred_mic_id: None,
            preferred_cam_id: None,
        };

        let meeting = ScheduledMeeting {
            id: "m1".to_string(),
            title: "T".to_string(),
            room_id: "r1".to_string(),
            invite_link: "".to_string(),
            start_time: "".to_string(),
            duration_minutes: 0,
            created_at: "".to_string(),
        };

        let participant = Participant {
            id: "p1".to_string(),
            name: "P".to_string(),
            is_local: false,
            is_screen: false,
            is_muted: false,
            video_enabled: false,
            audio_enabled: false,
        };

        let events = vec![
            (VtEvent::ProfileUpdated { profile }, "profile-updated"),
            (VtEvent::SettingsUpdated { settings }, "settings-updated"),
            (VtEvent::NotesUpdated { notes: "".to_string() }, "notes-updated"),
            (VtEvent::MeetingScheduled { meeting: meeting.clone() }, "meeting-scheduled"),
            (VtEvent::MeetingDeleted { id: "".to_string() }, "meeting-deleted"),
            (VtEvent::MeetingStarted { room: "".to_string() }, "meeting-started"),
            (VtEvent::MeetingEnded { room: "".to_string() }, "meeting-ended"),
            (
                VtEvent::ParticipantChanged {
                    action: "".to_string(),
                    participant: Some(participant),
                },
                "participant-changed",
            ),
        ];

        for (event, expected_name) in events {
            assert_eq!(
                event_name(&event),
                expected_name,
                "event_name() mismatch for variant"
            );
        }
    }

    #[test]
    fn serde_tag_and_content_structure() {
        let event = VtEvent::MeetingDeleted {
            id: "test-id".to_string(),
        };
        let json = serde_json::to_value(&event).unwrap();

        let obj = json.as_object().unwrap();
        assert!(obj.contains_key("type"));
        assert!(obj.contains_key("payload"));
        assert_eq!(obj.len(), 2, "Expected exactly 2 keys: type and payload");
    }
}