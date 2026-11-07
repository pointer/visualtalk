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
///
/// The write is atomic: the JSON is written to `<file>.tmp` in the same
/// directory and then renamed over the target. A rename within one filesystem
/// is atomic on every platform VisualTalk ships on, so a crash or a full disk
/// mid-write leaves the previous file intact instead of a truncated one.
///
/// That matters because `load_json` cannot tell a torn write from a corrupt
/// file — both fail to parse, and both fall back to `Default`, which for
/// `AppData` means silently losing the profile, settings, notes and block list.
/// Serialising before touching the disk also means a value that cannot be
/// serialised never disturbs the existing file at all.
pub fn save_json<T: Serialize>(dir: &Path, file: &str, value: &T) -> Result<(), String> {
    std::fs::create_dir_all(dir)
        .map_err(|e| format!("Failed to create dir {}: {}", dir.display(), e))?;
    let path = dir.join(file);
    let tmp = dir.join(format!("{}.tmp", file));
    let json = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, json).map_err(|e| format!("Failed to write {}: {}", tmp.display(), e))?;
    std::fs::rename(&tmp, &path)
        .map_err(|e| format!("Failed to replace {}: {}", path.display(), e))?;
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

    #[test]
    fn save_leaves_no_temp_file_behind() {
        let dir = std::env::temp_dir().join(format!("vt-persist-tmp-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let value = Sample {
            name: "meeting".into(),
            count: 1,
        };
        save_json(&dir, "sample.json", &value).expect("save should succeed");

        assert!(dir.join("sample.json").exists());
        assert!(
            !dir.join("sample.json.tmp").exists(),
            "the atomic-write temp file must be renamed away, not left behind"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_replaces_an_existing_file() {
        let dir = std::env::temp_dir().join(format!("vt-persist-replace-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        save_json(
            &dir,
            "sample.json",
            &Sample {
                name: "first".into(),
                count: 1,
            },
        )
        .unwrap();
        save_json(
            &dir,
            "sample.json",
            &Sample {
                name: "second".into(),
                count: 2,
            },
        )
        .unwrap();

        let loaded: Sample = load_json(&dir, "sample.json").expect("should load");
        assert_eq!(loaded.name, "second");
        assert_eq!(loaded.count, 2);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// A directory that cannot be created must leave the existing file intact,
    /// so the caller sees an error and can retry rather than finding its data
    /// replaced by nothing. This is the failure the atomic write protects
    /// against: without the temp-file-plus-rename, a partial `fs::write` could
    /// truncate a file that then fails to parse and silently resets to
    /// `Default` on the next load.
    #[test]
    fn save_failure_does_not_disturb_the_existing_file() {
        let dir = std::env::temp_dir().join(format!("vt-persist-keep-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        save_json(
            &dir,
            "sample.json",
            &Sample {
                name: "original".into(),
                count: 7,
            },
        )
        .unwrap();

        // A path *inside a regular file*: create_dir_all fails before any write.
        let impossible = dir.join("sample.json").join("nested");
        let err = save_json(
            &impossible,
            "sample.json",
            &Sample {
                name: "new".into(),
                count: 8,
            },
        );
        assert!(err.is_err(), "saving under a regular file must fail");

        let loaded: Sample = load_json(&dir, "sample.json").expect("original must survive");
        assert_eq!(loaded.name, "original");
        assert_eq!(loaded.count, 7);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
