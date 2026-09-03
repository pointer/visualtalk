use std::fs;
use std::path::Path;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(serde::Serialize)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
}

/// Open native file dialog. Returns selected path or None.
#[tauri::command]
pub async fn pick_file(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .blocking_pick_file();
    
    match picked {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None),
    }
}

/// Read a chunk of a file at given offset. Returns base64 string.
#[tauri::command]
pub fn read_file_chunk(path: String, offset: u64, chunk_size: u32) -> Result<String, String> {
    use std::io::{Read, Seek};

    let mut file = fs::File::open(&path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    file.seek(std::io::SeekFrom::Start(offset))
        .map_err(|e| format!("Failed to seek: {}", e))?;

    let mut buffer = vec![0u8; chunk_size as usize];
    let bytes_read = file.read(&mut buffer)
        .map_err(|e| format!("Failed to read: {}", e))?;

    buffer.truncate(bytes_read);

    Ok(base64::engine::general_purpose::STANDARD.encode(&buffer))
}

/// Get file name and size for a path.
#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileInfo, String> {
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Failed to get metadata: {}", e))?;

    let name = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(FileInfo { name, size: metadata.len() })
}

/// Save received bytes to ~/Downloads/VisualTalk/
#[tauri::command]
pub async fn save_download(app: AppHandle, filename: String, data: Vec<u8>) -> Result<String, String> {
    let downloads = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| std::env::temp_dir());

    let vt_dir = downloads.join("VisualTalk");
    fs::create_dir_all(&vt_dir)
        .map_err(|e| format!("Failed to create dir: {}", e))?;

    let target = vt_dir.join(&filename);
    let final_path = if target.exists() {
        let stem = Path::new(&filename)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("download");
        let ext = Path::new(&filename)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        let unique = format!("{}_{}.{}", stem, chrono::Utc::now().timestamp_millis(), ext);
        vt_dir.join(unique)
    } else {
        target
    };

    fs::write(&final_path, data)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(final_path.to_string_lossy().to_string())
}