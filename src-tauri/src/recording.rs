//! Local recording management — save browser recordings and FFmpeg post-processing.
//!
//! The frontend captures the video grid via MediaRecorder and sends the
//! recording data as base64 chunks. This module saves to disk and provides
//! optional FFmpeg transcoding.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// State for tracking active local recordings
pub struct RecordingState {
    pub active_recordings: Mutex<Vec<ActiveRecording>>,
    pub recordings_dir: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveRecording {
    pub id: String,
    pub room_name: String,
    pub started_at: i64,
    pub file_path: String,
    /// True once the recorder stopped and the bytes were verified on disk.
    /// Entries registered by the first chunk (and never finalized) point at a
    /// recording that was interrupted by a crash or a force-quit.
    #[serde(default)]
    pub finalized: bool,
}

/// Receipt returned to the frontend after a chunk lands on disk. The frontend
/// needs the *absolute* path: it only ever knows the file name it suggested,
/// and a bare name is useless to `ffmpeg_transcode` / `delete_recording`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkReceipt {
    pub file_path: String,
    pub bytes_written: u64,
    pub total_bytes: u64,
}

impl RecordingState {
    pub fn new(config_dir: PathBuf) -> Self {
        let recordings_dir = config_dir.join("recordings");
        let _ = std::fs::create_dir_all(&recordings_dir);
        Self {
            active_recordings: Mutex::new(Vec::new()),
            recordings_dir,
        }
    }
}

/// Neutralise anything that could escape `recordings_dir`. Room names arrive
/// from the frontend and ultimately from invite links, so `../../foo` must not
/// be able to redirect a recording write outside the recordings folder.
fn sanitize_component(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if (c as u32) < 0x20 => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim_matches('.').trim();
    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Canonical absolute path of a local recording.
fn recording_path(recordings_dir: &Path, room_name: &str, recording_id: &str) -> PathBuf {
    recordings_dir.join(format!(
        "{}-{}.webm",
        sanitize_component(room_name),
        sanitize_component(recording_id)
    ))
}

/// Insert or refresh the registry entry for a recording.
fn register_active(
    state: &RecordingState,
    recording_id: &str,
    room_name: &str,
    file_path: &Path,
    finalized: bool,
    started_at: Option<i64>,
) {
    let mut active = match state.active_recordings.lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    let path = file_path.to_string_lossy().to_string();

    if let Some(entry) = active.iter_mut().find(|r| r.id == recording_id) {
        entry.file_path = path;
        entry.finalized = finalized;
        if let Some(ts) = started_at {
            entry.started_at = ts;
        }
        return;
    }

    active.push(ActiveRecording {
        id: recording_id.to_string(),
        room_name: room_name.to_string(),
        started_at: started_at.unwrap_or_else(|| chrono::Utc::now().timestamp()),
        file_path: path,
        finalized,
    });
}

/// Save a recording chunk to disk (append mode)
#[tauri::command]
pub async fn save_recording_chunk(
    app: AppHandle,
    recording_id: String,
    room_name: String,
    chunk_base64: String,
    is_first_chunk: bool,
) -> Result<ChunkReceipt, String> {
    let state = app.state::<RecordingState>();
    let file_path = recording_path(&state.recordings_dir, &room_name, &recording_id);

    // Decode base64
    let data = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &chunk_base64,
    )
    .map_err(|e| format!("Base64 decode error: {}", e))?;

    // Write to file (append or create)
    use std::fs::OpenOptions;
    use std::io::Write;
    let mut file = OpenOptions::new()
        .create(true)
        .append(!is_first_chunk)
        .write(is_first_chunk)
        .truncate(is_first_chunk)
        .open(&file_path)
        .map_err(|e| format!("Failed to open recording file {}: {}", file_path.display(), e))?;

    // Flush explicitly: an unflushed buffer lost to a window close is exactly
    // how a recording ends up truncated on disk.
    file.write_all(&data)
        .and_then(|_| file.flush())
        .map_err(|e| format!("Failed to write recording chunk: {}", e))?;

    let total_bytes = std::fs::metadata(&file_path)
        .map(|m| m.len())
        .unwrap_or(data.len() as u64);

    // Register on the very first chunk so an interrupted recording is still
    // discoverable instead of vanishing with the in-memory registry.
    if is_first_chunk {
        register_active(
            &state,
            &recording_id,
            &room_name,
            &file_path,
            false,
            None,
        );
    }

    Ok(ChunkReceipt {
        file_path: file_path.to_string_lossy().to_string(),
        bytes_written: data.len() as u64,
        total_bytes,
    })
}

/// Finalize a local recording: resolve its real path, verify the media bytes
/// actually reached disk, and register it as complete.
#[tauri::command]
pub async fn finalize_recording(
    app: AppHandle,
    recording_id: String,
    room_name: String,
    file_path: String,
    started_at: Option<i64>,
) -> Result<ActiveRecording, String> {
    let state = app.state::<RecordingState>();

    // The frontend used to pass a bare "<room>-<id>.webm" file name while the
    // chunks were written to recordings_dir/<room>-<id>.webm, so the stored
    // path pointed nowhere. Resolve any relative input against the recordings
    // dir and keep absolute paths as given.
    let candidate = PathBuf::from(&file_path);
    let resolved = if candidate.is_absolute() {
        candidate
    } else {
        recording_path(&state.recordings_dir, &room_name, &recording_id)
    };

    // Fail loudly rather than registering a recording that does not exist —
    // a silently missing file is indistinguishable from "it was never saved".
    let metadata = std::fs::metadata(&resolved).map_err(|e| {
        format!(
            "Recording was not written to disk ({}): {}",
            resolved.display(),
            e
        )
    })?;

    if metadata.len() == 0 {
        return Err(format!(
            "Recording {} is empty — no media data reached disk.",
            resolved.display()
        ));
    }

    let recording = ActiveRecording {
        id: recording_id,
        room_name,
        started_at: started_at.unwrap_or_else(|| chrono::Utc::now().timestamp()),
        file_path: resolved.to_string_lossy().to_string(),
        finalized: true,
    };

    // Update in place when the first chunk already registered this id, so the
    // registry never holds two rows for one recording.
    {
        let mut active = state
            .active_recordings
            .lock()
            .map_err(|_| "Lock error".to_string())?;
        match active.iter_mut().find(|r| r.id == recording.id) {
            Some(slot) => *slot = recording.clone(),
            None => active.push(recording.clone()),
        }
    }

    Ok(recording)
}

