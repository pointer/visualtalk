//! LiveKit Egress integration — server-side recording and RTMP streaming.
//!
//! Uses the LiveKit Server API (Twirp/HTTP) to start/stop egress sessions.
//! Requires the LiveKit Egress service to be configured on the server.

use crate::commands::{LiveKitSettings, SETTINGS_KEY, STORE_FILE};
use crate::token;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

/// Egress output type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EgressOutputType {
    File,
    Stream,
}

/// File output configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOutputConfig {
    pub file_type: String,
    pub filepath: String,
}

/// Stream output configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamOutputConfig {
    pub urls: Vec<String>,
    pub preset: String,
}

/// Request to start room composite egress
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartEgressRequest {
    pub room_name: String,
    pub output_type: EgressOutputType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_config: Option<FileOutputConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_config: Option<StreamOutputConfig>,
    pub custom_base_url: Option<String>,
    pub custom_api_key: Option<String>,
    pub custom_api_secret: Option<String>,
}

/// Egress info returned by the API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EgressInfo {
    pub egress_id: String,
    pub room_name: String,
    pub status: String,
    pub started_at: i64,
    pub ended_at: i64,
    pub error: Option<String>,
}

/// Response from list egress
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListEgressResponse {
    pub items: Vec<EgressInfo>,
}

/// Generate the LiveKit HTTP API URL from the WebSocket URL
fn api_url_from_ws(ws_url: &str) -> String {
    ws_url
        .replace("wss://", "https://")
        .replace("ws://", "http://")
        .trim_end_matches('/')
        .to_string()
}

fn make_server_token(api_key: &str, api_secret: &str) -> Result<String, String> {
    token::generate_server_token(api_key, api_secret, 600)
}

fn resolve_credentials(
    app: &AppHandle,
    custom_url: &Option<String>,
    custom_key: &Option<String>,
    custom_secret: &Option<String>,
) -> Result<(String, String, String), String> {
    // Fallback source is the user's saved server (Settings → LiveKit) — the
    // single source of truth. Environment variables are deliberately not used.
    let stored = app
        .store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(SETTINGS_KEY))
        .and_then(|value| serde_json::from_value::<LiveKitSettings>(value).ok());
    let (stored_url, stored_key, stored_secret) = match stored {
        Some(cfg) => (cfg.url, cfg.api_key, cfg.api_secret),
        None => (String::new(), String::new(), String::new()),
    };

    let api_key = custom_key.clone().unwrap_or(stored_key);
    let api_secret = custom_secret.clone().unwrap_or(stored_secret);
    let livekit_url = custom_url.clone().unwrap_or(stored_url);

    if api_key.is_empty() || api_secret.is_empty() || livekit_url.is_empty() {
        return Err("LiveKit API credentials not configured. Go to Settings first.".to_string());
    }
    Ok((api_key, api_secret, livekit_url))
}

/// Start room composite egress (records the entire room)
#[tauri::command]
pub async fn start_room_egress(
    app: AppHandle,
    request: StartEgressRequest,
) -> Result<EgressInfo, String> {
    let (api_key, api_secret, livekit_url) = resolve_credentials(
        &app,
        &request.custom_base_url,
        &request.custom_api_key,
        &request.custom_api_secret,
    )?;

    let base_url = api_url_from_ws(&livekit_url);
    let token = make_server_token(&api_key, &api_secret)?;

    let body = match request.output_type {
        EgressOutputType::File => {
            let cfg = request.file_config.unwrap_or(FileOutputConfig {
                file_type: "MP4".to_string(),
                filepath: format!(
                    "/recordings/{}-{}.mp4",
                    request.room_name,
                    chrono::Utc::now().timestamp()
                ),
            });
            serde_json::json!({
                "roomName": request.room_name,
                "layout": "grid",
                "file": { "fileType": cfg.file_type, "filepath": cfg.filepath }
            })
        }
        EgressOutputType::Stream => {
            let cfg = request.stream_config.unwrap_or(StreamOutputConfig {
                urls: vec![],
                preset: "FULL_HD_1080".to_string(),
            });
            if cfg.urls.is_empty() {
                return Err("At least one RTMP URL is required for streaming.".to_string());
            }
            serde_json::json!({
                "roomName": request.room_name,
                "layout": "grid",
                "stream": { "urls": cfg.urls, "preset": cfg.preset }
            })
        }
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(format!(
            "{}/twirp/livekit.Egress/StartRoomCompositeEgress",
            base_url
        ))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to LiveKit API: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("LiveKit API error ({}): {}", status, text));
    }

    resp.json::<EgressInfo>()
        .await
        .map_err(|e| format!("Failed to parse egress response: {}", e))
}

/// Stop an active egress session
#[tauri::command]
pub async fn stop_egress(
    app: AppHandle,
    egress_id: String,
    custom_base_url: Option<String>,
    custom_api_key: Option<String>,
    custom_api_secret: Option<String>,
) -> Result<EgressInfo, String> {
    let (api_key, api_secret, livekit_url) =
        resolve_credentials(&app, &custom_base_url, &custom_api_key, &custom_api_secret)?;

    let base_url = api_url_from_ws(&livekit_url);
    let token = make_server_token(&api_key, &api_secret)?;

    let body = serde_json::json!({ "egressId": egress_id });

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/twirp/livekit.Egress/StopEgress", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to LiveKit API: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("LiveKit API error ({}): {}", status, text));
    }

    resp.json::<EgressInfo>()
        .await
        .map_err(|e| format!("Failed to parse egress response: {}", e))
}

/// List active egress sessions for a room
#[tauri::command]
pub async fn list_egress(
    app: AppHandle,
    room_name: Option<String>,
    custom_base_url: Option<String>,
    custom_api_key: Option<String>,
    custom_api_secret: Option<String>,
) -> Result<Vec<EgressInfo>, String> {
    let (api_key, api_secret, livekit_url) =
        resolve_credentials(&app, &custom_base_url, &custom_api_key, &custom_api_secret)?;

    let base_url = api_url_from_ws(&livekit_url);
    let token = make_server_token(&api_key, &api_secret)?;

    let mut body = serde_json::Map::new();
    if let Some(room) = room_name {
        body.insert("roomName".to_string(), serde_json::Value::String(room));
    }

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{}/twirp/livekit.Egress/ListEgress", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to LiveKit API: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("LiveKit API error ({}): {}", status, text));
    }

    let list: ListEgressResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse egress list: {}", e))?;

    Ok(list.items)
}