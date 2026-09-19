use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

pub fn spawn_meeting_window(
    app: &AppHandle,
    room: String,
    _width: Option<f64>,
    _height: Option<f64>,
) -> Result<String, String> {
    let label = format!("meeting-{}", chrono::Utc::now().timestamp_millis());
    let window_title = format!("VisualTalk Meeting - Room: {}", room);
    let target_path = format!("index.html?mode=meeting&room={}", room);

    println!("Opening meeting window with URL: {}", target_path);

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(target_path.into()))
        .title(window_title)
        .resizable(true);

    // ⭐ DESKTOP SIZING (macOS, Windows, Linux)
    #[cfg(all(not(target_os = "android"), not(target_os = "ios")))]
    {
        builder = builder
            .min_inner_size(900.0, 900.0)
            .inner_size(900.0, 900.0)
            .center()
            .fullscreen(false);
    }

    // ⭐ MOBILE SIZING (iOS + Android)
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        // On iOS/Android, the window is naturally fullscreen.
        // We rely on CSS `env(safe-area-inset-*)` in the frontend
        // to handle the notch/status bar and home indicator.
        // No manual Rust positioning needed here!
    }

    // ⭐ BUILD THE WINDOW
    let _window = builder
        .build()
        .map_err(|e| format!("Failed to create meeting window: {}", e))?;

    Ok(label)
}

// use tauri::{window::Monitor, Manager, PhysicalPosition, PhysicalSize};
// use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

// // #[tauri::command]
// // pub fn get_size(window: WebviewWindow) {
// //     // 1. FIXED: Tauri v2's primary_monitor() returns a Result<Option<Monitor>>
// //     if let Ok(Some(monitor)) = window.primary_monitor() {
// //         let size = monitor.size();
// //         println!("Width: {}, Height: {}", size.width, size.height);
// //     }
// // }

// pub fn spawn_meeting_window(
//     app: &AppHandle,
//     room: String,
//     _width: Option<f64>,
//     _height: Option<f64>,
// ) -> Result<String, String> {
//     let label = format!("meeting-{}", chrono::Utc::now().timestamp_millis());
//     let window_title = format!("VisualTalk Meeting - Room: {}", room);
//     let target_path = format!("index.html?mode=meeting&room={}", room);

//     println!("Opening meeting window with URL: {}", target_path);

//     let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(target_path.into()))
//         .title(window_title)
//         .resizable(true);

//     //
//     // ⭐ DESKTOP SIZING (macOS, Windows, Linux)
//     //
//     #[cfg(all(not(target_os = "android"), not(target_os = "ios")))]
//     {
//         builder = builder
//             .min_inner_size(900.0, 900.0)
//             .inner_size(900.0, 900.0)
//             .center()
//             .fullscreen(false);
//     }

//     //
//     // ⭐ BUILD THE WINDOW
//     //
//     let window = builder
//         .build()
//         .map_err(|e| format!("Failed to create meeting window: {}", e))?;

//     //
//     // ⭐ MOBILE SIZING (iOS + Android)
//     //
//     #[cfg(any(target_os = "android", target_os = "ios"))]
//     {
//         // let window = app.get_webview_window("main").unwrap();
//         // 2. FIXED: Do not use .winit_window(). Call methods directly on Tauri's window instance.
//         if let Ok(Some(monitor)) = window.current_monitor() {
//             // let window_size: PhysicalSize<u32> = window.inner_size()?; // or outer_size()
//             let physical_size: &PhysicalSize<u32> = monitor.size();
//             let physical_pos: &PhysicalPosition<i32> = monitor.position();
//             let scale_factor = window.scale_factor().unwrap_or(1.0);
//             let logical = physical_size.to_logical::<f64>(scale_factor);
//             let width = physical_size.width;
//             let height = physical_size.height;
//             // Compute top-left so the window is centered on this monitor
//             let x = physical_pos.x + ((width as i32) - (width as i32)) / 2;
//             let y = physical_pos.y + ((height as i32) - (height as i32)) / 2;
//             // Resize the window/webview viewport natively via Tauri
//             let _ = window.set_size(logical);
//             let _ = window.set_position(PhysicalPosition::new(x, y));
//         }
//     }

//     Ok(label)
// }
