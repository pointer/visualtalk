use crate::device::DeviceManager;
use crate::e2ee::E2EESession;
use crate::meeting::MeetingStore;
use crate::participant::ParticipantManager;
use crate::settings::AppData;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub config_dir: PathBuf,
    pub data: Mutex<AppData>,
    pub meetings: Mutex<MeetingStore>,
    pub device_manager: Mutex<DeviceManager>,
    pub participant_manager: Mutex<ParticipantManager>,
    pub e2ee_session: Mutex<Option<E2EESession>>,
}

impl AppState {
    pub fn new(config_dir: PathBuf) -> Self {
        let data = AppData::load_or_default(&config_dir);
        let meetings = MeetingStore::load_or_default(&config_dir);

        Self {
            config_dir,
            data: Mutex::new(data),
            meetings: Mutex::new(meetings),
            device_manager: Mutex::new(DeviceManager::new()),
            participant_manager: Mutex::new(ParticipantManager::new()),
            e2ee_session: Mutex::new(None),
        }
    }
}
