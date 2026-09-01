use tauri::{AppHandle, Manager, State};

mod device;
mod layout;
mod meeting;
mod participant;
mod session;
mod settings;
mod state;
mod token;
mod window;

use device::{DevicePreferences, MediaDevice};
use layout::{LayoutCalculator, LayoutConfig};
use meeting::{format_invitation, MeetingRecord, ScheduledMeeting};
use participant::Participant;
use session::{create_session, MeetingSession};
use settings::{UserProfile, UserSettings};
use state::AppState;

#[tauri::command]
fn get_meeting_session(
    room: String,
    state: State<'_, AppState>,
) -> Result<MeetingSession, String> {
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
    width: Option<f64>,
    height: Option<f64>,
) -> Result<String, String> {
    window::spawn_meeting_window(&app, room, width, height)
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
    profile: UserProfile,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut data = state
        .data
        .lock()
        .map_err(|_| "Failed to lock app data".to_string())?;
    data.profile = profile;
    data.save(&state.config_dir)
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
    settings: UserSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut data = state
        .data
        .lock()
        .map_err(|_| "Failed to lock app data".to_string())?;
    data.settings = settings;
    data.save(&state.config_dir)
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
    title: String,
    room_id: String,
    start_time: String,
    duration_minutes: u32,
    state: State<'_, AppState>,
) -> Result<ScheduledMeeting, String> {
    let mut meetings = state
        .meetings
        .lock()
        .map_err(|_| "Failed to lock meetings".to_string())?;
    meetings.add_scheduled(
        title,
        room_id,
        start_time,
        duration_minutes,
        &state.config_dir,
    )
}

#[tauri::command]
fn delete_scheduled_meeting(id: String, state: State<'_, AppState>) -> Result<bool, String> {
    let mut meetings = state
        .meetings
        .lock()
        .map_err(|_| "Failed to lock meetings".to_string())?;
    meetings.remove_scheduled(&id, &state.config_dir)
}

#[tauri::command]
fn get_meeting_history(state: State<'_, AppState>) -> Result<Vec<MeetingRecord>, String> {
    let meetings = state
        .meetings
        .lock()
        .map_err(|_| "Failed to lock meetings".to_string())?;
    Ok(meetings.history.clone())
}

#[tauri::command]
fn get_meeting_invite(room: String, state: State<'_, AppState>) -> Result<String, String> {
    let data = state
        .data
        .lock()
        .map_err(|_| "Failed to lock app data".to_string())?;
    Ok(format_invitation(
        &data.profile.display_name,
        &room,
        &data.profile.pmi,
    ))
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
    participant: Participant,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    Ok(manager.add_participant(participant))
}

#[tauri::command]
fn remove_participant(
    participant_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    Ok(manager.remove_participant(&participant_id))
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
    participant_id: String,
    muted: bool,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    Ok(manager.set_participant_muted(&participant_id, muted))
}

#[tauri::command]
fn set_participant_video_enabled(
    participant_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    Ok(manager.set_participant_video_enabled(&participant_id, enabled))
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
fn participant_exists(
    participant_id: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
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
fn clear_participants(state: State<'_, AppState>) -> Result<(), String> {
    let mut manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    manager.clear();
    Ok(())
}

#[tauri::command]
fn remove_screen_share(
    participant_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut manager = state
        .participant_manager
        .lock()
        .map_err(|_| "Failed to lock participant manager".to_string())?;
    manager.remove_screen_share(&participant_id);
    Ok(())
}

// ===== DEVICE MANAGEMENT =====

#[tauri::command]
fn set_devices(
    devices: Vec<MediaDevice>,
    state: State<'_, AppState>,
) -> Result<(), String> {
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
fn get_device_groups(state: State<'_, AppState>) -> Result<Vec<crate::device::DeviceGroup>, String> {
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
    Ok(LayoutCalculator::calculate_grid_dimensions(participant_count))
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
    notes: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut data = state
        .data
        .lock()
        .map_err(|_| "Failed to lock app data".to_string())?;
    data.notes = notes;
    data.save(&state.config_dir)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("visualtalk"));
            
            let _ = std::fs::create_dir_all(&config_dir);
            app.manage(AppState::new(config_dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Meeting & Session
            get_meeting_session,
            open_meeting_window,
            
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
            generate_livekit_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}