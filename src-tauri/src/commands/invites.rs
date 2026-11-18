use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use super::invitees::{normalize_recipient_values, InviteDeliveryMethod};
use crate::commands::{LiveKitSettings, SETTINGS_KEY, STORE_FILE};
use crate::token;
use url::Url;

const GUEST_TOKEN_TTL_SECONDS: u64 = 24 * 60 * 60;
const MAX_SCHEDULED_INVITE_TTL_SECONDS: u64 = 30 * 24 * 60 * 60;

#[derive(Debug, Deserialize)]
pub struct CreateMeetingInviteRequest {
    pub room: String,
    pub title: String,
    #[serde(default)]
    pub attendees: Vec<String>,
    #[serde(default)]
    pub delivery_method: InviteDeliveryMethod,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub duration_minutes: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AttendeeInvite {
    pub recipient: Option<String>,
    pub delivery_method: InviteDeliveryMethod,
    pub identity: String,
    pub invite_link: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MeetingInvite {
    pub room: String,
    pub title: String,
    #[serde(default)]
    pub invite_link: String,
    #[serde(default)]
    pub attendee_invites: Vec<AttendeeInvite>,
    /// True when an external guest-token issuer produced these links: the same
    /// capability link is safe to share with every guest, because the issuer
    /// mints a fresh identity per redemption (ADR 0006).
    #[serde(default)]
    pub shared_link: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParsedInvite {
    pub url: String,
    pub room: String,
    /// Direct (per-guest) invite: the signed LiveKit token in the link.
    #[serde(default)]
    pub token: Option<String>,
    /// Direct invite only: the identity that token was signed for.
    #[serde(default)]
    pub identity: Option<String>,
    /// Issuer-backed invite: where to redeem the capability at join time.
    #[serde(default)]
    pub issuer_url: Option<String>,
    /// Issuer-backed invite: the signed capability itself.
    #[serde(default)]
    pub invite_capability: Option<String>,
}

/// A participant token the external issuer minted for one guest.
#[derive(Debug, Serialize, Deserialize)]
pub struct IssuedParticipantToken {
    pub token: String,
    pub identity: String,
}

#[tauri::command]
pub async fn create_meeting_invite(
    app: AppHandle,
    meeting: CreateMeetingInviteRequest,
) -> Result<MeetingInvite, String> {
    let settings = load_livekit_settings(&app)?;
    let room = if meeting.room.trim().is_empty() {
        format!("room-{}", rand::random::<u16>() % 10_000)
    } else {
        meeting.room.trim().to_string()
    };
    let token_ttl = scheduled_invite_ttl(
        meeting.start_time.as_deref(),
        meeting.duration_minutes.unwrap_or(30),
    )?;
    let issuer_url = settings.token_issuer_url.trim().to_string();
    let shared_link = !issuer_url.is_empty();
    let attendee_invites = if shared_link {
        // Issuer mode (ADR 0006): one capability link that every guest can use,
        // because the issuer mints a fresh identity for each redemption.
        generate_shared_invites(
            &settings,
            &issuer_url,
            &room,
            meeting.attendees,
            meeting.delivery_method,
            token_ttl,
        )?
    } else {
        generate_attendee_invites(
            &settings,
            &room,
            meeting.attendees,
            meeting.delivery_method,
            token_ttl,
        )?
    };
    // A shared capability link is meaningful for any number of guests; a direct
    // token link is only offered at the top level when there is exactly one.
    let invite_link = if shared_link || attendee_invites.len() == 1 {
        attendee_invites
            .first()
            .map(|invite| invite.invite_link.clone())
            .unwrap_or_default()
    } else {
        String::new()
    };

    Ok(MeetingInvite {
        room,
        title: meeting.title,
        invite_link,
        attendee_invites,
        shared_link,
    })
}

#[tauri::command]
pub async fn get_meeting_invite(app: AppHandle, room: String) -> Result<String, String> {
    let settings = load_livekit_settings(&app)?;
    let issuer_url = settings.token_issuer_url.trim().to_string();
    let invite = if issuer_url.is_empty() {
        generate_attendee_invites(
            &settings,
            &room,
            Vec::new(),
            InviteDeliveryMethod::Email,
            GUEST_TOKEN_TTL_SECONDS,
        )?
    } else {
        generate_shared_invites(
            &settings,
            &issuer_url,
            &room,
            Vec::new(),
            InviteDeliveryMethod::Email,
            GUEST_TOKEN_TTL_SECONDS,
        )?
    }
    .into_iter()
    .next()
    .ok_or("Could not create a guest invitation.")?;

    let guidance = if issuer_url.is_empty() {
        "This link is for one guest only and expires in 24 hours; use a separate link for each guest."
    } else {
        "Each guest who opens this link gets their own pass, so it is safe to share. It expires in 24 hours."
    };

    Ok(format!(
        "Join my VisualTalk meeting!\nRoom: {}\n{}\nLink: {}",
        room, guidance, invite.invite_link
    ))
}

#[tauri::command]
pub fn parse_invite_link(invite_link: String) -> Result<ParsedInvite, String> {
    if !invite_link.starts_with("visualtalk://join?") {
        return Err("Invalid invite link format. Must start with visualtalk://join?".to_string());
    }

    let query_str = invite_link
        .split_once('?')
        .map(|(_, query)| query)
        .ok_or("Missing query parameters")?;
    let params: std::collections::HashMap<String, String> =
        url::form_urlencoded::parse(query_str.as_bytes())
            .into_owned()
            .collect();

    let url = params
        .get("url")
        .ok_or("Missing LiveKit URL in invite")?
        .clone();
    let room = params
        .get("room")
        .ok_or("Missing Room ID in invite")?
        .clone();

    // Two supported shapes — ADR 0004 and ADR 0006:
    //   token=…               a direct, per-guest signed LiveKit token
    //   issuer=…&invite=…     a capability redeemed for a token at join time
    let issuer_url = params.get("issuer").filter(|v| !v.is_empty()).cloned();
    let invite_capability = params.get("invite").filter(|v| !v.is_empty()).cloned();
    let direct_token = params.get("token").filter(|v| !v.is_empty()).cloned();

    if let (Some(issuer_url), Some(invite_capability)) = (issuer_url, invite_capability) {
        validate_token_issuer_url(&issuer_url).map_err(|_| {
            "This invitation points at an unusable guest token issuer. Ask the organizer for a new invite."
                .to_string()
        })?;
        return Ok(ParsedInvite {
            url,
            room,
            token: None,
            identity: None,
            issuer_url: Some(issuer_url),
            invite_capability: Some(invite_capability),
        });
    }

    let token = direct_token.ok_or("Invite is missing its participant token or issuer details.")?;
    let identity = identity_from_token(&token)?;

    Ok(ParsedInvite {
        url,
        room,
        token: Some(token),
        identity: Some(identity),
        issuer_url: None,
        invite_capability: None,
    })
}

fn identity_from_token(token: &str) -> Result<String, String> {
    let mut parts = token.split('.');
    let header = parts.next().unwrap_or_default();
    let payload = parts.next().unwrap_or_default();
    let signature = parts.next().unwrap_or_default();
    if header.is_empty() || payload.is_empty() || signature.is_empty() || parts.next().is_some() {
        return Err("Invite contains a malformed participant token.".to_string());
    }

    let payload = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| "Invite contains a malformed participant token.".to_string())?;
    let claims: serde_json::Value = serde_json::from_slice(&payload)
        .map_err(|_| "Invite contains a malformed participant token.".to_string())?;
    claims
        .get("sub")
        .and_then(serde_json::Value::as_str)
        .filter(|identity| !identity.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "Invite token is missing its participant identity.".to_string())
}

fn load_livekit_settings(app: &AppHandle) -> Result<LiveKitSettings, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = store
        .get(SETTINGS_KEY)
        .ok_or("LiveKit settings not found. Please configure API keys in Settings first.")?;
    serde_json::from_value(value).map_err(|e| e.to_string())
}

fn generate_attendee_invites(
    settings: &LiveKitSettings,
    room: &str,
    attendees: Vec<String>,
    delivery_method: InviteDeliveryMethod,
    token_ttl: u64,
) -> Result<Vec<AttendeeInvite>, String> {
    let attendees = normalize_recipient_values(&attendees, delivery_method)?;
    let invitees = if attendees.is_empty() {
        vec![None]
    } else {
        attendees.into_iter().map(Some).collect()
    };
    let mut identities = HashSet::with_capacity(invitees.len());
    let mut invites = Vec::with_capacity(invitees.len());

    for recipient in invitees {
        let identity = loop {
            let candidate = format!("guest-{:032x}", rand::random::<u128>());
            if identities.insert(candidate.clone()) {
                break candidate;
            }
        };
        let token = token::generate_token(
            &settings.api_key,
            &settings.api_secret,
            &identity,
            room,
            token_ttl,
        )?;
        let mut query = url::form_urlencoded::Serializer::new(String::new());
        query
            .append_pair("room", room)
            .append_pair("url", &settings.url)
            .append_pair("token", &token);

        invites.push(AttendeeInvite {
            recipient,
            delivery_method,
            identity,
            invite_link: format!("visualtalk://join?{}", query.finish()),
        });
    }

    Ok(invites)
}

/// Issuer-backed invitations (ADR 0006).
///
/// One signed capability link that every recipient can use: the issuer mints a
/// *fresh* identity per redemption, so unlike a direct token link this one is
/// safe to share with a group. The organizer's API secret never leaves this
/// process — the capability is an HMAC over `{iss, purpose, room, exp}` that only
/// a holder of that secret can produce or verify.
fn generate_shared_invites(
    settings: &LiveKitSettings,
    issuer_url: &str,
    room: &str,
    attendees: Vec<String>,
    delivery_method: InviteDeliveryMethod,
    token_ttl: u64,
) -> Result<Vec<AttendeeInvite>, String> {
    validate_token_issuer_url(issuer_url)?;
    let attendees = normalize_recipient_values(&attendees, delivery_method)?;
    let recipients = if attendees.is_empty() {
        vec![None]
    } else {
        attendees.into_iter().map(Some).collect()
    };

    let expires_at = Utc::now().timestamp() + token_ttl as i64;
    let capability = token::generate_invite_capability(
        &settings.api_key,
        &settings.api_secret,
        room,
        expires_at,
    )?;
    let mut query = url::form_urlencoded::Serializer::new(String::new());
    query
        .append_pair("room", room)
        .append_pair("url", &settings.url)
        .append_pair("issuer", issuer_url.trim())
        .append_pair("invite", &capability);
    let invite_link = format!("visualtalk://join?{}", query.finish());

    Ok(recipients
        .into_iter()
        .enumerate()
        .map(|(index, recipient)| AttendeeInvite {
            // There is no fixed identity in this mode — the issuer assigns one
            // per join. This value only keys the Schedule dialog's per-row
            // copy/send state, so it must be unique and non-empty.
            identity: recipient
                .clone()
                .unwrap_or_else(|| format!("guest-{}", index + 1)),
            recipient,
            delivery_method,
            invite_link: invite_link.clone(),
        })
        .collect())
}

/// Validates an external guest-token issuer endpoint.
///
/// HTTPS is required; plain HTTP is accepted only for loopback, `localhost` and
/// RFC 1918 addresses, which covers the local Docker stack and LAN testing
/// without letting a capability cross the internet unencrypted. The path must be
/// the issuer's token endpoint and carry no query or fragment, so a crafted link
/// cannot redirect a guest's capability somewhere else.
pub fn validate_token_issuer_url(endpoint: &str) -> Result<(), String> {
    let trimmed = endpoint.trim();
    if trimmed.is_empty() {
        return Err(
            "Configure the guest token issuer in Settings → LiveKit before creating shared invites."
                .to_string(),
        );
    }
    let parsed = Url::parse(trimmed).map_err(|e| format!("Invalid guest token issuer URL: {e}"))?;
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(
            "The guest token issuer URL must not contain a query or a fragment.".to_string(),
        );
    }
    if !parsed.path().ends_with("/v1/token") {
        return Err("The guest token issuer URL must end with /v1/token.".to_string());
    }
    match parsed.scheme() {
        "https" => Ok(()),
        "http" if is_local_issuer_host(&parsed) => Ok(()),
        "http" => Err(
            "The guest token issuer must use HTTPS unless it runs on this machine or your local network."
                .to_string(),
        ),
        other => Err(format!("Unsupported guest token issuer scheme: {other}")),
    }
}

