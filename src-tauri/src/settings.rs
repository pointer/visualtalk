use crate::ai::AiSettings;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Publisher support contact, surfaced in Settings → About.
///
/// This is the *developer's* address — the party that builds and ships
/// VisualTalk — and mirrors the contact published in `PRIVACY.md` §15 so the
/// app, the privacy policy and the App Store Connect support URL all advertise
/// one consistent channel.
///
/// It is deliberately **not** the destination for in-meeting abuse reports.
/// VisualTalk is bring-your-own-server and the licensor never sees meeting
/// content, so it cannot moderate it; reports about what happened *in a
/// meeting* go to that meeting's organizer instead. See
/// [`UserProfile::effective_report_email`].
pub const SUPPORT_EMAIL: &str = "kghemari@yahoo.com";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserProfile {
    pub identity: String,
    pub display_name: String,
    pub email: String,
    pub pmi: String,
    /// Optional override for where in-meeting abuse reports are sent.
    ///
    /// Empty (the default) means "route reports to the organizer", i.e. fall
    /// back to [`UserProfile::email`]. Keeping it empty by default means the
    /// report address tracks the user's email automatically instead of going
    /// stale when they change it.
    ///
    /// `#[serde(default)]` keeps pre-existing `settings.json` files loadable.
    #[serde(default)]
    pub report_email: String,
}

impl UserProfile {
    /// The address in-meeting "Report" actions send to: the meeting organizer.
    ///
    /// The organizer is the person who created the meeting, and therefore the
    /// party who chose the LiveKit server and owns the moderation
    /// responsibility for what happens on it (see `PRIVACY.md` §3d). That is
    /// this user's own email unless they explicitly redirected reports
    /// elsewhere — e.g. to a `moderation@` alias for a team deployment.
    ///
    /// Returns an empty string only when neither field is set, which callers
    /// must handle rather than composing a mailto with no recipient.
    pub fn effective_report_email(&self) -> String {
        let custom = self.report_email.trim();
        if !custom.is_empty() {
            return custom.to_string();
        }
        self.email.trim().to_string()
    }
}

