//! LiveKit session assembly.
//!
//! Session logic is split into an abstraction (`CredentialSource`, `TokenSigner`,
//! and the `SessionService` that depends on them) and the concrete, Tauri-backed
//! implementations. The high-level `SessionService` has no knowledge of the app
//! runtime — it only knows "give me credentials" and "sign a token" — so it is
//! unit-testable in isolation (DIP). The free function `create_session` wires
//! the real sources so the existing `#[tauri::command]` layer is unchanged.

use crate::commands::{LiveKitSettings, SETTINGS_KEY, STORE_FILE};
use crate::demo::DemoCredentials;
use crate::settings::AppData;
use crate::token;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingSession {
    pub livekit_url: String,
    pub token: String,
    pub room_name: String,
    pub identity: String,
    pub display_name: String,
    pub start_with_video: bool,
    pub mute_on_join: bool,
}

/// Shown when no LiveKit server has been configured.
///
/// VisualTalk is bring-your-own-server: it ships **no** default server and **no**
/// embedded credentials, and never routes meetings through infrastructure
/// operated by the licensor.
const NO_SERVER_CONFIGURED: &str = "No LiveKit server configured. Open Settings → LiveKit and \
enter your own server URL, API key and API secret. VisualTalk provides no built-in server: \
your audio, video and chat travel only to the server you choose.";

/// A resolved, ready-to-use LiveKit credential set.
#[derive(Debug, Clone)]
pub struct LiveKitCredentials {
    pub url: String,
    pub api_key: String,
    pub api_secret: String,
}

/// Abstraction over where a LiveKit credential set comes from.
///
/// Session assembly depends only on this trait (DIP); concrete sources — the
/// user's own server, the review-build demo project — are supplied at the
/// composition root and can be swapped or extended without touching session
/// logic (open for extension).
pub trait CredentialSource {
    /// Resolve credentials, or an `Err` explaining that none are available.
    fn credentials(&self) -> Result<LiveKitCredentials, String>;
}

/// The user's own LiveKit server, persisted in the Tauri store.
///
/// Single source of truth: the user's own server, saved from
/// Settings → LiveKit (Tauri store, `STORE_FILE`). Environment variables are
/// deliberately **not** consulted — a second credential path only creates a
/// way for secrets to leak into dev machines, CI logs and shipped bundles.
///
/// Fails closed when the store is not fully populated. This is a deliberate
/// security property: a signing secret compiled into a shipped binary is
/// recoverable by anyone with `strings`, so no secret may ever be embedded here.
struct UserCredentialSource {
    app: AppHandle,
}

impl UserCredentialSource {
    fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl CredentialSource for UserCredentialSource {
    fn credentials(&self) -> Result<LiveKitCredentials, String> {
        let store = self.app.store(STORE_FILE).map_err(|e| e.to_string())?;
        let value = match store.get(SETTINGS_KEY) {
            Some(value) => value,
            None => return Err(NO_SERVER_CONFIGURED.to_string()),
        };
        let settings: LiveKitSettings = serde_json::from_value(value).map_err(|e| e.to_string())?;

        if settings.url.trim().is_empty()
            || settings.api_key.trim().is_empty()
            || settings.api_secret.trim().is_empty()
        {
            return Err(NO_SERVER_CONFIGURED.to_string());
        }

        Ok(LiveKitCredentials {
            url: settings.url.trim().to_string(),
            api_key: settings.api_key.trim().to_string(),
            api_secret: settings.api_secret.trim().to_string(),
        })
    }
}

/// The review-build demo project, present only when this build carries
/// credentials (empty in every production build).
struct DemoCredentialSource {
    credentials: Option<DemoCredentials>,
}

impl DemoCredentialSource {
    fn new() -> Self {
        Self {
            credentials: crate::demo::credentials(),
        }
    }
}

impl CredentialSource for DemoCredentialSource {
    fn credentials(&self) -> Result<LiveKitCredentials, String> {
        match &self.credentials {
            Some(c) => Ok(LiveKitCredentials {
                url: c.url.clone(),
                api_key: c.api_key.clone(),
                api_secret: c.api_secret.clone(),
            }),
            None => Err(NO_SERVER_CONFIGURED.to_string()),
        }
    }
}

/// Abstraction over LiveKit access-token signing.
///
/// Lets session logic be tested without invoking real JWT crypto (DIP); the
/// default implementation delegates to [`token::generate_token`].
pub trait TokenSigner {
    fn generate_token(
        &self,
        api_key: &str,
        api_secret: &str,
        identity: &str,
        room: &str,
        valid_for_seconds: u64,
    ) -> Result<String, String>;
}

/// Default signer backed by the `livekit-api` crate.
pub struct LiveKitTokenSigner;

impl TokenSigner for LiveKitTokenSigner {
    fn generate_token(
        &self,
        api_key: &str,
        api_secret: &str,
        identity: &str,
        room: &str,
        valid_for_seconds: u64,
    ) -> Result<String, String> {
        token::generate_token(api_key, api_secret, identity, room, valid_for_seconds)
    }
}

/// Assembly of a fully-credentialed `MeetingSession` from a room request.
///
/// Depends only on the `CredentialSource` and `TokenSigner` abstractions, so it
/// works without any Tauri runtime. Real implementations are wired in via
/// [`SessionService::livekit`] at the composition root.
pub struct SessionService {
    user_source: Box<dyn CredentialSource>,
    demo_source: Option<Box<dyn CredentialSource>>,
    signer: Box<dyn TokenSigner>,
}

impl SessionService {
    /// Construct a service from injected dependencies (used by tests).
    pub fn new(
        user_source: Box<dyn CredentialSource>,
        demo_source: Option<Box<dyn CredentialSource>>,
        signer: Box<dyn TokenSigner>,
    ) -> Self {
        Self {
            user_source,
            demo_source,
            signer,
        }
    }

