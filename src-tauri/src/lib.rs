use tauri::{AppHandle, Manager, State};
use tauri_plugin_store::StoreExt;

mod backgrounds;
mod chat;
mod commands;
mod device;
mod e2ee;
mod egress;
mod events;
mod layout;
mod meeting;
mod participant;
mod recording;
mod session;
mod settings;
mod state;
mod token;
mod window;

use backgrounds::{get_background, set_background, BackgroundState};
use commands::*;
use device::{DevicePreferences, MediaDevice};
use events::{emit as emit_event, VtEvent};
use layout::{LayoutCalculator, LayoutConfig};
use meeting::{MeetingRecord, ScheduledMeeting};
use participant::Participant;
use session::{create_session, MeetingSession};
use settings::{UserProfile, UserSettings};
use state::AppState;

use serde::Serialize;

#[derive(Serialize)]
pub struct AppConfig {
    livekit_url: String,
    api_key: String,
    room: String,
    identity: String,
}

#[tauri::command]
fn get_config() -> Result<AppConfig, String> {
    let livekit_url =
        std::env::var("LIVEKIT_URL").map_err(|_| "LIVEKIT_URL not set".to_string())?;
    let api_key =
        std::env::var("LIVEKIT_API_KEY").map_err(|_| "LIVEKIT_API_KEY not set".to_string())?;
    let room = std::env::var("ROOM").map_err(|_| "ROOM not set".to_string())?;
    let identity = std::env::var("IDENTITY").map_err(|_| "IDENTITY not set".to_string())?;
    Ok(AppConfig {
        livekit_url,
        api_key,
        room,
        identity,
    })
}

#[tauri::command]
fn get_meeting_session(room: String, state: State<'_, AppState>) -> Result<MeetingSession, String> {
    let data = state
        .data
        .lock()
        .map_err(|_| "Failed to acquire lock on app data".to_string())?
        .clone();

    // Record in history
    if let Ok(mut meetings) = state.meetings.lock() {
        let _ = meetings.add_history(room.clone(), &state.config_dir);
    }

    create_session(room, &data)
}

