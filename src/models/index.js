/**
 * Wire shapes for every object that crosses the Tauri IPC boundary.
 *
 * These typedefs describe what `invoke()` RESOLVES TO — the JSON serde produces
 * in `src-tauri/src/` — not the Rust source. Two rules decide the spelling of
 * every field, and getting them wrong fails silently (the property is just
 * `undefined` at runtime):
 *
 *  1. The default is snake_case. A Rust struct with no `rename_all` keeps its
 *     field names verbatim: `Participant.is_local`, `UserSettings.use_pmi`,
 *     `RecordingFileInfo.size_bytes`.
 *  2. `#[serde(rename_all = "camelCase")]` switches that struct to camelCase and
 *     lowercases only the first letter of an enum variant, so
 *     `TranslationSettings.targetLanguage` and `ServerAgent` becomes
 *     `"serverAgent"` — NOT `"serveragent"`. Four types opt in:
 *     TranslationSettings, TranslationStrategy, BackgroundSettings and
 *     BackgroundKind. The two Translation spellings are pinned by the Rust
 *     tests `translation_strategy_wire_spelling_is_camel_case` and
 *     `translation_settings_field_names_on_the_wire`; the Background payloads by
 *     `background_kind_matches_the_frontend_payloads`.
 *
 * Enums carrying an explicit `#[serde(rename = "...")]` use that literal instead
 * (DeviceKind, LayoutType, FilmstripPosition). An enum's *tagging* matters too:
 * `BackgroundKind` is internally tagged (`#[serde(tag = "type")]`), so a colour
 * is `{ "type": "color", "value": "#fff" }` — serde's default external tagging
 * would instead produce `{ "color": { "value": "#fff" } }`, and unit variants
 * would be bare strings.
 *
 * Usage: either annotate above the call with a `@type` naming
 * `import("<path>/models").Participant[]`, or call through `src/lib/ipc.js`,
 * whose `invoke` is typed by `CommandMap` and needs no annotation at all.
 *
 * When you change a Rust struct, change it here too — there is no TypeScript
 * build step to catch the drift (Guidance.md §5).
 */

// ── Roster & media ───────────────────────────────────────────────────────────

/**
 * A meeting participant as tracked by the Rust roster (`participant.rs`).
 * Distinct from the LiveKit `RemoteParticipant`, which stays behind `src/lib/`.
 * @typedef {Object} Participant
 * @property {string} id - LiveKit participant identity.
 * @property {string} name
 * @property {boolean} is_local - True for this user's own entry.
 * @property {boolean} is_screen - True for a screen-share pseudo-participant.
 * @property {boolean} is_muted
 * @property {boolean} video_enabled
 * @property {boolean} audio_enabled
 */

/** @typedef {"audioinput" | "audiooutput" | "videoinput"} DeviceKind */

/**
 * @typedef {Object} MediaDevice
 * @property {string} id
 * @property {string} label - Falls back to `"<kind> (<id prefix>)"` when the
 *   browser withholds the label because permission was not granted.
 * @property {DeviceKind} kind
 * @property {string|null} group_id - Same physical device across kinds.
 */

/**
 * Argument shape for `set_device_preferences`.
 * @typedef {Object} DevicePreferences
 * @property {string|null} preferred_mic_id
 * @property {string|null} preferred_camera_id
 * @property {string|null} preferred_speaker_id
 */

/**
 * @typedef {Object} DeviceGroup
 * @property {string|null} group_id
 * @property {MediaDevice|null} audio_input
 * @property {MediaDevice|null} audio_output
 * @property {MediaDevice|null} video_input
 */

// ── Meetings ─────────────────────────────────────────────────────────────────

/**
 * Resolved credentials for joining a room, returned by `get_meeting_session`.
 * @typedef {Object} MeetingSession
 * @property {string} livekit_url
 * @property {string} token - Signed LiveKit access token, 24h TTL.
 * @property {string} room_name
 * @property {string} identity
 * @property {string} display_name
 * @property {boolean} start_with_video
 * @property {boolean} mute_on_join
 */

/**
 * @typedef {Object} ScheduledMeeting
 * @property {string} id
 * @property {string} title
 * @property {string} room_id
 * @property {string} invite_link - `visualtalk://join?...` deep link.
 * @property {string} start_time
 * @property {number} duration_minutes
 * @property {string} created_at
 */

/**
 * @typedef {Object} MeetingRecord
 * @property {string} id
 * @property {string} room_id
 * @property {string} timestamp
 */

/**
 * Payload for `create_meeting_invite` and its resolved value, with
 * `invite_link` filled in by the core.
 * @typedef {Object} MeetingInvite
 * @property {string} room - Empty means "generate a room code".
 * @property {string} title
 * @property {string} [invite_link]
 */

/**
 * @typedef {Object} HostMeetingData
 * @property {string} url
 * @property {string} token
 */

/**
 * @typedef {Object} ParsedInvite
 * @property {string} url
 * @property {string} room
 * @property {string} token
 */

