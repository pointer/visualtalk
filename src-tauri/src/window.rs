use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

pub fn spawn_meeting_window(
    app: &AppHandle,
    room: String,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<String, String> {
    let label = format!("meeting-{}", chrono::Utc::now().timestamp_millis());
    let window_title = format!("VisualTalk Meeting - Room: {}", room);
    let target_path = format!("index.html?mode=meeting&room={}", room);

    let w = width.unwrap_or(750.0);
    let h = height.unwrap_or(600.0);

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(target_path.into()))
        .title(window_title)
        .inner_size(w, h)
        .resizable(true);

    #[cfg(not(target_os = "android"))]
    {
        builder = builder.center().fullscreen(false);
    }

    builder
        .build()
        .map_err(|e| format!("Failed to create meeting window: {}", e))?;

    Ok(label)
}

