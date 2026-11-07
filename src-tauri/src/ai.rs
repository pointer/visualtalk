//! AI chat assistant — client-side LLM integration.
//!
//! Talks to any OpenAI-compatible `/chat/completions` endpoint:
//! OpenAI, OpenRouter, or a fully local Ollama / LM Studio server.
//! All logic lives in the Rust core ("thin UI, fat core"); the frontend
//! only invokes `ask_ai` and renders the reply in the chat panel.

use crate::error::{AppError, ErrorKind};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::State;

/// Persisted AI configuration (stored inside AppData → settings.json).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettings {
    pub enabled: bool,
    /// OpenAI-compatible base URL, e.g. "http://localhost:11434/v1" (Ollama)
    /// or "https://api.openai.com/v1".
    pub base_url: String,
    /// API key. May be empty for local servers; falls back to env AI_API_KEY.
    pub api_key: String,
    pub model: String,
    pub system_prompt: String,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            base_url: "http://localhost:11434/v1".to_string(),
            api_key: String::new(),
            model: "llama3.2".to_string(),
            system_prompt: "You are a helpful AI assistant inside a VisualTalk video meeting chat. \
                Answer questions concisely. When given recent chat history, use it as context \
                about the meeting conversation.".to_string(),
        }
    }
}

/// One conversation turn passed from the frontend as context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTurn {
    /// "user" or "assistant"
    pub role: String,
    pub content: String,
}

// ── OpenAI-compatible wire format ──────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ModelsResponse {
    #[serde(default)]
    data: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
}

/// Resolve the API key: explicit setting first, then env AI_API_KEY.
fn resolve_api_key(settings_key: &str) -> String {
    if !settings_key.trim().is_empty() {
        return settings_key.trim().to_string();
    }
    std::env::var("AI_API_KEY").unwrap_or_default()
}

fn build_client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| AppError::internal(format!("Failed to build HTTP client: {}", e)))
}

fn completion_url(base_url: &str) -> String {
    format!("{}/chat/completions", base_url.trim_end_matches('/'))
}

/// Send a prompt (plus recent chat history as context) to the configured
/// LLM endpoint and return the assistant reply text.
#[tauri::command]
pub async fn ask_ai(
    prompt: String,
    history: Vec<ChatTurn>,
    state: State<'_, AppState>,
) -> Result<String, AppError> {
    // Clone the settings out: `read_data` drops the guard when the closure
    // returns, so nothing is held across the `.await` below (a std MutexGuard
    // is not Send and would make this async command fail to compile).
    let ai = state
        .read_data(|data| data.ai.clone())
        .map_err(AppError::internal)?;

    if !ai.enabled {
        return Err(AppError::config(
            "AI assistant is disabled. Enable it in Settings → AI Assistant.",
        ));
    }

    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err(AppError::config("Empty prompt"));
    }

    let mut messages = vec![ChatMessage {
        role: "system".to_string(),
        content: ai.system_prompt.clone(),
    }];

    // Recent conversation as context (last 20 turns max).
    let context_start = history.len().saturating_sub(20);
    for turn in history.into_iter().skip(context_start) {
        messages.push(ChatMessage {
            role: if turn.role == "assistant" { "assistant".to_string() } else { "user".to_string() },
            content: turn.content,
        });
    }

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: prompt.to_string(),
    });

    let client = build_client()?;
    let request = ChatCompletionRequest {
        model: ai.model.clone(),
        messages,
        stream: false,
    };

    let mut req_builder = client.post(completion_url(&ai.base_url)).json(&request);
    let api_key = resolve_api_key(&ai.api_key);
    if !api_key.is_empty() {
        req_builder = req_builder.bearer_auth(api_key);
    }

    let response = req_builder
        .send()
        .await
        .map_err(|e| AppError::from_reqwest(&e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| AppError::from_reqwest(&e))?;

    if !status.is_success() {
        return Err(AppError::from_status(status, &body));
    }

    let parsed: ChatCompletionResponse =
        serde_json::from_str(&body)
            .map_err(|e| AppError::new(ErrorKind::BadResponse, format!("Invalid AI response: {}", e)))?;

    parsed
        .choices
        .first()
        .map(|c| c.message.content.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::new(ErrorKind::BadResponse, "AI returned an empty response"))
}

#[tauri::command]
pub fn get_ai_settings(state: State<'_, AppState>) -> Result<AiSettings, AppError> {
    state
        .read_data(|data| data.ai.clone())
        .map_err(AppError::internal)
}

#[tauri::command]
pub fn update_ai_settings(
    settings: AiSettings,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state
        .update_data(|data| data.ai = settings)
        .map_err(AppError::internal)
}

/// Verify the endpoint is reachable and credentials work by listing models.
/// Returns a short human-readable summary for the settings UI.
#[tauri::command]
pub async fn test_ai_connection(state: State<'_, AppState>) -> Result<String, AppError> {
    let ai = state
        .read_data(|data| data.ai.clone())
        .map_err(AppError::internal)?;

    let client = build_client()?;
    let url = format!("{}/models", ai.base_url.trim_end_matches('/'));

    let mut req_builder = client.get(&url);
    let api_key = resolve_api_key(&ai.api_key);
    if !api_key.is_empty() {
        req_builder = req_builder.bearer_auth(api_key);
    }

    let response = req_builder
        .send()
        .await
        .map_err(|e| AppError::from_reqwest(&e))?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(AppError::from_status(status, &body));
    }

    match serde_json::from_str::<ModelsResponse>(&body) {
        Ok(models) => {
            let count = models.data.len();
            let has_model = models.data.iter().any(|m| m.id == ai.model);
            if count == 0 {
                Ok("Connected — endpoint reachable (no models listed)".to_string())
            } else if has_model {
                Ok(format!("Connected — model \"{}\" available ({} models)", ai.model, count))
            } else {
                Ok(format!(
                    "Connected — {} models available, but \"{}\" not found",
                    count, ai.model
                ))
            }
        }
        Err(_) => Ok("Connected — endpoint reachable".to_string()),
    }
}


/// List available models by querying the configured endpoint.
#[tauri::command]
pub async fn get_available_models(
    state: State<'_, AppState>,
) -> Result<Vec<String>, AppError> {
    let ai = state
        .read_data(|data| data.ai.clone())
        .map_err(AppError::internal)?;

    let client = build_client()?;
    let url = format!("{}/models", ai.base_url.trim_end_matches('/'));

    let mut req_builder = client.get(&url);
    let api_key = resolve_api_key(&ai.api_key);
    if !api_key.is_empty() {
        req_builder = req_builder.bearer_auth(api_key);
    }

    let response = req_builder
        .send()
        .await
        .map_err(|e| AppError::from_reqwest(&e))?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(AppError::from_status(status, &body));
    }

    match serde_json::from_str::<ModelsResponse>(&body) {
        Ok(models) => Ok(models.data.into_iter().map(|m| m.id).collect()),
        Err(e) => Err(AppError::new(
            ErrorKind::BadResponse,
            format!("Failed to parse models response: {}", e),
        )),
    }
}
