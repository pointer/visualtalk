//! Scheduled meetings and join history, backed by `MeetingStore`.
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

use serde::Serialize;

use tauri::{AppHandle, State};

use super::invitees::InviteDeliveryMethod;
// The canonical invite shape produced by `create_meeting_invite`. Reusing it
// keeps the IPC payload in sync with what the webview actually sends; a local
// duplicate drifted once and made `send_invitations` unreachable, because
// serde rejected the arguments before the handler body could run.
use super::invites::AttendeeInvite;
// Bulk sending reuses the single-send transport (SMTP via `lettre`, SMS via
// Twilio) and its validation, so the two paths cannot drift.
use super::messaging::{deliver_invite, validate_messaging_config, InviteContext};
use crate::events::{emit as emit_event, VtEvent};
use crate::meeting::{MeetingRecord, ScheduledMeeting};
use crate::settings::MessagingConfig;
use crate::state::AppState;

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
pub async fn send_invitations(
    invites: Vec<AttendeeInvite>,
    title: String,
    room: String,
    meeting_date: String,
    meeting_time: String,
    share_link_label: String,
    state: State<'_, AppState>,
) -> Result<Vec<InviteResult>, String> {
    if invites.is_empty() {
        return Err("No invitations provided.".into());
    }

    // Resolve and validate the transport configuration once, up front. A
    // misconfigured provider fails every row identically, so abort the batch
    // with one clear message instead of returning up to 50 copies of it.
    let settings = validate_messaging_config(state.read_data(|data| data.messaging.clone())?)?;

    // Meeting-level context is identical for every attendee, so it travels
    // once as command arguments rather than being duplicated onto each invite.
    let context = InviteContext {
        meeting_title: title,
        meeting_room: room,
        meeting_date,
        meeting_time,
        share_link_label,
    };

    Ok(dispatch_invitations(&settings, &invites, &context).await)
}