#[tauri::command]
fn open_meeting_window(
    app: AppHandle,
    room: String,
    token: Option<String>,
    url: Option<String>,
    identity: Option<String>,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<String, String> {
    println!(
        "Rust received room: {}, token present: {}",
        room,
        token.is_some()
    );

    // Pass the new arguments down to the spawn function
    let result = window::spawn_meeting_window(&app, room.clone(), token, url, identity, width, height);

    // [CONCERN: We emit MeetingStarted only if the window was created
    //  successfully.  If spawn fails, no event is emitted — correct
    //  behavior.  But the main window has no way to know the meeting
    //  window *failed* to open other than the invoke rejection.]
    if result.is_ok() {
        emit_event(&app, VtEvent::MeetingStarted { room });
    }

    result
}

#[tauri::command]
fn get_user_profile(state: State<'_, AppState>) -> Result<UserProfile, String> {
    let data = state
        .data
        .lock()
        .map_err(|_| "Failed to lock app data".to_string())?;
    Ok(data.profile.clone())
}

#[tauri::command]
fn update_user_profile(
    app: AppHandle,
    profile: UserProfile,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut data = state
        .data
        .lock()
        .map_err(|_| "Failed to lock app data".to_string())?;
    data.profile = profile.clone();
    data.save(&state.config_dir)?;

    // [CONCERN: The invoking window already received the updated profile
    //  via the invoke response.  This event will fire in ALL windows
    //  including the one that initiated the update.  The JS handler
    //  must be idempotent — setting the same profile twice is harmless
    //  but the re-render is wasted work.]
    emit_event(&app, VtEvent::ProfileUpdated { profile });
    Ok(())
}

#[tauri::command]
fn get_user_settings(state: State<'_, AppState>) -> Result<UserSettings, String> {
    let data = state
        .data
        .lock()
        .map_err(|_| "Failed to lock app data".to_string())?;
    Ok(data.settings.clone())
}

#[tauri::command]
fn update_user_settings(
    app: AppHandle,
    settings: UserSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut data = state
        .data
        .lock()
        .map_err(|_| "Failed to lock app data".to_string())?;
    data.settings = settings.clone();
    data.save(&state.config_dir)?;

    // [CONCERN: Same idempotency concern as ProfileUpdated.  The JS
    //  SettingsTab currently calls `setSettings(updated)` locally AND
    //  awaits invoke().  The event will re-set it from the parent.
    //  This is safe (same value) but causes a redundant SolidJS
    //  re-evaluation.  Consider removing the local set in the child
    //  and relying solely on the event for cross-window sync.]
    emit_event(&app, VtEvent::SettingsUpdated { settings });
    Ok(())
}

#[tauri::command]
fn get_scheduled_meetings(state: State<'_, AppState>) -> Result<Vec<ScheduledMeeting>, String> {
    let meetings = state
        .meetings
        .lock()
        .map_err(|_| "Failed to lock meetings".to_string())?;
    Ok(meetings.scheduled.clone())
}

#[tauri::command]
fn schedule_meeting(
    app: AppHandle,
    title: String,
    room_id: String,
    start_time: String,
    duration_minutes: u32,
    state: State<'_, AppState>,
) -> Result<ScheduledMeeting, String> {
    // Load LiveKit settings to generate the invite link
    let store = app.store(commands::STORE_FILE).map_err(|e| e.to_string())?;
    let value = store
        .get(commands::SETTINGS_KEY)
        .ok_or("LiveKit settings not configured. Please set your API keys in Settings first.")?;
    let settings: LiveKitSettings = serde_json::from_value(value).map_err(|e| e.to_string())?;
    let invite_link = commands::generate_magic_link(&settings, &room_id)?;

    let mut meetings = state
        .meetings
        .lock()
        .map_err(|_| "Failed to lock meetings".to_string())?;
    let meeting = meetings.add_scheduled(
        title,
        room_id,
        invite_link,
        start_time,
        duration_minutes,
        &state.config_dir,
    )?;

    // [CONCERN: schedule_meeting already has AppHandle from the store
    //  lookup above, so reusing it here is fine.  But note that the
    //  invoke response already returns the ScheduledMeeting to the
    //  caller.  The event is for OTHER windows that didn't initiate
    //  the schedule.  The caller's local `setScheduledMeetings(prev =>
    //  [...prev, newMeeting])` and this event will both add it.
    //  Must ensure the JS handler checks for duplicates or is
    //  idempotent.]
    emit_event(&app, VtEvent::MeetingScheduled { meeting: meeting.clone() });
    Ok(meeting)
}

#[tauri::command]
fn delete_scheduled_meeting(
    app: AppHandle,
    id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut meetings = state
        .meetings
        .lock()
        .map_err(|_| "Failed to lock meetings".to_string())?;
    let removed = meetings.remove_scheduled(&id, &state.config_dir)?;

    // [CONCERN: The caller's JS already does `setScheduledMeetings(prev =>
    //  prev.filter(m => m.id !== id))` locally.  The event will trigger
    //  the same filter again in ALL windows.  Double-filtering is
    //  harmless (idempotent) but the redundant re-render is wasteful.
    //  This is the trade-off of global broadcast vs. targeted emit.]
    if removed {
        emit_event(&app, VtEvent::MeetingDeleted { id });
    }

    Ok(removed)
}

#[tauri::command]
fn get_meeting_history(state: State<'_, AppState>) -> Result<Vec<MeetingRecord>, String> {
    let meetings = state
        .meetings
        .lock()
        .map_err(|_| "Failed to lock meetings".to_string())?;
    Ok(meetings.history.clone())
}

// ===== PARTICIPANT MANAGEMENT =====

#[tauri::command]
fn get_all_participants(state: State<'_, AppState>) -> Result<Vec<Participant>, String> {
    let manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    Ok(manager.get_all())
}

#[tauri::command]
fn add_participant(
    app: AppHandle,
    participant: Participant,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    let added = manager.add_participant(participant.clone());

    // [CONCERN: During a meeting join burst, 10-20 participants may be
    //  added in quick succession.  Each emit triggers JSON serialization
    //  of the full Participant struct and a JS-side re-render.  If the
    //  video grid re-renders are expensive, debounce participant-changed
    //  events on the JS side (e.g. coalesce within a 100ms window).]
    if added {
        emit_event(
            &app,
            VtEvent::ParticipantChanged {
                action: "added".to_string(),
                participant: Some(participant),
            },
        );
    }

    Ok(added)
}

#[tauri::command]
fn remove_participant(
    app: AppHandle,
    participant_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;

    // [CONCERN: We need to grab the participant *before* removal so we
    //  can include it in the event.  This is a minor extra lookup but
    //  keeps the event payload self-contained for the JS listener.]
    let removed_participant = manager.get_participant(&participant_id);
    let removed = manager.remove_participant(&participant_id);

    if removed {
        emit_event(
            &app,
            VtEvent::ParticipantChanged {
                action: "removed".to_string(),
                participant: removed_participant,
            },
        );
    }

    Ok(removed)
}

#[tauri::command]
fn get_participant(
    participant_id: String,
    state: State<'_, AppState>,
) -> Result<Option<Participant>, String> {
    let manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    Ok(manager.get_participant(&participant_id))
}

#[tauri::command]
fn set_participant_muted(
    app: AppHandle,
    participant_id: String,
    muted: bool,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    let updated = manager.set_participant_muted(&participant_id, muted);

    // [CONCERN: Mute toggles can happen rapidly (e.g. push-to-talk).
    //  Each toggle emits immediately.  On the JS side this may cause
    //  rapid icon flicker.  Consider only emitting when the state
    //  actually changed, which `set_participant_muted` already
    //  guarantees (returns true only on actual mutation).]
    if updated {
        let participant = manager.get_participant(&participant_id);
        emit_event(
            &app,
            VtEvent::ParticipantChanged {
                action: if muted { "muted" } else { "unmuted" }.to_string(),
                participant,
            },
        );
    }

    Ok(updated)
}

#[tauri::command]
fn set_participant_video_enabled(
    app: AppHandle,
    participant_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    let updated = manager.set_participant_video_enabled(&participant_id, enabled);

    if updated {
        let participant = manager.get_participant(&participant_id);
        emit_event(
            &app,
            VtEvent::ParticipantChanged {
                action: if enabled { "video-on" } else { "video-off" }.to_string(),
                participant,
            },
        );
    }

    Ok(updated)
}

#[tauri::command]
fn filter_remote_participants(state: State<'_, AppState>) -> Result<Vec<Participant>, String> {
    let manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    Ok(manager.get_remote_participants())
}

#[tauri::command]
fn get_screen_shares(state: State<'_, AppState>) -> Result<Vec<Participant>, String> {
    let manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    Ok(manager.get_screen_shares())
}

#[tauri::command]
fn get_active_screen_share(state: State<'_, AppState>) -> Result<Option<Participant>, String> {
    let manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    Ok(manager.get_active_screen_share())
}

#[tauri::command]
fn get_participant_count(state: State<'_, AppState>) -> Result<usize, String> {
    let manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    Ok(manager.count())
}

#[tauri::command]
fn participant_exists(participant_id: String, state: State<'_, AppState>) -> Result<bool, String> {
    let manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    Ok(manager.exists(&participant_id))
}

#[tauri::command]
fn get_sorted_participants(state: State<'_, AppState>) -> Result<Vec<Participant>, String> {
    let manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    Ok(manager.get_sorted())
}

#[tauri::command]
fn clear_participants(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let mut manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    manager.clear();

    // [CONCERN: Clearing emits a single "cleared" event with no participant.
    //  The JS side must treat this as "drop all participants", not "one
    //  participant changed".  This is a slightly different semantic from
    //  the other ParticipantChanged events — document this contract.]
    emit_event(
        &app,
        VtEvent::ParticipantChanged {
            action: "cleared".to_string(),
            participant: None,
        },
    );

    Ok(())
}

#[tauri::command]
fn remove_screen_share(
    app: AppHandle,
    participant_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    manager.remove_screen_share(&participant_id);

    // [CONCERN: The removed screen-share participant object isn't included
    //  in the event (it's gone).  The JS listener gets only the ID via
    //  the action string.  If the UI needs the full participant to animate
    //  a removal, capture it before `remove_screen_share` like we do in
    //  `remove_participant`.]
    emit_event(
        &app,
        VtEvent::ParticipantChanged {
            action: format!("screen-share-removed:{}", participant_id),
            participant: None,
        },
    );

    Ok(())
}

// ===== DEVICE MANAGEMENT =====

#[tauri::command]
fn set_devices(devices: Vec<MediaDevice>, state: State<'_, AppState>) -> Result<(), String> {
    let mut manager = state
        .device_manager
        .lock()
        .map_err(|_| "Failed to lock device manager".to_string())?;
    manager.set_devices(devices);
    Ok(())
}

#[tauri::command]
fn set_device_preferences(
    preferences: DevicePreferences,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut manager = state
        .device_manager
        .lock()
        .map_err(|_| "Failed to lock device manager".to_string())?;
    manager.set_preferences(preferences);
    Ok(())
}

#[tauri::command]
fn get_audio_inputs(state: State<'_, AppState>) -> Result<Vec<MediaDevice>, String> {
    let manager = state
        .device_manager
        .lock()
        .map_err(|_| "Failed to lock device manager".to_string())?;
    Ok(manager.get_audio_inputs())
}

#[tauri::command]
fn get_video_inputs(state: State<'_, AppState>) -> Result<Vec<MediaDevice>, String> {
    let manager = state
        .device_manager
        .lock()
        .map_err(|_| "Failed to lock device manager".to_string())?;
    Ok(manager.get_video_inputs())
}

#[tauri::command]
fn get_audio_outputs(state: State<'_, AppState>) -> Result<Vec<MediaDevice>, String> {
    let manager = state
        .device_manager
        .lock()
        .map_err(|_| "Failed to lock device manager".to_string())?;
    Ok(manager.get_audio_outputs())
}

#[tauri::command]
fn get_preferred_mic(state: State<'_, AppState>) -> Result<Option<MediaDevice>, String> {
    let manager = state
        .device_manager
        .lock()
        .map_err(|_| "Failed to lock device manager".to_string())?;
    Ok(manager.get_preferred_mic())
}

#[tauri::command]
fn get_preferred_camera(state: State<'_, AppState>) -> Result<Option<MediaDevice>, String> {
    let manager = state
        .device_manager
        .lock()
        .map_err(|_| "Failed to lock device manager".to_string())?;
    Ok(manager.get_preferred_camera())
}

#[tauri::command]
fn get_preferred_speaker(state: State<'_, AppState>) -> Result<Option<MediaDevice>, String> {
    let manager = state
        .device_manager
        .lock()
        .map_err(|_| "Failed to lock device manager".to_string())?;
    Ok(manager.get_preferred_speaker())
}

#[tauri::command]
fn get_device(
    device_id: String,
    state: State<'_, AppState>,
) -> Result<Option<MediaDevice>, String> {
    let manager = state
        .device_manager
        .lock()
        .map_err(|_| "Failed to lock device manager".to_string())?;
    Ok(manager.get_device(&device_id))
}

#[tauri::command]
fn get_all_devices(state: State<'_, AppState>) -> Result<Vec<MediaDevice>, String> {
    let manager = state
        .device_manager
        .lock()
        .map_err(|_| "Failed to lock device manager".to_string())?;
    Ok(manager.get_all_devices())
}

#[tauri::command]
fn get_device_groups(
    state: State<'_, AppState>,
) -> Result<Vec<crate::device::DeviceGroup>, String> {
    let manager = state
        .device_manager
        .lock()
        .map_err(|_| "Failed to lock device manager".to_string())?;
    Ok(manager.get_device_groups())
}

#[tauri::command]
fn validate_device(
    device_id: String,
    kind: crate::device::DeviceKind,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let manager = state
        .device_manager
        .lock()
        .map_err(|_| "Failed to lock device manager".to_string())?;
    Ok(manager.validate_device(&device_id, kind))
}

// ===== LAYOUT CALCULATIONS =====

#[tauri::command]
fn calculate_grid_dimensions(participant_count: usize) -> Result<(usize, usize), String> {
    Ok(LayoutCalculator::calculate_grid_dimensions(
        participant_count,
    ))
}

#[tauri::command]
fn calculate_optimal_layout(
    participant_count: usize,
    has_active_screen_share: bool,
    pinned_participant_id: Option<String>,
) -> Result<LayoutConfig, String> {
    Ok(LayoutCalculator::calculate_optimal_layout(
        participant_count,
        has_active_screen_share,
        pinned_participant_id,
    ))
}

#[tauri::command]
fn get_grid_class(columns: usize) -> Result<String, String> {
    Ok(LayoutCalculator::get_grid_class(columns))
}

#[tauri::command]
fn should_use_featured_layout(
    participant_count: usize,
    has_active_screen_share: bool,
) -> Result<bool, String> {
    Ok(LayoutCalculator::should_use_featured_layout(
        participant_count,
        has_active_screen_share,
    ))
}

#[tauri::command]
fn calculate_aspect_ratio(width: u32, height: u32) -> Result<f64, String> {
    Ok(LayoutCalculator::calculate_aspect_ratio(width, height))
}

#[tauri::command]
fn calculate_tile_size(
    container_width: u32,
    container_height: u32,
    grid_width: usize,
    grid_height: usize,
    padding: u32,
) -> Result<crate::layout::TileSize, String> {
    Ok(LayoutCalculator::calculate_tile_size(
        container_width,
        container_height,
        grid_width,
        grid_height,
        padding,
    ))
}

#[tauri::command]
fn should_feature_screen_share(
    active_screen_shares: usize,
    has_pinned_participant: bool,
) -> Result<bool, String> {
    Ok(LayoutCalculator::should_feature_screen_share(
        active_screen_shares,
        has_pinned_participant,
    ))
}

#[tauri::command]
fn calculate_filmstrip_dimensions(
    container_width: u32,
    container_height: u32,
    position: crate::layout::FilmstripPosition,
    filmstrip_width_ratio: f32,
) -> Result<crate::layout::FilmstripDimensions, String> {
    Ok(LayoutCalculator::calculate_filmstrip_dimensions(
        container_width,
        container_height,
        &position,
        filmstrip_width_ratio,
    ))
}

#[tauri::command]
fn get_user_notes(state: State<'_, AppState>) -> Result<String, String> {
    let data = state
        .data
        .lock()
        .map_err(|_| "Failed to lock app data".to_string())?;
    Ok(data.notes.clone())
}

#[tauri::command]
fn update_user_notes(
    app: AppHandle,
    notes: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut data = state
        .data
        .lock()
        .map_err(|_| "Failed to lock app data".to_string())?;
    data.notes = notes.clone();
    data.save(&state.config_dir)?;

    // [CONCERN: Notes can be large (multi-paragraph text).  Emitting the
    //  full notes string on every keystroke-save would be wasteful.
    //  Currently NotesTab only saves on explicit action (not on every
    //  keystroke), so this is acceptable.  If a live-collaborative
    //  notes feature is added, switch to debounced saves or a Channel.]
    emit_event(&app, VtEvent::NotesUpdated { notes });
    Ok(())
}
#[tauri::command]
fn generate_livekit_token(
    api_key: String,
    identity: String,
    room: String,
    valid_for_seconds: Option<u64>,
) -> Result<String, String> {
    let secret = std::env::var("LIVEKIT_API_SECRET")
        .map_err(|_| "LIVEKIT_API_SECRET not set in environment".to_string())?;
    let validity = valid_for_seconds.unwrap_or(86400);
    token::generate_token(&api_key, &secret, &identity, &room, validity)
}

// ===================
// ===== MEETING LIFECYCLE EVENTS =====
// ===================

/// Called from the meeting window's JS (`useLiveKitRoom.js`) when the meeting
/// is ending, *before* the window closes.  Emits `MeetingEnded` so the main
/// window can update its state without polling.
///
/// [CONCERN: The meeting window may crash or be force-quit before this
///  command runs.  The main window would then never receive the `MeetingEnded`
///  event.  Consider also listening for the Tauri `tauri://window-destroyed`
///  event with label == "meeting" as a fallback in the frontend.]
#[tauri::command]
fn notify_meeting_ended(app: AppHandle, room: String) -> Result<(), String> {
    emit_event(&app, VtEvent::MeetingEnded { room });
    Ok(())
}

// ===================
// ==========

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
            app.manage(AppState::new(config_dir.clone()));
            app.manage(recording::RecordingState::new(config_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Meeting & Session
            get_meeting_session,
            open_meeting_window,
            notify_meeting_ended,
            parse_invite_link,
            create_meeting_invite,
            // User Management
            get_user_profile,
            update_user_profile,
            get_user_settings,
            update_user_settings,
            get_user_notes,
            update_user_notes,
            // Meetings History & Scheduling
            get_scheduled_meetings,
            schedule_meeting,
            delete_scheduled_meeting,
            get_meeting_history,
            get_meeting_invite,
            // Participant Management
            get_all_participants,
            add_participant,
            remove_participant,
            get_participant,
            set_participant_muted,
            set_participant_video_enabled,
            filter_remote_participants,
            get_screen_shares,
            get_active_screen_share,
            get_participant_count,
            participant_exists,
            get_sorted_participants,
            clear_participants,
            remove_screen_share,
            // Device Management
            set_devices,
            set_device_preferences,
            get_audio_inputs,
            get_video_inputs,
            get_audio_outputs,
            get_preferred_mic,
            get_preferred_camera,
            get_preferred_speaker,
            get_device,
            get_all_devices,
            get_device_groups,
            validate_device,
            // Layout Calculations
            calculate_grid_dimensions,
            calculate_optimal_layout,
            get_grid_class,
            should_use_featured_layout,
            calculate_aspect_ratio,
            calculate_tile_size,
            should_feature_screen_share,
            calculate_filmstrip_dimensions,
            // Token Generation
            generate_livekit_token,
            get_config,
            // Backgrounds
            get_background,
            set_background,
            get_host_meeting_data,
            //Settings
            load_settings,
            save_settings,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
