#[cfg(feature = "pro")]
use crate::ai::AiSettings;
use crate::persistence;
use serde::{Deserialize, Serialize};
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

/// Builds a fresh, collision-resistant LiveKit identity: `User-` + 12 hex.
///
/// 48 bits from the CSPRNG (~2.8e14 values). This used to be
/// `timestamp_millis() % 9000` — **9,000 possible identities derived from the
/// install clock** — so two installs landing in the same 9-second-modulo window
/// received the *same* identity. LiveKit disconnects the older of two
/// participants sharing an identity (`DisconnectReason::DUPLICATE_IDENTITY`),
/// which reaches the user as "everyone except the last guest keeps getting
/// kicked". Identities are persistent, so a collision lasts until the profile
/// is re-rolled — hence the migration in [`AppData::load_or_default`].
pub(crate) fn generated_identity() -> String {
    format!("User-{:012x}", rand::random::<u64>() & 0xffff_ffff_ffff)
}

/// True for identities the old clock-derived generators produced: `User-`
/// followed by 1-4 digits (`% 9000` in the profile default, `% 10000` in the
/// session fallback). A 12-hex identity, or anything the user typed, is not.
fn is_legacy_generated_identity(identity: &str) -> bool {
    match identity.strip_prefix("User-") {
        Some(suffix) => {
            !suffix.is_empty()
                && suffix.len() <= 4
                && suffix.chars().all(|character| character.is_ascii_digit())
        }
        None => false,
    }
}

impl Default for UserProfile {
    fn default() -> Self {
        let identity = generated_identity();
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SmtpSecurity {
    StartTls,
    Tls,
}

impl Default for SmtpSecurity {
    fn default() -> Self {
        Self::StartTls
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagingConfig {
    #[serde(default)]
    pub smtp_host: String,
    #[serde(default = "default_smtp_port")]
    pub smtp_port: u16,
    #[serde(default)]
    pub smtp_security: SmtpSecurity,
    #[serde(default)]
    pub smtp_username: String,
    #[serde(default)]
    pub smtp_from_email: String,
    #[serde(default)]
    pub smtp_from_name: String,
    #[serde(default)]
    pub twilio_account_sid: String,
    #[serde(default)]
    pub twilio_from_phone: String,
}

fn default_smtp_port() -> u16 {
    587
}

impl Default for MessagingConfig {
    fn default() -> Self {
        Self {
            smtp_host: String::new(),
            smtp_port: default_smtp_port(),
            smtp_security: SmtpSecurity::default(),
            smtp_username: String::new(),
            smtp_from_email: String::new(),
            smtp_from_name: "VisualTalk".to_string(),
            twilio_account_sid: String::new(),
            twilio_from_phone: String::new(),
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
    #[serde(default)]
    pub messaging: MessagingConfig,
    pub notes: String,
    /// AI assistant config — Pro only (ADR 0008). `#[serde(default)]` keeps old
    /// settings.json files loadable in both editions.
    #[serde(default)]
    #[cfg(feature = "pro")]
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
        if let Some(mut data) = persistence::load_json::<AppData>(config_dir, "settings.json") {
            // Re-roll identities the old clock-derived generator produced: they
            // collide across installs, and LiveKit disconnects the older of two
            // participants that share an identity. Only an *untouched* default
            // is replaced (identity == display_name), so a name the user chose
            // in Settings is never renamed behind their back.
            let stale_identity = data.profile.identity == "User1"
                || data.profile.identity.is_empty()
                || (is_legacy_generated_identity(&data.profile.identity)
                    && data.profile.display_name == data.profile.identity);
            if stale_identity {
                let previous_identity = data.profile.identity.clone();
                data.profile.identity = generated_identity();
                if data.profile.display_name == "You"
                    || data.profile.display_name == "User1"
                    || data.profile.display_name == previous_identity
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
        let default_data = AppData::default();
        let _ = default_data.save(config_dir);
        default_data
    }

    pub fn save(&self, config_dir: &PathBuf) -> Result<(), String> {
        persistence::save_json(config_dir, "settings.json", self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Identities must be unique across installs: the previous
    /// `User-{timestamp_millis() % 9000}` gave 9,000 possible values, and two
    /// participants sharing one identity makes LiveKit disconnect the older
    /// connection (`DUPLICATE_IDENTITY`).
    #[test]
    fn generated_identities_are_unique_and_well_formed() {
        let identities: std::collections::HashSet<String> =
            (0..2_000).map(|_| generated_identity()).collect();
        assert_eq!(identities.len(), 2_000, "identity generation must not repeat");
        for identity in &identities {
            let suffix = identity.strip_prefix("User-").expect("User- prefix");
            assert_eq!(suffix.len(), 12);
            assert!(suffix.chars().all(|c| c.is_ascii_hexdigit()));
        }
    }

    /// The migration must catch the old clock-derived identities without
    /// renaming anything a user typed themselves.
    #[test]
    fn legacy_generated_identities_are_recognised_and_chosen_ones_are_not() {
        assert!(is_legacy_generated_identity("User-1234"));
        assert!(is_legacy_generated_identity("User-1"));
        assert!(is_legacy_generated_identity("User-9999"));
        assert!(!is_legacy_generated_identity("User-12345"));
        assert!(!is_legacy_generated_identity("User-3f9a1c7b2e40"));
        assert!(!is_legacy_generated_identity("User-"));
        assert!(!is_legacy_generated_identity("kate"));
        assert!(!is_legacy_generated_identity(""));
    }

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
        assert_eq!(data.messaging.smtp_port, 587);
    }

    #[test]
    fn legacy_app_data_defaults_new_messaging_settings() {
        let value = serde_json::json!({
            "profile": UserProfile::default(),
            "settings": UserSettings::default(),
            "notes": ""
        });
        let data: AppData = serde_json::from_value(value).unwrap();
        assert_eq!(data.messaging.smtp_port, 587);
        assert_eq!(data.messaging.smtp_security, SmtpSecurity::StartTls);
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
        std::fs::create_dir_all(&dir).unwrap();

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

        let _ = std::fs::remove_dir_all(&dir);
    }
}
