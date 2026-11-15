use std::sync::OnceLock;
use std::time::Duration;

use keyring::v1::{Entry, Error as KeyringError};
use lettre::message::{Mailbox, Message};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Tokio1Executor};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::State;

use super::invitees::{is_valid_email, normalize_recipient_values, InviteDeliveryMethod};
use super::invites::AttendeeInvite;
use crate::settings::{MessagingConfig, SmtpSecurity};
use crate::state::AppState;

const KEYRING_SERVICE: &str = "com.katebg.visualtalk.messaging";
const SMTP_PASSWORD_KEY: &str = "smtp-password";
const TWILIO_AUTH_TOKEN_KEY: &str = "twilio-auth-token";
const TWILIO_API_BASE: &str = "https://api.twilio.com/2010-04-01/Accounts";
const MAX_MESSAGE_LENGTH: usize = 1_500;

#[derive(Debug, Serialize)]
pub struct MessagingSettingsResponse {
    pub settings: MessagingConfig,
    pub smtp_password_configured: bool,
    pub twilio_auth_token_configured: bool,
}

#[derive(Debug, Deserialize)]
pub struct SendInviteRequest {
    pub invite: AttendeeInvite,
    pub meeting_title: String,
    pub meeting_room: String,
    pub meeting_date: String,
    pub meeting_time: String,
    pub share_link_label: String,
}

#[tauri::command]
pub fn get_messaging_settings(
    state: State<'_, AppState>,
) -> Result<MessagingSettingsResponse, String> {
    let settings = state.read_data(|data| data.messaging.clone())?;
    Ok(MessagingSettingsResponse {
        settings,
        smtp_password_configured: get_secret(SMTP_PASSWORD_KEY)?.is_some(),
        twilio_auth_token_configured: get_secret(TWILIO_AUTH_TOKEN_KEY)?.is_some(),
    })
}

#[tauri::command]
pub fn update_messaging_settings(
    settings: MessagingConfig,
    smtp_password: Option<String>,
    clear_smtp_password: bool,
    twilio_auth_token: Option<String>,
    clear_twilio_auth_token: bool,
    state: State<'_, AppState>,
) -> Result<MessagingSettingsResponse, String> {
    let settings = validate_messaging_config(settings)?;

    update_secret(SMTP_PASSWORD_KEY, smtp_password, clear_smtp_password)?;
    update_secret(
        TWILIO_AUTH_TOKEN_KEY,
        twilio_auth_token,
        clear_twilio_auth_token,
    )?;

    let response = MessagingSettingsResponse {
        settings,
        smtp_password_configured: get_secret(SMTP_PASSWORD_KEY)?.is_some(),
        twilio_auth_token_configured: get_secret(TWILIO_AUTH_TOKEN_KEY)?.is_some(),
    };
    state.update_data(|data| data.messaging = response.settings.clone())?;
    Ok(response)
}

#[tauri::command]
pub async fn send_meeting_invite(
    request: SendInviteRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let settings = validate_messaging_config(state.read_data(|data| data.messaging.clone())?)?;
    let recipient = request
        .invite
        .recipient
        .as_deref()
        .map(str::trim)
        .filter(|recipient| !recipient.is_empty())
        .ok_or("Add a recipient before sending this invitation.")?;
    let link = request.invite.invite_link.trim();
    if !link.starts_with("visualtalk://join?") || link.len() > 8_192 {
        return Err("The invitation link is invalid.".to_string());
    }
    let subject = request.meeting_title.trim();
    if subject.is_empty()
        || subject.len() > 200
        || subject.chars().any(char::is_control)
        || request.meeting_room.len() > 128
        || request.meeting_date.len() > 64
        || request.meeting_time.len() > 64
    {
        return Err("The invitation title or meeting details are invalid.".to_string());
    }

    let body = format!(
        "{}\n\n{} {}\n\nRoom: {}\nDate: {} at {}\n",
        request.meeting_title.trim(),
        request.share_link_label.trim(),
        link,
        request.meeting_room.trim(),
        request.meeting_date.trim(),
        request.meeting_time.trim()
    );
    if body.chars().count() > MAX_MESSAGE_LENGTH {
        return Err(format!(
            "The invitation message exceeds the {MAX_MESSAGE_LENGTH}-character sending limit."
        ));
    }

    match request.invite.delivery_method {
        InviteDeliveryMethod::Email => send_email(&settings, recipient, subject, &body).await,
        InviteDeliveryMethod::Sms => send_sms(&settings, recipient, &body).await,
    }
}