/**
 * Payload for `create_icalendar_event`. Every field carries the `ics_` prefix
 * on the wire; resolved value is the written `.ics` path as a string.
 * @typedef {Object} ICalendarEvent
 * @property {string} ics_id
 * @property {string} ics_organizer
 * @property {string[]} ics_attendees
 * @property {string} ics_room
 * @property {string} ics_title
 * @property {string} ics_summary
 * @property {string} ics_description
 * @property {string} ics_start_date - `YYYY-MM-DD`.
 * @property {string} ics_start_time - `HH:MM`, 24h.
 * @property {number} ics_duration_minutes
 * @property {string} [ics_invite_link]
 */

// ── Settings & profile ───────────────────────────────────────────────────────

/**
 * @typedef {Object} UserProfile
 * @property {string} identity - Auto-generated `User-<n>` when blank.
 * @property {string} display_name
 * @property {string} email
 * @property {string} pmi
 * @property {string} report_email - Empty means "route abuse reports to the
 *   organizer's own `email`"; see `get_report_contact`.
 */

/**
 * @typedef {Object} UserSettings
 * @property {boolean} start_with_video
 * @property {boolean} use_pmi
 * @property {boolean} always_show_preview
 * @property {boolean} mute_on_join
 * @property {string|null} preferred_mic_id
 * @property {string|null} preferred_cam_id
 * @property {string|null} recordings_dir - `null` means the built-in default.
 * @property {TranslationSettings} [translation] - Present only in Pro builds
 *   (`#[cfg(feature = "pro")]`); `undefined` in Community.
 * @property {boolean} demo_mode
 */

/**
 * @typedef {Object} AiSettings
 * @property {boolean} enabled
 * @property {string} base_url - OpenAI-compatible root, e.g.
 *   `http://localhost:11434/v1`.
 * @property {string} api_key - May be empty; falls back to env `AI_API_KEY`.
 * @property {string} model
 * @property {string} system_prompt
 */

/**
 * One conversation turn sent to `ask_ai` as context.
 * @typedef {Object} ChatTurn
 * @property {"user" | "assistant"} role
 * @property {string} content
 */

/** @typedef {"cloud" | "docker" | "serverAgent"} TranslationStrategy */

/**
 * camelCase on the wire — the one settings struct with `rename_all`.
 * @typedef {Object} TranslationSettings
 * @property {boolean} enabled
 * @property {TranslationStrategy} strategy
 * @property {string} sourceLanguage - `"auto"` or a BCP-47 tag.
 * @property {string} targetLanguage
 * @property {string|null} apiKey
 * @property {string|null} customUrl
 */

// ── Recordings, safety & layout ──────────────────────────────────────────────

/** @typedef {Object} RecordingsDirInfo
 * @property {string} path
 * @property {boolean} is_default - True when the user has not relocated it.
 * @property {boolean} exists
 */

/** @typedef {Object} ReportContact
 * @property {string} organizer - Destination for in-meeting abuse reports.
 * @property {string} support - Publisher address shown in Settings → About.
 */

/** @typedef {Object} RecordingFileInfo
 * @property {string} path
 * @property {string} name
 * @property {number} size_bytes
 * @property {number} created - Unix seconds (multiply by 1000 for `Date`).
 */

/** @typedef {Object} FfmpegInfo
 * @property {boolean} available
 * @property {string} version
 * @property {string} path
 */

/** @typedef {"gallery" | "speaker" | "filmstrip" | "spotlight"} LayoutType */

/** @typedef {"right" | "left" | "top" | "bottom" | "hide"} FilmstripPosition */

/** @typedef {Object} LayoutConfig
 * @property {LayoutType} layout_type
 * @property {number} columns
 * @property {number} rows
 * @property {string|null} featured_participant_id
 * @property {FilmstripPosition} filmstrip_position
 */

/** @typedef {Object} TileSize
 * @property {number} width
 * @property {number} height
 */

/** @typedef {Object} FilmstripDimensions
 * @property {number} filmstrip_width
 * @property {number} filmstrip_height
 * @property {number} feature_width
 * @property {number} feature_height
 * @property {boolean} is_horizontal
 */

// ── Backgrounds, files & the LiveKit store ───────────────────────────────────

/**
 * Internally tagged on `"type"`. `none` and `blur` carry no payload; `color`
 * adds `value` and `image` adds `path`.
 * @typedef {{ type: "none" } | { type: "blur" } | { type: "color", value: string } | { type: "image", path: string }} BackgroundKind
 */

/**
 * Not persisted — `BackgroundState` is in-memory only, so this resets to
 * disabled on every launch.
 * @typedef {Object} BackgroundSettings
 * @property {boolean} enabled
 * @property {BackgroundKind} kind
 */

/**
 * Metadata for a file picked for chat transfer (`get_file_info`).
 * @typedef {Object} FileInfo
 * @property {string} name
 * @property {number} size - Bytes.
 */

/**
 * The user's own LiveKit server, kept in `livekit.json` via the Tauri store
 * plugin — deliberately NOT `settings.json`, which `AppData` rewrites wholesale
 * (see `commands.rs`). `load_settings` resolves to `null` when unconfigured.
 * @typedef {Object} LiveKitSettings
 * @property {string} url
 * @property {string} api_key
 * @property {string} api_secret
 * @property {string} identity
 */

export {};
