//! Recordings folder, report contact, local blocking and demo availability.
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

use tauri::{AppHandle, State};

use crate::demo;
use crate::events::{emit as emit_event, VtEvent};
use crate::recording;
use crate::state::AppState;

#[derive(serde::Serialize)]
pub struct RecordingsDirInfo {
    path: String,
    /// True when the user has not chosen their own folder.
    is_default: bool,
    exists: bool,
}

fn recordings_dir_info(rec: &recording::RecordingState) -> RecordingsDirInfo {
    let dir = rec.dir();
    RecordingsDirInfo {
        is_default: dir == rec.default_dir,
        exists: dir.is_dir(),
        path: dir.to_string_lossy().to_string(),
    }
}

#[tauri::command]
pub fn get_recordings_dir(rec: State<'_, recording::RecordingState>) -> RecordingsDirInfo {
    recordings_dir_info(&rec)
}

/// Point local recordings at `path`, or back at the built-in folder when
/// `path` is `None`.
#[tauri::command]
pub fn set_recordings_dir(
    app: AppHandle,
    state: State<'_, AppState>,
    rec: State<'_, recording::RecordingState>,
    path: Option<String>,
) -> Result<RecordingsDirInfo, String> {
    // Apply first. If the folder cannot be created we must not persist a
    // setting that would silently break every subsequent recording.
    let requested = recording::resolve_recordings_dir(&rec.default_dir, path.as_deref());
    let effective = rec.set_dir(requested)?;

    let settings = state.update_data(|data| {
        // Store `None` for the built-in location so the default keeps tracking
        // the platform folder if it ever moves (portable installs, renamed id).
        data.settings.recordings_dir = if effective == rec.default_dir {
            None
        } else {
            Some(effective.to_string_lossy().to_string())
        };
        data.settings.clone()
    })?;

    emit_event(&app, VtEvent::SettingsUpdated { settings });
    Ok(recordings_dir_info(&rec))
}

#[derive(serde::Serialize)]
pub struct ReportContact {
    /// Meeting organizer's address — the destination for in-meeting reports
    /// about objectionable content. The licensor never sees meeting content, so
    /// it cannot moderate it; the organizer can.
    organizer: String,
    /// Publisher support address, shown in Settings → About.
    support: String,
}

#[tauri::command]
pub fn get_report_contact(state: State<'_, AppState>) -> Result<ReportContact, String> {
    state.read_data(|data| ReportContact {
        organizer: data.profile.effective_report_email(),
        support: crate::settings::SUPPORT_EMAIL.to_string(),
    })
}

#[tauri::command]
pub fn get_blocked_participants(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.read_data(|data| data.blocked_identities.clone())
}

/// Block or unblock a participant locally, by LiveKit identity.
///
/// Blocking is a client-side filter only: it hides that participant's chat,
/// files and video for this user. It cannot remove them from the room, because
/// only the organizer holds that authority on the LiveKit server. Returns the
/// updated block list so the UI can apply it without a second round-trip.
#[tauri::command]
pub fn set_participant_blocked(
    state: State<'_, AppState>,
    identity: String,
    blocked: bool,
) -> Result<Vec<String>, String> {
    let id = identity.trim();
    if id.is_empty() {
        return Err("No participant selected".to_string());
    }
    state.update_data(|data| {
        if blocked {
            if !data.blocked_identities.iter().any(|b| b == id) {
                data.blocked_identities.push(id.to_string());
            }
        } else {
            data.blocked_identities.retain(|b| b != id);
        }
        data.blocked_identities.clone()
    })
}

/// Whether this build carries demo credentials, so Settings can hide the
/// Demo-mode toggle in normal builds.
#[tauri::command]
pub fn get_demo_available() -> bool {
    demo::is_available()
}
