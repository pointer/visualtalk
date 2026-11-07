//! Scheduled meetings and join history, backed by `MeetingStore`.
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;

use crate::commands::{self, LiveKitSettings};
use crate::events::{emit as emit_event, VtEvent};
use crate::meeting::{MeetingRecord, ScheduledMeeting};
use crate::state::AppState;

#[tauri::command]
pub fn get_scheduled_meetings(state: State<'_, AppState>) -> Result<Vec<ScheduledMeeting>, String> {
    state.read_meetings(|meetings| meetings.scheduled.clone())
}

#[tauri::command]
pub fn schedule_meeting(
    app: AppHandle,
    title: String,
    room_id: String,
    start_time: String,
    duration_minutes: u32,
    state: State<'_, AppState>,
) -> Result<ScheduledMeeting, String> {
    // Load LiveKit settings to generate the invite link
    let store = app.store(commands::STORE_FILE).map_err(|e| e.to_string())?;
    let value = store
        .get(commands::SETTINGS_KEY)
        .ok_or("LiveKit settings not configured. Please set your API keys in Settings first.")?;
    let settings: LiveKitSettings = serde_json::from_value(value).map_err(|e| e.to_string())?;
    let invite_link = commands::generate_magic_link(&settings, &room_id)?;

    // Two `?`: the outer is the lock, the inner is the meetings.json write
    // that `add_scheduled` performs.
    let meeting = state.with_meetings(|meetings| {
        meetings.add_scheduled(
            title,
            room_id,
            invite_link,
            start_time,
            duration_minutes,
            &state.config_dir,
        )
    })??;

    // [CONCERN: schedule_meeting already has AppHandle from the store
    //  lookup above, so reusing it here is fine.  But note that the
    //  invoke response already returns the ScheduledMeeting to the
    //  caller.  The event is for OTHER windows that didn't initiate
    //  the schedule.  The caller's local `setScheduledMeetings(prev =>
    //  [...prev, newMeeting])` and this event will both add it.
    //  Must ensure the JS handler checks for duplicates or is
    //  idempotent.]
    emit_event(
        &app,
        VtEvent::MeetingScheduled {
            meeting: meeting.clone(),
        },
    );
    Ok(meeting)
}

#[tauri::command]
pub fn delete_scheduled_meeting(
    app: AppHandle,
    id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    // Two `?`: the outer is the lock, the inner is the meetings.json write.
    let removed =
        state.with_meetings(|meetings| meetings.remove_scheduled(&id, &state.config_dir))??;

    // [CONCERN: The caller's JS already does `setScheduledMeetings(prev =>
    //  prev.filter(m => m.id !== id))` locally.  The event will trigger
    //  the same filter again in ALL windows.  Double-filtering is
    //  harmless (idempotent) but the redundant re-render is wasteful.
    //  This is the trade-off of global broadcast vs. targeted emit.]
    if removed {
        emit_event(&app, VtEvent::MeetingDeleted { id });
    }

    Ok(removed)
}

#[tauri::command]
pub fn get_meeting_history(state: State<'_, AppState>) -> Result<Vec<MeetingRecord>, String> {
    state.read_meetings(|meetings| meetings.history.clone())
}
