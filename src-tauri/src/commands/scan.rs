//! Scanning is split into three passes so the UI is usable immediately:
//!
//!   1. `scan_folder`   — paths + size + mtime only. No file is opened. This is
//!                        what makes a 50 000-file folder appear in well under a second.
//!   2. `inspect_file`  — dimensions / duration / text preview for the one file the
//!                        user is actually looking at.
//!   3. `compute_hashes` / `image_signatures` — expensive work, run on demand (and only
//!                        for the files that could possibly match) when the duplicate
//!                        finder is invoked.
//!
//! Rayon drives the parallel loops; every command stays off the UI thread.

use crate::model::{ext_of, kind_for_ext, AppFile};
use rayon::prelude::*;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const MAX_FILES: usize = 100_000;
const MAX_HASH_BYTES: u64 = 512 * 1024 * 1024;
const MAX_PREVIEW_BYTES: u64 = 256 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub files: Vec<AppFile>,
    pub root: String,
    pub truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    pub name: String,
    pub path: String,
    pub files: usize,
    pub bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashEntry {
    pub path: String,
    pub hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Signature {
    pub path: String,
    /// 64-bit difference hash, hex encoded.
    pub hash: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration: Option<f64>,
    pub text_preview: Option<String>,
    pub audio_bitrate: Option<u32>,
}

fn timestamp(meta: &std::fs::Metadata) -> String {
    meta.modified()
        .ok()
        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}

fn sha256_prefix(path: &Path) -> Option<String> {
    let size = path.metadata().ok()?.len();
    if size == 0 || size > MAX_HASH_BYTES {
        return None;
    }
    let mut file = File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 128 * 1024];
    loop {
        let read = file.read(&mut buffer).ok()?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Some(format!("{:x}", hasher.finalize())[..24].to_string())
}

fn audio_info(path: &Path) -> (Option<f64>, Option<u32>) {
    use lofty::file::AudioFile;
    use lofty::probe::Probe;

    let mut probe = match Probe::open(path) {
        Ok(probe) => probe,
        Err(_) => return (None, None),
    };
    let tagged = match probe.read() {
        Ok(tagged) => tagged,
        Err(_) => return (None, None),
    };
    let duration = tagged.properties().duration().as_secs_f64();
    if duration <= 0.0 {
        return (None, None);
    }
    // Derived rather than read from the tag: every container reports it, and it
    // keeps this free of version-specific property accessors.
    let size = path.metadata().map(|meta| meta.len()).unwrap_or(0);
    let bitrate = ((size as f64 * 8.0 / duration) / 1000.0).round() as u32;
    (Some(duration), if bitrate > 0 { Some(bitrate) } else { None })
}

fn text_preview(path: &Path, size: u64) -> Option<String> {
    if size == 0 || size > MAX_PREVIEW_BYTES {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    if bytes.iter().take(4096).any(|b| *b == 0) {
        return None;
    }
    let text = String::from_utf8_lossy(&bytes);
    Some(text.chars().take(1200).collect::<String>().replace("\r\n", "\n"))
}

/// Cheap pass: metadata only, nothing opened.
fn build_file(path: &PathBuf) -> Option<AppFile> {
    let meta = path.metadata().ok()?;
    if !meta.is_file() {
        return None;
    }
    let name = path.file_name()?.to_string_lossy().to_string();
    let ext = ext_of(&name);
    let kind = kind_for_ext(&ext);

    Some(AppFile {
        id: format!("f-{}", &blake3::hash(path.to_string_lossy().as_bytes()).to_hex()[..12]),
        path: path.to_string_lossy().to_string(),
        folder: path
            .parent()
            .and_then(|p| p.file_name())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| String::from(".")),
        ext,
        size: meta.len(),
        kind: kind.to_string(),
        modified: timestamp(&meta),
        hash: None,
        width: None,
        height: None,
        duration: None,
        text_preview: None,
        name,
    })
}

#[tauri::command]
pub async fn scan_folder(path: String, recursive: bool, hash: bool) -> Result<ScanResult, String> {
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

    if hash {
        files.par_iter_mut().for_each(|file| {
            file.hash = sha256_prefix(Path::new(&file.path));
        });
    }

    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(ScanResult { files, root: root.to_string_lossy().to_string(), truncated })
}

/// Expensive details for a single file — called by the preview pane.
#[tauri::command]
pub async fn inspect_file(path: String) -> Result<FileInfo, String> {
    let target = PathBuf::from(&path);
    if !target.is_file() {
        return Err(format!("Not a file: {path}"));
    }
    let size = target.metadata().map(|m| m.len()).unwrap_or(0);
    let kind = kind_for_ext(&ext_of(&path));

    let mut info = FileInfo::default();
    match kind {
        "image" => {
            if let Ok((w, h)) = image::image_dimensions(&target) {
                info.width = Some(w);
                info.height = Some(h);
            }
        }
        "audio" => {
            let (duration, bitrate) = audio_info(&target);
            info.duration = duration;
            info.audio_bitrate = bitrate;
        }
        "video" => {
            info.duration = audio_info(&target).0;
        }
        "document" | "code" => info.text_preview = text_preview(&target, size),
        _ => {}
    }
    Ok(info)
}

#[tauri::command]
pub async fn compute_hashes(paths: Vec<String>) -> Result<Vec<HashEntry>, String> {
    let entries: Vec<HashEntry> = paths
        .par_iter()
        .filter_map(|p| sha256_prefix(Path::new(p)).map(|hash| HashEntry { path: p.clone(), hash }))
        .collect();
    Ok(entries)
}

/// dHash: resize to 9×8 grayscale and compare horizontal neighbours. Two photos of the
/// same scene score a small Hamming distance even when resized, re-encoded or renamed.
#[tauri::command]
pub async fn image_signatures(paths: Vec<String>) -> Result<Vec<Signature>, String> {
    let signatures: Vec<Signature> = paths
        .par_iter()
        .filter_map(|p| {
            let image = image::open(p).ok()?;
            let luma = image.to_luma8();
            let small = image::imageops::resize(&luma, 9, 8, image::imageops::FilterType::Triangle);
            let mut bits: u64 = 0;
            let mut index = 0;
            for y in 0..8u32 {
                for x in 0..8u32 {
                    let left = small.get_pixel(x, y)[0];
                    let right = small.get_pixel(x + 1, y)[0];
                    if left > right {
                        bits |= 1 << index;
                    }
                    index += 1;
                }
            }
            Some(Signature { path: p.clone(), hash: format!("{bits:016x}") })
        })
        .collect();
    Ok(signatures)
}

/// Immediate sub-folders of `path`, including empty ones.
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
