use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum BackgroundKind {
    None,
    Blur,
    Color { value: String },
    Image { path: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundSettings {
    pub enabled: bool,
    pub kind: BackgroundKind,
}

impl Default for BackgroundSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            kind: BackgroundKind::None,
        }
    }
}

pub struct BackgroundState(pub Mutex<BackgroundSettings>);

#[tauri::command]
pub fn get_background(state: State<'_, BackgroundState>) -> Result<BackgroundSettings, String> {
    state
        .0
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "Could not read background settings".to_string())
}

#[tauri::command]
pub fn set_background(
    settings: BackgroundSettings,
    state: State<'_, BackgroundState>,
) -> Result<BackgroundSettings, String> {
    let mut current = state
        .0
        .lock()
        .map_err(|_| "Could not update background settings".to_string())?;

    *current = settings.clone();

    println!("Background updated: {:?}", settings);

    Ok(settings)
}