fn validate_messaging_config(mut settings: MessagingConfig) -> Result<MessagingConfig, String> {
    if settings.smtp_port == 0 {
        return Err("SMTP port must be between 1 and 65535.".to_string());
    }
    if settings.smtp_host.len() > 253
        || settings.smtp_host.chars().any(char::is_whitespace)
        || settings.smtp_host.contains("://")
    {
        return Err("Enter an SMTP host name without a URL scheme.".to_string());
    }
    settings.smtp_host = settings.smtp_host.trim().to_string();
    if settings
        .smtp_host
        .chars()
        .any(|character| character.is_control())
    {
        return Err("SMTP host contains invalid characters.".to_string());
    }
    settings.smtp_username = settings.smtp_username.trim().to_string();
    settings.smtp_from_email = settings.smtp_from_email.trim().to_string();
    settings.smtp_from_name = settings.smtp_from_name.trim().to_string();
    if settings.smtp_from_name.chars().any(char::is_control) {
        return Err("Sender name contains invalid characters.".to_string());
    }
    if !settings.smtp_from_email.is_empty() && !is_valid_email(&settings.smtp_from_email) {
        return Err("Enter a valid sender email address.".to_string());
    }

    settings.twilio_account_sid = settings.twilio_account_sid.trim().to_string();
    if !settings.twilio_account_sid.is_empty()
        && (!settings.twilio_account_sid.starts_with("AC")
            || settings.twilio_account_sid.len() != 34
            || !settings.twilio_account_sid[2..]
                .chars()
                .all(|character| character.is_ascii_hexdigit()))
    {
        return Err("Enter a valid Twilio Account SID.".to_string());
    }
    settings.twilio_from_phone = settings.twilio_from_phone.trim().to_string();
    if !settings.twilio_from_phone.is_empty() {
        let normalized = normalize_recipient_values(
            std::slice::from_ref(&settings.twilio_from_phone),
            InviteDeliveryMethod::Sms,
        )?
        .into_iter()
        .next()
        .ok_or("Enter a valid Twilio sender phone number.")?;
        if !normalized.starts_with('+') {
            return Err(
                "Twilio sender numbers must include the country code, beginning with +."
                    .to_string(),
            );
        }
        settings.twilio_from_phone = normalized;
    }
    Ok(settings)
}

async fn send_email(
    settings: &MessagingConfig,
    recipient: &str,
    subject: &str,
    body: &str,
) -> Result<(), String> {
    if settings.smtp_host.is_empty()
        || settings.smtp_username.is_empty()
        || settings.smtp_from_email.is_empty()
    {
        return Err(
            "Configure the SMTP server, username, and sender address in Settings.".to_string(),
        );
    }
    let password = get_secret(SMTP_PASSWORD_KEY)?
        .filter(|password| !password.is_empty())
        .ok_or("Save the SMTP password in Settings before sending email.")?;
    if !is_valid_email(recipient) {
        return Err("The invitation recipient is not a valid email address.".to_string());
    }

    let from_address = settings
        .smtp_from_email
        .parse()
        .map_err(|error| format!("Invalid SMTP sender address: {error}"))?;
    let from = if settings.smtp_from_name.is_empty() {
        Mailbox::new(None, from_address)
    } else {
        Mailbox::new(Some(settings.smtp_from_name.clone()), from_address)
    };
    let to = recipient
        .parse::<Mailbox>()
        .map_err(|error| format!("Invalid invitation recipient: {error}"))?;
    let email = Message::builder()
        .from(from)
        .to(to)
        .subject(subject.trim())
        .body(body.to_string())
        .map_err(|error| format!("Could not build the invitation email: {error}"))?;
    let credentials = Credentials::new(settings.smtp_username.clone(), password);
    let builder = match settings.smtp_security {
        SmtpSecurity::StartTls => {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&settings.smtp_host)
        }
        SmtpSecurity::Tls => AsyncSmtpTransport::<Tokio1Executor>::relay(&settings.smtp_host),
    }
    .map_err(|error| format!("Invalid SMTP server settings: {error}"))?;
    let mailer = builder
        .port(settings.smtp_port)
        .credentials(credentials)
        .timeout(Some(Duration::from_secs(30)))
        .build();
    mailer
        .send(email)
        .await
        .map_err(|error| format!("SMTP delivery failed: {error}"))?;
    Ok(())
}

