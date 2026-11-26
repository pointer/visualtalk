use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

use tauri::{
    AppHandle, LogicalSize, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

use crate::events::{emit as emit_event, VtEvent};

/// Window labels that already reported "meeting ended" through one of the two
/// paths below.  Guarantees `MeetingEnded` is emitted **exactly once** per
/// meeting window:
///
/// 1. Clean leave: the window's JS runs `notify_meeting_ended` *before* it
///    closes → `mark_meeting_ended()` inserts the label and the command emits.
/// 2. Force-quit / crash: the JS never runs, but the native `Destroyed`
///    window event always fires → `take_meeting_ended_on_destroy()` finds no
///    label and the hook emits instead.
fn ended_labels() -> &'static Mutex<HashSet<String>> {
    static ENDED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    ENDED.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Called by `notify_meeting_ended` (lib.rs).  Returns `true` when this is the
/// first end-report for the label, i.e. when the caller should emit
/// `MeetingEnded`.
pub fn mark_meeting_ended(label: &str) -> bool {
    match ended_labels().lock() {
        // A poisoned mutex must not cost us the event — treat it as "first".
        Err(_) => true,
        Ok(mut labels) => labels.insert(label.to_string()),
    }
}

/// Called from the `Destroyed` window hook.  Returns `true` when the window's
/// JS never reported the end (force-quit / crash), i.e. when the hook itself
/// must emit `MeetingEnded`.  Also drops the label so the registry never grows
/// unbounded.
fn take_meeting_ended_on_destroy(label: &str) -> bool {
    match ended_labels().lock() {
        // No dedupe possible — better a duplicate event than a lost one.
        Err(_) => true,
        Ok(mut labels) => !labels.remove(label),
    }
}

pub fn spawn_meeting_window(
    app: &AppHandle,
    room: String,
    token: Option<String>,
    url: Option<String>,
    identity: Option<String>,
    display_name: Option<String>,
    _width: Option<f64>,
    _height: Option<f64>,
) -> Result<String, String> {
    let label = format!("meeting-{}", chrono::Utc::now().timestamp_millis());
    let window_title = format!("VisualTalk - {}", room);

    // 1. Build the target URL with all LiveKit credentials
    let mut query = url::form_urlencoded::Serializer::new(String::new());
    query
        .append_pair("mode", "meeting")
        .append_pair("room", &room);
    if let Some(token) = token {
        query.append_pair("token", &token);
    }
    if let Some(url) = url {
        query.append_pair("url", &url);
    }
    if let Some(identity) = identity {
        query.append_pair("identity", &identity);
    }
    if let Some(display_name) = display_name {
        query.append_pair("displayName", &display_name);
    }
    let target_path = format!("index.html?{}", query.finish());

    // Fallback for force-quit / crashed meeting windows: the JS-side
    // `notify_meeting_ended` never runs in those cases, so without this hook
    // the main window would never learn the meeting ended.  `Destroyed` fires
    // for *every* close path (clean leave, ✕ button, crash); the ended-labels
    // registry dedupes it against the JS command.
    let app_for_event = app.clone();
    let label_for_event = label.clone();
    let room_for_event = room.clone();

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(target_path.into()))
        .title(window_title)
        .resizable(true);

    // ⭐ DESKTOP SIZING (macOS, Windows, Linux)
    #[cfg(all(not(target_os = "android"), not(target_os = "ios")))]
    {
        builder = builder
            .min_inner_size(900.0, 600.0) // Adjusted height for better desktop ratio
            .inner_size(900.0, 600.0)
            .center()
            .fullscreen(false);
    }

    // ⭐ BUILD THE WINDOW
    let window = builder
        .build()
        .map_err(|e| format!("Failed to create meeting window: {}", e))?;

    window.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            if take_meeting_ended_on_destroy(&label_for_event) {
                emit_event(
                    &app_for_event,
                    VtEvent::MeetingEnded {
                        room: room_for_event.clone(),
                    },
                );
            }
        }
    });

    Ok(label)
}

/// Geometry saved when a meeting window collapses into the presenting bar, so
/// it can be restored exactly when sharing stops.
#[derive(Clone, Copy)]
struct SavedGeometry {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
}

fn presenting_geom() -> &'static Mutex<HashMap<String, SavedGeometry>> {
    static GEOM: OnceLock<Mutex<HashMap<String, SavedGeometry>>> = OnceLock::new();
    GEOM.get_or_init(|| Mutex::new(HashMap::new()))
}

const BAR_W: f64 = 360.0;
const BAR_H: f64 = 72.0;

/// Collapse the meeting window into a small, always-on-top presenting bar so
/// the display being captured shows the user's real desktop — the only way to
/// avoid rendering the capture inside the capture (infinite mirror).
pub fn enter_presenting(window: &WebviewWindow) -> Result<(), String> {
    let label = window.label().to_string();
    {
        let mut map = presenting_geom()
            .lock()
            .map_err(|_| "presenting state poisoned".to_string())?;
        if !map.contains_key(&label) {
            let size = window.outer_size().map_err(|e| e.to_string())?;
            let pos = window.outer_position().map_err(|e| e.to_string())?;
            map.insert(
                label,
                SavedGeometry {
                    width: size.width,
                    height: size.height,
                    x: pos.x,
                    y: pos.y,
                },
            );
        }
    }

    // The window was created with a 900x600 minimum; relax it for the bar.
    window
        .set_min_size(Some(Size::Logical(LogicalSize::new(240.0, 56.0))))
        .map_err(|e| e.to_string())?;
    window.set_decorations(false).map_err(|e| e.to_string())?;
    window
        .set_size(Size::Logical(LogicalSize::new(BAR_W, BAR_H)))
        .map_err(|e| e.to_string())?;

    if let Ok(Some(monitor)) = window.current_monitor() {
        let wa = monitor.work_area();
        let scale = window.scale_factor().unwrap_or(1.0);
        let bar_w = (BAR_W * scale) as i32;
        let bar_h = (BAR_H * scale) as i32;
        let x = wa.position.x + (wa.size.width as i32 - bar_w) / 2;
        let y = wa.position.y + wa.size.height as i32 - bar_h - (16.0 * scale) as i32;
        let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
    }
    window.set_always_on_top(true).map_err(|e| e.to_string())?;
    Ok(())
}

/// Restore the meeting window to its pre-share size, position and chrome.
pub fn exit_presenting(window: &WebviewWindow) -> Result<(), String> {
    let label = window.label().to_string();
    let saved = presenting_geom()
        .lock()
        .ok()
        .and_then(|mut map| map.remove(&label));

    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    window.set_decorations(true).map_err(|e| e.to_string())?;
    if let Some(g) = saved {
        let _ = window.set_size(Size::Physical(PhysicalSize::new(g.width, g.height)));
        let _ = window.set_position(Position::Physical(PhysicalPosition::new(g.x, g.y)));
    }
    window
        .set_min_size(Some(Size::Logical(LogicalSize::new(900.0, 600.0))))
        .map_err(|e| e.to_string())?;
    Ok(())
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
