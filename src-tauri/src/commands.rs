use crate::token;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt; // Assuming your token module is imported at the root
                                  // use tauri_plugin_opener::StoreExt;
use chrono::{NaiveDate, NaiveTime};
use icalendar::{Calendar, Component, Event, EventLike, Property};
use std::fs;

// ── Command modules ──────────────────────────────────────────────
//
// The #[tauri::command] wrappers used to live in lib.rs next to the app
// setup. They are grouped here by domain; lib.rs keeps one
// `generate_handler!` table because Tauri v2 overwrites (not extends)
// `Builder::invoke_handler`, so it can only be installed once.
pub mod devices;
pub mod invitees;
pub mod invites;
pub mod layout;
pub mod meeting;
pub mod messaging;
pub mod participants;
pub mod profile;
pub mod safety;
pub mod schedule;
pub mod system;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LiveKitSettings {
    pub url: String,
    pub api_key: String,
    pub api_secret: String,
    pub identity: String, // The user's display name/ID
    /// Optional external guest-token issuer (`packages/guest-token-issuer`,
    /// ADR 0006). Empty — the default — means the app mints a signed LiveKit
    /// token per guest and every invite link admits exactly one guest. Set, it
    /// means invites carry a capability that each guest redeems for their own
    /// short-lived token, so one link can be shared with a group.
    #[serde(default)]
    pub token_issuer_url: String,
}

/// Store file holding the user's own LiveKit server configuration.
///
/// This must **not** be `settings.json`: that file is owned by `AppData`
/// (`settings.rs`), which rewrites it wholesale with `fs::write`. Sharing one
/// file between the two writers silently wiped the saved server whenever a
/// note or profile field was saved.
pub(crate) const STORE_FILE: &str = "livekit.json";
pub(crate) const SETTINGS_KEY: &str = "livekit_config";

// The payload used to create an iCalendar event.
#[derive(Debug, Serialize, Deserialize)]
pub struct ICalendarEvent {
    pub ics_id: String,
    pub ics_organizer: String,
    pub ics_attendees: Vec<String>,
    pub ics_room: String,
    pub ics_title: String,
    pub ics_summary: String,
    pub ics_description: String,
    pub ics_start_date: String,
    pub ics_start_time: String,
    pub ics_duration_minutes: u32,
    #[serde(default)]
    pub ics_invite_link: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HostMeetingData {
    pub url: String,
    pub token: String,
}

/// What `load_settings` returns to the webview: everything except the secret.
///
/// The API secret is only ever read by Rust (token signing, egress, invites),
/// so it must not cross the IPC boundary back into JavaScript — see
/// `docs/decisions/0004-individual-livekit-invites.md`. This mirrors how
/// `MessagingSettingsResponse` reports the SMTP password and Twilio token as
/// booleans instead of values.
#[derive(Debug, Serialize)]
pub struct LiveKitSettingsView {
    pub url: String,
    pub api_key: String,
    pub identity: String,
    pub api_secret_configured: bool,
}

// 1. Save Settings
#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: LiveKitSettings) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    // The form never receives the stored secret back, so it submits an empty
    // one when the user only edited the URL/key/identity: keep what is stored.
    let stored_secret = store
        .get(SETTINGS_KEY)
        .and_then(|value| serde_json::from_value::<LiveKitSettings>(value).ok())
        .map(|stored| stored.api_secret);
    let mut settings = settings;
    settings.api_secret = resolve_api_secret(stored_secret.as_deref(), &settings.api_secret)?;

    store.set(SETTINGS_KEY, serde_json::to_value(&settings).unwrap());
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// 2. Load Settings
#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<Option<LiveKitSettingsView>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    match store.get(SETTINGS_KEY) {
        Some(value) => {
            let settings: LiveKitSettings =
                serde_json::from_value(value).map_err(|e| e.to_string())?;
            Ok(Some(LiveKitSettingsView {
                api_secret_configured: !settings.api_secret.trim().is_empty(),
                url: settings.url,
                api_key: settings.api_key,
                identity: settings.identity,
            }))
        }
        None => Ok(None),
    }
}

/// Uses the submitted secret, or keeps the stored one when the submission is
/// blank. Never resolves to an empty secret: signing would then fail later,
/// far from the field the user actually left empty.
fn resolve_api_secret(stored: Option<&str>, submitted: &str) -> Result<String, String> {
    if !submitted.trim().is_empty() {
        return Ok(submitted.trim().to_string());
    }
    stored
        .map(str::trim)
        .filter(|secret| !secret.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "Enter the LiveKit API secret; none is stored yet.".to_string())
}

