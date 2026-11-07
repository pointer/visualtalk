//! Pro-only live translation settings (ADR 0003).
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

use tauri::State;

use crate::settings::TranslationSettings;
use crate::state::AppState;

#[tauri::command]
pub fn update_translation_settings(
    settings: TranslationSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.update_data(|data| data.settings.translation = settings)?;
    Ok(())
}

#[tauri::command]
pub fn get_translation_settings(state: State<'_, AppState>) -> Result<TranslationSettings, String> {
    state.read_data(|data| data.settings.translation.clone())
}
