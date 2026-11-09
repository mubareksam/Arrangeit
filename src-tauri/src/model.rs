//! Shared data model. Field names are camelCase on the wire so the TypeScript
//! `AppFile` in `src/lib/organizer/types.ts` deserialises without a mapping layer.

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppFile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub folder: String,
    pub ext: String,
    pub size: u64,
    /// image | video | audio | document | archive | code | other
    pub kind: String,
    /// RFC-3339 timestamp.
    pub modified: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoRecord {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub entries: Vec<String>,
    /// Machine-readable moves consumed by `revert_files`.
    #[serde(default)]
    pub ops: Vec<UndoOp>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoOp {
    /// Path before the operation.
    pub from: String,
    /// Path after the operation — reverting moves `to` back to `from`.
    pub to: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleStep {
    pub command: String,
    pub ok: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderStyle {
    pub folder: String,
    pub glyph: String,
    pub color: String,
    #[serde(default)]
    pub tooltip: String,
    #[serde(default)]
    pub hide_system_files: bool,
    #[serde(default)]
    pub icon_path: Option<String>,
}

pub fn kind_for_ext(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "tif" | "tiff" | "svg" | "heic" | "avif"
        | "raw" | "cr2" | "nef" => "image",
        "mp4" | "mkv" | "mov" | "avi" | "wmv" | "webm" | "flv" | "m4v" | "mpg" | "mpeg" => "video",
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "opus" | "m4a" | "wma" | "aiff" | "alac" | "mid" => "audio",
        "pdf" | "doc" | "docx" | "txt" | "rtf" | "odt" | "xls" | "xlsx" | "csv" | "ppt" | "pptx"
        | "epub" | "md" | "pages" | "numbers" => "document",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "iso" | "cab" => "archive",
        "ts" | "tsx" | "js" | "jsx" | "rs" | "py" | "go" | "java" | "c" | "cpp" | "h" | "cs" | "rb"
        | "php" | "sh" | "json" | "yml" | "yaml" | "toml" | "sql" | "html" | "css" => "code",
        _ => "other",
    }
}

pub fn ext_of(name: &str) -> String {
    Path::new(name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// Length-aware, Explorer-style size label (used in logs, not in the UI).
pub fn human_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0usize;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{} {}", bytes, UNITS[0])
    } else {
        format!("{:.1} {}", value, UNITS[unit])
    }
}

/// Strips characters Windows refuses in a path segment.
pub fn sanitize_segment(value: &str) -> String {
    value
        .chars()
        .filter(|c| !matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'))
        .collect::<String>()
        .trim_end_matches(['.', ' '])
        .to_string()
}

/// Rename with a copy+delete fallback so moves across volumes still work.
pub fn move_file(from: &Path, to: &Path) -> std::io::Result<()> {
    match std::fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(_) => {
            std::fs::copy(from, to)?;
            std::fs::remove_file(from)
        }
    }
}

/// `name.ext`, `name (2).ext`, `name (3).ext`, … until the path is free.
pub fn uniquify(dir: &Path, name: &str) -> std::path::PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => (stem.to_string(), format!(".{ext}")),
        _ => (name.to_string(), String::new()),
    };
    for n in 2..10_000 {
        let next = dir.join(format!("{stem} ({n}){ext}"));
        if !next.exists() {
            return next;
        }
    }
    dir.join(format!("{stem} (copy){ext}"))
}
