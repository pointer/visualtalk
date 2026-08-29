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
    let livekit_url = env::var("LIVEKIT_URL")
        .unwrap_or_else(|_| "wss://visual-talk-84j2fcwy.livekit.cloud".to_string());
    
    let api_key = env::var("LIVEKIT_API_KEY")
        .map_err(|_| "LIVEKIT_API_KEY environment variable not set".to_string())?;

    let api_secret = env::var("LIVEKIT_API_SECRET")
        .map_err(|_| "LIVEKIT_API_SECRET environment variable not set".to_string())?;

    let identity = if !app_data.profile.identity.is_empty() {
        app_data.profile.identity.clone()
    } else {
        env::var("IDENTITY").unwrap_or_else(|_| "User1".to_string())
    };

    let display_name = if !app_data.profile.display_name.is_empty() {
        app_data.profile.display_name.clone()
    } else {
        identity.clone()
    };

    // Valid for 24 hours (86400s)
    let token = token::generate_token(&api_key, &api_secret, &identity, &room_name, 86400)?;

    Ok(MeetingSession {
        livekit_url,
        token,
        room_name,
        identity,
        display_name,
        start_with_video: app_data.settings.start_with_video,
        mute_on_join: app_data.settings.mute_on_join,
    })
}