impl Default for UserProfile {
    fn default() -> Self {
        let rand_suffix = (chrono::Utc::now().timestamp_millis() % 9000) + 1000;
        let identity = format!("User-{}", rand_suffix);
        let pmi_prefix = (chrono::Utc::now().timestamp_millis() % 900) + 100;
        let pmi_mid = (chrono::Utc::now().timestamp_subsec_millis() % 900) + 100;
        let pmi_end = (chrono::Utc::now().timestamp_subsec_micros() % 9000) + 1000;
        let pmi = format!("{} {} {}", pmi_prefix, pmi_mid, pmi_end);

        Self {
            identity: identity.clone(),
            display_name: identity,
            email: "user@visualtalk.local".to_string(),
            pmi,
            // Empty = "route reports to the organizer" (see effective_report_email).
            report_email: String::new(),
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
    /// Where local recordings are written.
    ///
    /// `None` means the built-in default (`<app_config_dir>/recordings`). On
    /// desktop that lives under `~/Library/Application Support/...` (macOS) or
    /// `%APPDATA%`, which users cannot find by browsing — hence the Settings
    /// control to relocate it and to reveal the current folder.
    #[serde(default)]
    pub recordings_dir: Option<String>,
    /// Use the build-time demo LiveKit project instead of the user's own
    /// credentials. Only ever functional in a build compiled with
    /// `VISUALTALK_DEMO_*`; see `demo.rs`. Off by default and never consulted
    /// when those variables are absent.
    #[serde(default)]
    pub demo_mode: bool,
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
            recordings_dir: None,
            demo_mode: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppData {
    pub profile: UserProfile,
    pub settings: UserSettings,
    pub notes: String,
    /// AI assistant config — `#[serde(default)]` keeps old settings.json files loadable.
    #[serde(default)]
    pub ai: AiSettings,
    /// Participants the user has blocked.
    ///
    /// Blocking is local and per-device: their chat messages and files are
    /// filtered out of this user's view and they are hidden in the video grid.
    /// It cannot remove them from the room, because only the meeting organizer
    /// has that authority on the LiveKit server. Keyed by LiveKit identity.
    #[serde(default)]
    pub blocked_identities: Vec<String>,
}

impl AppData {
    pub fn load_or_default(config_dir: &PathBuf) -> Self {
        let file_path = config_dir.join("settings.json");
        if file_path.exists() {
            if let Ok(content) = fs::read_to_string(&file_path) {
                if let Ok(mut data) = serde_json::from_str::<AppData>(&content) {
                    // If the stored identity was generic "User1", generate a unique one
                    if data.profile.identity == "User1" || data.profile.identity.is_empty() {
                        let rand_suffix = (chrono::Utc::now().timestamp_millis() % 9000) + 1000;
                        data.profile.identity = format!("User-{}", rand_suffix);
                        if data.profile.display_name == "You"
                            || data.profile.display_name == "User1"
                        {
                            data.profile.display_name = data.profile.identity.clone();
                        }
                        let _ = data.save(config_dir);
                    }
                    // An empty `report_email` is meaningful ("route reports to
                    // the organizer"), so nothing is backfilled here — see
                    // `UserProfile::effective_report_email`.
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

#[cfg(test)]
mod tests {
    use super::*;

    /// A `settings.json` written before `report_email` existed must still load,
    /// and reports must route to the organizer (the user's own email) rather
    /// than to some hardcoded third party.
    #[test]
    fn legacy_settings_route_reports_to_the_organizer() {
        let legacy = r#"{
            "identity": "User-1234",
            "display_name": "User-1234",
            "email": "organizer@example.com",
            "pmi": "123 456 7890"
        }"#;
        let profile: UserProfile = serde_json::from_str(legacy).unwrap();
        assert_eq!(profile.report_email, "");
        assert_eq!(profile.effective_report_email(), "organizer@example.com");
    }

    /// An explicit override (e.g. a team `moderation@` alias) must win over the
    /// organizer fallback, and survive a save/load round-trip.
    #[test]
    fn report_email_override_wins_and_round_trips() {
        let mut profile = UserProfile::default();
        profile.email = "organizer@example.com".to_string();
        profile.report_email = "moderation@example.com".to_string();
        assert_eq!(profile.effective_report_email(), "moderation@example.com");

        let json = serde_json::to_string(&profile).unwrap();
        let back: UserProfile = serde_json::from_str(&json).unwrap();
        assert_eq!(back.effective_report_email(), "moderation@example.com");
    }

    /// Whitespace-only input must fall through to the organizer instead of
    /// producing a mailto with a blank recipient.
    #[test]
    fn blank_report_email_falls_back_to_organizer() {
        let mut profile = UserProfile::default();
        profile.email = "organizer@example.com".to_string();
        profile.report_email = "   ".to_string();
        assert_eq!(profile.effective_report_email(), "organizer@example.com");
    }

    /// The About-box support address is the publisher's, and must be a real
    /// mailbox — an empty one silently breaks the App Store support contact.
    #[test]
    fn support_email_is_a_usable_mailbox() {
        assert!(!SUPPORT_EMAIL.trim().is_empty());
        assert!(SUPPORT_EMAIL.contains('@'));
    }

    /// Blocking, the recordings folder and demo mode must all be inert by
    /// default: a fresh install blocks nobody, records to the built-in folder,
    /// and never reaches for demo credentials.
    #[test]
    fn new_settings_are_inert_by_default() {
        let data = AppData::default();
        assert!(data.blocked_identities.is_empty());
        assert_eq!(data.settings.recordings_dir, None);
        assert!(!data.settings.demo_mode);
    }

    #[test]
    fn blocked_identities_round_trip() {
        let mut data = AppData::default();
        data.blocked_identities.push("abuser-1".to_string());
        let json = serde_json::to_string(&data).unwrap();
        let back: AppData = serde_json::from_str(&json).unwrap();
        assert_eq!(back.blocked_identities, vec!["abuser-1".to_string()]);
    }

    /// Empty `report_email` is the normal "use organizer" state, so loading
    /// must preserve it rather than rewrite it to something else.
    #[test]
    fn load_preserves_an_empty_report_email() {
        let dir = std::env::temp_dir().join(format!(
            "vt-settings-test-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_millis()
        ));
        fs::create_dir_all(&dir).unwrap();

        let mut data = AppData::default();
        data.profile.email = "organizer@example.com".to_string();
        data.profile.report_email = String::new();
        data.save(&dir).unwrap();

        let loaded = AppData::load_or_default(&dir);
        assert_eq!(loaded.profile.report_email, "");
        assert_eq!(
            loaded.profile.effective_report_email(),
            "organizer@example.com"
        );

        let _ = fs::remove_dir_all(&dir);
    }
}
