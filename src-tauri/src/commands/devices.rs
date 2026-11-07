//! Media device inventory and preferences, backed by `DeviceManager`.
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

use tauri::State;

use crate::device::{DevicePreferences, MediaDevice};
use crate::state::MediaState;

#[tauri::command]
pub fn set_devices(devices: Vec<MediaDevice>, state: State<'_, MediaState>) -> Result<(), String> {
    state.with_devices(|manager| manager.set_devices(devices))
}

#[tauri::command]
pub fn set_device_preferences(
    preferences: DevicePreferences,
    state: State<'_, MediaState>,
) -> Result<(), String> {
    state.with_devices(|manager| manager.set_preferences(preferences))
}

#[tauri::command]
pub fn get_audio_inputs(state: State<'_, MediaState>) -> Result<Vec<MediaDevice>, String> {
    state.read_devices(|manager| manager.get_audio_inputs())
}

#[tauri::command]
pub fn get_video_inputs(state: State<'_, MediaState>) -> Result<Vec<MediaDevice>, String> {
    state.read_devices(|manager| manager.get_video_inputs())
}

#[tauri::command]
pub fn get_audio_outputs(state: State<'_, MediaState>) -> Result<Vec<MediaDevice>, String> {
    state.read_devices(|manager| manager.get_audio_outputs())
}

#[tauri::command]
pub fn get_preferred_mic(state: State<'_, MediaState>) -> Result<Option<MediaDevice>, String> {
    state.read_devices(|manager| manager.get_preferred_mic())
}

#[tauri::command]
pub fn get_preferred_camera(state: State<'_, MediaState>) -> Result<Option<MediaDevice>, String> {
    state.read_devices(|manager| manager.get_preferred_camera())
}

#[tauri::command]
pub fn get_preferred_speaker(state: State<'_, MediaState>) -> Result<Option<MediaDevice>, String> {
    state.read_devices(|manager| manager.get_preferred_speaker())
}

#[tauri::command]
pub fn get_device(
    device_id: String,
    state: State<'_, MediaState>,
) -> Result<Option<MediaDevice>, String> {
    state.read_devices(|manager| manager.get_device(&device_id))
}

#[tauri::command]
pub fn get_all_devices(state: State<'_, MediaState>) -> Result<Vec<MediaDevice>, String> {
    state.read_devices(|manager| manager.get_all_devices())
}

#[tauri::command]
pub fn get_device_groups(
    state: State<'_, MediaState>,
) -> Result<Vec<crate::device::DeviceGroup>, String> {
    state.read_devices(|manager| manager.get_device_groups())
}

#[tauri::command]
pub fn validate_device(
    device_id: String,
    kind: crate::device::DeviceKind,
    state: State<'_, MediaState>,
) -> Result<bool, String> {
    state.read_devices(|manager| manager.validate_device(&device_id, kind))
}
