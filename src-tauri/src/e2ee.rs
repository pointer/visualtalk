//! End-to-End Encryption — Community Edition Stub
//!
//! This module provides the same API surface as the Pro Edition's E2EE
//! module, but all commands return an error indicating that E2EE requires
//! the VisualTalk Pro Edition.
//!
//! The Pro Edition implementation lives in the private `e2ee-pro/` submodule
//! and is compiled when the `e2ee` Cargo feature is enabled.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::state::AppState;

const PRO_REQUIRED: &str = "E2EE requires VisualTalk Pro Edition. \
    Get it from the App Store, Google Play, or Microsoft Store.";

type E2eeResult<T> = Result<T, String>;

// ── IPC data structures (must match Pro Edition's API) ────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WrappedKeyData {
    pub wrapped: String,
    pub iv: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedChatPayload {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub encrypted: bool,
    pub id: String,
    pub sender: String,
    pub sender_name: String,
    pub timestamp: i64,
    pub ciphertext: String,
    pub iv: String,
    pub wrapped_keys: HashMap<String, WrappedKeyData>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DecryptedChatData {
    pub text: String,
    pub sender_name: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedChunkResult {
    pub iv_b64: String,
    pub ciphertext_b64: String,
}

// ── Stub E2EESession ──────────────────────────────────────────

pub struct E2EESession;

impl E2EESession {
    pub fn new(_local_identity: String) -> E2eeResult<Self> {
        Err(PRO_REQUIRED.to_string())
    }
}

// ═══════════════════════════════════════════════════════════════
// Stub Tauri Commands — all return "Pro required" error
// ═══════════════════════════════════════════════════════════════

#[tauri::command]
pub fn e2ee_init(_local_identity: String, _state: State<'_, AppState>) -> E2eeResult<String> {
    Err(PRO_REQUIRED.to_string())
}

#[tauri::command]
pub fn e2ee_import_peer(_identity: String, _public_key_b64: String, _state: State<'_, AppState>) -> E2eeResult<()> {
    Err(PRO_REQUIRED.to_string())
}

#[tauri::command]
pub fn e2ee_encrypt_chat(_text: String, _sender: String, _sender_name: String, _state: State<'_, AppState>) -> E2eeResult<EncryptedChatPayload> {
    Err(PRO_REQUIRED.to_string())
}

#[tauri::command]
pub fn e2ee_decrypt_chat(
    _ciphertext_b64: String,
    _iv_b64: String,
    _wrapped_keys: HashMap<String, WrappedKeyData>,
    _sender: String,
    _state: State<'_, AppState>,
) -> E2eeResult<DecryptedChatData> {
    Err(PRO_REQUIRED.to_string())
}

#[tauri::command]
pub fn e2ee_prepare_file(_file_id: String, _state: State<'_, AppState>) -> E2eeResult<HashMap<String, WrappedKeyData>> {
    Err(PRO_REQUIRED.to_string())
}

#[tauri::command]
pub fn e2ee_unwrap_file_key(_file_id: String, _wrapped_b64: String, _iv_b64: String, _sender: String, _state: State<'_, AppState>) -> E2eeResult<()> {
    Err(PRO_REQUIRED.to_string())
}

#[tauri::command]
pub fn e2ee_encrypt_chunk(_file_id: String, _data: String, _state: State<'_, AppState>) -> E2eeResult<EncryptedChunkResult> {
    Err(PRO_REQUIRED.to_string())
}

#[tauri::command]
pub fn e2ee_decrypt_chunk(_file_id: String, _iv_b64: String, _ciphertext_b64: String, _state: State<'_, AppState>) -> E2eeResult<String> {
    Err(PRO_REQUIRED.to_string())
}

#[tauri::command]
pub fn e2ee_cleanup_file(_file_id: String, _state: State<'_, AppState>) -> E2eeResult<()> {
    Ok(()) // No-op in stub — no keys to clean
}

#[tauri::command]
pub fn e2ee_destroy(_state: State<'_, AppState>) -> E2eeResult<()> {
    Ok(()) // No-op in stub — no session to destroy
}