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
 *     lowercases only the first letter of an enum variant, so `ServerAgent`
 *     becomes `"serverAgent"` — NOT `"serveragent"`. Two types opt in today:
 *     BackgroundSettings and BackgroundKind, pinned by the Rust test
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
 * @property {string} invite_link - Single-guest link, or empty for multi-invite meetings.
 * @property {string} start_time
 * @property {number} duration_minutes
 * @property {string} created_at
 * @property {number} position - Manual list order (0 = first).
 */

/**
 * Input payload for `create_meeting_invite`.
 * @typedef {Object} CreateMeetingInviteRequest
 * @property {string} room - Empty means "generate a room code".
 * @property {string} title
 * @property {string[]} [attendees] - One invite is created per distinct recipient.
 * @property {"email" | "sms"} [delivery_method]
 * @property {string} [start_time] - RFC 3339 start, used to set token expiry.
 * @property {number} [duration_minutes]
 */

/** @typedef {"email" | "sms"} InviteDeliveryMethod */

/**
 * @typedef {Object} AttendeeInvite
 * @property {string|null} recipient
 * @property {InviteDeliveryMethod} delivery_method
 * @property {string} identity - Direct mode: signed into this attendee's LiveKit
 *   token. Issuer mode: only a unique key for the Schedule dialog's row state,
 *   since the issuer assigns the real identity at join time.
 * @property {string} invite_link
 */

/**
 * Result returned by `create_meeting_invite`.
 * @typedef {Object} MeetingInvite
 * @property {string} room
 * @property {string} title
 * @property {string} invite_link - Direct mode: populated only when exactly one
 *   link exists. Issuer mode: always the single shareable link.
 * @property {AttendeeInvite[]} attendee_invites
 * @property {boolean} shared_link - True when an external issuer produced these
 *   links, so one link may be sent to every guest (ADR 0006).
 */

/**
 * Per-attendee outcome returned by `send_invitations`. The command reports one
 * row per invite instead of failing the batch, so a single bad recipient never
 * hides the others.
 * @typedef {Object} InviteResult
 * @property {number} index - Position in the submitted `invites` array.
 * @property {string} recipient - Empty string when the invite had none
 *   (shared-link mode, ADR 0006).
 * @property {string|null} channel - `"email"` / `"sms"`, or null when the row
 *   was rejected before a channel was chosen.
 * @property {boolean} accepted
 * @property {string|null} error
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
 * @property {string|null} token - Direct invite: the signed LiveKit token.
 * @property {string|null} identity - Direct invite: the identity in that token.
 * @property {string|null} issuer_url - Issuer invite: where to redeem the
 *   capability at join time (ADR 0006).
 * @property {string|null} invite_capability - Issuer invite: the capability.
 */

/**
 * A participant token the external guest-token issuer minted for one guest
 * (`exchange_invite_for_token`). The identity is fresh per redemption, which is
 * what makes a shared invitation link safe.
 * @typedef {Object} IssuedParticipantToken
 * @property {string} token
 * @property {string} identity
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


/** @typedef {"startTls" | "tls"} SmtpSecurity */

/**
 * Non-secret mail/SMS provider configuration. Provider passwords and tokens
 * remain in the platform secure store and are never returned over IPC.
 * @typedef {Object} MessagingConfig
 * @property {string} smtp_host
 * @property {number} smtp_port
 * @property {SmtpSecurity} smtp_security
 * @property {string} smtp_username
 * @property {string} smtp_from_email
 * @property {string} smtp_from_name
 * @property {string} twilio_account_sid
 * @property {string} twilio_from_phone
 */

/**
 * @typedef {Object} MessagingSettingsResponse
 * @property {MessagingConfig} settings
 * @property {boolean} smtp_password_configured
 * @property {boolean} twilio_auth_token_configured
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
 * (see `commands.rs`). This is the shape `save_settings` accepts; submit an
 * empty `api_secret` to keep the stored one.
 * @typedef {Object} LiveKitSettings
 * @property {string} url
 * @property {string} api_key
 * @property {string} api_secret
 * @property {string} identity
 */

/**
 * What `load_settings` resolves to — `null` when unconfigured. The API secret
 * is deliberately absent: Rust reports only whether one is stored, so the
 * secret never crosses back into the webview (ADR 0004).
 * @typedef {Object} LiveKitSettingsView
 * @property {string} url
 * @property {string} api_key
 * @property {string} identity
 * @property {boolean} api_secret_configured
 */

export {};
