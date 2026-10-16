//! LiveKit Egress integration — server-side recording and RTMP streaming.
//!
//! Uses the official `livekit-api` crate's `EgressClient`, which handles auth
//! (it mints short-lived server tokens per request — the old manual
//! `roomRecord` server token is no longer needed), Twirp framing and the
//! protobuf wire types. Requires the LiveKit Egress service to be configured
//! on the server.
//!
//! The Tauri command signatures and the JSON shape returned to the frontend
//! (`EgressInfo`, status strings like `"EGRESS_ACTIVE"`) are unchanged.

use crate::commands::{LiveKitSettings, SETTINGS_KEY, STORE_FILE};
use livekit_api::services::egress::{
    encoding::{self, EncodingOptions},
    EgressClient, EgressListFilter, EgressListOptions, EgressOutput, RoomCompositeOptions,
};
use livekit_protocol::{
    EncodedFileOutput, EncodedFileType, EgressInfo as ProtoEgressInfo, EgressStatus, StreamOutput,
};
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

/// Generate the LiveKit HTTP API URL from the WebSocket URL
fn api_url_from_ws(ws_url: &str) -> String {
    ws_url
        .replace("wss://", "https://")
        .replace("ws://", "http://")
        .trim_end_matches('/')
        .to_string()
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

    let client = EgressClient::with_api_key(&api_url_from_ws(&livekit_url), &api_key, &api_secret);

    let (output, options) = match request.output_type {
        EgressOutputType::File => {
            let cfg = request.file_config.unwrap_or(FileOutputConfig {
                file_type: "MP4".to_string(),
                filepath: format!(
                    "/recordings/{}-{}.mp4",
                    request.room_name,
                    chrono::Utc::now().timestamp()
                ),
            });
            let mut file_output = EncodedFileOutput {
                filepath: cfg.filepath,
                ..Default::default()
            };
            file_output.set_file_type(file_type_from_str(&cfg.file_type));
            (
                EgressOutput::File(file_output),
                RoomCompositeOptions {
                    layout: "grid".to_string(),
                    ..Default::default()
                },
            )
        }
        EgressOutputType::Stream => {
            let cfg = request.stream_config.unwrap_or(StreamOutputConfig {
                urls: vec![],
                preset: "FULL_HD_1080".to_string(),
            });
            if cfg.urls.is_empty() {
                return Err("At least one RTMP URL is required for streaming.".to_string());
            }
            let encoding = encoding_for_preset(&cfg.preset);
            (
                EgressOutput::Stream(StreamOutput {
                    urls: cfg.urls,
                    ..Default::default()
                }),
                RoomCompositeOptions {
                    layout: "grid".to_string(),
                    encoding,
                    ..Default::default()
                },
            )
        }
    };

    let info = client
        .start_room_composite_egress(&request.room_name, vec![output], options)
        .await
        .map_err(|e| format!("LiveKit API error: {}", e))?;

    Ok(to_api_info(info))
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

    let client = EgressClient::with_api_key(&api_url_from_ws(&livekit_url), &api_key, &api_secret);

    let info = client
        .stop_egress(&egress_id)
        .await
        .map_err(|e| format!("LiveKit API error: {}", e))?;

    Ok(to_api_info(info))
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

    let client = EgressClient::with_api_key(&api_url_from_ws(&livekit_url), &api_key, &api_secret);

    let filter = match room_name.filter(|r| !r.is_empty()) {
        Some(room) => EgressListFilter::Room(room),
        None => EgressListFilter::All,
    };

    let items = client
        .list_egress(EgressListOptions {
            filter,
            ..Default::default()
        })
        .await
        .map_err(|e| format!("LiveKit API error: {}", e))?;

    Ok(items.into_iter().map(to_api_info).collect())
}

// ── proto → serde mapping (keeps the frontend wire format unchanged) ──

/// Map the SDK's `EgressStatus` enum back to the SCREAMING_SNAKE strings the
/// old JSON/Twirp responses carried, so the frontend sees identical values.
fn status_str(status: EgressStatus) -> &'static str {
    match status {
        EgressStatus::EgressStarting => "EGRESS_STARTING",
        EgressStatus::EgressActive => "EGRESS_ACTIVE",
        EgressStatus::EgressEnding => "EGRESS_ENDING",
        EgressStatus::EgressComplete => "EGRESS_COMPLETE",
        EgressStatus::EgressFailed => "EGRESS_FAILED",
        EgressStatus::EgressAborted => "EGRESS_ABORTED",
        EgressStatus::EgressLimitReached => "EGRESS_LIMIT_REACHED",
    }
}

/// Convert the protobuf `EgressInfo` returned by the SDK into this module's
/// serde struct (identical JSON shape as before the migration).
fn to_api_info(info: ProtoEgressInfo) -> EgressInfo {
    let status = status_str(info.status()).to_string();
    let error = if info.error.is_empty() {
        None
    } else {
        Some(info.error)
    };
    EgressInfo {
        egress_id: info.egress_id,
        room_name: info.room_name,
        status,
        started_at: info.started_at,
        ended_at: info.ended_at,
        error,
    }
}

/// Map the file-type strings used by the settings UI to protobuf enums.
fn file_type_from_str(s: &str) -> EncodedFileType {
    match s.to_uppercase().as_str() {
        "MP4" => EncodedFileType::Mp4,
        "OGG" => EncodedFileType::Ogg,
        _ => EncodedFileType::DefaultFiletype,
    }
}

/// Map a stream preset name from the frontend ("FULL_HD_1080" by default) to
/// the SDK's built-in encoding presets.
fn encoding_for_preset(preset: &str) -> EncodingOptions {
    match preset {
        "HD_720" | "H264_720P_30" => encoding::H264_720P_30,
        // "FULL_HD_1080" (the frontend default) and anything else → 1080p30.
        _ => encoding::H264_1080P_30,
    }
}