    /// Wire the production sources: the user's stored server plus the
    /// (possibly absent) review-build demo project.
    pub fn livekit(app: AppHandle) -> Self {
        Self::new(
            Box::new(UserCredentialSource::new(app)),
            Some(Box::new(DemoCredentialSource::new())),
            Box::new(LiveKitTokenSigner),
        )
    }

    /// Assemble a `MeetingSession` for `room_name`, applying credential
    /// precedence and identity/settings from `app_data`.
    pub fn create(&self, room_name: String, app_data: &AppData) -> Result<MeetingSession, String> {
        // Bring-your-own-server: there is deliberately no licensor-operated fallback
        // in a normal build. The only exception is a review build compiled with
        // `VISUALTALK_DEMO_*` — see `demo.rs` for the security trade-off, which
        // is that those credentials are public for as long as that build exists
        // and must be rotated after App Review.
        let creds = self.resolve_credentials(app_data)?;

        // Persistent profile identity; a random one is generated on first run.
        let identity = if !app_data.profile.identity.is_empty() {
            app_data.profile.identity.clone()
        } else {
            format!("User-{}", chrono::Utc::now().timestamp_millis() % 10000)
        };

        let display_name = if !app_data.profile.display_name.is_empty() {
            app_data.profile.display_name.clone()
        } else {
            identity.clone()
        };

        // Trim room name
        let clean_room = room_name.trim().to_string();

        // Valid for 24 hours (86400s)
        let token = self.signer.generate_token(
            &creds.api_key,
            &creds.api_secret,
            &identity,
            &clean_room,
            86400,
        )?;

        Ok(MeetingSession {
            livekit_url: creds.url,
            token,
            room_name: clean_room,
            identity,
            display_name,
            start_with_video: app_data.settings.start_with_video,
            mute_on_join: app_data.settings.mute_on_join,
        })
    }

