//! Optional build-time demo credentials, for App Store review builds only.
//!
//! VisualTalk is bring-your-own-server, and `session.rs` documents a hard
//! invariant: *no signing secret may ever be embedded in the binary*. This
//! module is the single explicit exception to that rule, and it is empty in
//! every build that does not deliberately opt in.
//!
//! `option_env!` is expanded by the compiler, so:
//!
//! * A normal build contains no credentials whatsoever — the strings are
//!   absent from the binary, not merely unreferenced.
//! * The repository never holds a secret, so nothing leaks through git history.
//! * Only a build produced via `scripts/make-review-build.sh` can reach a demo
//!   project.
//!
//! # Security
//!
//! Anything compiled into a shipped IPA is recoverable by anyone who runs
//! `strings` over it. Credentials supplied here are therefore **public** for as
//! long as that build exists, and must be:
//!
//! 1. a dedicated LiveKit project with a spend cap, not a production one;
//! 2. rotated immediately after App Review approves the build.
//!
//! The review build is the only one that carries them, which bounds the
//! exposure to the review window.

const DEMO_URL: Option<&str> = option_env!("VISUALTALK_DEMO_LIVEKIT_URL");
const DEMO_API_KEY: Option<&str> = option_env!("VISUALTALK_DEMO_API_KEY");
const DEMO_API_SECRET: Option<&str> = option_env!("VISUALTALK_DEMO_API_SECRET");

pub struct DemoCredentials {
    pub url: String,
    pub api_key: String,
    pub api_secret: String,
}

/// The demo project baked into this build, if any.
///
/// `None` unless all three variables were set at compile time. Partial
/// configuration is treated as absent rather than as a half-working server, so
/// a typo cannot leave review builds failing with a confusing LiveKit error.
pub fn credentials() -> Option<DemoCredentials> {
    let url = DEMO_URL?.trim();
    let api_key = DEMO_API_KEY?.trim();
    let api_secret = DEMO_API_SECRET?.trim();
    if url.is_empty() || api_key.is_empty() || api_secret.is_empty() {
        return None;
    }
    Some(DemoCredentials {
        url: url.to_string(),
        api_key: api_key.to_string(),
        api_secret: api_secret.to_string(),
    })
}

/// Whether this build can offer demo mode at all.
///
/// Drives the Settings toggle's visibility: showing "Demo mode" in a build with
/// no credentials would let users turn on something that silently does nothing.
pub fn is_available() -> bool {
    credentials().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A normal build (no `VISUALTALK_DEMO_*` at compile time) must expose no
    /// credentials and must not advertise demo mode. This is the invariant that
    /// keeps production builds free of any embedded secret.
    #[test]
    fn builds_without_demo_env_expose_nothing() {
        if DEMO_URL.is_none() || DEMO_API_KEY.is_none() || DEMO_API_SECRET.is_none() {
            assert!(!is_available(), "demo mode must be unavailable");
            assert!(credentials().is_none());
        }
    }

    /// Whatever the build, `is_available` and `credentials` must agree — the
    /// Settings toggle is driven by the former and the session by the latter.
    #[test]
    fn availability_matches_credentials() {
        assert_eq!(is_available(), credentials().is_some());
    }

    /// When the build supplies all three variables, `credentials()` must return
    /// them. This guards the compile-time plumbing a review build depends on:
    /// run with `VISUALTALK_DEMO_*` set, a failure means `option_env!` or
    /// build.rs's `rerun-if-env-changed` is broken and the IPA would ship with
    /// no demo access — something only the App Review reviewer would discover.
    #[test]
    fn compiled_credentials_are_returned() {
        let all_set = matches!(DEMO_URL, Some(u) if !u.trim().is_empty())
            && matches!(DEMO_API_KEY, Some(k) if !k.trim().is_empty())
            && matches!(DEMO_API_SECRET, Some(s) if !s.trim().is_empty());
        assert_eq!(all_set, credentials().is_some());
        if let Some(c) = credentials() {
            assert_eq!(c.api_key, DEMO_API_KEY.unwrap().trim());
            assert_eq!(c.url, DEMO_URL.unwrap().trim());
        }
    }
}
