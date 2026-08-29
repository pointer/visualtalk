use crate::settings::AppData;
use crate::token;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingSession {
    pub livekit_url: String,
    pub token: String,
    pub room_name: String,
    pub identity: String,
    pub display_name: String,
    pub start_with_video: bool,
    pub mute_on_join: bool,
}

pub fn create_session(
    room_name: String,
    app_data: &AppData,
) -> Result<MeetingSession, String> {
    // Default to the project's LiveKit cloud instance if .env is missing in release bundles
    let livekit_url = env::var("LIVEKIT_URL")
        .unwrap_or_else(|_| "wss://visual-talk-84j2fcwy.livekit.cloud".to_string());

    let api_key = env::var("LIVEKIT_API_KEY")
        .unwrap_or_else(|_| "APIHKPPK2KC3WdL".to_string());

    let api_secret = env::var("LIVEKIT_API_SECRET")
        .unwrap_or_else(|_| "kIgjMH9XjfxXnUA0dwMPo8bzoHx0WTyRuQoFLg9eEaJ".to_string());

    // Prioritize IDENTITY from .env if explicitly set (e.g. IDENTITY=user2), otherwise use persistent profile
    let identity = if let Ok(env_id) = env::var("IDENTITY") {
        if !env_id.trim().is_empty() {
            env_id.trim().to_string()
        } else if !app_data.profile.identity.is_empty() {
            app_data.profile.identity.clone()
        } else {
            format!("User-{}", chrono::Utc::now().timestamp_millis() % 10000)
        }
    } else if !app_data.profile.identity.is_empty() {
        app_data.profile.identity.clone()
    } else {
        format!("User-{}", chrono::Utc::now().timestamp_millis() % 10000)
    };

    let display_name = if !app_data.profile.display_name.is_empty() {
        app_data.profile.display_name.clone()
    } else {
        identity.clone()
    };

    // Trim room name
    let clean_room = room_name.trim().to_string();

    // Valid for 24 hours (86400s)
    let token = token::generate_token(&api_key, &api_secret, &identity, &clean_room, 86400)?;

    Ok(MeetingSession {
        livekit_url,
        token,
        room_name: clean_room,
        identity,
        display_name,
        start_with_video: app_data.settings.start_with_video,
        mute_on_join: app_data.settings.mute_on_join,
    })
}