#[tauri::command]
pub async fn get_host_meeting_data(
    app: AppHandle,
    room: String,
) -> Result<HostMeetingData, String> {
    // 1. Load Settings
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = store
        .get(SETTINGS_KEY)
        .ok_or("LiveKit settings not configured. Go to Settings first!")?;
    let settings: LiveKitSettings = serde_json::from_value(value).map_err(|e| e.to_string())?;

    // 2. Generate HOST token (using the user's actual identity, not "guest")
    // Valid for 24 hours (86400 seconds)
    let host_token = token::generate_token(
        &settings.api_key,
        &settings.api_secret,
        &settings.identity, // Use the Host's actual name/ID
        &room,
        86400,
    )
    .map_err(|e| format!("Token generation failed: {}", e))?;

    Ok(HostMeetingData {
        url: settings.url,
        token: host_token,
    })
}

#[tauri::command]
pub async fn create_icalendar_event(app: AppHandle, ics: ICalendarEvent) -> Result<String, String> {
    use chrono::Duration;

    let start_date = NaiveDate::parse_from_str(&ics.ics_start_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid start date: {}", e))?;
    let start_time = NaiveTime::parse_from_str(&ics.ics_start_time, "%H:%M")
        .map_err(|e| format!("Invalid start time: {}", e))?;
    let start = start_date.and_time(start_time);

    // Compute end from start + duration
    let end = start + Duration::minutes(ics.ics_duration_minutes as i64);

    let mut event = Event::new();
    event
        .summary(&ics.ics_summary)
        .description(&ics.ics_description)
        .starts(start)
        .ends(end);

    event.append_property(Property::new("UID", ics.ics_id.as_str()));

    if !ics.ics_room.is_empty() {
        event.append_property(Property::new("LOCATION", ics.ics_room.as_str()));
    }

    if !ics.ics_organizer.is_empty() {
        let organizer = format!("mailto:{}", ics.ics_organizer);
        event.append_property(Property::new("ORGANIZER", organizer.as_str()));
    }

    // Add ATTENDEE properties so calendar apps (macOS Calendar, Outlook, etc.)
    // offer to email invitations to each guest when the .ics is opened.
    for attendee_email in &ics.ics_attendees {
        let email = attendee_email.trim();
        if !email.is_empty() {
            let mut attendee_prop = Property::new("ATTENDEE", format!("mailto:{}", email));
            attendee_prop
                .add_parameter("CN", email)
                .add_parameter("RSVP", "TRUE")
                .add_parameter("PARTSTAT", "NEEDS-ACTION")
                .add_parameter("ROLE", "REQ-PARTICIPANT");
            event.append_property(attendee_prop);
        }
    }

    if !ics.ics_invite_link.is_empty() {
        event.append_property(Property::new("URL", ics.ics_invite_link.as_str()));
    }

    let calendar = Calendar::new().push(event).done();

    // Write to the app config directory so the file persists across sessions
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Cannot resolve config dir: {}", e))?;
    let _ = std::fs::create_dir_all(&config_dir);

    let file_name = format!("{}.ics", ics.ics_id);
    let ics_path = config_dir.join(&file_name);
    fs::write(&ics_path, calendar.to_string())
        .map_err(|e| format!("Failed to write .ics file: {}", e))?;

    Ok(ics_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_submission_keeps_the_stored_api_secret() {
        assert_eq!(
            resolve_api_secret(Some("stored-secret"), "").unwrap(),
            "stored-secret"
        );
        assert_eq!(
            resolve_api_secret(Some("stored-secret"), "   ").unwrap(),
            "stored-secret"
        );
    }

    #[test]
    fn submitted_secret_replaces_the_stored_one_and_is_trimmed() {
        assert_eq!(
            resolve_api_secret(Some("old-secret"), " new-secret ").unwrap(),
            "new-secret"
        );
        assert_eq!(
            resolve_api_secret(None, "new-secret").unwrap(),
            "new-secret"
        );
    }

    #[test]
    fn a_blank_secret_is_rejected_instead_of_being_saved_empty() {
        assert!(resolve_api_secret(None, "").is_err());
        assert!(resolve_api_secret(Some("   "), " ").is_err());
    }
}
