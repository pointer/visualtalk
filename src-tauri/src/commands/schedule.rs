//! Scheduled meetings and join history, backed by `MeetingStore`.
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::events::{emit as emit_event, VtEvent};
use crate::meeting::{MeetingRecord, ScheduledMeeting};
use crate::state::AppState;
#[derive(Debug, Deserialize)]
pub struct AttendeeInvite {
    recipient: Option<String>,
    invite_link: String,
}

#[derive(Debug, Serialize)]
pub struct InviteResult {
    index: usize,
    recipient: String,
    channel: Option<String>,
    accepted: bool,
    error: Option<String>,
}

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

#[tauri::command]
pub async fn send_invitations(invites: Vec<AttendeeInvite>) -> Result<Vec<InviteResult>, String> {
    if invites.is_empty() {
        return Err("No invitations provided.".into());
    }

    let mut results = Vec::with_capacity(invites.len());

    for (index, invite) in invites.into_iter().enumerate() {
        let recipient = invite.recipient.unwrap_or_default().trim().to_owned();

        let link = invite.invite_link.trim();

        let (channel, outcome) = if recipient.is_empty() {
            (None, Err("Missing recipient.".to_owned()))
        } else if link.is_empty() {
            (None, Err("Missing invitation link.".to_owned()))
        } else if recipient.contains('@') {
            (Some("email".to_owned()), send_email(&recipient, link).await)
        } else if looks_like_international_phone(&recipient) {
            (Some("sms".to_owned()), send_sms(&recipient, link).await)
        } else {
            (
                None,
                Err("Enter an email address or an international \
                     phone number beginning with +."
                    .to_owned()),
            )
        };

        let (accepted, error) = match outcome {
            Ok(()) => (true, None),
            Err(message) => (false, Some(message)),
        };

        results.push(InviteResult {
            index,
            recipient,
            channel,
            accepted,
            error,
        });
    }

    Ok(results)
}

// A routing check, not full phone-number validation.
fn looks_like_international_phone(value: &str) -> bool {
    match value.strip_prefix('+') {
        Some(digits) => !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()),
        None => false,
    }
}

// Replace this body with your actual email service integration.
async fn send_email(_recipient: &str, _invite_link: &str) -> Result<(), String> {
    Err("Email delivery service is not configured.".into())
}

// Replace this body with your actual SMS service integration.
async fn send_sms(_recipient: &str, _invite_link: &str) -> Result<(), String> {
    Err("SMS delivery service is not configured.".into())
}
