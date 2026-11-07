import { invoke as tauriInvoke } from "@tauri-apps/api/core";

/**
 * Typed `invoke`.
 *
 * Importing this instead of `@tauri-apps/api/core` costs nothing at runtime — it
 * is a pass-through — but gives the editor the resolved shape of every command,
 * which is otherwise invisible in a project with no TypeScript build step
 * (Guidance.md §5). Types come from `src/models/index.js`, which mirrors the
 * serde output of `src-tauri/src/`.
 *
 * Commands missing from `CommandMap` still work and resolve to `unknown`; add
 * them here when you touch them. Deliberately unmapped: the ten E2EE envelope
 * commands (Pro-only, opaque ciphertext — see `src/components/chat.jsx` for
 * their shapes) and the ffmpeg / egress streaming commands, which return
 * livekit-protocol types the UI never inspects.
 *
 * Note the argument casing: Tauri converts Rust `snake_case` parameters to
 * `camelCase` in the JS payload, so `invoke("delete_recording", { filePath })`
 * targets `file_path: String`. That applies to *arguments*; resolved *values*
 * follow the serde rules documented in `src/models/index.js`.
 */

/**
 * @typedef {import("../models").Participant} Participant
 * @typedef {import("../models").MediaDevice} MediaDevice
 * @typedef {import("../models").DeviceGroup} DeviceGroup
 * @typedef {import("../models").MeetingSession} MeetingSession
 * @typedef {import("../models").ScheduledMeeting} ScheduledMeeting
 * @typedef {import("../models").MeetingRecord} MeetingRecord
 * @typedef {import("../models").MeetingInvite} MeetingInvite
 * @typedef {import("../models").HostMeetingData} HostMeetingData
 * @typedef {import("../models").ParsedInvite} ParsedInvite
 * @typedef {import("../models").UserProfile} UserProfile
 * @typedef {import("../models").UserSettings} UserSettings
 * @typedef {import("../models").AiSettings} AiSettings
 * @typedef {import("../models").TranslationSettings} TranslationSettings
 * @typedef {import("../models").RecordingsDirInfo} RecordingsDirInfo
 * @typedef {import("../models").ReportContact} ReportContact
 * @typedef {import("../models").RecordingFileInfo} RecordingFileInfo
 * @typedef {import("../models").FfmpegInfo} FfmpegInfo
 * @typedef {import("../models").LayoutConfig} LayoutConfig
 * @typedef {import("../models").TileSize} TileSize
 * @typedef {import("../models").FilmstripDimensions} FilmstripDimensions
 * @typedef {import("../models").BackgroundSettings} BackgroundSettings
 * @typedef {import("../models").FileInfo} FileInfo
 * @typedef {import("../models").LiveKitSettings} LiveKitSettings
 */

/**
 * Command name → resolved value. Keep in step with the `generate_handler!`
 * table in `src-tauri/src/lib.rs`.
 *
 * @typedef {Object} CommandMap
 * @property {MeetingSession} get_meeting_session
 * @property {string} open_meeting_window
 * @property {void} notify_meeting_ended
 * @property {ParsedInvite} parse_invite_link
 * @property {MeetingInvite} create_meeting_invite
 * @property {string} create_icalendar_event
 * @property {string} get_meeting_invite
 * @property {HostMeetingData} get_host_meeting_data
 * @property {UserProfile} get_user_profile
 * @property {void} update_user_profile
 * @property {UserSettings} get_user_settings
 * @property {void} update_user_settings
 * @property {string} get_user_notes
 * @property {void} update_user_notes
 * @property {ScheduledMeeting[]} get_scheduled_meetings
 * @property {ScheduledMeeting} schedule_meeting
 * @property {boolean} delete_scheduled_meeting
 * @property {MeetingRecord[]} get_meeting_history
 * @property {Participant[]} get_all_participants
 * @property {boolean} add_participant
 * @property {boolean} remove_participant
 * @property {Participant|null} get_participant
 * @property {boolean} set_participant_muted
 * @property {boolean} set_participant_video_enabled
 * @property {Participant[]} filter_remote_participants
 * @property {Participant[]} get_screen_shares
 * @property {Participant|null} get_active_screen_share
 * @property {number} get_participant_count
 * @property {boolean} participant_exists
 * @property {Participant[]} get_sorted_participants
 * @property {void} clear_participants
 * @property {void} remove_screen_share
 * @property {void} set_devices
 * @property {void} set_device_preferences
 * @property {MediaDevice[]} get_audio_inputs
 * @property {MediaDevice[]} get_video_inputs
 * @property {MediaDevice[]} get_audio_outputs
 * @property {MediaDevice|null} get_preferred_mic
 * @property {MediaDevice|null} get_preferred_camera
 * @property {MediaDevice|null} get_preferred_speaker
 * @property {MediaDevice|null} get_device
 * @property {MediaDevice[]} get_all_devices
 * @property {DeviceGroup[]} get_device_groups
 * @property {boolean} validate_device
 * @property {[number, number]} calculate_grid_dimensions
 * @property {LayoutConfig} calculate_optimal_layout
 * @property {string} get_grid_class
 * @property {boolean} should_use_featured_layout
 * @property {number} calculate_aspect_ratio
 * @property {TileSize} calculate_tile_size
 * @property {boolean} should_feature_screen_share
 * @property {FilmstripDimensions} calculate_filmstrip_dimensions
 * @property {string} get_system_locale
 * @property {RecordingsDirInfo} get_recordings_dir
 * @property {RecordingsDirInfo} set_recordings_dir
 * @property {ReportContact} get_report_contact
 * @property {string[]} get_blocked_participants
 * @property {string[]} set_participant_blocked
 * @property {boolean} get_demo_available
 * @property {string} ask_ai
 * @property {AiSettings} get_ai_settings
 * @property {void} update_ai_settings
 * @property {string} test_ai_connection
 * @property {string[]} get_available_models
 * @property {TranslationSettings} get_translation_settings
 * @property {void} update_translation_settings
 * @property {string|null} pick_file
 * @property {string} read_file_chunk
 * @property {string} save_download
 * @property {RecordingFileInfo[]} get_local_recordings
 * @property {FfmpegInfo} check_ffmpeg_available
 * @property {void} delete_recording
 * @property {BackgroundSettings} get_background
 * @property {BackgroundSettings} set_background
 * @property {FileInfo} get_file_info
 * @property {LiveKitSettings|null} load_settings
 * @property {void} save_settings
 */

/**
 * @template {string} C
 * @param {C} cmd - Command name, exactly as registered in `generate_handler!`.
 * @param {Object} [args] - Named arguments; Rust `snake_case` params are
 *   `camelCase` here.
 * @returns {Promise<C extends keyof CommandMap ? CommandMap[C] : unknown>}
 */
export function invoke(cmd, args) {
  return tauriInvoke(cmd, args);
}

export default invoke;
