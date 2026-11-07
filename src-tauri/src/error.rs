//! Typed errors for commands that talk to the network.
//!
//! Most commands in this crate return `Result<T, String>` and the frontend shows
//! that string verbatim. That is fine for a local failure the user can act on
//! from the message alone, and it is what the E2EE commands rely on: their
//! `E2EE_KEY_CHANGED` / `E2EE_REPLAY` / `E2EE_SENDER_MISMATCH` codes are matched
//! as substrings in `src/components/chat.jsx`. **Do not migrate those.**
//!
//! Outgoing HTTP is different. A raw `reqwest` error string ("error sending
//! request for url ...") tells the user nothing actionable, and the same 401
//! arrives as three different strings depending on the provider. So these
//! commands return [`AppError`], which carries a small closed [`ErrorKind`] the
//! UI maps to a localized headline (`errors.network.<kind>` in the locales),
//! plus the provider's own text for the detail line and the logs.
//!
//! The frontend reads both shapes through `src/lib/errors.js`, whose
//! `errorKind()` / `errorMessage()` accept a string or an `AppError` object, so
//! migrating a command one at a time cannot break the ones not yet converted.

use serde::Serialize;

/// Why a command failed, in terms the UI can act on.
///
/// Serialized camelCase: `ErrorKind::RateLimit` reaches JS as `"rateLimit"`, and
/// the i18n key is `errors.network.rateLimit`. Adding a variant means adding a
/// key to all three locales.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    /// The endpoint did not answer within the client timeout.
    Timeout,
    /// 401 / 403 — key missing, invalid, expired or not permitted.
    Auth,
    /// 429 — the provider is rate limiting or the quota is spent.
    RateLimit,
    /// The host could not be reached: DNS, connection refused, TLS.
    Network,
    /// 5xx — the provider is up but failing.
    ServerError,
    /// A response we could not interpret: unexpected status or unparseable body.
    BadResponse,
    /// The feature is not usable as configured (disabled, empty prompt, …).
    Config,
    /// Our own state or storage failed; nothing to do with the network.
    Internal,
}

/// Error payload returned to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    /// What kind of failure this is. The UI localizes its headline from this.
    pub kind: ErrorKind,
    /// Provider or internal detail. Shown as a secondary line and logged; never
    /// used as the headline, because it is untranslated and provider-specific.
    pub message: String,
}

impl AppError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    /// The feature cannot be used as currently configured.
    pub fn config(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Config, message)
    }

    /// Our own state or storage failed.
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Internal, message)
    }

    /// Classify a transport-level failure.
    pub fn from_reqwest(err: &reqwest::Error) -> Self {
        let kind = if err.is_timeout() {
            ErrorKind::Timeout
        } else if let Some(status) = err.status() {
            Self::kind_for_status(status)
        } else if err.is_connect() || err.is_request() {
            ErrorKind::Network
        } else {
            ErrorKind::BadResponse
        };
        Self::new(kind, err.to_string())
    }

    /// Classify a completed response that was not a success.
    pub fn from_status(status: reqwest::StatusCode, body: &str) -> Self {
        // Providers put the useful sentence in the body; cap it so a stack trace
        // or an HTML error page does not end up in a chat bubble.
        let detail: String = body.chars().take(300).collect();
        Self::new(
            Self::kind_for_status(status),
            format!("{}: {}", status, detail.trim()),
        )
    }

    fn kind_for_status(status: reqwest::StatusCode) -> ErrorKind {
        match status.as_u16() {
            401 | 403 => ErrorKind::Auth,
            429 => ErrorKind::RateLimit,
            500..=599 => ErrorKind::ServerError,
            _ => ErrorKind::BadResponse,
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

#[cfg(test)]
mod tests {
    use super::*;

    /// The JS side switches on these exact strings (`src/lib/errors.js` maps
    /// them to `errors.network.<kind>` i18n keys), so the spelling is a contract.
    #[test]
    fn error_kind_serializes_camel_case() {
        let cases = [
            (ErrorKind::Timeout, "\"timeout\""),
            (ErrorKind::Auth, "\"auth\""),
            (ErrorKind::RateLimit, "\"rateLimit\""),
            (ErrorKind::Network, "\"network\""),
            (ErrorKind::ServerError, "\"serverError\""),
            (ErrorKind::BadResponse, "\"badResponse\""),
            (ErrorKind::Config, "\"config\""),
            (ErrorKind::Internal, "\"internal\""),
        ];
        for (kind, expected) in cases {
            assert_eq!(serde_json::to_string(&kind).unwrap(), expected);
        }
    }

    /// The whole payload shape, because the frontend destructures it.
    #[test]
    fn app_error_wire_shape() {
        let err = AppError::new(ErrorKind::Auth, "invalid api key");
        assert_eq!(
            serde_json::to_string(&err).unwrap(),
            r#"{"kind":"auth","message":"invalid api key"}"#
        );
    }

    #[test]
    fn statuses_map_to_the_expected_kind() {
        use reqwest::StatusCode as S;
        let cases = [
            (S::UNAUTHORIZED, ErrorKind::Auth),
            (S::FORBIDDEN, ErrorKind::Auth),
            (S::TOO_MANY_REQUESTS, ErrorKind::RateLimit),
            (S::INTERNAL_SERVER_ERROR, ErrorKind::ServerError),
            (S::BAD_GATEWAY, ErrorKind::ServerError),
            (S::NOT_FOUND, ErrorKind::BadResponse),
            (S::IM_A_TEAPOT, ErrorKind::BadResponse),
        ];
        for (status, expected) in cases {
            assert_eq!(
                AppError::from_status(status, "detail").kind,
                expected,
                "status {}",
                status
            );
        }
    }

    /// A long provider body must be truncated, not echoed whole into a bubble.
    #[test]
    fn from_status_truncates_the_body() {
        let long = "x".repeat(5000);
        let err = AppError::from_status(reqwest::StatusCode::INTERNAL_SERVER_ERROR, &long);
        assert!(err.message.len() < 400, "got {} chars", err.message.len());
    }
}
