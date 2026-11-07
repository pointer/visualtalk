//! Host system introspection.
//!
//! Extracted from lib.rs so command registration is not the only thing
//! that lives there; the domain logic stays in the sibling module it wraps.

/// Detect the OS system locale.
///
/// Reads LANG / LC_ALL / LANGUAGE environment variables (set by macOS and Linux)
/// and returns the language tag (e.g. "en_US.UTF-8" → "en").
/// Returns an empty string if no locale can be detected — the frontend falls
/// back to `navigator.language` and then to "en".
#[tauri::command]
pub fn get_system_locale() -> String {
    for var in &["LC_ALL", "LANG", "LANGUAGE"] {
        if let Ok(val) = std::env::var(var) {
            if !val.is_empty() && val != "C" && val != "POSIX" {
                return val;
            }
        }
    }
    String::new()
}
