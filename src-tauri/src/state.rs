use crate::meeting::MeetingStore;
use crate::settings::AppData;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub config_dir: PathBuf,
    pub data: Mutex<AppData>,
    pub meetings: Mutex<MeetingStore>,
}

impl AppState {
    pub fn new(config_dir: PathBuf) -> Self {
        let data = AppData::load_or_default(&config_dir);
        let meetings = MeetingStore::load_or_default(&config_dir);

        Self {
            config_dir,
            data: Mutex::new(data),
            meetings: Mutex::new(meetings),
        }
    }
}

