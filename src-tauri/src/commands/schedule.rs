//! Scheduled meetings and join history, backed by `MeetingStore`.
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

use tauri::{AppHandle, State};

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
    invite_link: String,
    state: State<'_, AppState>,
) -> Result<ScheduledMeeting, String> {
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

    // The event synchronizes other windows; the initiating window also gets
    // this meeting from the invoke response and deduplicates by ID.
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
