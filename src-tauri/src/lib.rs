use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

mod ai;
mod backgrounds;
mod chat;
mod commands;
mod demo;
mod device;
mod e2ee;
mod egress;
mod error;
mod events;
mod layout;
mod meeting;
mod participant;
mod persistence;
mod recording;
mod session;
mod settings;
mod state;
mod token;
mod window;

use backgrounds::BackgroundState;
use state::{AppState, MediaState};

// ── Command layout ───────────────────────────────────────────────────────────
//
// Every `#[tauri::command]` lives in a domain module, not here: the invite /
// LiveKit-store commands are in `commands.rs` itself and the rest are grouped
// under `commands/` (meeting, profile, schedule, safety, participants, devices,
// layout, translation, system), alongside the non-command modules that already
// held the domain logic they wrap (`ai`, `chat`, `recording`, `egress`, `e2ee`,
// `backgrounds`).
//
// The `generate_handler!` table below is deliberately the ONE place commands are
// registered. Tauri v2's `Builder::invoke_handler` assigns rather than extends
// (see tauri/src/app.rs), so a per-module `register(builder)` would silently
// discard every earlier module's commands; and `generate_handler!` is a proc
// macro, so it cannot be fed a `macro_rules!` list either. Adding a command means
// adding it to the domain module and to this table.

