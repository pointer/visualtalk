use std::collections::HashSet;

use serde::{Deserialize, Serialize};

const MAX_INVITEES: usize = 50;

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InviteDeliveryMethod {
    #[default]
    Email,
    Sms,
}

#[derive(Debug, Default, Deserialize)]
pub struct PickedContact {
    #[serde(default)]
    pub email: Vec<String>,
    #[serde(default)]
    pub tel: Vec<String>,
}

#[tauri::command]
pub fn normalize_invitees(
    raw_recipients: String,
    contacts: Vec<PickedContact>,
    delivery_method: InviteDeliveryMethod,
) -> Result<Vec<String>, String> {
    normalize_recipients(&raw_recipients, &contacts, delivery_method)
}

pub fn normalize_recipients(
    raw_recipients: &str,
    contacts: &[PickedContact],
    delivery_method: InviteDeliveryMethod,
) -> Result<Vec<String>, String> {
    let mut values: Vec<&str> = raw_recipients
        .split(|character| match delivery_method {
            InviteDeliveryMethod::Email => matches!(character, ',' | ';' | '\n' | '\r'),
            InviteDeliveryMethod::Sms => matches!(character, ',' | ';' | '\n' | '\r'),
        })
        .collect();

    for contact in contacts {
        match delivery_method {
            InviteDeliveryMethod::Email => values.extend(contact.email.iter().map(String::as_str)),
            InviteDeliveryMethod::Sms => values.extend(contact.tel.iter().map(String::as_str)),
        }
    }

    normalize_values(values, delivery_method)
}

pub fn normalize_recipient_values(
    recipients: &[String],
    delivery_method: InviteDeliveryMethod,
) -> Result<Vec<String>, String> {
    normalize_values(recipients.iter().map(String::as_str), delivery_method)
}

fn normalize_values<'a>(
    values: impl IntoIterator<Item = &'a str>,
    delivery_method: InviteDeliveryMethod,
) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();
    let mut seen = HashSet::new();

    for value in values {
        let value = value.trim();
        if value.is_empty() {
            continue;
        }

        let recipient = match delivery_method {
            InviteDeliveryMethod::Email => {
                if !is_valid_email(value) {
                    return Err(format!("Invalid guest email address: {value}"));
                }
                value.to_string()
            }
            InviteDeliveryMethod::Sms => normalize_phone_number(value)?,
        };
        let key = recipient.to_ascii_lowercase();
        if seen.insert(key) {
            normalized.push(recipient);
            if normalized.len() > MAX_INVITEES {
                return Err(format!(
                    "A meeting can have no more than {MAX_INVITEES} individual guest invites."
                ));
            }
        }
    }

    Ok(normalized)
}

pub fn is_valid_email(email: &str) -> bool {
    if email.len() > 254 || email.chars().any(char::is_whitespace) {
        return false;
    }
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    if local.is_empty()
        || local.len() > 64
        || domain.is_empty()
        || domain.contains('@')
        || local.starts_with('.')
        || local.ends_with('.')
        || local.contains("..")
        || domain.starts_with('.')
        || domain.ends_with('.')
        || domain.contains("..")
    {
        return false;
    }

    local.chars().all(|character| {
        character.is_ascii_alphanumeric()
            || matches!(
                character,
                '.' | '!'
                    | '#'
                    | '$'
                    | '%'
                    | '&'
                    | '\''
                    | '*'
                    | '+'
                    | '-'
                    | '/'
                    | '='
                    | '?'
                    | '^'
                    | '_'
                    | '`'
                    | '{'
                    | '|'
                    | '}'
                    | '~'
            )
    }) && domain.split('.').all(|label| {
        !label.is_empty()
            && label
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '-')
            && label
                .chars()
                .next()
                .is_some_and(|character| character.is_ascii_alphanumeric())
            && label
                .chars()
                .last()
                .is_some_and(|character| character.is_ascii_alphanumeric())
    })
}

fn normalize_phone_number(phone: &str) -> Result<String, String> {
    let mut normalized = String::new();
    for character in phone.chars() {
        match character {
            '0'..='9' => normalized.push(character),
            '+' if normalized.is_empty() => normalized.push(character),
            ' ' | '-' | '(' | ')' | '.' => {}
            _ => {
                return Err(format!(
                    "Invalid guest phone number: {phone}. Use 7-15 digits, optionally prefixed with +."
                ));
            }
        }
    }

    let digits = normalized.strip_prefix('+').unwrap_or(&normalized);
    if !(7..=15).contains(&digits.len())
        || (normalized.starts_with('+') && digits.starts_with('0'))
        || digits.chars().any(|character| !character.is_ascii_digit())
    {
        return Err(format!(
            "Invalid guest phone number: {phone}. Use 7-15 digits, optionally prefixed with +."
        ));
    }

    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_recipients_split_validate_and_deduplicate() {
        let recipients = normalize_recipients(
            " Alice@example.com; bob@example.com\nalice@EXAMPLE.com ",
            &[],
            InviteDeliveryMethod::Email,
        )
        .unwrap();

        assert_eq!(
            recipients,
            vec![
                "Alice@example.com".to_string(),
                "bob@example.com".to_string()
            ]
        );
        assert!(normalize_recipients("not-an-email", &[], InviteDeliveryMethod::Email).is_err());
    }

    #[test]
    fn phone_recipients_normalize_formatting_and_deduplicate() {
        let recipients = normalize_recipients(
            "+1 (415) 555-0100;\n+14155550100",
            &[],
            InviteDeliveryMethod::Sms,
        )
        .unwrap();

        assert_eq!(recipients, vec!["+14155550100".to_string()]);
        assert!(normalize_recipients("123-ABC", &[], InviteDeliveryMethod::Sms).is_err());
        assert!(normalize_recipients("123456", &[], InviteDeliveryMethod::Sms).is_err());
        assert_eq!(
            normalize_recipients("06 12 34 56 78", &[], InviteDeliveryMethod::Sms).unwrap(),
            vec!["0612345678".to_string()]
        );
    }

    #[test]
    fn contacts_use_only_the_field_for_the_delivery_method() {
        let contacts = vec![PickedContact {
            email: vec!["guest@example.com".to_string()],
            tel: vec!["+33 (6) 12 34 56 78".to_string()],
        }];

        assert_eq!(
            normalize_recipients("guest@example.com", &contacts, InviteDeliveryMethod::Email)
                .unwrap(),
            vec!["guest@example.com".to_string()]
        );
        assert_eq!(
            normalize_recipients("+33612345678", &contacts, InviteDeliveryMethod::Sms).unwrap(),
            vec!["+33612345678".to_string()]
        );
    }

    #[test]
    fn phone_recipients_split_comma_separated_values() {
        assert_eq!(
            normalize_recipients(
                "+14155550100, +442079460000",
                &[],
                InviteDeliveryMethod::Sms
            )
            .unwrap(),
            vec!["+14155550100".to_string(), "+442079460000".to_string()]
        );
    }

    #[test]
    fn recipient_list_is_limited_to_fifty_invitees() {
        let recipients = (0..=MAX_INVITEES)
            .map(|index| format!("guest{index}@example.com"))
            .collect::<Vec<_>>()
            .join(",");
        assert!(normalize_recipients(&recipients, &[], InviteDeliveryMethod::Email).is_err());
    }

    #[test]
    fn delivery_method_uses_lowercase_wire_names() {
        assert_eq!(
            serde_json::to_value(InviteDeliveryMethod::Email).unwrap(),
            "email"
        );
        assert_eq!(
            serde_json::to_value(InviteDeliveryMethod::Sms).unwrap(),
            "sms"
        );
    }
}
