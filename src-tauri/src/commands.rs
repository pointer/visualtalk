use crate::token;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt; // Assuming your token module is imported at the root
                                  // use tauri_plugin_opener::StoreExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LiveKitSettings {
    pub url: String,
    pub api_key: String,
    pub api_secret: String,
    pub identity: String, // The user's display name/ID
}

const STORE_FILE: &str = "settings.json";
const SETTINGS_KEY: &str = "livekit_config";

// The payload we will send back to SolidJS
#[derive(Debug, Serialize, Deserialize)]
pub struct MeetingInvite {
    pub room: String,
    pub title: String,
    pub invite_link: String,
}

// --- MEETING STRUCT ---
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub room_id: String,
    pub start_time: String,
    pub duration_minutes: i32,
    pub invite_link: String, // <--- ADDED THIS
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedInvite {
    pub url: String,
    pub room: String,
    pub token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HostMeetingData {
    pub url: String,
    pub token: String,
}

#[tauri::command]
pub async fn create_meeting_invite(app: AppHandle, title: String) -> Result<MeetingInvite, String> {
    // 1. Load Host Settings (API Keys & URL)
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = store
        .get(SETTINGS_KEY)
        .ok_or("LiveKit settings not found. Please configure API keys in Settings first.")?;
    let settings: LiveKitSettings = serde_json::from_value(value).map_err(|e| e.to_string())?;

    // 2. Generate a random Room Code (e.g., room-7137)
    let random_id = rand::random::<u16>() % 10000;
    let room = format!("room-{}", random_id);

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

// 3. Generate Token (Using your existing module!)
#[tauri::command]
pub async fn get_meeting_token(app: AppHandle, room: String) -> Result<String, String> {
    // First, load the saved settings
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = store
        .get(SETTINGS_KEY)
        .ok_or("Settings not found. Please configure API keys first.")?;
    let settings: LiveKitSettings = serde_json::from_value(value).map_err(|e| e.to_string())?;

    // Call your existing token generator!
    // validity: e.g., 3600 seconds (1 hour)
    let token = token::generate_token(
        &settings.api_key,
        &settings.api_secret,
        &settings.identity,
        &room,
        3600,
    )
    .map_err(|e| format!("Token generation failed: {}", e))?;

    Ok(token)
}

// Helper function to generate the magic link (DRY - Don't Repeat Yourself)
fn generate_magic_link(settings: &LiveKitSettings, room: &str) -> Result<String, String> {
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

#[tauri::command]
pub async fn schedule_meeting_0(
    app: AppHandle,
    title: String,
    room_id: String,
    start_time: String,
    duration_minutes: i32,
) -> Result<Meeting, String> {
    // Load settings to get API keys
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = store
        .get(SETTINGS_KEY)
        .ok_or("LiveKit settings not configured.")?;
    let settings: LiveKitSettings = serde_json::from_value(value).map_err(|e| e.to_string())?;

    // Generate the magic link right now!
    let invite_link = generate_magic_link(&settings, &room_id)?;

    let new_meeting = Meeting {
        id: Utc::now().timestamp_millis().to_string(),
        title,
        room_id,
        start_time,
        duration_minutes,
        invite_link, // Save the link with the meeting
    };

    // TODO: Your existing logic to save this to the local database/store goes here
    // e.g., store.set("meetings", ...); store.save()?;

    Ok(new_meeting)
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
