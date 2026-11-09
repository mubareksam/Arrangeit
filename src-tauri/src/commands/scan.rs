//! Folder scanning: walkdir for traversal, rayon for the per-file metadata loop.
//!
//! A 20 k-file folder is stat-ed in parallel; hashing is capped at 256 MB per file
//! so a runaway ISO can never stall the UI thread. Everything here is read-only.

use crate::model::{ext_of, kind_for_ext, AppFile};
use rayon::prelude::*;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const MAX_FILES: usize = 50_000;
const MAX_HASH_BYTES: u64 = 256 * 1024 * 1024;
const MAX_PREVIEW_BYTES: u64 = 128 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub files: Vec<AppFile>,
    pub root: String,
    pub truncated: bool,
}

fn timestamp(meta: &std::fs::Metadata) -> String {
    meta.modified()
        .ok()
        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}

fn sha256_prefix(path: &Path, size: u64) -> Option<String> {
    if size > MAX_HASH_BYTES {
        return None;
    }
    let mut file = File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).ok()?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let digest = format!("{:x}", hasher.finalize());
    Some(digest[..24].to_string())
}

fn audio_duration(path: &Path) -> Option<f64> {
    use lofty::file::AudioFile;
    use lofty::probe::Probe;

    let tagged = Probe::open(path).ok()?.read().ok()?;
    let duration = tagged.properties().duration().as_secs_f64();
    if duration > 0.0 {
        Some(duration)
    } else {
        None
    }
}

fn text_preview(path: &Path, size: u64) -> Option<String> {
    if size == 0 || size > MAX_PREVIEW_BYTES {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    if text.chars().any(|c| c == '\u{0}') {
        return None;
    }
    let trimmed: String = text.chars().take(600).collect();
    Some(trimmed.replace("\r\n", "\n"))
}

fn build_file(path: &PathBuf) -> Option<AppFile> {
    let meta = path.metadata().ok()?;
    if !meta.is_file() {
        return None;
    }
    let name = path.file_name()?.to_string_lossy().to_string();
    let ext = ext_of(&name);
    let kind = kind_for_ext(&ext);
    let size = meta.len();

    let width_height = if kind == "image" {
        image::image_dimensions(path).ok()
    } else {
        None
    };

    Some(AppFile {
        id: format!("f-{}", &blake3::hash(path.to_string_lossy().as_bytes()).to_hex()[..12]),
        path: path.to_string_lossy().to_string(),
        folder: path
            .parent()
            .and_then(|p| p.file_name())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| String::from(".")),
        ext,
        size,
        kind: kind.to_string(),
        modified: timestamp(&meta),
        hash: sha256_prefix(path, size),
        width: width_height.map(|(w, _)| w),
        height: width_height.map(|(_, h)| h),
        duration: if kind == "audio" || kind == "video" { audio_duration(path) } else { None },
        text_preview: if kind == "document" || kind == "code" { text_preview(path, size) } else { None },
        name,
    })
}

#[tauri::command]
pub async fn scan_folder(path: String, recursive: bool) -> Result<ScanResult, String> {
    let root = PathBuf::from(&path);
    if !root.exists() {
        return Err(format!("Folder not found: {path}"));
    }
    if !root.is_dir() {
        return Err(format!("Not a folder: {path}"));
    }

    let walker = if recursive {
        WalkDir::new(&root).follow_links(false).into_iter()
    } else {
        WalkDir::new(&root).max_depth(1).follow_links(false).into_iter()
    };

    let mut paths: Vec<PathBuf> = Vec::new();
    let mut truncated = false;
    for entry in walker.filter_map(Result::ok) {
        if entry.file_type().is_file() {
            paths.push(entry.into_path());
            if paths.len() >= MAX_FILES {
                truncated = true;
                break;
            }
        }
    }

    let mut files: Vec<AppFile> = paths.par_iter().filter_map(build_file).collect();
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(ScanResult { files, root: root.to_string_lossy().to_string(), truncated })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub name: String,
    pub path: String,
    pub files: usize,
    pub bytes: u64,
}

/// Immediate sub-folders of `path` — including empty ones, which the file list
/// alone can never surface. Used by the Folder styles tab.
#[tauri::command]
pub async fn list_folders(path: String) -> Result<Vec<FolderEntry>, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Folder not found: {path}"));
    }

    let mut out: Vec<FolderEntry> = Vec::new();
    let entries = std::fs::read_dir(&root).map_err(|e| format!("Cannot read {}: {e}", root.display()))?;
    for entry in entries.filter_map(Result::ok) {
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if !file_type.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let mut files = 0usize;
        let mut bytes = 0u64;
        if let Ok(children) = std::fs::read_dir(entry.path()) {
            for child in children.filter_map(Result::ok) {
                if let Ok(meta) = child.metadata() {
                    if meta.is_file() {
                        files += 1;
                        bytes += meta.len();
                    }
                }
            }
        }
        out.push(FolderEntry { name, path: entry.path().to_string_lossy().to_string(), files, bytes });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}
