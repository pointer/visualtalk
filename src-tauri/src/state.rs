use crate::device::DeviceManager;
use crate::e2ee::E2EESession;
use crate::meeting::MeetingStore;
use crate::participant::ParticipantManager;
use crate::settings::AppData;
use std::path::PathBuf;
use std::sync::Mutex;

/// App data, meetings, and shared E2EE session state.
///
/// This struct's exact name and shape are a **contract with the Pro Edition**:
/// the private `e2ee-pro/` implementation (swapped in at build time behind the
/// `e2ee` Cargo feature) does `use crate::state::AppState;` and reads
/// `state.e2ee_session`. Keep the name and the `e2ee_session` field stable so
/// that private drop-in keeps compiling without editing the private repo.
pub struct AppState {
    pub config_dir: PathBuf,
    pub data: Mutex<AppData>,
    pub meetings: Mutex<MeetingStore>,
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
            e2ee_session: Mutex::new(None),
        }
    }
}

/// Media runtime: device and participant managers.
///
/// Split out of the historical `AppState` god-object so commands that only
/// touch media/roster state no longer depend on app data or session state
/// (interface segregation). These fields were never read by the Pro E2EE
/// drop-in, so this split is safe for the `e2ee` feature build.
pub struct MediaState {
    pub device_manager: Mutex<DeviceManager>,
    pub participant_manager: Mutex<ParticipantManager>,
}

impl MediaState {
    pub fn new() -> Self {
        Self {
            device_manager: Mutex::new(DeviceManager::new()),
            participant_manager: Mutex::new(ParticipantManager::new()),
        }
    }
}
