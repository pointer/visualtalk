use crate::commands::{LiveKitSettings, SETTINGS_KEY, STORE_FILE};
use crate::settings::AppData;
use crate::token;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

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

/// Shown when no LiveKit server has been configured.
///
/// VisualTalk is bring-your-own-server: it ships **no** default server and **no**
/// embedded credentials, and never routes meetings through infrastructure
/// operated by the licensor.
const NO_SERVER_CONFIGURED: &str = "No LiveKit server configured. Open Settings → LiveKit and \
enter your own server URL, API key and API secret. VisualTalk provides no built-in server: \
your audio, video and chat travel only to the server you choose.";

/// Resolve the LiveKit credentials for a session.
///
/// Single source of truth: the user's own server, saved from
/// Settings → LiveKit (Tauri store, `STORE_FILE`). Environment variables are
/// deliberately **not** consulted — a second credential path only creates a
/// way for secrets to leak into dev machines, CI logs and shipped bundles.
///
/// Fails closed when the store is not fully populated. This is a deliberate
/// security property: a signing secret compiled into a shipped binary is
/// recoverable by anyone with `strings`, so no secret may ever be embedded here.
fn resolve_livekit_credentials(app: &AppHandle) -> Result<(String, String, String), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = match store.get(SETTINGS_KEY) {
        Some(value) => value,
        None => return Err(NO_SERVER_CONFIGURED.to_string()),
    };
    let settings: LiveKitSettings = serde_json::from_value(value).map_err(|e| e.to_string())?;

    if settings.url.trim().is_empty()
        || settings.api_key.trim().is_empty()
        || settings.api_secret.trim().is_empty()
    {
        return Err(NO_SERVER_CONFIGURED.to_string());
    }

    Ok((
        settings.url.trim().to_string(),
        settings.api_key.trim().to_string(),
        settings.api_secret.trim().to_string(),
    ))
}

/// Resolve the LiveKit credentials for a session, in strict precedence order.
///
/// 1. **Demo mode, if switched on and the build carries credentials.** Lets a
///    review build be exercised deliberately.
/// 2. **The user's own server** (Settings → LiveKit). This is the normal path,
///    and it is checked before any fallback so a configured deployment is never
///    silently routed elsewhere.
/// 3. **The demo project, only when nothing of the user's own is configured.**
///    Without this an App Review reviewer who never finds the toggle would hit
///    "no server configured" and reject the app as broken.
///
/// Steps 1 and 3 are no-ops in every build that was not compiled with
/// `VISUALTALK_DEMO_*`, where the chain degrades to the pre-existing behaviour:
/// the user's server, or a hard failure.
fn resolve_credentials(
    app_data: &AppData,
    app: &AppHandle,
) -> Result<(String, String, String), String> {
    let demo = crate::demo::credentials();

    if app_data.settings.demo_mode {
        if let Some(demo) = &demo {
            return Ok((
                demo.url.clone(),
                demo.api_key.clone(),
                demo.api_secret.clone(),
            ));
        }
    }

    if let Ok(own) = resolve_livekit_credentials(app) {
        return Ok(own);
    }

    if let Some(demo) = &demo {
        return Ok((
            demo.url.clone(),
            demo.api_key.clone(),
            demo.api_secret.clone(),
        ));
    }

    Err(NO_SERVER_CONFIGURED.to_string())
}

pub fn create_session(
    room_name: String,
    app_data: &AppData,
    app: &AppHandle,
) -> Result<MeetingSession, String> {
    // Bring-your-own-server: there is deliberately no licensor-operated fallback
    // in a normal build. The only exception is a review build compiled with
    // `VISUALTALK_DEMO_*` — see `demo.rs` for the security trade-off, which is
    // that those credentials are public for as long as that build exists and
    // must be rotated after App Review.
    let (livekit_url, api_key, api_secret) = resolve_credentials(app_data, app)?;

    // Persistent profile identity; a random one is generated on first run.
    let identity = if !app_data.profile.identity.is_empty() {
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