/// True for loopback, `localhost`, and private-range hosts.
fn is_local_issuer_host(parsed: &Url) -> bool {
    match parsed.host() {
        Some(url::Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(v4)) => {
            let [first, second, ..] = v4.octets();
            v4.is_loopback()
                || first == 10
                || (first == 172 && (16..=31).contains(&second))
                || (first == 192 && second == 168)
        }
        Some(url::Host::Ipv6(v6)) => v6.is_loopback(),
        None => false,
    }
}

/// Redeems an invitation capability at the organizer's issuer and returns a
/// short-lived LiveKit participant token with a fresh identity.
///
/// Called from the guest's app at join time (`JoinMeeting.jsx`). The guest never
/// sees the API secret; the issuer enforces the capability's room and expiry,
/// plus its own per-invite participant cap and rate limit.
#[tauri::command]
pub async fn exchange_invite_for_token(
    issuer_url: String,
    invite_capability: String,
    display_name: String,
) -> Result<IssuedParticipantToken, String> {
    validate_token_issuer_url(&issuer_url)?;

    let display_name = display_name.trim();
    if display_name.is_empty()
        || display_name.chars().count() > 80
        || display_name.chars().any(char::is_control)
    {
        return Err("Enter a display name between 1 and 80 characters.".to_string());
    }
    let invite_capability = invite_capability.trim();
    if invite_capability.is_empty() || invite_capability.len() > 8_192 {
        return Err("This invitation is missing its capability.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Could not create the guest token issuer client: {e}"))?;
    let response = client
        .post(issuer_url.trim())
        .json(&serde_json::json!({
            "invite": invite_capability,
            "display_name": display_name,
        }))
        .send()
        .await
        .map_err(|e| format!("Could not contact the guest token issuer: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        // Surface the issuer's own explanation (participant limit, bad or
        // expired capability) but bounded, so a hostile endpoint cannot flood
        // the UI or the logs.
        let detail = response.text().await.unwrap_or_default();
        let detail: String = detail.chars().take(300).collect();
        return Err(format!(
            "The guest token issuer rejected this invitation (HTTP {status}): {detail}"
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Could not read the guest token issuer response: {e}"))?;
    if bytes.len() > 64 * 1024 {
        return Err("The guest token issuer response was too large.".to_string());
    }
    let issued: IssuedParticipantToken = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Invalid response from the guest token issuer: {e}"))?;
    if issued.token.trim().is_empty() || issued.identity.trim().is_empty() {
        return Err("The guest token issuer returned an incomplete participant token.".to_string());
    }
    Ok(issued)
}

fn scheduled_invite_ttl(start_time: Option<&str>, duration_minutes: u32) -> Result<u64, String> {
    let Some(start_time) = start_time else {
        return Ok(GUEST_TOKEN_TTL_SECONDS);
    };
    let start_time = DateTime::parse_from_rfc3339(start_time)
        .map_err(|error| format!("Invalid scheduled meeting start time: {error}"))?
        .with_timezone(&Utc);
    let expiry = start_time + Duration::minutes(duration_minutes.into()) + Duration::hours(2);
    let now = Utc::now();
    let ttl = (expiry - now)
        .num_seconds()
        .max(GUEST_TOKEN_TTL_SECONDS as i64) as u64;
    if ttl > MAX_SCHEDULED_INVITE_TTL_SECONDS {
        return Err(
            "The meeting end and its two-hour invite grace period must be within the next 30 days."
                .to_string(),
        );
    }
    Ok(ttl)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_settings() -> LiveKitSettings {
        LiveKitSettings {
            url: "wss://example.livekit.cloud".to_string(),
            api_key: "test-key".to_string(),
            api_secret: "test-secret-long-enough-for-hs256".to_string(),
            identity: "organizer".to_string(),
            token_issuer_url: String::new(),
        }
    }

    #[test]
    fn each_attendee_gets_a_distinct_direct_livekit_invite() {
        let invites = generate_attendee_invites(
            &test_settings(),
            "room-1",
            vec![
                "alice@example.com".to_string(),
                "bob@example.com".to_string(),
            ],
            InviteDeliveryMethod::Email,
            GUEST_TOKEN_TTL_SECONDS,
        )
        .unwrap();

        assert_eq!(invites.len(), 2);
        assert_ne!(invites[0].identity, invites[1].identity);
        assert_ne!(invites[0].invite_link, invites[1].invite_link);
        for invite in invites {
            let link = format!("{}&identity=spoofed", invite.invite_link);
            let parsed = parse_invite_link(link).unwrap();
            assert_eq!(parsed.room, "room-1");
            // The identity comes from the signed token, never from the link's
            // query string — appending `identity=spoofed` must not change it.
            assert_eq!(parsed.identity.as_deref(), Some(invite.identity.as_str()));
            assert!(parsed.token.is_some_and(|token| !token.is_empty()));
            assert!(parsed.issuer_url.is_none() && parsed.invite_capability.is_none());
            assert!(!invite
                .invite_link
                .contains("test-secret-long-enough-for-hs256"));
        }
    }

    #[test]
    fn no_attendees_creates_one_single_guest_invite() {
        let invites = generate_attendee_invites(
            &test_settings(),
            "room-1",
            Vec::new(),
            InviteDeliveryMethod::Email,
            GUEST_TOKEN_TTL_SECONDS,
        )
        .unwrap();

        assert_eq!(invites.len(), 1);
        assert_eq!(invites[0].recipient, None);
        assert!(parse_invite_link(invites[0].invite_link.clone()).is_ok());
    }

    #[test]
    fn scheduled_invites_remain_valid_after_the_meeting_starts() {
        let start = (Utc::now() + Duration::days(2)).to_rfc3339();
        let ttl = scheduled_invite_ttl(Some(&start), 60).unwrap();
        assert!(ttl > 48 * 60 * 60);
        assert!(ttl < 52 * 60 * 60);
        assert!(scheduled_invite_ttl(Some("not-a-date"), 30).is_err());
    }

    /// Issuer mode (ADR 0006): one capability link for the whole group, because
    /// the issuer hands each joiner a distinct identity. This is what makes a
    /// shared link safe — with direct tokens, everyone sharing one link also
    /// shares an identity and LiveKit disconnects all but the last of them.
    #[test]
    fn issuer_backed_invites_share_one_capability_link() {
        let settings = LiveKitSettings {
            token_issuer_url: "http://127.0.0.1:7883/v1/token".to_string(),
            ..test_settings()
        };
        let invites = generate_shared_invites(
            &settings,
            &settings.token_issuer_url,
            "room-1",
            vec![
                "alice@example.com".to_string(),
                "bob@example.com".to_string(),
            ],
            InviteDeliveryMethod::Email,
            GUEST_TOKEN_TTL_SECONDS,
        )
        .unwrap();

        assert_eq!(invites.len(), 2);
        assert_eq!(invites[0].invite_link, invites[1].invite_link);
        // Row keys must stay unique: the Schedule dialog keys its per-row
        // copy/send state on this value.
        assert_ne!(invites[0].identity, invites[1].identity);
        assert!(!invites[0].invite_link.contains(&settings.api_secret));

        let parsed = parse_invite_link(invites[0].invite_link.clone()).unwrap();
        assert_eq!(parsed.room, "room-1");
        assert_eq!(
            parsed.issuer_url.as_deref(),
            Some("http://127.0.0.1:7883/v1/token")
        );
        assert!(parsed.token.is_none() && parsed.identity.is_none());
        let capability = parsed.invite_capability.expect("a capability");
        assert_eq!(capability.matches('.').count(), 1, "payload.signature");
    }

    #[test]
    fn issuer_url_requires_https_except_for_local_hosts() {
        assert!(validate_token_issuer_url("https://issuer.example/v1/token").is_ok());
        assert!(validate_token_issuer_url("http://127.0.0.1:7883/v1/token").is_ok());
        assert!(validate_token_issuer_url("http://localhost:7883/v1/token").is_ok());
        assert!(validate_token_issuer_url("http://192.168.1.20:7883/v1/token").is_ok());
        assert!(validate_token_issuer_url("http://10.0.0.5:7883/v1/token").is_ok());
        // Plain HTTP over the internet would expose both the capability and the
        // minted token to anyone on the path.
        assert!(validate_token_issuer_url("http://issuer.example/v1/token").is_err());
        assert!(validate_token_issuer_url("https://issuer.example/v1/token?next=x").is_err());
        assert!(validate_token_issuer_url("https://issuer.example/v1/other").is_err());
        assert!(validate_token_issuer_url("").is_err());
    }

    #[test]
    fn malformed_issuer_links_are_rejected() {
        // An issuer the app would refuse to talk to.
        let unusable = "visualtalk://join?room=room-1&url=wss%3A%2F%2Fexample.com&issuer=http%3A%2F%2Fissuer.example%2Fv1%2Ftoken&invite=capability";
        assert!(parse_invite_link(unusable.to_string())
            .unwrap_err()
            .contains("unusable guest token issuer"));

        // Neither shape complete: no token, and an issuer with no capability.
        assert!(
            parse_invite_link("visualtalk://join?room=r&url=wss%3A%2F%2Fx".to_string()).is_err()
        );
        assert!(parse_invite_link(
            "visualtalk://join?room=r&url=wss%3A%2F%2Fx&issuer=https%3A%2F%2Fi.example%2Fv1%2Ftoken"
                .to_string()
        )
        .is_err());
    }
}
