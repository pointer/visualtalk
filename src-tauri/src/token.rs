use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use chrono::Utc;
use std::collections::BTreeMap;

// Claims structure for LiveKit JWT (matches LiveKit specification)
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoGrant {
    room_join: bool,
    room: String,
    can_publish: bool,
    can_subscribe: bool,
    can_publish_data: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    iss: String,
    sub: String,
    exp: usize,
    nbf: usize,
    iat: usize,
    identity: String,
    video: VideoGrant,
}

/// Generates a LiveKit JWT token using pure-Rust HMAC-SHA256.
/// Completely avoids `jsonwebtoken` and `ring` to prevent crypto provider panics.
pub fn generate_token(
    api_key: &str,
    api_secret: &str,
    identity: &str,
    room: &str,
    valid_for_seconds: u64,
) -> Result<String, String> {
    let now = Utc::now().timestamp() as usize;
    let exp = now + valid_for_seconds as usize;

    let claims = Claims {
        iss: api_key.to_string(),
        sub: identity.to_string(),
        exp,
        nbf: now,
        iat: now,
        identity: identity.to_string(),
        video: VideoGrant {
            room_join: true,
            room: room.to_string(),
            can_publish: true,
            can_subscribe: true,
            can_publish_data: true,
        },
    };

    // Build header
    let header = BTreeMap::from([
        ("alg".to_string(), "HS256".to_string()),
        ("typ".to_string(), "JWT".to_string()),
    ]);

    let header_json = serde_json::to_string(&header).map_err(|e| e.to_string())?;
    let claims_json = serde_json::to_string(&claims).map_err(|e| e.to_string())?;

    let header_b64 = URL_SAFE_NO_PAD.encode(header_json.as_bytes());
    let claims_b64 = URL_SAFE_NO_PAD.encode(claims_json.as_bytes());

    let message = format!("{}.{}", header_b64, claims_b64);

    // Sign with HMAC-SHA256
    let mut mac = Hmac::<Sha256>::new_from_slice(api_secret.as_bytes())
        .map_err(|e| format!("HMAC key error: {}", e))?;
    mac.update(message.as_bytes());
    let signature = mac.finalize().into_bytes();
    let sig_b64 = URL_SAFE_NO_PAD.encode(&signature);

    Ok(format!("{}.{}", message, sig_b64))
}