async fn send_sms(settings: &MessagingConfig, recipient: &str, body: &str) -> Result<(), String> {
    let account_sid = settings.twilio_account_sid.trim();
    let from = settings.twilio_from_phone.trim();
    let auth_token = get_secret(TWILIO_AUTH_TOKEN_KEY)?
        .filter(|token| !token.is_empty())
        .ok_or("Save the Twilio authentication token in Settings before sending SMS.")?;
    if account_sid.is_empty() || from.is_empty() {
        return Err("Configure the Twilio Account SID and sender phone in Settings.".to_string());
    }
    let recipient =
        normalize_recipient_values(&[recipient.to_string()], InviteDeliveryMethod::Sms)?
            .into_iter()
            .next()
            .ok_or("Enter a valid SMS recipient.")?;
    if !recipient.starts_with('+') {
        return Err(
            "Twilio requires recipient phone numbers with a country code, beginning with +."
                .to_string(),
        );
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Could not initialize SMS delivery: {error}"))?;
    let response = client
        .post(format!("{TWILIO_API_BASE}/{account_sid}/Messages.json"))
        .basic_auth(account_sid, Some(auth_token))
        .form(&[("From", from), ("To", recipient.as_str()), ("Body", body)])
        .send()
        .await
        .map_err(|error| format!("SMS delivery failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let provider_message = response.text().await.map_err(|error| {
            format!("SMS provider returned {status}; could not read its response: {error}")
        })?;
        return Err(format!(
            "SMS provider rejected the message ({status}): {provider_message}"
        ));
    }
    Ok(())
}

fn update_secret(key: &str, value: Option<String>, clear: bool) -> Result<(), String> {
    if clear {
        return delete_secret(key);
    }
    if let Some(value) = value.filter(|value| !value.is_empty()) {
        if value.len() > 2_048 || value.chars().any(char::is_control) {
            return Err("Credential values must be under 2048 characters and contain no control characters.".to_string());
        }
        set_secret(key, &value)?;
    }
    Ok(())
}

fn get_secret(key: &str) -> Result<Option<String>, String> {
    initialize_credential_store()?;
    let entry = Entry::new(KEYRING_SERVICE, key).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "Could not read the credential from the OS secure store: {error}"
        )),
    }
}

fn set_secret(key: &str, secret: &str) -> Result<(), String> {
    initialize_credential_store()?;
    let entry = Entry::new(KEYRING_SERVICE, key).map_err(|error| error.to_string())?;
    entry
        .set_password(secret)
        .map_err(|error| format!("Could not save the credential to the OS secure store: {error}"))
}

fn delete_secret(key: &str) -> Result<(), String> {
    initialize_credential_store()?;
    let entry = Entry::new(KEYRING_SERVICE, key).map_err(|error| error.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Could not remove the credential from the OS secure store: {error}"
        )),
    }
}

fn initialize_credential_store() -> Result<(), String> {
    static RESULT: OnceLock<Result<(), String>> = OnceLock::new();
    RESULT
        .get_or_init(|| {
            let result = if cfg!(target_os = "android") {
                keyring::cli::use_named_store("android")
            } else if cfg!(target_os = "ios") {
                keyring::cli::use_named_store("protected")
            } else if cfg!(target_os = "macos") {
                keyring::cli::use_named_store("keychain")
            } else if cfg!(target_os = "windows") {
                keyring::cli::use_named_store("windows")
            } else if cfg!(target_os = "linux") {
                keyring::cli::use_named_store("secret-service")
            } else {
                return Err(
                    "Secure credential storage is not supported on this platform.".to_string(),
                );
            };
            result.map_err(|error| format!("Could not initialize the OS secure store: {error}"))
        })
        .clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn messaging_settings_reject_invalid_addresses_and_unsafe_hosts() {
        let mut settings = MessagingConfig::default();
        settings.smtp_host = "smtp.example.com".to_string();
        settings.smtp_from_email = "bad address".to_string();
        assert!(validate_messaging_config(settings).is_err());

        let mut settings = MessagingConfig::default();
        settings.smtp_host = "https://smtp.example.com".to_string();
        assert!(validate_messaging_config(settings).is_err());
    }

    #[test]
    fn twilio_sender_number_requires_e164_country_code() {
        let mut settings = MessagingConfig::default();
        settings.twilio_from_phone = "4155550100".to_string();
        assert!(validate_messaging_config(settings).is_err());

        let mut settings = MessagingConfig::default();
        settings.twilio_from_phone = "+1 (415) 555-0100".to_string();
        assert_eq!(
            validate_messaging_config(settings)
                .unwrap()
                .twilio_from_phone,
            "+14155550100"
        );
    }

    #[test]
    fn messaging_settings_default_wire_shape_omits_secrets() {
        let json = serde_json::to_value(MessagingConfig::default()).unwrap();
        assert_eq!(json["smtp_port"], 587);
        assert!(json.get("smtp_password").is_none());
        assert!(json.get("twilio_auth_token").is_none());
    }
}
