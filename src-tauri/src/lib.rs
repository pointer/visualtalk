// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Serialize;
mod token; // if you put it in a separate file

// use tauri::command;

#[tauri::command]
fn generate_livekit_token(
    api_key: String,
    identity: String,
    room: String,
    valid_for_seconds: Option<u64>,
) -> Result<String, String> {
    // Read secret from environment variable
    let secret = std::env::var("LIVEKIT_API_SECRET")
        .map_err(|_| "LIVEKIT_API_SECRET not set in environment".to_string())?;

    let validity = valid_for_seconds.unwrap_or(86400); // 24h
    token::generate_token(&api_key, &secret, &identity, &room, validity)
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct AppConfig {
    livekit_url: String,
    api_key: String,
    room: String,
    identity: String,
}

#[tauri::command]
fn get_config() -> Result<AppConfig, String> {
    let livekit_url = std::env::var("LIVEKIT_URL")
        .map_err(|_| "LIVEKIT_URL not set".to_string())?;
    let api_key = std::env::var("API_KEY")
        .map_err(|_| "API_KEY not set".to_string())?;
    let room = std::env::var("ROOM")
        .map_err(|_| "ROOM not set".to_string())?;
    let identity = std::env::var("IDENTITY")
        .map_err(|_| "IDENTITY not set".to_string())?;

    Ok(AppConfig {
        livekit_url,
        api_key,
        room,
        identity,
    })
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok();    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, generate_livekit_token, get_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
