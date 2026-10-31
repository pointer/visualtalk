//! Minimal JSON file persistence shared by the app's on-disk aggregates.
//!
//! Every persisted model (`AppData` → `settings.json`, `MeetingStore` →
//! `meetings.json`, …) used to duplicate the same three-step dance: create the
//! config directory, pretty-print via `serde_json`, and write the file. This
//! module centralizes that so each model only declares its file name and its
//! Rust type.
//!
//! Serialization format is deliberately unchanged: files are written as
//! `serde_json::to_string_pretty` under a `create_dir_all`-created directory,
//! exactly as the previous duplicated implementations did, so existing user
//! data and any tooling that reads these files behave identically.

use serde::de::DeserializeOwned;
use serde::Serialize;
use std::path::Path;

/// Load `T` from `<dir>/<file>`.
///
/// Returns `None` when the file is missing, unreadable, or does not parse as
/// `T` — mirroring the previous "best effort load, fall back to default"
/// behaviour of the aggregate types.
pub fn load_json<T: DeserializeOwned>(dir: &Path, file: &str) -> Option<T> {
    let path = dir.join(file);
    if !path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Pretty-print `value` to `<dir>/<file>`, creating `dir` if it is missing.
pub fn save_json<T: Serialize>(dir: &Path, file: &str, value: &T) -> Result<(), String> {
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("Failed to create dir {}: {}", dir.display(), e))?;
    let path = dir.join(file);
    let json = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use std::path::PathBuf;

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct Sample {
        name: String,
        count: u32,
    }

    #[test]
    fn save_then_load_round_trips() {
        let dir = std::env::temp_dir().join(format!("vt-persist-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let value = Sample {
            name: "meeting".into(),
            count: 42,
        };
        save_json(&dir, "sample.json", &value).expect("save should succeed");
        let loaded: Sample = load_json(&dir, "sample.json").expect("load should succeed");
        assert_eq!(loaded, value);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_missing_file_returns_none() {
        let dir = PathBuf::from("/nonexistent/vt-persist-missing");
        assert!(load_json::<Sample>(&dir, "nope.json").is_none());
    }

    #[test]
    fn corrupt_file_returns_none() {
        let dir = std::env::temp_dir().join(format!("vt-persist-corrupt-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("sample.json"), "not json at all").unwrap();
        assert!(load_json::<Sample>(&dir, "sample.json").is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
