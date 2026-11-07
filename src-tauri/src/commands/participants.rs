//! In-meeting roster, backed by `ParticipantManager`.
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

use tauri::{AppHandle, State};

use crate::events::{emit as emit_event, VtEvent};
use crate::participant::Participant;
use crate::state::MediaState;

#[tauri::command]
pub fn get_all_participants(state: State<'_, MediaState>) -> Result<Vec<Participant>, String> {
    state.read_participants(|manager| manager.get_all())
}

#[tauri::command]
pub fn add_participant(
    app: AppHandle,
    participant: Participant,
    state: State<'_, MediaState>,
) -> Result<bool, String> {
    let added = state.with_participants(|manager| manager.add_participant(participant.clone()))?;

    // [CONCERN: During a meeting join burst, 10-20 participants may be
    //  added in quick succession.  Each emit triggers JSON serialization
    //  of the full Participant struct.  The LiveKit-driven video grid
    //  already coalesces its participant writes within a 100ms window on
    //  the JS side (`updateParticipants` in useLiveKitRoom.js); if this
    //  Rust-side roster ever grows a JS consumer, debounce it the same way.]
    if added {
        emit_event(
            &app,
            VtEvent::ParticipantChanged {
                action: "added".to_string(),
                participant: Some(participant),
            },
        );
    }

    Ok(added)
}

#[tauri::command]
pub fn remove_participant(
    app: AppHandle,
    participant_id: String,
    state: State<'_, MediaState>,
) -> Result<bool, String> {
    // [CONCERN: We need to grab the participant *before* removal so we
    //  can include it in the event.  This is a minor extra lookup but
    //  keeps the event payload self-contained for the JS listener.]
    let (removed, removed_participant) = state.with_participants(|manager| {
        let removed_participant = manager.get_participant(&participant_id);
        let removed = manager.remove_participant(&participant_id);
        (removed, removed_participant)
    })?;

    if removed {
        emit_event(
            &app,
            VtEvent::ParticipantChanged {
                action: "removed".to_string(),
                participant: removed_participant,
            },
        );
    }

    Ok(removed)
}

#[tauri::command]
pub fn get_participant(
    participant_id: String,
    state: State<'_, MediaState>,
) -> Result<Option<Participant>, String> {
    state.read_participants(|manager| manager.get_participant(&participant_id))
}

#[tauri::command]
pub fn set_participant_muted(
    app: AppHandle,
    participant_id: String,
    muted: bool,
    state: State<'_, MediaState>,
) -> Result<bool, String> {
    // Snapshot the participant inside the lock and emit outside it: the roster
    // mutex must not be held across IPC to every window.
    let (updated, participant) = state.with_participants(|manager| {
        let updated = manager.set_participant_muted(&participant_id, muted);
        let participant = if updated {
            manager.get_participant(&participant_id)
        } else {
            None
        };
        (updated, participant)
    })?;

    // [CONCERN: Mute toggles can happen rapidly (e.g. push-to-talk).
    //  Each toggle emits immediately.  On the JS side this may cause
    //  rapid icon flicker.  Consider only emitting when the state
    //  actually changed, which `set_participant_muted` already
    //  guarantees (returns true only on actual mutation).]
    if updated {
        emit_event(
            &app,
            VtEvent::ParticipantChanged {
                action: if muted { "muted" } else { "unmuted" }.to_string(),
                participant,
            },
        );
    }

    Ok(updated)
}

#[tauri::command]
pub fn set_participant_video_enabled(
    app: AppHandle,
    participant_id: String,
    enabled: bool,
    state: State<'_, MediaState>,
) -> Result<bool, String> {
    // Snapshot inside the lock, emit outside it - see `set_participant_muted`.
    let (updated, participant) = state.with_participants(|manager| {
        let updated = manager.set_participant_video_enabled(&participant_id, enabled);
        let participant = if updated {
            manager.get_participant(&participant_id)
        } else {
            None
        };
        (updated, participant)
    })?;

    if updated {
        emit_event(
            &app,
            VtEvent::ParticipantChanged {
                action: if enabled { "video-on" } else { "video-off" }.to_string(),
                participant,
            },
        );
    }

    Ok(updated)
}

#[tauri::command]
pub fn filter_remote_participants(
    state: State<'_, MediaState>,
) -> Result<Vec<Participant>, String> {
    state.read_participants(|manager| manager.get_remote_participants())
}

#[tauri::command]
pub fn get_screen_shares(state: State<'_, MediaState>) -> Result<Vec<Participant>, String> {
    state.read_participants(|manager| manager.get_screen_shares())
}

#[tauri::command]
pub fn get_active_screen_share(
    state: State<'_, MediaState>,
) -> Result<Option<Participant>, String> {
    state.read_participants(|manager| manager.get_active_screen_share())
}

#[tauri::command]
pub fn get_participant_count(state: State<'_, MediaState>) -> Result<usize, String> {
    state.read_participants(|manager| manager.count())
}

#[tauri::command]
pub fn participant_exists(
    participant_id: String,
    state: State<'_, MediaState>,
) -> Result<bool, String> {
    state.read_participants(|manager| manager.exists(&participant_id))
}

#[tauri::command]
pub fn get_sorted_participants(state: State<'_, MediaState>) -> Result<Vec<Participant>, String> {
    state.read_participants(|manager| manager.get_sorted())
}

#[tauri::command]
pub fn clear_participants(app: AppHandle, state: State<'_, MediaState>) -> Result<(), String> {
    state.with_participants(|manager| manager.clear())?;

    // [CONCERN: Clearing emits a single "cleared" event with no participant.
    //  The JS side must treat this as "drop all participants", not "one
    //  participant changed".  This is a slightly different semantic from
    //  the other ParticipantChanged events — document this contract.]
    emit_event(
        &app,
        VtEvent::ParticipantChanged {
            action: "cleared".to_string(),
            participant: None,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn remove_screen_share(
    app: AppHandle,
    participant_id: String,
    state: State<'_, MediaState>,
) -> Result<(), String> {
    state.with_participants(|manager| manager.remove_screen_share(&participant_id))?;

    // [CONCERN: The removed screen-share participant object isn't included
    //  in the event (it's gone).  The JS listener gets only the ID via
    //  the action string.  If the UI needs the full participant to animate
    //  a removal, capture it before `remove_screen_share` like we do in
    //  `remove_participant`.]
    emit_event(
        &app,
        VtEvent::ParticipantChanged {
            action: format!("screen-share-removed:{}", participant_id),
            participant: None,
        },
    );

    Ok(())
}