    /// Resolve LiveKit credentials in strict precedence order.
    ///
    /// 1. **Demo mode, if switched on and the build carries credentials.** Lets a
    ///    review build be exercised deliberately.
    /// 2. **The user's own server** (Settings → LiveKit). Checked before any
    ///    fallback so a configured deployment is never silently routed elsewhere.
    /// 3. **The demo project, only when nothing of the user's own is configured.**
    ///    Without this an App Review reviewer who never finds the toggle would
    ///    hit "no server configured" and reject the app as broken.
    ///
    /// Steps 1 and 3 are no-ops in every build not compiled with
    /// `VISUALTALK_DEMO_*`, where the chain degrades to the user's server or a
    /// hard failure.
    fn resolve_credentials(&self, app_data: &AppData) -> Result<LiveKitCredentials, String> {
        if app_data.settings.demo_mode {
            if let Some(demo) = &self.demo_source {
                if let Ok(creds) = demo.credentials() {
                    return Ok(creds);
                }
            }
        }

        if let Ok(own) = self.user_source.credentials() {
            return Ok(own);
        }

        if let Some(demo) = &self.demo_source {
            if let Ok(creds) = demo.credentials() {
                return Ok(creds);
            }
        }

        Err(NO_SERVER_CONFIGURED.to_string())
    }
}

/// Thin composition shim kept for the command layer and frontend contract:
/// wires the production sources and delegates to [`SessionService::create`].
pub fn create_session(
    room_name: String,
    app_data: &AppData,
    app: &AppHandle,
) -> Result<MeetingSession, String> {
    SessionService::livekit(app.clone()).create(room_name, app_data)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Deterministic credential source for tests.
    struct StubSource {
        creds: Option<LiveKitCredentials>,
    }
    impl CredentialSource for StubSource {
        fn credentials(&self) -> Result<LiveKitCredentials, String> {
            match &self.creds {
                Some(c) => Ok(c.clone()),
                None => Err(NO_SERVER_CONFIGURED.to_string()),
            }
        }
    }
    fn own_server() -> LiveKitCredentials {
        LiveKitCredentials {
            url: "wss://own.example".into(),
            api_key: "own-key".into(),
            api_secret: "own-secret".into(),
        }
    }
    fn demo() -> LiveKitCredentials {
        LiveKitCredentials {
            url: "wss://demo.example".into(),
            api_key: "demo-key".into(),
            api_secret: "demo-secret".into(),
        }
    }

    /// A signer that records its inputs and returns a fixed token. The recorded
    /// value lives behind an `Arc` so a test can keep a handle to it even after
    /// the signer itself is moved into the service.
    #[derive(Clone, Default)]
    struct RecordingSigner {
        recorded: std::rc::Rc<std::cell::RefCell<Option<String>>>,
    }
    impl RecordingSigner {
        fn recorded_value(&self) -> Option<String> {
            self.recorded.borrow().clone()
        }
    }
    impl TokenSigner for RecordingSigner {
        fn generate_token(
            &self,
            _api_key: &str,
            _api_secret: &str,
            _identity: &str,
            room: &str,
            valid_for_seconds: u64,
        ) -> Result<String, String> {
            *self.recorded.borrow_mut() = Some(format!("{}|{}", room, valid_for_seconds));
            Ok("signed-token".to_string())
        }
    }

    fn service(
        user: StubSource,
        demo: Option<StubSource>,
        signer: RecordingSigner,
    ) -> SessionService {
        SessionService::new(
            Box::new(user),
            demo.map(|d| Box::new(d) as Box<dyn CredentialSource>),
            Box::new(signer),
        )
    }

    fn app_data_with(mut data: crate::settings::AppData, demo_mode: bool) -> crate::settings::AppData {
        data.settings.demo_mode = demo_mode;
        data
    }

    #[test]
    fn builds_session_from_user_server() {
        let svc = service(
            StubSource {
                creds: Some(own_server()),
            },
            Some(StubSource {
                creds: Some(demo()),
            }),
            RecordingSigner::default(),
        );
        let session = svc
            .create(" My Room ".into(), &crate::settings::AppData::default())
            .expect("user server configured");
        // Room is trimmed.
        assert_eq!(session.room_name, "My Room");
        assert_eq!(session.livekit_url, "wss://own.example");
        assert_eq!(session.token, "signed-token");
    }

    #[test]
    fn demo_mode_wins_over_user_server() {
        let svc = service(
            StubSource {
                creds: Some(own_server()),
            },
            Some(StubSource {
                creds: Some(demo()),
            }),
            RecordingSigner::default(),
        );
        // Demo mode off → user server wins.
        let normal = svc
            .create(
                "room".into(),
                &app_data_with(crate::settings::AppData::default(), false),
            )
            .unwrap();
        assert_eq!(normal.livekit_url, "wss://own.example");

        // Demo mode on but no demo configured → falls back to user server.
        let no_demo = {
            let s = service(
                StubSource {
                    creds: Some(own_server()),
                },
                None,
                RecordingSigner::default(),
            );
            s.create(
                "room".into(),
                &app_data_with(crate::settings::AppData::default(), true),
            )
            .unwrap()
        };
        assert_eq!(no_demo.livekit_url, "wss://own.example");

        // Demo mode on with demo configured → demo wins.
        let dem = service(
            StubSource {
                creds: Some(own_server()),
            },
            Some(StubSource {
                creds: Some(demo()),
            }),
            RecordingSigner::default(),
        )
        .create(
            "room".into(),
            &app_data_with(crate::settings::AppData::default(), true),
        )
        .unwrap();
        assert_eq!(dem.livekit_url, "wss://demo.example");
    }

    #[test]
    fn fails_closed_when_no_source_available() {
        let svc = service(
            StubSource { creds: None },
            None,
            RecordingSigner::default(),
        );
        let err = svc
            .create("room".into(), &crate::settings::AppData::default())
            .unwrap_err();
        assert_eq!(err, NO_SERVER_CONFIGURED);
    }

    #[test]
    fn signs_with_trimmed_room_and_24h_ttl() {
        let signer = RecordingSigner::default();
        let probe = signer.clone();
        let svc = service(
            StubSource {
                creds: Some(own_server()),
            },
            None,
            signer,
        );
        svc.create("  room-x  ".into(), &crate::settings::AppData::default())
            .unwrap();
        assert_eq!(probe.recorded_value(), Some("room-x|86400".to_string()));
    }
}
