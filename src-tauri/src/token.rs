use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use chrono::Utc;
// use std::env;

// Claims structure for LiveKit JWT
#[derive(Debug, Serialize, Deserialize)]
struct VideoGrant {
    room_join: bool,
    room: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    iss: String,      // API Key
    sub: String,      // identity
    exp: usize,       // expiration timestamp
    nbf: usize,       // not before timestamp
    iat: usize,       // issued at
    identity: String,
    video: VideoGrant,
}

/// Generates a LiveKit JWT token.
/// - `api_key`: your LiveKit API key
/// - `api_secret`: your LiveKit API secret
/// - `identity`: the user identity
/// - `room`: the room name
/// - `valid_for_seconds`: token validity duration (default 24h)
pub fn generate_token(
    api_key: &str,
    api_secret: &str,
    identity: &str,
    room: &str,
    valid_for_seconds: u64,
) -> Result<String, jsonwebtoken::errors::Error> {
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
        },
    };

    let header = Header::default(); // HS256
    let encoding_key = EncodingKey::from_secret(api_secret.as_bytes());
    encode(&header, &claims, &encoding_key)
}