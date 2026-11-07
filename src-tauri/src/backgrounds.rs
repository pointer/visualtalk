use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
// Internally tagged: `{ "type": "blur" }`, `{ "type": "color", "value": "#fff" }`.
// This is the shape `PreJoinScreen.jsx` posts and `useBackgroundEffects.js`
// reads back (`kind.type`, `kind.value`). With serde's default *external*
// tagging those payloads fail to deserialize ("unknown variant `type`"), so
// every background selection errored out inside the hook's catch block and the
// preview never applied. See the tests below, which pin both directions.
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BackgroundKind {
    None,
    Blur,
    Color { value: String },
    Image { path: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundSettings {
    pub enabled: bool,
    pub kind: BackgroundKind,
}

impl Default for BackgroundSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            kind: BackgroundKind::None,
        }
    }
}

pub struct BackgroundState(pub Mutex<BackgroundSettings>);

#[tauri::command]
pub fn get_background(state: State<'_, BackgroundState>) -> Result<BackgroundSettings, String> {
    state
        .0
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "Could not read background settings".to_string())
}

#[tauri::command]
pub fn set_background(
    settings: BackgroundSettings,
    state: State<'_, BackgroundState>,
) -> Result<BackgroundSettings, String> {
    let mut current = state
        .0
        .lock()
        .map_err(|_| "Could not update background settings".to_string())?;

    *current = settings.clone();

    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Pin the exact payloads the pre-join picker sends, in both directions.
    #[test]
    fn background_kind_matches_the_frontend_payloads() {
        let cases = [
            (r#"{"type":"none"}"#, BackgroundKind::None),
            (r#"{"type":"blur"}"#, BackgroundKind::Blur),
            (
                r##"{"type":"color","value":"#2563eb"}"##,
                BackgroundKind::Color {
                    value: "#2563eb".into(),
                },
            ),
            (
                r#"{"type":"image","path":"/tmp/bg.png"}"#,
                BackgroundKind::Image {
                    path: "/tmp/bg.png".into(),
                },
            ),
        ];
        for (json, expected) in cases {
            let parsed: BackgroundKind =
                serde_json::from_str(json).expect(&format!("must deserialize {}", json));
            assert_eq!(parsed, expected);
            assert_eq!(serde_json::to_string(&expected).unwrap(), json);
        }
    }

    /// The whole `set_background` argument, as `selectBackground()` builds it.
    #[test]
    fn background_settings_round_trips_the_full_payload() {
        let json = r##"{"enabled":true,"kind":{"type":"color","value":"#2563eb"}}"##;
        let settings: BackgroundSettings = serde_json::from_str(json).unwrap();
        assert!(settings.enabled);
        assert_eq!(
            settings.kind,
            BackgroundKind::Color {
                value: "#2563eb".into()
            }
        );
        assert_eq!(serde_json::to_string(&settings).unwrap(), json);
    }

    #[test]
    fn default_background_is_disabled_and_none() {
        let json = serde_json::to_string(&BackgroundSettings::default()).unwrap();
        assert_eq!(json, r#"{"enabled":false,"kind":{"type":"none"}}"#);
    }
}
