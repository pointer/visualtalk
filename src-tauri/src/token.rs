//! LiveKit access-token generation via the official `livekit-api` crate.
//!
//! This replaces the previous hand-rolled HS256 JWT implementation.
//! `AccessToken` signs a spec-compliant LiveKit JWT: standard claims (`iss`,
//! `sub`, `exp`, `nbf`) plus the `video` grants. Per the current token spec,
//! the participant identity is carried by `sub` (no separate `identity`
//! claim), matching what all official LiveKit SDKs issue — so tokens are
//! accepted by any LiveKit server.
//!
//! The public function signature is intentionally unchanged so callers
//! (`session.rs`, `commands.rs`) are unaffected by this migration.
//!
//! Crypto note: signing goes through `livekit-token` → `jsonwebtoken` v10,
//! which is built on the pure-Rust RustCrypto stack (hmac/sha2) — it does NOT
//! pull in `ring`. No new TLS/crypto provider is introduced; `native-tls` is
//! selected for `livekit-api` to match the existing reqwest TLS backend. See
//! the `livekit-api` comment in Cargo.toml before changing TLS features.

use livekit_api::access_token::{AccessToken, VideoGrants};
use std::time::Duration;

/// Generates a LiveKit participant (room-join) JWT.
///
/// Grants mirror the previous implementation exactly: join the given room,
/// publish, subscribe and publish data.
pub fn generate_token(
    api_key: &str,
    api_secret: &str,
    identity: &str,
    room: &str,
    valid_for_seconds: u64,
) -> Result<String, String> {
    AccessToken::with_api_key(api_key, api_secret)
        .with_identity(identity)
        .with_grants(VideoGrants {
            room_join: true,
            room: room.to_string(),
            can_publish: Some(true),
            can_subscribe: Some(true),
            can_publish_data: Some(true),
            ..Default::default()
        })
        .with_ttl(Duration::from_secs(valid_for_seconds))
        .to_jwt()
        .map_err(|e| format!("Failed to sign LiveKit token: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};

    /// The signed JWT must carry the exact claims LiveKit servers (and the
    /// pre-migration hand-rolled implementation) expect: standard JWT claims
    /// plus camelCase `video` grants.
    #[test]
    fn generates_valid_hs256_jwt_with_expected_claims() {
        let jwt = generate_token(
            "APItestkey",
            "test-secret-long-enough-for-hs256",
            "user-1",
            "room-1",
            300,
        )
        .expect("token generation should succeed");

        let parts: Vec<&str> = jwt.split('.').collect();
        assert_eq!(parts.len(), 3, "JWT must have header.payload.signature");

        let header: serde_json::Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[0]).unwrap()).unwrap();
        assert_eq!(header["alg"], "HS256");
        assert_eq!(header["typ"], "JWT");

        let claims: serde_json::Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[1]).unwrap()).unwrap();
        assert_eq!(claims["iss"], "APItestkey");
        // Per the current LiveKit token spec (protocol auth.proto), the
        // participant identity is carried by the standard `sub` claim — there
        // is no separate top-level `identity` claim (all official SDK v2s
        // issue tokens in this shape and LiveKit servers read identity from
        // `sub`).
        assert_eq!(claims["sub"], "user-1");
        assert_eq!(claims["video"]["roomJoin"], true);
        assert_eq!(claims["video"]["room"], "room-1");
        assert_eq!(claims["video"]["canPublish"], true);
        assert_eq!(claims["video"]["canSubscribe"], true);
        assert_eq!(claims["video"]["canPublishData"], true);

        let nbf = claims["nbf"].as_u64().unwrap();
        let exp = claims["exp"].as_u64().unwrap();
        assert_eq!(exp - nbf, 300, "exp must be nbf + ttl");
        assert!(!parts[2].is_empty(), "signature must be present");
    }
}
