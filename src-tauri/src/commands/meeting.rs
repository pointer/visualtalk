//! Meeting lifecycle: session creation, the meeting window, and teardown.
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

use tauri::{AppHandle, State};

use crate::events::{emit as emit_event, VtEvent};
use crate::session::{create_session, MeetingSession};
use crate::state::AppState;
use crate::window;

#[tauri::command]
pub fn get_meeting_session(
    room: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<MeetingSession, String> {
    let data = state.read_data(|data| data.clone())?;

    // Record in history. A failure here (an unwritable meetings.json) must not
    // stop the user joining, so — as before — it is deliberately ignored.
    let _ = state.with_meetings(|meetings| meetings.add_history(room.clone(), &state.config_dir));

    create_session(room, &data, &app)
}

#[tauri::command]
pub fn open_meeting_window(
    app: AppHandle,
    room: String,
    token: Option<String>,
    url: Option<String>,
    identity: Option<String>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<String, String> {
    // Pass the new arguments down to the spawn function
    let result =
        window::spawn_meeting_window(&app, room.clone(), token, url, identity, width, height);

    // [CONCERN: We emit MeetingStarted only if the window was created
    //  successfully.  If spawn fails, no event is emitted — correct
    //  behavior.  But the main window has no way to know the meeting
    //  window *failed* to open other than the invoke rejection.]
    if result.is_ok() {
        emit_event(&app, VtEvent::MeetingStarted { room });
    }

    result
}

/// Called from the meeting window's JS (`useLiveKitRoom.js`) when the meeting
/// is ending, *before* the window closes.  Emits `MeetingEnded` so the main
/// window can update its state without polling.
///
/// Force-quits and crashes are covered too: `window::spawn_meeting_window`
/// registers a native `Destroyed` hook that emits `MeetingEnded` whenever this
/// command never ran.  The ended-labels registry in `window.rs` guarantees the
/// event is emitted exactly once per meeting window.
///
/// The `window` parameter is injected by Tauri (the *calling* window), so the
/// JS side keeps invoking this with just `{ room }`.
#[tauri::command]
pub fn notify_meeting_ended(
    app: AppHandle,
    window: tauri::WebviewWindow,
    room: String,
) -> Result<(), String> {
    if window::mark_meeting_ended(&window.label()) {
        emit_event(&app, VtEvent::MeetingEnded { room });
    }
    Ok(())
}