/// Get list of local recordings
#[tauri::command]
pub async fn get_local_recordings(app: AppHandle) -> Result<Vec<RecordingFileInfo>, String> {
    let state = app.state::<RecordingState>();
    let dir = &state.recordings_dir;

    let mut files = Vec::new();
    if dir.exists() {
        let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| {
                e == "webm" || e == "mp4" || e == "mkv"
            }) {
                let metadata = std::fs::metadata(&path).ok();
                files.push(RecordingFileInfo {
                    path: path.to_string_lossy().to_string(),
                    name: path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    size_bytes: metadata.as_ref().map(|m| m.len()).unwrap_or(0),
                    created: metadata
                        .and_then(|m| m.created().ok())
                        .map(|t| {
                            let dur = t
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default();
                            dur.as_secs() as i64
                        })
                        .unwrap_or(0),
                });
            }
        }
    }

    files.sort_by(|a, b| b.created.cmp(&a.created));
    Ok(files)
}

// ── FFmpeg integration ──────────────────────────────────────────

/// Check if FFmpeg is available on the system
#[tauri::command]
pub async fn check_ffmpeg_available() -> Result<FfmpegInfo, String> {
    let output = tokio::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let version = stdout
                .lines()
                .next()
                .unwrap_or("unknown")
                .to_string();
            Ok(FfmpegInfo {
                available: true,
                version,
                path: "ffmpeg".to_string(),
            })
        }
        _ => Ok(FfmpegInfo {
            available: false,
            version: String::new(),
            path: String::new(),
        }),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FfmpegInfo {
    pub available: bool,
    pub version: String,
    pub path: String,
}

/// Transcode a recording using FFmpeg (e.g., webm -> mp4)
#[tauri::command]
pub async fn ffmpeg_transcode(
    input_path: String,
    output_path: String,
    options: Option<TranscodeOptions>,
) -> Result<String, String> {
    let opts = options.unwrap_or_default();

    let mut cmd = tokio::process::Command::new("ffmpeg");
    cmd.arg("-y").arg("-i").arg(&input_path);

    // Video codec
    if let Some(ref vcodec) = opts.video_codec {
        cmd.arg("-c:v").arg(vcodec);
    } else {
        cmd.arg("-c:v").arg("libx264");
    }

    // Audio codec
    if let Some(ref acodec) = opts.audio_codec {
        cmd.arg("-c:a").arg(acodec);
    } else {
        cmd.arg("-c:a").arg("aac");
    }

    // Resolution
    if let Some(ref res) = opts.resolution {
        cmd.arg("-s").arg(res);
    }

    // Bitrate
    if let Some(ref br) = opts.video_bitrate {
        cmd.arg("-b:v").arg(br);
    }

    // Preset
    if let Some(ref preset) = opts.preset {
        cmd.arg("-preset").arg(preset);
    } else {
        cmd.arg("-preset").arg("medium");
    }

    // Custom args
    for arg in &opts.extra_args {
        cmd.arg(arg);
    }

    cmd.arg(&output_path);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("FFmpeg execution failed: {}", e))?;

    if output.status.success() {
        Ok(output_path)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg error: {}", stderr))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TranscodeOptions {
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub resolution: Option<String>,
    pub video_bitrate: Option<String>,
    pub preset: Option<String>,
    pub extra_args: Vec<String>,
}

/// Stream to RTMP using FFmpeg (pipe local capture to RTMP endpoint)
#[tauri::command]
pub async fn ffmpeg_stream_to_rtmp(
    input_path: String,
    rtmp_url: String,
    options: Option<TranscodeOptions>,
) -> Result<String, String> {
    let opts = options.unwrap_or_default();

    let mut cmd = tokio::process::Command::new("ffmpeg");
    cmd.arg("-re").arg("-i").arg(&input_path);

    cmd.arg("-c:v").arg(
        opts.video_codec
            .as_deref()
            .unwrap_or("libx264"),
    );
    cmd.arg("-c:a").arg(
        opts.audio_codec
            .as_deref()
            .unwrap_or("aac"),
    );

    cmd.arg("-preset")
        .arg(opts.preset.as_deref().unwrap_or("veryfast"));

    cmd.arg("-f").arg("flv");
    cmd.arg(&rtmp_url);

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("FFmpeg stream failed: {}", e))?;

    if output.status.success() {
        Ok(format!("Streamed to {}", rtmp_url))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg stream error: {}", stderr))
    }
}

/// Delete a local recording file
#[tauri::command]
pub async fn delete_recording(file_path: String) -> Result<(), String> {
    std::fs::remove_file(&file_path)
        .map_err(|e| format!("Failed to delete recording: {}", e))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingFileInfo {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub created: i64,
}