/// One-time migration for the user's LiveKit server configuration.
///
/// Earlier builds kept it inside `settings.json` under the `livekit_config`
/// key — the same file that `AppData` owns and rewrites wholesale via
/// `fs::write`. Saving a note or a profile change therefore silently wiped the
/// saved server. That was masked while a built-in default server existed; now
/// that VisualTalk is bring-your-own-server, the config lives in its own store
/// file (`commands::STORE_FILE`) so the two writers cannot clobber each other.
///
/// Copy-only: the legacy key is left untouched and simply ignored, which avoids
/// rewriting a file that `AppData` may be about to write itself.
fn migrate_livekit_store(app: &AppHandle) {
    const LEGACY_FILE: &str = "settings.json";

    let Ok(store) = app.store(commands::STORE_FILE) else {
        return;
    };
    // Already migrated, or configured fresh — nothing to do.
    if store.get(commands::SETTINGS_KEY).is_some() {
        return;
    }

    let Ok(legacy) = app.store(LEGACY_FILE) else {
        return;
    };
    let Some(value) = legacy.get(commands::SETTINGS_KEY) else {
        return;
    };

    store.set(commands::SETTINGS_KEY, value.clone());
    let _ = store.save();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(BackgroundState(Default::default()))
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("visualtalk"));

            let _ = std::fs::create_dir_all(&config_dir);

            // Must run before `AppState::new`, which loads `settings.json` and
            // later rewrites it — after that point the legacy key may be gone.
            let handle = app.handle().clone();
            migrate_livekit_store(&handle);

            // Recordings belong somewhere the user can actually reach. On
            // desktop the config dir is fine — Settings → Recordings shows the
            // path and reveals it in Finder/Explorer.
            //
            // iOS: the sandbox has no file manager, so the default is Documents,
            // which `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace`
            // (Info.plist) expose in the Files app under "On My iPhone".
            //
            // That iOS path is currently UNREACHABLE in practice: local recording
            // needs MediaRecorder, which WKWebView does not implement, so no iOS
            // build can produce a recording (see useRecording.js). The directory
            // and the plist keys are provisioned ahead of that feature. Until it
            // lands, Settings → Recordings tells mobile users so explicitly via
            // `settings.recordings.mobileHint` instead of promising a Files
            // location that would always be empty.
            let recordings_default = if cfg!(target_os = "ios") {
                app.path()
                    .document_dir()
                    .map(|dir| dir.join("Recordings"))
                    .unwrap_or_else(|_| recording::default_recordings_dir(&config_dir))
            } else {
                recording::default_recordings_dir(&config_dir)
            };

            let app_state = AppState::new(config_dir.clone());
            // Honour a previously chosen recordings folder. Read before the
            // state is moved into `manage`, since `RecordingState` needs it.
            let recordings_override = app_state
                .read_data(|data| data.settings.recordings_dir.clone())
                .ok()
                .flatten();
            app.manage(app_state);
            app.manage(MediaState::new());
            app.manage(recording::RecordingState::new(
                recordings_default,
                recordings_override,
            ));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Meeting & Session
            commands::meeting::get_meeting_session,
            commands::meeting::open_meeting_window,
            commands::meeting::notify_meeting_ended,
            commands::parse_invite_link,
            commands::create_meeting_invite,
            commands::create_icalendar_event,
            // User Management
            commands::profile::get_user_profile,
            commands::profile::update_user_profile,
            commands::profile::get_user_settings,
            commands::profile::update_user_settings,
            commands::profile::get_user_notes,
            commands::profile::update_user_notes,
            // Meetings History & Scheduling
            commands::schedule::get_scheduled_meetings,
            commands::schedule::schedule_meeting,
            commands::schedule::delete_scheduled_meeting,
            commands::schedule::get_meeting_history,
            commands::get_meeting_invite,
            // Participant Management
            commands::participants::get_all_participants,
            commands::participants::add_participant,
            commands::participants::remove_participant,
            commands::participants::get_participant,
            commands::participants::set_participant_muted,
            commands::participants::set_participant_video_enabled,
            commands::participants::filter_remote_participants,
            commands::participants::get_screen_shares,
            commands::participants::get_active_screen_share,
            commands::participants::get_participant_count,
            commands::participants::participant_exists,
            commands::participants::get_sorted_participants,
            commands::participants::clear_participants,
            commands::participants::remove_screen_share,
            // Device Management
            commands::devices::set_devices,
            commands::devices::set_device_preferences,
            commands::devices::get_audio_inputs,
            commands::devices::get_video_inputs,
            commands::devices::get_audio_outputs,
            commands::devices::get_preferred_mic,
            commands::devices::get_preferred_camera,
            commands::devices::get_preferred_speaker,
            commands::devices::get_device,
            commands::devices::get_all_devices,
            commands::devices::get_device_groups,
            commands::devices::validate_device,
            // Layout Calculations
            commands::layout::calculate_grid_dimensions,
            commands::layout::calculate_optimal_layout,
            commands::layout::get_grid_class,
            commands::layout::should_use_featured_layout,
            commands::layout::calculate_aspect_ratio,
            commands::layout::calculate_tile_size,
            commands::layout::should_feature_screen_share,
            commands::layout::calculate_filmstrip_dimensions,
            // Locale
            commands::system::get_system_locale,
            #[cfg(feature = "pro")]
            commands::system::get_energy_efficiency_stats,
            // Backgrounds
            backgrounds::get_background,
            backgrounds::set_background,
            commands::get_host_meeting_data,
            //Settings
            commands::load_settings,
            commands::save_settings,
            // Chat & File Transfer
            chat::pick_file,
            chat::read_file_chunk,
            chat::get_file_info,
            chat::save_download,
            // E2EE (Rust-native crypto)
            e2ee::e2ee_init,
            e2ee::e2ee_import_peer,
            e2ee::e2ee_encrypt_chat,
            e2ee::e2ee_decrypt_chat,
            e2ee::e2ee_prepare_file,
            e2ee::e2ee_unwrap_file_key,
            e2ee::e2ee_encrypt_chunk,
            e2ee::e2ee_decrypt_chunk,
            e2ee::e2ee_cleanup_file,
            e2ee::e2ee_destroy,
            // Egress (LiveKit server-side recording/streaming)
            egress::start_room_egress,
            egress::stop_egress,
            egress::list_egress,
            // Local Recording & FFmpeg
            recording::save_recording_chunk,
            recording::finalize_recording,
            recording::get_local_recordings,
            recording::check_ffmpeg_available,
            recording::ffmpeg_transcode,
            recording::ffmpeg_stream_to_rtmp,
            recording::delete_recording,
            // Recordings folder, reporting & blocking
            commands::safety::get_recordings_dir,
            commands::safety::set_recordings_dir,
            commands::safety::get_report_contact,
            commands::safety::get_blocked_participants,
            commands::safety::set_participant_blocked,
            commands::safety::get_demo_available,
            // AI Assistant (OpenAI-compatible endpoint)
            ai::ask_ai,
            ai::get_ai_settings,
            ai::update_ai_settings,
            ai::test_ai_connection,
            ai::get_available_models,
            // Translation
            #[cfg(feature = "pro")]
            commands::translation::update_translation_settings,
            #[cfg(feature = "pro")]
            commands::translation::get_translation_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
