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