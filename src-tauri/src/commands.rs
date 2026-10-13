use crate::token;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt; // Assuming your token module is imported at the root
                                  // use tauri_plugin_opener::StoreExt;
use chrono::{Local, NaiveDate, NaiveTime, TimeZone, Utc};
use icalendar::{Calendar, Component, Event, EventLike, Property};
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LiveKitSettings {
    pub url: String,
    pub api_key: String,
    pub api_secret: String,
    pub identity: String, // The user's display name/ID
}

/// Store file holding the user's own LiveKit server configuration.
///
/// This must **not** be `settings.json`: that file is owned by `AppData`
/// (`settings.rs`), which rewrites it wholesale with `fs::write`. Sharing one
/// file between the two writers silently wiped the saved server whenever a
/// note or profile field was saved.
pub(crate) const STORE_FILE: &str = "livekit.json";
pub(crate) const SETTINGS_KEY: &str = "livekit_config";

// The payload we will send back to SolidJS.
// `meeting_invite_link` is generated server-side, so requests may omit it.
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
pub struct ParsedInvite {
    pub url: String,
    pub room: String,
    pub token: String,
}
// The payload we will send back to SolidJS
#[derive(Debug, Serialize, Deserialize)]
pub struct MeetingInvite {
    pub room: String,
    pub title: String,
    #[serde(default)]
    pub invite_link: String,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct HostMeetingData {
    pub url: String,
    pub token: String,
}

#[tauri::command]
pub async fn create_meeting_invite(
    app: AppHandle,
    meeting: MeetingInvite,
) -> Result<MeetingInvite, String> {
    // 1. Load Host Settings (API Keys & URL)
    println!("Title: {}", meeting.title);

    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = store
        .get(SETTINGS_KEY)
        .ok_or("LiveKit settings not found. Please configure API keys in Settings first.")?;
    let settings: LiveKitSettings = serde_json::from_value(value).map_err(|e| e.to_string())?;

    // 2. Use the requested Room Code if provided, else generate a random one
    //    (e.g., room-7137)
    let room = if meeting.room.trim().is_empty() {
        let random_id = rand::random::<u16>() % 10000;
        format!("room-{}", random_id)
    } else {
        meeting.room.trim().to_string()
    };
    let title = meeting.title;

    // 3. Generate the Guest Token using YOUR existing module!
    // Identity is "guest", validity is 86400 seconds (24 hours)
    let guest_token = token::generate_token(
        &settings.api_key,
        &settings.api_secret,
        "guest",
        &room,
        86400,
    )
    .map_err(|e| format!("Token generation failed: {}", e))?;

    // 4. Package it into a deep link / invite URL
    // We use URL encoding so the JWT doesn't break the URL string
    let encoded_token = urlencoding::encode(&guest_token);
    let encoded_url = urlencoding::encode(&settings.url);

    // Format: visualtalk://join?room=room-7137&url=wss%3A...&token=eyJ...
    let invite_link = format!(
        "visualtalk://join?room={}&url={}&token={}",
        room, encoded_url, encoded_token
    );

    // 5. Return to SolidJS
    Ok(MeetingInvite {
        room,
        title,
        invite_link,
    })
}

// 1. Save Settings
#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: LiveKitSettings) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(SETTINGS_KEY, serde_json::to_value(&settings).unwrap());
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// 2. Load Settings
#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<Option<LiveKitSettings>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    match store.get(SETTINGS_KEY) {
        Some(value) => {
            let settings: LiveKitSettings =
                serde_json::from_value(value).map_err(|e| e.to_string())?;
            Ok(Some(settings))
        }
        None => Ok(None),
    }
}

// Helper function to generate the magic link (DRY - Don't Repeat Yourself)
pub(crate) fn generate_magic_link(
    settings: &LiveKitSettings,
    room: &str,
) -> Result<String, String> {
    // Generate 24h guest token
    let guest_token = token::generate_token(
        &settings.api_key,
        &settings.api_secret,
        "guest",
        room,
        86400,
    )
    .map_err(|e| format!("Token generation failed: {}", e))?;

    let encoded_token = urlencoding::encode(&guest_token);
    let encoded_url = urlencoding::encode(&settings.url);

    Ok(format!(
        "visualtalk://join?room={}&url={}&token={}",
        room, encoded_url, encoded_token
    ))
}

// Get Meeting Invite (For your PMI / Instant meetings)
#[tauri::command]
pub async fn get_meeting_invite(app: AppHandle, room: String) -> Result<String, String> {
    // Load settings
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = store
        .get(SETTINGS_KEY)
        .ok_or("LiveKit settings not configured.")?;
    let settings: LiveKitSettings = serde_json::from_value(value).map_err(|e| e.to_string())?;

    // Generate magic link for the PMI room
    let invite_link = generate_magic_link(&settings, &room)?;

    // Format it nicely for clipboard copying
    let invite_text = format!(
        "Join my VisualTalk meeting!\nRoom: {}\nLink: {}",
        room, invite_link
    );

    Ok(invite_text)
}

#[tauri::command]
pub async fn get_host_meeting_data(
    app: AppHandle,
    room: String,
) -> Result<HostMeetingData, String> {
    // 1. Load Settings
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    println!(
        "🔍 Looking for settings in {} under key {}",
        STORE_FILE, SETTINGS_KEY
    );
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
pub fn parse_invite_link(invite_link: String) -> Result<ParsedInvite, String> {
    // 1. Basic validation
    if !invite_link.starts_with("visualtalk://join?") {
        return Err("Invalid invite link format. Must start with visualtalk://join?".to_string());
    }

    // 2. Extract the query string (everything after the '?')
    let query_str = invite_link
        .split('?')
        .nth(1)
        .ok_or("Missing query parameters")?;

    // 3. Parse the parameters (room, url, token)
    let params: HashMap<String, String> = url::form_urlencoded::parse(query_str.as_bytes())
        .into_owned()
        .collect();

    // 4. Extract and validate required fields
    let url = params
        .get("url")
        .ok_or("Missing LiveKit URL in invite")?
        .clone();
    let room = params
        .get("room")
        .ok_or("Missing Room ID in invite")?
        .clone();
    let token = params
        .get("token")
        .ok_or("Missing Guest Token in invite")?
        .clone();

    Ok(ParsedInvite { url, room, token })
}

#[tauri::command]
pub async fn create_icalendar_event(
    app: AppHandle,
    ics: ICalendarEvent,
) -> Result<String, String> {
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