/// Send each invitation in turn and report one row per invite.
///
/// Delivery is deliberately sequential: a batch can hold up to 50 guests
/// (`invitees::MAX_INVITEES`), and fanning out would hammer the SMTP server and
/// the Twilio rate limit at once. Split out from the command wrapper so it can
/// be tested without a live Tauri `State`.
async fn dispatch_invitations(
    settings: &MessagingConfig,
    invites: &[AttendeeInvite],
    context: &InviteContext,
) -> Vec<InviteResult> {
    let mut results = Vec::with_capacity(invites.len());

    for (index, invite) in invites.iter().enumerate() {
        let recipient = invite
            .recipient
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .to_owned();
        // Reported even on failure: it is the channel this guest was invited
        // on, which is what the UI groups the outcome under.
        let channel = match invite.delivery_method {
            InviteDeliveryMethod::Email => "email",
            InviteDeliveryMethod::Sms => "sms",
        };

        let (accepted, error) = match deliver_invite(settings, invite, context).await {
            Ok(()) => (true, None),
            Err(message) => (false, Some(message)),
        };

        results.push(InviteResult {
            index,
            recipient,
            channel: Some(channel.to_owned()),
            accepted,
            error,
        });
    }

    results
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression guard: `send_invitations` receives exactly the JSON that
    /// `create_meeting_invite` emits for `attendee_invites`, and the webview
    /// forwards it verbatim. If the two shapes diverge, Tauri rejects the
    /// arguments before the handler runs and the command silently appears
    /// "not called" — which is what happened when this module carried its own
    /// duplicate `AttendeeInvite` with extra required fields.
    #[test]
    fn send_invitations_accepts_the_create_meeting_invite_wire_shape() {
        let emitted = serde_json::json!([{
            "recipient": "guest@example.com",
            "delivery_method": "email",
            "identity": "guest-00000000000000000000000000000000",
            "invite_link": "visualtalk://join?room=demo&url=https%3A%2F%2Flk&token=abc",
        }]);

        let invites: Vec<AttendeeInvite> = serde_json::from_value(emitted).unwrap();

        assert_eq!(invites.len(), 1);
        assert_eq!(invites[0].recipient.as_deref(), Some("guest@example.com"));
        assert_eq!(invites[0].delivery_method, InviteDeliveryMethod::Email);
        assert!(invites[0].invite_link.starts_with("visualtalk://join?"));
    }

    /// Shared-link invites (ADR 0006) carry no recipient. They must still
    /// deserialize, so one link-less invite cannot fail the whole batch —
    /// it is reported per-row through `InviteResult` instead.
    #[test]
    fn send_invitations_accepts_shared_link_invites_without_a_recipient() {
        let emitted = serde_json::json!([{
            "recipient": null,
            "delivery_method": "sms",
            "identity": "guest-11111111111111111111111111111111",
            "invite_link": "visualtalk://join?room=demo",
        }]);

        let invites: Vec<AttendeeInvite> = serde_json::from_value(emitted).unwrap();

        assert!(invites[0].recipient.is_none());
        assert_eq!(invites[0].delivery_method, InviteDeliveryMethod::Sms);
    }

    fn test_context() -> InviteContext {
        InviteContext {
            meeting_title: "Weekly sync".into(),
            meeting_room: "demo".into(),
            meeting_date: "2026-11-20".into(),
            meeting_time: "14:30".into(),
            share_link_label: "Share this Invite Link:".into(),
        }
    }

    /// A batch reports one row per invite and never fails wholesale: the
    /// recipient-less row is rejected on its own terms while the other is still
    /// attempted.
    ///
    /// Deliberately email-only with default (unconfigured) settings — `send_email`
    /// fails fast on an empty SMTP host, so the test touches neither the network
    /// nor the OS keychain. `send_sms` reads the Twilio token from the keychain
    /// before its own guard, so it must stay out of unit tests.
    #[test]
    fn dispatch_reports_each_row_instead_of_failing_the_batch() {
        let invites: Vec<AttendeeInvite> = serde_json::from_value(serde_json::json!([
            {
                "recipient": "guest@example.com",
                "delivery_method": "email",
                "identity": "guest-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "invite_link": "visualtalk://join?room=demo",
            },
            {
                "recipient": null,
                "delivery_method": "email",
                "identity": "guest-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                "invite_link": "visualtalk://join?room=demo",
            },
        ]))
        .unwrap();

        // Tauri's own runtime: the crate does not enable tokio's `macros`/`rt`
        // test features, and adding a dev-dependency for one test is not worth it.
        let results = tauri::async_runtime::block_on(dispatch_invitations(
            &MessagingConfig::default(),
            &invites,
            &test_context(),
        ));

        assert_eq!(results.len(), 2);

        // Row 0 passed validation and reached the transport, which is not
        // configured here. Assert on the cause, not the exact copy.
        assert_eq!(results[0].index, 0);
        assert_eq!(results[0].recipient, "guest@example.com");
        assert_eq!(results[0].channel.as_deref(), Some("email"));
        assert!(!results[0].accepted);
        let error = results[0].error.as_deref().unwrap();
        assert!(
            error.contains("SMTP"),
            "expected an SMTP configuration error, got: {error}"
        );

        // Row 1 was rejected by shared validation before any transport ran.
        assert_eq!(results[1].index, 1);
        assert_eq!(results[1].recipient, "");
        assert_eq!(results[1].channel.as_deref(), Some("email"));
        assert!(!results[1].accepted);
        assert_eq!(
            results[1].error.as_deref(),
            Some("Add a recipient before sending this invitation.")
        );
    }

    #[test]
    fn dispatch_of_an_empty_batch_produces_no_rows() {
        let results = tauri::async_runtime::block_on(dispatch_invitations(
            &MessagingConfig::default(),
            &[],
            &test_context(),
        ));

        assert!(results.is_empty());
    }
}
