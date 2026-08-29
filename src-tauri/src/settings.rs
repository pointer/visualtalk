use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub identity: String,
    pub display_name: String,
    pub email: String,
    pub pmi: String,
}

impl Default for UserProfile {
    fn default() -> Self {
        Self {
            identity: "User1".to_string(),
            display_name: "You".to_string(),
            email: "user@visualtalk.local".to_string(),
            pmi: "231 809 1164".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    pub start_with_video: bool,
    pub use_pmi: bool,
    pub always_show_preview: bool,
    pub mute_on_join: bool,
    pub preferred_mic_id: Option<String>,
    pub preferred_cam_id: Option<String>,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            start_with_video: true,
            use_pmi: false,
            always_show_preview: true,
            mute_on_join: false,
            preferred_mic_id: None,
            preferred_cam_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppData {
    pub profile: UserProfile,
    pub settings: UserSettings,
}

impl AppData {
    pub fn load_or_default(config_dir: &PathBuf) -> Self {
        let file_path = config_dir.join("settings.json");
        if file_path.exists() {
            if let Ok(content) = fs::read_to_string(&file_path) {
                if let Ok(data) = serde_json::from_str::<AppData>(&content) {
                    return data;
                }
            }
        }
        let default_data = AppData::default();
        let _ = default_data.save(config_dir);
        default_data
    }

    pub fn save(&self, config_dir: &PathBuf) -> Result<(), String> {
        let _ = fs::create_dir_all(config_dir);
        let file_path = config_dir.join("settings.json");
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(file_path, json).map_err(|e| e.to_string())?;
        Ok(())
    }
}

