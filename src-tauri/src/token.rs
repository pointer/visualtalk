//! LiveKit access-token generation via the official `livekit-api` crate.
//!
//! This replaces the previous hand-rolled HS256 JWT implementation.
//! `AccessToken` signs a spec-compliant LiveKit JWT: standard claims (`iss`,
//! `sub`, `exp`, `nbf`) plus the `video` grants. Per the current token spec,
//! the participant identity is carried by `sub` (no separate `identity`
//! claim), matching what all official LiveKit SDKs issue — so tokens are
//! accepted by any LiveKit server.
//!
//! The public function signature is intentionally unchanged for session,
//! host-token, and invite-token callers.
//!
//! Crypto note: signing goes through `livekit-token` → `jsonwebtoken` v10,
//! which is built on the pure-Rust RustCrypto stack (hmac/sha2) — it does NOT
//! pull in `ring`. No new TLS/crypto provider is introduced; `native-tls` is
//! selected for `livekit-api` to match the existing reqwest TLS backend. See
//! the `livekit-api` comment in Cargo.toml before changing TLS features.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, KeyInit, Mac};
use livekit_api::access_token::{AccessToken, VideoGrants};
use serde::Serialize;
use sha2::Sha256;
use std::time::Duration;

/// Claims of an invitation *capability* — not a LiveKit token.
///
/// Field order is part of the wire format: the JSON bytes are what gets signed,
/// and `packages/guest-token-issuer/src/server.js` (`verifyInvite`) recomputes
/// the same HMAC. Keep this struct and that verifier in sync.
#[derive(Serialize)]
struct InviteClaims<'a> {
    iss: &'a str,
    purpose: &'static str,
    room: &'a str,
    exp: i64,
}

/// Creates a room-scoped invitation capability for the external guest-token
/// issuer (`packages/guest-token-issuer`).
///
/// Wire format: `base64url(claims) + "." + base64url(HMAC-SHA256(base64url(claims), api_secret))`.
///
/// The API secret never leaves this process. A guest who holds the capability
/// can only obtain a participant token for `room`, only until `exp`, and only
/// from the issuer the organizer configured — and every guest who redeems it
/// gets a *fresh* identity, which is what makes one link safe to share with a
/// group (two participants sharing an identity get the older one disconnected
/// by LiveKit).
pub fn generate_invite_capability(
    api_key: &str,
    api_secret: &str,
    room: &str,
    expires_at: i64,
) -> Result<String, String> {
    let claims = InviteClaims {
        iss: api_key,
        purpose: "visualtalk-invite",
        room,
        exp: expires_at,
    };
    let payload = serde_json::to_vec(&claims).map_err(|e| format!("Failed to encode invite: {e}"))?;
    let encoded_payload = URL_SAFE_NO_PAD.encode(payload);

    let mut mac = Hmac::<Sha256>::new_from_slice(api_secret.as_bytes())
        .map_err(|e| format!("Failed to initialize invite signature: {e}"))?;
    mac.update(encoded_payload.as_bytes());
    let signature = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());

    Ok(format!("{encoded_payload}.{signature}"))
}

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

    /// The capability is a **cross-language contract**: the Node issuer
    /// (`packages/guest-token-issuer/src/server.js`, `verifyInvite`) recomputes
    /// this exact HMAC. The expected value below was produced with
    /// `node:crypto` from the same inputs — if this assertion fails, the two
    /// implementations have drifted and guests will be told their invitation is
    /// invalid.
    #[test]
    fn invite_capability_matches_the_node_issuer_wire_format() {
        let capability =
            generate_invite_capability("test-key", "test-secret", "room-1", 2_000_000_000)
                .expect("capability generation should succeed");
        assert_eq!(
            capability,
            // Rust's `\`-at-end-of-line continuation strips the newline *and*
            // the following indentation, so this is one unbroken literal.
            "eyJpc3MiOiJ0ZXN0LWtleSIsInB1cnBvc2UiOiJ2aXN1YWx0YWxrLWludml0ZSIsInJvb20iOiJyb29\
             tLTEiLCJleHAiOjIwMDAwMDAwMDB9.hL9HsZn9k8k9B5j2TXV3YyECx7bkUf43GCQ593EIrQo"
        );
    }

    /// The capability carries no secret and is bound to its room, expiry and
    /// API key, so a guest cannot retarget it at another meeting.
    #[test]
    fn invite_capability_is_bound_to_room_expiry_and_key() {
        let base = generate_invite_capability("test-key", "test-secret", "room-1", 100).unwrap();
        assert_ne!(
            base,
            generate_invite_capability("test-key", "test-secret", "room-2", 100).unwrap()
        );
        assert_ne!(
            base,
            generate_invite_capability("test-key", "test-secret", "room-1", 101).unwrap()
        );
        assert_ne!(
            base,
            generate_invite_capability("other-key", "test-secret", "room-1", 100).unwrap()
        );
        assert!(!base.contains("test-secret"));

        let payload = base.split('.').next().expect("payload segment");
        let claims: serde_json::Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(payload).unwrap()).unwrap();
        assert_eq!(claims["iss"], "test-key");
        assert_eq!(claims["purpose"], "visualtalk-invite");
        assert_eq!(claims["room"], "room-1");
        assert_eq!(claims["exp"], 100);
    }
}
