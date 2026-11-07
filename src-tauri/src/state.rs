use crate::device::DeviceManager;
use crate::e2ee::E2EESession;
use crate::meeting::MeetingStore;
use crate::participant::ParticipantManager;
use crate::settings::AppData;
use std::path::PathBuf;
use std::sync::Mutex;

/// Lock `mutex` and run `f` against the guard.
///
/// Every `with_*` / `read_*` accessor below is built on this one function, so
/// the poisoned-lock message and the scoping rule live in exactly one place.
///
/// The guard is confined to `f`, which is the point: it cannot outlive the
/// closure. A `std::sync::MutexGuard` is not `Send`, so an `async` Tauri
/// command that carried one across an `.await` would fail to compile — but a
/// *sync* command could otherwise hold it across slow work such as
/// `emit_event`, serialising IPC to every window while blocking every other
/// command that needs the same state.
fn with_lock<T, F, R>(mutex: &Mutex<T>, what: &str, f: F) -> Result<R, String>
where
    F: FnOnce(&mut T) -> R,
{
    let mut guard = mutex
        .lock()
        .map_err(|_| format!("Failed to lock {}", what))?;
    Ok(f(&mut guard))
}

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
    /// Mutate the persisted `AppData` without saving.
    ///
    /// Prefer [`AppState::update_data`] for settings writes — it persists the
    /// change and rolls it back if the write fails. Use this only when the
    /// caller genuinely wants an in-memory-only mutation.
    pub fn with_data<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut AppData) -> R,
    {
        with_lock(&self.data, "app data", f)
    }

    /// Read the persisted `AppData`.
    ///
    /// Return an owned value (a clone) rather than a borrow: the guard dies
    /// with the closure, so nothing can escape holding a reference to it.
    pub fn read_data<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&AppData) -> R,
    {
        with_lock(&self.data, "app data", |data| f(data))
    }

    /// Mutate `AppData` and persist it in one step.
    ///
    /// Every settings-writing command used to repeat the same three moves —
    /// take the lock, assign, `save` — which left two ways to get it wrong:
    /// forgetting the save, and mutating before a save that then failed. The
    /// second is the subtle one: the old code applied the change in memory and
    /// only *then* wrote the file, so a failed write left memory and disk
    /// disagreeing, and the next unrelated save would quietly persist the
    /// change the user was just told had failed. Restoring the previous value
    /// on error makes the command atomic from the caller's point of view.
    pub fn update_data<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut AppData) -> R,
    {
        let saved = self.with_data(|data| {
            let before = data.clone();
            let out = f(data);
            if let Err(err) = data.save(&self.config_dir) {
                *data = before;
                return Err(err);
            }
            Ok(out)
        })?;
        saved
    }

    /// Mutate the scheduled-meeting / history store.
    pub fn with_meetings<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut MeetingStore) -> R,
    {
        with_lock(&self.meetings, "meetings", f)
    }

    /// Read the scheduled-meeting / history store.
    pub fn read_meetings<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&MeetingStore) -> R,
    {
        with_lock(&self.meetings, "meetings", |meetings| f(meetings))
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

    /// Mutate the device manager.
    pub fn with_devices<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut DeviceManager) -> R,
    {
        with_lock(&self.device_manager, "device manager", f)
    }

    /// Read the device manager.
    pub fn read_devices<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&DeviceManager) -> R,
    {
        with_lock(&self.device_manager, "device manager", |manager| f(manager))
    }

    /// Mutate the participant roster.
    ///
    /// Roster commands usually need a value out of the manager *and* an event
    /// emitted about it. Compute the value inside this closure and emit after
    /// it returns, so the roster lock is never held across IPC to every window.
    pub fn with_participants<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut ParticipantManager) -> R,
    {
        with_lock(&self.participant_manager, "participant manager", f)
    }

    /// Read the participant roster.
    pub fn read_participants<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&ParticipantManager) -> R,
    {
        with_lock(
            &self.participant_manager,
            "participant manager",
            |manager| f(manager),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `update_data` must be all-or-nothing.
    ///
    /// The commands it replaced mutated `AppData` first and saved afterwards,
    /// so a failed write left memory and disk disagreeing — and the next
    /// unrelated save would then persist a change the caller had already been
    /// told had failed.
    #[test]
    fn update_data_rolls_back_when_the_save_fails() {
        // A config_dir that is a regular *file*: `create_dir_all` inside
        // save_json cannot succeed, so every save fails.
        let dir = std::env::temp_dir().join(format!("vt-state-blocker-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(&dir);
        std::fs::write(&dir, b"not a directory").unwrap();

        let state = AppState::new(dir.clone());
        let before = state.read_data(|data| data.notes.clone()).unwrap();

        let result = state.update_data(|data| data.notes = "must not stick".to_string());
        assert!(result.is_err(), "saving into a regular file must fail");
        assert_eq!(
            state.read_data(|data| data.notes.clone()).unwrap(),
            before,
            "a failed save must leave the in-memory data untouched"
        );

        let _ = std::fs::remove_file(&dir);
    }

    /// A successful update is visible to later reads *and* survives a reload
    /// from disk — the property the Settings UI relies on when it re-reads
    /// after saving.
    #[test]
    fn update_data_persists_and_reloads() {
        let dir = std::env::temp_dir().join(format!("vt-state-ok-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let state = AppState::new(dir.clone());
        state
            .update_data(|data| data.notes = "saved".to_string())
            .unwrap();
        assert_eq!(state.read_data(|data| data.notes.clone()).unwrap(), "saved");

        let reloaded = AppState::new(dir.clone());
        assert_eq!(
            reloaded.read_data(|data| data.notes.clone()).unwrap(),
            "saved",
            "the update must reach settings.json, not just memory"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A poisoned lock must surface as an error, not a panic: `with_lock` is
    /// the single place that turns `PoisonError` into the `String` every
    /// command already returns.
    #[test]
    fn poisoned_lock_is_reported_as_an_error() {
        let dir = std::env::temp_dir().join(format!("vt-state-poison-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let state = std::sync::Arc::new(AppState::new(dir.clone()));

        // Panic while holding the guard to poison it.
        let poisoner = {
            let state = std::sync::Arc::clone(&state);
            std::thread::spawn(move || {
                let _guard = state.data.lock().unwrap();
                panic!("intentional: poison the AppData lock");
            })
        };
        let _ = poisoner.join();

        assert!(state.read_data(|data| data.notes.clone()).is_err());
        assert!(state
            .update_data(|data| data.notes = String::new())
            .is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
