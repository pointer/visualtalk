//! User profile, preferences and notes — the `AppData` half of settings.json.
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

use tauri::{AppHandle, State};

use crate::events::{emit as emit_event, VtEvent};
use crate::settings::{UserProfile, UserSettings};
use crate::state::AppState;

#[tauri::command]
pub fn get_user_profile(state: State<'_, AppState>) -> Result<UserProfile, String> {
    state.read_data(|data| data.profile.clone())
}

#[tauri::command]
pub fn update_user_profile(
    app: AppHandle,
    profile: UserProfile,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.update_data(|data| data.profile = profile.clone())?;

    // [CONCERN: The invoking window already received the updated profile
    //  via the invoke response.  This event will fire in ALL windows
    //  including the one that initiated the update.  The JS handler
    //  must be idempotent — setting the same profile twice is harmless
    //  but the re-render is wasted work.]
    emit_event(&app, VtEvent::ProfileUpdated { profile });
    Ok(())
}

#[tauri::command]
pub fn get_user_settings(state: State<'_, AppState>) -> Result<UserSettings, String> {
    state.read_data(|data| data.settings.clone())
}

#[tauri::command]
pub fn update_user_settings(
    app: AppHandle,
    settings: UserSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.update_data(|data| data.settings = settings.clone())?;

    // [CONCERN: Same idempotency concern as ProfileUpdated.  The JS
    //  SettingsTab currently calls `setSettings(updated)` locally AND
    //  awaits invoke().  The event will re-set it from the parent.
    //  This is safe (same value) but causes a redundant SolidJS
    //  re-evaluation.  Consider removing the local set in the child
    //  and relying solely on the event for cross-window sync.]
    emit_event(&app, VtEvent::SettingsUpdated { settings });
    Ok(())
}

#[tauri::command]
pub fn get_user_notes(state: State<'_, AppState>) -> Result<String, String> {
    state.read_data(|data| data.notes.clone())
}

#[tauri::command]
pub fn update_user_notes(
    app: AppHandle,
    notes: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.update_data(|data| data.notes = notes.clone())?;

    // [CONCERN: Notes can be large (multi-paragraph text).  Emitting the
    //  full notes string on every keystroke-save would be wasteful.
    //  Currently NotesTab only saves on explicit action (not on every
    //  keystroke), so this is acceptable.  If a live-collaborative
    //  notes feature is added, switch to debounced saves or a Channel.]
    emit_event(&app, VtEvent::NotesUpdated { notes });
    Ok(())
}
